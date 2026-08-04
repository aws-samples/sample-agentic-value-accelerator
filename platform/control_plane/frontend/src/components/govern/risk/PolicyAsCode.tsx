/**
 * PolicyAsCode — Governance policies enforced at deployment time
 *
 * Supports multiple policy engines:
 * - HashiCorp Sentinel (Terraform)
 * - Open Policy Agent (OPA/Rego)
 * - AWS Cedar (Cedar)
 * - Checkov (IaC scanning)
 * - Custom AVA policies
 *
 * Integrates with CI/CD to enforce governance gates before agents deploy.
 */

import { useState } from 'react';

interface PolicyRule {
  id: string;
  name: string;
  engine: 'sentinel' | 'opa' | 'cedar' | 'checkov' | 'ava';
  category: 'risk' | 'compliance' | 'security' | 'cost' | 'data';
  severity: 'advisory' | 'soft-mandatory' | 'hard-mandatory';
  description: string;
  code: string;
  status: 'active' | 'testing' | 'disabled';
  lastTriggered?: string;
  violations: number;
}

interface PolicyExecution {
  id: string;
  policyId: string;
  policyName: string;
  agentId: string;
  agentName: string;
  result: 'pass' | 'fail' | 'warn';
  timestamp: string;
  details: string;
  remediation?: string;
}

const POLICY_ENGINES = [
  { id: 'sentinel', name: 'HashiCorp Sentinel', icon: '🏛️', color: '#7B42BC', description: 'Terraform policy enforcement' },
  { id: 'opa', name: 'Open Policy Agent', icon: '📜', color: '#566366', description: 'Rego-based policy decisions' },
  { id: 'cedar', name: 'AWS Cedar', icon: '🌲', color: '#FF9900', description: 'Fine-grained authorization' },
  { id: 'checkov', name: 'Checkov', icon: '✅', color: '#5C4EE5', description: 'IaC security scanning' },
  { id: 'ava', name: 'AVA Native', icon: '🤖', color: '#4F46E5', description: 'Built-in governance rules' },
];

const MOCK_POLICIES: PolicyRule[] = [
  {
    id: 'pol-001',
    name: 'Agent Risk Threshold',
    engine: 'ava',
    category: 'risk',
    severity: 'hard-mandatory',
    description: 'Block deployment if agent overall risk score exceeds threshold',
    status: 'active',
    violations: 3,
    lastTriggered: '2026-06-14',
    code: `# AVA Risk Policy
rule "agent_risk_threshold" {
  description = "Block high-risk agents from production"

  condition = agent.risk_score <= 70

  enforcement = "hard-mandatory"

  message = "Agent risk score {agent.risk_score} exceeds threshold of 70"
}`,
  },
  {
    id: 'pol-002',
    name: 'Autonomy Level Approval',
    engine: 'opa',
    category: 'risk',
    severity: 'soft-mandatory',
    description: 'Require executive approval for fully autonomous agents',
    status: 'active',
    violations: 1,
    lastTriggered: '2026-06-12',
    code: `# OPA Rego Policy - Autonomy Governance
package ava.agent.autonomy

import future.keywords.if
import future.keywords.in

default allow := false

# Allow non-autonomous agents without approval
allow if {
  input.agent.autonomy_level != "fully-autonomous"
}

# Allow fully autonomous with executive approval
allow if {
  input.agent.autonomy_level == "fully-autonomous"
  executive_approved
}

executive_approved if {
  some approval in input.approvals
  approval.role == "executive"
  approval.status == "approved"
  time.parse_rfc3339_ns(approval.timestamp) > time.now_ns() - (30 * 24 * 60 * 60 * 1000000000)
}

violation[result] if {
  input.agent.autonomy_level == "fully-autonomous"
  not executive_approved
  result := {
    "msg": "Fully autonomous agents require executive approval within 30 days",
    "severity": "soft-mandatory",
    "remediation": "Request approval via the Human Oversight tab in Agent Registry"
  }
}`,
  },
  {
    id: 'pol-003',
    name: 'PII Data Access Guard',
    engine: 'cedar',
    category: 'data',
    severity: 'hard-mandatory',
    description: 'Enforce data classification access controls for PII',
    status: 'active',
    violations: 0,
    code: `// AWS Cedar Policy
permit (
  principal in Agent::"customer-service",
  action in [Action::"read"],
  resource in DataSource::"customer-db"
) when {
  resource.classification in ["internal", "public"] ||
  (resource.classification == "confidential" &&
   principal.clearanceLevel >= 3)
};

forbid (
  principal,
  action in [Action::"read", Action::"write"],
  resource
) when {
  resource.contains_pii == true &&
  !principal.pii_certified
};`,
  },
  {
    id: 'pol-004',
    name: 'Tool Blast Radius Limit',
    engine: 'sentinel',
    category: 'security',
    severity: 'soft-mandatory',
    description: 'Limit critical blast radius tools to supervised agents',
    status: 'active',
    violations: 2,
    lastTriggered: '2026-06-13',
    code: `# HashiCorp Sentinel Policy
import "tfplan/v2" as tfplan

# Deny critical blast radius tools for autonomous agents
main = rule {
  all tfplan.resources as _, resources {
    all resources as _, r {
      r.values.agent_config.autonomy_level in ["supervised", "semi-autonomous"] or
      all r.values.agent_config.tools as tool {
        tool.blast_radius != "critical"
      }
    }
  }
}`,
  },
  {
    id: 'pol-005',
    name: 'HRAIS Assessment Required',
    engine: 'ava',
    category: 'compliance',
    severity: 'hard-mandatory',
    description: 'Require passing HRAIS assessment for EU AI Act compliance',
    status: 'active',
    violations: 1,
    lastTriggered: '2026-06-10',
    code: `# AVA Compliance Policy
rule "hrais_required" {
  description = "EU AI Act HRAIS assessment must pass"

  condition = and(
    agent.hrais_assessment.completed == true,
    agent.hrais_assessment.residual_risk <= "medium",
    agent.hrais_assessment.all_controls_implemented == true
  )

  enforcement = "hard-mandatory"

  message = "HRAIS assessment required for EU AI Act compliance"

  remediation = "Complete HRAIS assessment in Risk Management > HRAIS tab"
}`,
  },
  {
    id: 'pol-006',
    name: 'Cost Guardrail Enforcement',
    engine: 'checkov',
    category: 'cost',
    severity: 'advisory',
    description: 'Ensure cost controls are configured for agent deployments',
    status: 'testing',
    violations: 0,
    code: `# Checkov Custom Check
from checkov.common.models.enums import CheckResult
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck

class AgentCostGuardrails(BaseResourceCheck):
    def __init__(self):
        name = "Ensure agent has cost guardrails configured"
        id = "AVA_AGENT_001"
        supported_resources = ["aws_bedrock_agent"]
        categories = ["cost"]
        super().__init__(name=name, id=id,
                        supported_resources=supported_resources)

    def scan_resource_conf(self, conf):
        if "guardrails" in conf:
            guardrails = conf["guardrails"][0]
            if guardrails.get("cost_limit"):
                return CheckResult.PASSED
        return CheckResult.FAILED`,
  },
  // ─────────────────────────── Additional OPA Policies ───────────────────────────
  {
    id: 'pol-007',
    name: 'Tool Permission Boundaries',
    engine: 'opa',
    category: 'security',
    severity: 'hard-mandatory',
    description: 'Enforce tool-level permissions based on agent classification and environment',
    status: 'active',
    violations: 4,
    lastTriggered: '2026-06-15',
    code: `# OPA Rego Policy - Tool Permission Boundaries
package ava.agent.tools

import future.keywords.if
import future.keywords.in
import future.keywords.contains

default allow := false

# Define dangerous tools that require elevated permissions
dangerous_tools := {
  "account_blocker", "payment_processor", "data_exporter",
  "system_executor", "credential_manager", "config_modifier"
}

# Define tool categories by blast radius
critical_blast_radius := {"account_blocker", "payment_processor", "system_executor"}
high_blast_radius := {"data_exporter", "credential_manager", "config_modifier"}

# Allow if no dangerous tools requested
allow if {
  tools_requested := {t | t := input.agent.tools[_].name}
  count(tools_requested & dangerous_tools) == 0
}

# Allow dangerous tools only with proper controls
allow if {
  tools_requested := {t | t := input.agent.tools[_].name}
  count(tools_requested & dangerous_tools) > 0
  has_required_controls
  environment_appropriate
}

has_required_controls if {
  input.agent.guardrails_enabled == true
  input.agent.audit_logging == true
  input.agent.human_in_loop == true
}

environment_appropriate if {
  input.deployment.environment != "production"
}

environment_appropriate if {
  input.deployment.environment == "production"
  input.agent.classification in ["tier-1", "tier-2"]
  count(input.approvals) >= 2
}

# Specific violations
violation contains result if {
  some tool in input.agent.tools
  tool.name in critical_blast_radius
  input.agent.human_in_loop != true
  result := {
    "msg": sprintf("Tool '%s' requires human-in-the-loop controls", [tool.name]),
    "tool": tool.name,
    "severity": "hard-mandatory"
  }
}

violation contains result if {
  some tool in input.agent.tools
  tool.name in dangerous_tools
  not input.agent.guardrails_enabled
  result := {
    "msg": sprintf("Tool '%s' requires Bedrock Guardrails enabled", [tool.name]),
    "tool": tool.name,
    "severity": "hard-mandatory"
  }
}`,
  },
  {
    id: 'pol-008',
    name: 'MCP Server Allowlist',
    engine: 'opa',
    category: 'security',
    severity: 'hard-mandatory',
    description: 'Only allow pre-approved MCP servers from the security registry',
    status: 'active',
    violations: 2,
    lastTriggered: '2026-06-14',
    code: `# OPA Rego Policy - MCP Server Allowlist
package ava.agent.mcp

import future.keywords.if
import future.keywords.in
import future.keywords.contains

default allow := false

# Approved MCP servers from security registry
approved_mcp_servers := {
  "mcp-database-readonly",
  "mcp-database-readwrite",
  "mcp-servicenow",
  "mcp-salesforce",
  "mcp-slack-notifications",
  "mcp-github-readonly",
  "mcp-aws-bedrock-kb"
}

# High-risk MCP servers requiring additional approval
high_risk_mcp := {
  "mcp-database-readwrite",
  "mcp-payment-gateway",
  "mcp-external-api"
}

allow if {
  all_servers_approved
  high_risk_servers_have_approval
}

all_servers_approved if {
  every server in input.agent.mcp_servers {
    server.id in approved_mcp_servers
  }
}

high_risk_servers_have_approval if {
  requested_high_risk := {s.id | s := input.agent.mcp_servers[_]; s.id in high_risk_mcp}
  count(requested_high_risk) == 0
}

high_risk_servers_have_approval if {
  requested_high_risk := {s.id | s := input.agent.mcp_servers[_]; s.id in high_risk_mcp}
  count(requested_high_risk) > 0
  input.security_review.status == "approved"
  input.security_review.reviewer_role in ["security-lead", "ciso"]
}

# Violations
violation contains result if {
  some server in input.agent.mcp_servers
  not server.id in approved_mcp_servers
  result := {
    "msg": sprintf("MCP server '%s' is not in the approved allowlist", [server.id]),
    "server": server.id,
    "severity": "hard-mandatory",
    "remediation": "Submit MCP server for security review in the MCP Servers tab of Agent Registry"
  }
}

violation contains result if {
  some server in input.agent.mcp_servers
  server.id in high_risk_mcp
  not input.security_review.status == "approved"
  result := {
    "msg": sprintf("High-risk MCP server '%s' requires security review", [server.id]),
    "server": server.id,
    "severity": "hard-mandatory"
  }
}`,
  },
  {
    id: 'pol-009',
    name: 'Data Classification Boundaries',
    engine: 'opa',
    category: 'data',
    severity: 'hard-mandatory',
    description: 'Enforce data access based on classification levels and agent clearance',
    status: 'active',
    violations: 0,
    code: `# OPA Rego Policy - Data Classification Boundaries
package ava.agent.data

import future.keywords.if
import future.keywords.in
import future.keywords.contains

default allow := false

# Classification hierarchy (higher number = more sensitive)
classification_levels := {
  "public": 1,
  "internal": 2,
  "confidential": 3,
  "restricted": 4,
  "pii": 5,
  "phi": 5,
  "pci": 5
}

# Agent clearance levels
clearance_levels := {
  "basic": 2,
  "elevated": 3,
  "privileged": 4,
  "pii-certified": 5
}

allow if {
  every ds in input.agent.data_sources {
    agent_can_access(ds)
  }
}

agent_can_access(data_source) if {
  agent_clearance := clearance_levels[input.agent.clearance]
  data_classification := classification_levels[data_source.classification]
  agent_clearance >= data_classification
}

# PII requires explicit certification
agent_can_access(data_source) if {
  data_source.classification in ["pii", "phi"]
  input.agent.pii_certified == true
  input.agent.data_handling_training_completed == true
}

# PCI requires PCI-DSS compliance
agent_can_access(data_source) if {
  data_source.classification == "pci"
  input.agent.pci_compliant == true
  input.deployment.environment_pci_certified == true
}

# Violations with specific guidance
violation contains result if {
  some ds in input.agent.data_sources
  ds.classification in ["pii", "phi"]
  not input.agent.pii_certified
  result := {
    "msg": sprintf("Agent requires PII certification to access '%s'", [ds.name]),
    "data_source": ds.name,
    "classification": ds.classification,
    "severity": "hard-mandatory",
    "remediation": "Complete PII handling training and certification"
  }
}

violation contains result if {
  some ds in input.agent.data_sources
  not agent_can_access(ds)
  result := {
    "msg": sprintf("Agent clearance '%s' insufficient for '%s' data", [input.agent.clearance, ds.classification]),
    "data_source": ds.name,
    "required_clearance": ds.classification,
    "agent_clearance": input.agent.clearance,
    "severity": "hard-mandatory"
  }
}`,
  },
  {
    id: 'pol-010',
    name: 'Chain Depth & Cascade Risk',
    engine: 'opa',
    category: 'risk',
    severity: 'soft-mandatory',
    description: 'Limit agent chain depth and require circuit breakers for cascade risk',
    status: 'active',
    violations: 1,
    lastTriggered: '2026-06-13',
    code: `# OPA Rego Policy - Chain Depth & Cascade Risk
package ava.agent.chain

import future.keywords.if
import future.keywords.in

default allow := false

# Maximum allowed chain depth by environment
max_chain_depth := {
  "development": 5,
  "staging": 4,
  "production": 3
}

# Cascade risk thresholds
cascade_risk_thresholds := {
  "development": 80,
  "staging": 60,
  "production": 50
}

allow if {
  chain_depth_ok
  cascade_risk_ok
  has_circuit_breakers
}

chain_depth_ok if {
  env := input.deployment.environment
  input.agent.chain_depth <= max_chain_depth[env]
}

cascade_risk_ok if {
  env := input.deployment.environment
  input.agent.cascade_risk_score <= cascade_risk_thresholds[env]
}

# Circuit breakers required for multi-agent chains
has_circuit_breakers if {
  input.agent.chain_depth <= 1
}

has_circuit_breakers if {
  input.agent.chain_depth > 1
  input.agent.circuit_breaker_enabled == true
  input.agent.circuit_breaker_config.failure_threshold > 0
  input.agent.circuit_breaker_config.timeout_seconds > 0
}

# Calculate cascade risk (simplified)
calculated_cascade_risk := risk if {
  base_risk := input.agent.risk_score
  depth := input.agent.chain_depth
  human_gates := input.agent.human_gates
  mitigation := 1 - (human_gates * 0.2)
  # Rego has no exponent operator; approximate depth amplification linearly
  depth_factor := 1 + (depth * 0.15)
  risk := base_risk * depth_factor * mitigation
}

violation contains result if {
  env := input.deployment.environment
  input.agent.chain_depth > max_chain_depth[env]
  result := {
    "msg": sprintf("Chain depth %d exceeds maximum %d for %s", [input.agent.chain_depth, max_chain_depth[env], env]),
    "severity": "soft-mandatory",
    "remediation": "Reduce chain depth or add human-in-the-loop gates"
  }
}

violation contains result if {
  input.agent.chain_depth > 1
  not input.agent.circuit_breaker_enabled
  result := {
    "msg": "Multi-agent chains require circuit breakers",
    "severity": "soft-mandatory",
    "remediation": "Enable circuit breaker with appropriate thresholds"
  }
}

violation contains result if {
  env := input.deployment.environment
  calculated_cascade_risk > cascade_risk_thresholds[env]
  result := {
    "msg": sprintf("Cascade risk %d exceeds threshold %d", [calculated_cascade_risk, cascade_risk_thresholds[env]]),
    "calculated_risk": calculated_cascade_risk,
    "severity": "soft-mandatory"
  }
}`,
  },
  {
    id: 'pol-011',
    name: 'Human Oversight Requirements',
    engine: 'opa',
    category: 'compliance',
    severity: 'hard-mandatory',
    description: 'Enforce EU AI Act Article 14 human oversight for high-risk AI systems',
    status: 'active',
    violations: 0,
    code: `# OPA Rego Policy - Human Oversight (EU AI Act Article 14)
package ava.agent.oversight

import future.keywords.if
import future.keywords.in
import future.keywords.contains

default allow := false

# High-risk domains requiring human oversight
high_risk_domains := {
  "credit-decisions", "employment", "law-enforcement",
  "education", "healthcare", "benefits-eligibility"
}

# Actions requiring human confirmation
critical_actions := {
  "approve_loan", "deny_application", "terminate_account",
  "submit_regulatory", "execute_trade", "block_customer"
}

allow if {
  not is_high_risk_system
}

allow if {
  is_high_risk_system
  has_human_oversight
  has_intervention_capability
  has_audit_trail
}

is_high_risk_system if {
  input.agent.domain in high_risk_domains
}

is_high_risk_system if {
  some action in input.agent.available_actions
  action in critical_actions
}

has_human_oversight if {
  input.agent.human_oversight.enabled == true
  input.agent.human_oversight.reviewer_assigned == true
  input.agent.human_oversight.review_frequency in ["real-time", "daily", "per-decision"]
}

has_intervention_capability if {
  input.agent.controls.kill_switch_enabled == true
  input.agent.controls.pause_capability == true
  input.agent.controls.override_mechanism == true
}

has_audit_trail if {
  input.agent.logging.decision_logging == true
  input.agent.logging.input_output_capture == true
  input.agent.logging.retention_days >= 365
}

# Violations
violation contains result if {
  is_high_risk_system
  not has_human_oversight
  result := {
    "msg": "High-risk AI system requires human oversight per EU AI Act Article 14",
    "domain": input.agent.domain,
    "severity": "hard-mandatory",
    "remediation": "Configure human oversight in agent settings"
  }
}

violation contains result if {
  is_high_risk_system
  not input.agent.controls.kill_switch_enabled
  result := {
    "msg": "High-risk system requires kill switch capability",
    "severity": "hard-mandatory",
    "remediation": "Enable emergency stop controls"
  }
}

violation contains result if {
  is_high_risk_system
  not has_audit_trail
  result := {
    "msg": "High-risk system requires comprehensive audit logging",
    "severity": "hard-mandatory",
    "remediation": "Enable decision logging with 365-day retention"
  }
}`,
  },
  {
    id: 'pol-012',
    name: 'Network Egress Controls',
    engine: 'opa',
    category: 'security',
    severity: 'hard-mandatory',
    description: 'Control agent network access to external endpoints',
    status: 'active',
    violations: 1,
    lastTriggered: '2026-06-16',
    code: `# OPA Rego Policy - Network Egress Controls
package ava.agent.network

import future.keywords.if
import future.keywords.in
import future.keywords.contains

default allow := false

# Approved external domains by category
approved_domains := {
  "aws": {"*.amazonaws.com", "*.aws.amazon.com"},
  "ai-providers": {"api.anthropic.com", "api.openai.com"},
  "enterprise": {"*.salesforce.com", "*.servicenow.com"},
  "monitoring": {"*.datadoghq.com", "*.newrelic.com"}
}

# Blocked domains (malware, data exfiltration risk)
blocked_domains := {
  "*.pastebin.com", "*.transfer.sh", "*.file.io",
  "*.ngrok.io", "*.localtunnel.me"
}

# Protocols allowed for egress
allowed_protocols := {"https", "wss", "grpc"}

allow if {
  all_endpoints_approved
  no_blocked_domains
  protocols_approved
}

all_endpoints_approved if {
  every endpoint in input.agent.network.egress_endpoints {
    endpoint_approved(endpoint)
  }
}

endpoint_approved(endpoint) if {
  some category, patterns in approved_domains
  some pattern in patterns
  glob.match(pattern, [], endpoint.domain)
}

no_blocked_domains if {
  every endpoint in input.agent.network.egress_endpoints {
    not is_blocked(endpoint.domain)
  }
}

is_blocked(domain) if {
  some pattern in blocked_domains
  glob.match(pattern, [], domain)
}

protocols_approved if {
  every endpoint in input.agent.network.egress_endpoints {
    endpoint.protocol in allowed_protocols
  }
}

# Violations
violation contains result if {
  some endpoint in input.agent.network.egress_endpoints
  not endpoint_approved(endpoint)
  result := {
    "msg": sprintf("External endpoint '%s' is not in approved list", [endpoint.domain]),
    "domain": endpoint.domain,
    "severity": "hard-mandatory",
    "remediation": "Submit domain for security review"
  }
}

violation contains result if {
  some endpoint in input.agent.network.egress_endpoints
  is_blocked(endpoint.domain)
  result := {
    "msg": sprintf("Domain '%s' is blocked for security reasons", [endpoint.domain]),
    "domain": endpoint.domain,
    "severity": "hard-mandatory"
  }
}

violation contains result if {
  some endpoint in input.agent.network.egress_endpoints
  not endpoint.protocol in allowed_protocols
  result := {
    "msg": sprintf("Protocol '%s' not allowed for egress", [endpoint.protocol]),
    "protocol": endpoint.protocol,
    "allowed": allowed_protocols,
    "severity": "hard-mandatory"
  }
}`,
  },
  {
    id: 'pol-013',
    name: 'Model & Provider Governance',
    engine: 'opa',
    category: 'compliance',
    severity: 'soft-mandatory',
    description: 'Enforce approved model versions and providers for production use',
    status: 'active',
    violations: 0,
    code: `# OPA Rego Policy - Model & Provider Governance
package ava.agent.model

import future.keywords.if
import future.keywords.in
import future.keywords.contains

default allow := false

# Approved models by environment
approved_models := {
  "production": {
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "amazon.nova-pro-v1:0",
    "amazon.nova-lite-v1:0"
  },
  "staging": {
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "anthropic.claude-3-opus-20240229-v1:0",
    "amazon.nova-pro-v1:0",
    "amazon.nova-lite-v1:0",
    "amazon.nova-micro-v1:0"
  },
  "development": {
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "anthropic.claude-3-opus-20240229-v1:0",
    "amazon.nova-pro-v1:0",
    "amazon.nova-lite-v1:0",
    "amazon.nova-micro-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "meta.llama3-1-70b-instruct-v1:0"
  }
}

# Models requiring additional controls
high_capability_models := {
  "anthropic.claude-3-opus-20240229-v1:0",
  "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

allow if {
  model_approved
  provider_controls_met
}

model_approved if {
  env := input.deployment.environment
  input.agent.model_id in approved_models[env]
}

provider_controls_met if {
  not input.agent.model_id in high_capability_models
}

provider_controls_met if {
  input.agent.model_id in high_capability_models
  input.agent.guardrails_enabled == true
  input.agent.token_limit_configured == true
  input.agent.cost_monitoring_enabled == true
}

# Violations
violation contains result if {
  env := input.deployment.environment
  not input.agent.model_id in approved_models[env]
  result := {
    "msg": sprintf("Model '%s' not approved for %s", [input.agent.model_id, env]),
    "model": input.agent.model_id,
    "environment": env,
    "severity": "soft-mandatory",
    "remediation": "Use an approved model or submit for review"
  }
}

violation contains result if {
  input.agent.model_id in high_capability_models
  not input.agent.guardrails_enabled
  result := {
    "msg": sprintf("High-capability model '%s' requires guardrails", [input.agent.model_id]),
    "model": input.agent.model_id,
    "severity": "soft-mandatory"
  }
}`,
  },
  {
    id: 'pol-014',
    name: 'Prompt Injection Defense',
    engine: 'opa',
    category: 'security',
    severity: 'hard-mandatory',
    description: 'Require prompt injection defenses for customer-facing agents',
    status: 'active',
    violations: 0,
    code: `# OPA Rego Policy - Prompt Injection Defense
package ava.agent.security.injection

import future.keywords.if
import future.keywords.in

default allow := false

# Agent types that accept external input
external_input_agents := {
  "customer-facing", "api-exposed", "email-processing",
  "document-processing", "chat-interface"
}

allow if {
  not accepts_external_input
}

allow if {
  accepts_external_input
  has_injection_defenses
}

accepts_external_input if {
  input.agent.type in external_input_agents
}

accepts_external_input if {
  input.agent.input_sources[_].type == "external"
}

has_injection_defenses if {
  input.agent.security.input_validation_enabled == true
  input.agent.security.prompt_injection_detection == true
  input.agent.security.instruction_hierarchy_enforced == true
  input.agent.guardrails_enabled == true
}

# Calculate defense coverage score
defense_score := score if {
  checks := [
    input.agent.security.input_validation_enabled,
    input.agent.security.prompt_injection_detection,
    input.agent.security.instruction_hierarchy_enforced,
    input.agent.security.output_filtering_enabled,
    input.agent.guardrails_enabled
  ]
  passed := count([c | c := checks[_]; c == true])
  score := (passed / count(checks)) * 100
}

violation contains result if {
  accepts_external_input
  not has_injection_defenses
  result := {
    "msg": "Customer-facing agent requires prompt injection defenses",
    "defense_score": defense_score,
    "severity": "hard-mandatory",
    "remediation": "Enable input validation, injection detection, and guardrails"
  }
}

violation contains result if {
  accepts_external_input
  defense_score < 80
  result := {
    "msg": sprintf("Defense coverage score %d%% below 80%% threshold", [defense_score]),
    "defense_score": defense_score,
    "severity": "soft-mandatory"
  }
}`,
  },
  {
    id: 'pol-015',
    name: 'Memory & Context Isolation',
    engine: 'opa',
    category: 'security',
    severity: 'soft-mandatory',
    description: 'Enforce memory isolation and context hygiene for multi-tenant agents',
    status: 'testing',
    violations: 0,
    code: `# OPA Rego Policy - Memory & Context Isolation
package ava.agent.memory

import future.keywords.if
import future.keywords.in

default allow := false

allow if {
  not is_multi_tenant
}

allow if {
  is_multi_tenant
  has_session_isolation
  has_memory_hygiene
}

is_multi_tenant if {
  input.agent.deployment_model == "multi-tenant"
}

is_multi_tenant if {
  count(input.agent.tenant_ids) > 1
}

has_session_isolation if {
  input.agent.memory.session_isolation == true
  input.agent.memory.tenant_partitioning == true
  input.agent.memory.context_window_isolation == true
}

has_memory_hygiene if {
  input.agent.memory.auto_flush_enabled == true
  input.agent.memory.flush_interval_hours <= 24
  input.agent.memory.pii_scrubbing == true
}

# Memory retention limits by data type
max_retention := {
  "conversation": 24,
  "user_preferences": 168,
  "task_context": 4
}

violation contains result if {
  is_multi_tenant
  not has_session_isolation
  result := {
    "msg": "Multi-tenant agent requires session isolation",
    "severity": "soft-mandatory",
    "remediation": "Enable session and tenant partitioning"
  }
}

violation contains result if {
  is_multi_tenant
  input.agent.memory.flush_interval_hours > 24
  result := {
    "msg": sprintf("Memory flush interval %d hours exceeds 24-hour maximum", [input.agent.memory.flush_interval_hours]),
    "severity": "soft-mandatory"
  }
}

violation contains result if {
  is_multi_tenant
  not input.agent.memory.pii_scrubbing
  result := {
    "msg": "Multi-tenant agent requires PII scrubbing in memory",
    "severity": "hard-mandatory"
  }
}`,
  },
];

const MOCK_EXECUTIONS: PolicyExecution[] = [
  { id: 'exec-001', policyId: 'pol-001', policyName: 'Agent Risk Threshold', agentId: 'agent-003', agentName: 'DevOps Deployment Agent', result: 'fail', timestamp: '2026-06-14T10:23:00Z', details: 'Risk score 92 exceeds threshold 70', remediation: 'Reduce tool permissions or add compensating controls' },
  { id: 'exec-002', policyId: 'pol-002', policyName: 'Autonomy Level Approval', agentId: 'agent-003', agentName: 'DevOps Deployment Agent', result: 'warn', timestamp: '2026-06-14T10:23:00Z', details: 'Fully autonomous agent pending executive approval', remediation: 'Request approval from executive sponsor' },
  { id: 'exec-003', policyId: 'pol-007', policyName: 'Tool Permission Boundaries', agentId: 'agent-004', agentName: 'Fraud Detection Agent', result: 'fail', timestamp: '2026-06-15T09:15:00Z', details: 'Tool "account_blocker" requires human-in-the-loop controls', remediation: 'Enable human oversight for critical tools' },
  { id: 'exec-004', policyId: 'pol-008', policyName: 'MCP Server Allowlist', agentId: 'agent-005', agentName: 'Integration Agent', result: 'fail', timestamp: '2026-06-14T16:30:00Z', details: 'MCP server "mcp-custom-api" not in approved allowlist', remediation: 'Submit MCP server for security review' },
  { id: 'exec-005', policyId: 'pol-001', policyName: 'Agent Risk Threshold', agentId: 'agent-002', agentName: 'Trading Compliance Agent', result: 'pass', timestamp: '2026-06-12T14:15:00Z', details: 'Risk score 68 within acceptable range', remediation: undefined },
  { id: 'exec-006', policyId: 'pol-003', policyName: 'PII Data Access Guard', agentId: 'agent-001', agentName: 'Customer Service Agent', result: 'pass', timestamp: '2026-06-12T09:30:00Z', details: 'Agent has required PII certification', remediation: undefined },
  { id: 'exec-007', policyId: 'pol-010', policyName: 'Chain Depth & Cascade Risk', agentId: 'agent-006', agentName: 'Multi-Agent Orchestrator', result: 'warn', timestamp: '2026-06-13T11:45:00Z', details: 'Chain depth 4 exceeds production maximum 3', remediation: 'Reduce chain depth or add human-in-the-loop gates' },
  { id: 'exec-008', policyId: 'pol-011', policyName: 'Human Oversight Requirements', agentId: 'agent-007', agentName: 'Credit Decision Agent', result: 'pass', timestamp: '2026-06-16T08:00:00Z', details: 'Human oversight configured with real-time review', remediation: undefined },
  { id: 'exec-009', policyId: 'pol-012', policyName: 'Network Egress Controls', agentId: 'agent-008', agentName: 'External API Agent', result: 'fail', timestamp: '2026-06-16T14:22:00Z', details: 'Domain "api.untrusted-service.com" not in approved list', remediation: 'Submit domain for security review' },
  { id: 'exec-010', policyId: 'pol-014', policyName: 'Prompt Injection Defense', agentId: 'agent-001', agentName: 'Customer Service Agent', result: 'pass', timestamp: '2026-06-15T10:00:00Z', details: 'Defense coverage score 100%', remediation: undefined },
  { id: 'exec-011', policyId: 'pol-005', policyName: 'HRAIS Assessment Required', agentId: 'agent-002', agentName: 'Trading Compliance Agent', result: 'fail', timestamp: '2026-06-10T16:45:00Z', details: 'HRAIS assessment incomplete - missing control documentation', remediation: 'Complete control evidence in HRAIS Assessment' },
  { id: 'exec-012', policyId: 'pol-013', policyName: 'Model & Provider Governance', agentId: 'agent-009', agentName: 'Research Assistant', result: 'warn', timestamp: '2026-06-14T13:00:00Z', details: 'High-capability model requires guardrails', remediation: 'Enable Bedrock Guardrails for Claude Opus' },
];

const SEVERITY_STYLES = {
  'advisory': { bg: '#dbeafe', text: '#1e40af', label: 'Advisory' },
  'soft-mandatory': { bg: '#fef3c7', text: '#92400e', label: 'Soft Mandatory' },
  'hard-mandatory': { bg: '#fee2e2', text: '#991b1b', label: 'Hard Mandatory' },
};

const RESULT_STYLES = {
  pass: { bg: '#dcfce7', text: '#166534', icon: '✓' },
  fail: { bg: '#fee2e2', text: '#991b1b', icon: '✗' },
  warn: { bg: '#fef3c7', text: '#92400e', icon: '⚠' },
};

export default function PolicyAsCode() {
  const [selectedEngine, setSelectedEngine] = useState<string | 'all'>('all');
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyRule | null>(null);
  const [activeTab, setActiveTab] = useState<'policies' | 'executions' | 'integration'>('policies');
  const [showNewPolicyForm, setShowNewPolicyForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filteredPolicies = selectedEngine === 'all'
    ? MOCK_POLICIES
    : MOCK_POLICIES.filter(p => p.engine === selectedEngine);

  const stats = {
    total: MOCK_POLICIES.length,
    active: MOCK_POLICIES.filter(p => p.status === 'active').length,
    violations: MOCK_POLICIES.reduce((sum, p) => sum + p.violations, 0),
    hardMandatory: MOCK_POLICIES.filter(p => p.severity === 'hard-mandatory').length,
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Policy as Code</h2>
          <p className="text-sm text-slate-500">Governance policies enforced at deployment time via CI/CD integration</p>
        </div>
        <button
          onClick={() => {
            setShowNewPolicyForm(true);
            setToast('Opening policy editor — select an engine to begin');
            setTimeout(() => setToast(null), 2800);
          }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Policy
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-xs text-slate-500">Total Policies</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-emerald-600">{stats.active}</div>
          <div className="text-xs text-slate-500">Active</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-red-600">{stats.violations}</div>
          <div className="text-xs text-slate-500">Total Violations</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-amber-600">{stats.hardMandatory}</div>
          <div className="text-xs text-slate-500">Hard Mandatory</div>
        </div>
      </div>

      {/* Engine Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedEngine('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            selectedEngine === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Engines
        </button>
        {POLICY_ENGINES.map(engine => (
          <button
            key={engine.id}
            onClick={() => setSelectedEngine(engine.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              selectedEngine === engine.id
                ? 'text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            style={selectedEngine === engine.id ? { backgroundColor: engine.color } : {}}
          >
            <span>{engine.icon}</span>
            {engine.name}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Policy as code tabs" className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit">
        {(['policies', 'executions', 'integration'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Policy List */}
          <div className="space-y-3">
            {filteredPolicies.map(policy => {
              const engine = POLICY_ENGINES.find(e => e.id === policy.engine);
              const severity = SEVERITY_STYLES[policy.severity];
              return (
                <button
                  key={policy.id}
                  onClick={() => setSelectedPolicy(policy)}
                  className={`w-full text-left p-4 bg-white/80 backdrop-blur-sm rounded-xl border transition-all ${
                    selectedPolicy?.id === policy.id
                      ? 'border-indigo-300 ring-2 ring-indigo-100'
                      : 'border-slate-200/60 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{engine?.icon}</span>
                      <span className="font-medium text-slate-900">{policy.name}</span>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: severity.bg, color: severity.text }}
                    >
                      {severity.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-3">{policy.description}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-2 py-0.5 rounded ${
                      policy.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      policy.status === 'testing' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {policy.status}
                    </span>
                    {policy.violations > 0 && (
                      <span className="text-red-600">{policy.violations} violations</span>
                    )}
                    {policy.lastTriggered && (
                      <span className="text-slate-400">Last: {policy.lastTriggered}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Policy Detail / Code View */}
          {selectedPolicy && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
              <div className="p-4 border-b border-slate-200/60">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">{selectedPolicy.name}</h3>
                  <span
                    className="text-xs px-2 py-1 rounded-full font-medium"
                    style={{
                      backgroundColor: POLICY_ENGINES.find(e => e.id === selectedPolicy.engine)?.color + '20',
                      color: POLICY_ENGINES.find(e => e.id === selectedPolicy.engine)?.color,
                    }}
                  >
                    {POLICY_ENGINES.find(e => e.id === selectedPolicy.engine)?.name}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{selectedPolicy.description}</p>
              </div>
              <div className="p-4 bg-slate-900 overflow-auto max-h-[400px]">
                <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
                  {selectedPolicy.code}
                </pre>
              </div>
              <div className="p-4 border-t border-slate-200/60 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setToast(`Editing policy: ${selectedPolicy.name}`);
                    setTimeout(() => setToast(null), 2800);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Edit Policy
                </button>
                <button
                  onClick={() => {
                    setToast(`Running test for: ${selectedPolicy.name} — results will appear shortly`);
                    setTimeout(() => setToast(null), 2800);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Test Policy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'executions' && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Result</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Policy</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_EXECUTIONS.map(exec => {
                  const result = RESULT_STYLES[exec.result];
                  return (
                    <tr key={exec.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: result.bg, color: result.text }}
                        >
                          {result.icon} {exec.result.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-slate-900">{exec.policyName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">{exec.agentName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-600 max-w-xs truncate">{exec.details}</div>
                        {exec.remediation && (
                          <div className="text-xs text-indigo-600 mt-0.5">{exec.remediation}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400">
                          {new Date(exec.timestamp).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'integration' && (
        <div className="space-y-6">
          {/* CI/CD Integration Guide */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">CI/CD Pipeline Integration</h3>
            <p className="text-sm text-slate-600 mb-4">
              Integrate AVA policy checks into your deployment pipeline to enforce governance gates before agents reach production.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl mb-2">🔄</div>
                <div className="font-medium text-slate-900 mb-1">GitHub Actions</div>
                <div className="text-xs text-slate-500">Pre-deployment checks via ava-policy-action</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl mb-2">🚀</div>
                <div className="font-medium text-slate-900 mb-1">GitLab CI</div>
                <div className="text-xs text-slate-500">Policy stage in .gitlab-ci.yml</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl mb-2">⚡</div>
                <div className="font-medium text-slate-900 mb-1">Terraform Cloud</div>
                <div className="text-xs text-slate-500">Sentinel policy sets integration</div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 overflow-auto">
              <div className="text-xs text-slate-400 mb-2"># GitHub Actions Example</div>
              <pre className="text-sm text-emerald-400 font-mono">{`name: Agent Deployment
on: [push]

jobs:
  policy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: ava-platform/policy-action@v1
        with:
          ava-endpoint: \${{ secrets.AVA_API_URL }}
          agent-manifest: ./agent.yaml
          fail-on: hard-mandatory

  deploy:
    needs: policy-check
    runs-on: ubuntu-latest
    steps:
      - run: aws bedrock create-agent ...`}</pre>
            </div>
          </div>

          {/* API Reference */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Policy Check API</h3>
            <div className="bg-slate-900 rounded-lg p-4 overflow-auto">
              <pre className="text-sm text-slate-300 font-mono">{`POST /api/v1/policy/evaluate

{
  "agent_id": "agent-001",
  "agent_manifest": {
    "name": "Customer Service Agent",
    "autonomy_level": "semi-autonomous",
    "tools": [...],
    "data_access": [...]
  },
  "deployment_target": "production"
}

Response:
{
  "overall_result": "pass",
  "policies_evaluated": 15,
  "results": [
    { "policy": "pol-001", "result": "pass", "details": "Risk score 45 <= 70" },
    { "policy": "pol-002", "result": "pass", "details": "Not fully autonomous" },
    ...
  ],
  "blocking_violations": 0,
  "advisory_violations": 0
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
