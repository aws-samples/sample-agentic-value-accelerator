import { useState } from 'react';
import { policiesApi } from '../../api/client';

interface Props {
  onComplete: () => void;
}

type Step = 'preset' | 'configure' | 'review';

interface PolicyRule {
  id: string;
  type: 'allow' | 'deny' | 'require' | 'limit';
  category: string;
  target: string;
  condition: string;
  value: string;
  action: 'block' | 'warn' | 'log';
}

interface PolicyConfig {
  name: string;
  description: string;
  resource_type: 'agent' | 'gateway' | 'tool';
  resource_id: string;
  rules: PolicyRule[];
}

type PresetCategory = 'security' | 'cost' | 'compliance' | 'operational' | 'fsi' | 'healthcare' | 'hitl' | 'isolation' | 'multiagent';

interface Preset {
  id: string;
  name: string;
  description: string;
  tags: string[];
  icon: string;
  color: string;
  category: PresetCategory;
  rules: PolicyRule[];
}

const PRESETS: Preset[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY A: OPERATIONAL SAFETY — Preventing Catastrophic Actions
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'A1-production-read-only',
    name: 'Production Read-Only',
    description: 'Block all write/delete/mutate actions in production environments. Enterprise-mandated safety control.',
    tags: ['Enterprise', 'FFIEC IT', 'SOX ITGC'],
    icon: '🛡️',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'database_write', condition: 'always', value: '', action: 'block' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'file_write', condition: 'always', value: '', action: 'block' as const },
      { id: '3', type: 'deny' as const, category: 'data', target: 's3_bucket', condition: 'write', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'A2-terraform-plan-only',
    name: 'Terraform Plan Only',
    description: 'Allow terraform plan; block apply/destroy. Prevents accidental infrastructure destruction.',
    tags: ['IaC', 'Terraform', 'LOB'],
    icon: '📋',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'contains', value: 'terraform apply', action: 'block' as const },
      { id: '2', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'contains', value: 'terraform destroy', action: 'block' as const },
    ],
  },
  {
    id: 'A3-iac-non-prod-only',
    name: 'IaC Non-Prod Only',
    description: 'Permit infrastructure-as-code operations only in dev/staging/sandbox environments.',
    tags: ['IaC', 'Non-Prod', 'LOB'],
    icon: '🔧',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'env_prod', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'A4-critical-resource-protection',
    name: 'Critical Resource Protection',
    description: 'Block modification of resources tagged critical: true. FFIEC Business Continuity aligned.',
    tags: ['Enterprise', 'FFIEC', 'Critical'],
    icon: '🔐',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'data', target: 's3_bucket', condition: 'tag_critical', value: '', action: 'block' as const },
      { id: '2', type: 'deny' as const, category: 'data', target: 'dynamodb_table', condition: 'tag_critical', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'A5-blast-radius-limit',
    name: 'Blast Radius Limit',
    description: 'Cap records affected by a single operation. Requires stateful context enrichment.',
    tags: ['Stateful', 'LOB', 'Safety'],
    icon: '💥',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'limit' as const, category: 'execution', target: 'max_concurrent', condition: 'exceeds', value: '100', action: 'block' as const },
    ],
  },
  {
    id: 'A6-no-iam-escalation',
    name: 'No IAM Escalation',
    description: 'Block IAM role/policy/security group modifications. NIST PR.AC and PCI-DSS 7.1 aligned.',
    tags: ['Enterprise', 'NIST', 'PCI-DSS'],
    icon: '🚫',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'contains', value: 'iam:', action: 'block' as const },
      { id: '2', type: 'deny' as const, category: 'compliance', target: 'human_approval', condition: 'iam_change', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'A7-destructive-cooldown',
    name: 'Destructive Action Cooldown',
    description: 'Block repeated destructive invocations within a session. Requires stateful tracking.',
    tags: ['Stateful', 'LOB', 'Safety'],
    icon: '⏱️',
    color: 'red',
    category: 'security',
    rules: [
      { id: '1', type: 'limit' as const, category: 'execution', target: 'max_retries', condition: 'exceeds', value: '1', action: 'block' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY B: HUMAN-IN-THE-LOOP — Approval Patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'B1-high-value-txn-approval',
    name: 'High-Value Transaction Approval',
    description: 'Transactions above threshold require human sign-off. BSA/AML and SOX aligned.',
    tags: ['LOB', 'BSA/AML', 'SOX'],
    icon: '💵',
    color: 'orange',
    category: 'hitl',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'human_approval', condition: 'amount_exceeds', value: '10000', action: 'block' as const },
    ],
  },
  {
    id: 'B2-dual-control',
    name: 'Dual Control Enforcement',
    description: 'Critical actions require a second authorized individual. SOX §404 and FFIEC aligned.',
    tags: ['Enterprise', 'SOX §404', 'FFIEC'],
    icon: '👥',
    color: 'orange',
    category: 'hitl',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'human_approval', condition: 'dual_control', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'B3-account-closure-review',
    name: 'Account Closure Review',
    description: 'Account closure requires human + compliance officer approval.',
    tags: ['LOB', 'Compliance', 'HITL'],
    icon: '📝',
    color: 'orange',
    category: 'hitl',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'human_approval', condition: 'account_closure', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'B4-infrastructure-change-gate',
    name: 'Infrastructure Change Gate',
    description: 'IaC apply in production requires human approval. SOX ITGC aligned.',
    tags: ['LOB', 'SOX ITGC', 'IaC'],
    icon: '🚧',
    color: 'orange',
    category: 'hitl',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'human_approval', condition: 'iac_prod', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'B5-exception-escalation',
    name: 'Exception Escalation',
    description: 'Soft-limit violations escalate to human for review before proceeding.',
    tags: ['LOB', 'Escalation', 'HITL'],
    icon: '⚠️',
    color: 'orange',
    category: 'hitl',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'human_approval', condition: 'soft_limit', value: '', action: 'warn' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY C: FINANCIAL SERVICES COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'C1-aml-transaction-threshold',
    name: 'AML Transaction Threshold',
    description: 'Halt transactions exceeding SAR thresholds. BSA 31 CFR 1010.320 aligned.',
    tags: ['LOB', 'BSA', 'AML', 'Stateful'],
    icon: '🔍',
    color: 'violet',
    category: 'compliance',
    rules: [
      { id: '1', type: 'limit' as const, category: 'tokens', target: 'max_daily_spend', condition: 'exceeds', value: '10000', action: 'block' as const },
      { id: '2', type: 'require' as const, category: 'compliance', target: 'human_approval', condition: 'sar_threshold', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'C2-ofac-geographic-block',
    name: 'OFAC Geographic Block',
    description: 'Block transactions involving sanctioned jurisdictions. OFAC 31 CFR 501 aligned.',
    tags: ['Enterprise', 'OFAC', 'Sanctions'],
    icon: '🌍',
    color: 'violet',
    category: 'compliance',
    rules: [
      { id: '1', type: 'deny' as const, category: 'network', target: 'external_egress', condition: 'sanctioned_geo', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'C3-segregation-of-duties',
    name: 'Segregation of Duties',
    description: 'Initiator cannot also approve. SOX §404 and PCI-DSS 6.4.2 aligned.',
    tags: ['Enterprise', 'SOX §404', 'PCI-DSS'],
    icon: '⚖️',
    color: 'violet',
    category: 'compliance',
    rules: [
      { id: '1', type: 'deny' as const, category: 'compliance', target: 'human_approval', condition: 'same_user', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'C4-customer-consent-gate',
    name: 'Customer Consent Gate',
    description: 'Block credit bureau access without consent token. FCRA §604 and GDPR Art. 6 aligned.',
    tags: ['LOB', 'FCRA', 'GDPR'],
    icon: '✅',
    color: 'violet',
    category: 'compliance',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'data_classification', condition: 'consent_required', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'C5-pci-scope-isolation',
    name: 'PCI Scope Isolation',
    description: 'PCI-scoped agents cannot invoke non-PCI tools. PCI-DSS Req 1.2, 7.1 aligned.',
    tags: ['Enterprise', 'PCI-DSS', 'Isolation'],
    icon: '💳',
    color: 'violet',
    category: 'compliance',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'http_request', condition: 'non_pci', value: '', action: 'block' as const },
      { id: '2', type: 'require' as const, category: 'compliance', target: 'guardrail_attached', condition: 'pci_scope', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'C6-payment-rate-limiting',
    name: 'Payment Rate Limiting',
    description: 'Cap payment actions per account per time window. Requires stateful context.',
    tags: ['LOB', 'Payments', 'Stateful'],
    icon: '⏰',
    color: 'violet',
    category: 'compliance',
    rules: [
      { id: '1', type: 'limit' as const, category: 'tokens', target: 'max_tokens_per_hour', condition: 'exceeds', value: '100', action: 'block' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY D: TENANT & SCOPE ISOLATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'D1-single-tenant-boundary',
    name: 'Single Tenant Boundary',
    description: 'Agent scoped to requesting customer\'s data only. PCI-DSS 7.1 and SOC 2 CC6.1 aligned.',
    tags: ['Enterprise', 'PCI-DSS', 'SOC 2'],
    icon: '🏢',
    color: 'blue',
    category: 'isolation',
    rules: [
      { id: '1', type: 'deny' as const, category: 'data', target: 's3_bucket', condition: 'cross_tenant', value: '', action: 'block' as const },
      { id: '2', type: 'deny' as const, category: 'data', target: 'dynamodb_table', condition: 'cross_tenant', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'D2-tool-allowlist',
    name: 'Tool Allowlist',
    description: 'Agent can only invoke explicitly permitted tools. NIST PR.AC-4 least privilege aligned.',
    tags: ['Agent', 'NIST', 'Least Privilege'],
    icon: '📋',
    color: 'blue',
    category: 'isolation',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'not_allowlisted', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'D3-session-scope',
    name: 'Session Scope Enforcement',
    description: 'Agent cannot access data outside session context boundaries.',
    tags: ['LOB', 'Session', 'Isolation'],
    icon: '🔒',
    color: 'blue',
    category: 'isolation',
    rules: [
      { id: '1', type: 'deny' as const, category: 'data', target: 's3_bucket', condition: 'out_of_session', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'D4-cross-account-block',
    name: 'Cross-Account Block',
    description: 'Block actions in unauthorized AWS accounts. Prevents lateral movement.',
    tags: ['Enterprise', 'AWS', 'Isolation'],
    icon: '🚫',
    color: 'blue',
    category: 'isolation',
    rules: [
      { id: '1', type: 'deny' as const, category: 'network', target: 'external_egress', condition: 'cross_account', value: '', action: 'block' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY E: AUDIT & GOVERNANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'E1-mandatory-audit-context',
    name: 'Mandatory Audit Context',
    description: 'All invocations must include audit metadata. SOX, FFIEC, PCI-DSS 10.1 aligned.',
    tags: ['Enterprise', 'SOX', 'PCI-DSS'],
    icon: '📋',
    color: 'slate',
    category: 'operational',
    rules: [
      { id: '1', type: 'require' as const, category: 'observability', target: 'tracing_enabled', condition: 'always', value: '', action: 'block' as const },
      { id: '2', type: 'require' as const, category: 'observability', target: 'log_all_tool_calls', condition: 'always', value: '', action: 'log' as const },
      { id: '3', type: 'require' as const, category: 'observability', target: 'log_all_llm_calls', condition: 'always', value: '', action: 'log' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY F: MULTI-AGENT GOVERNANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'F1-supervisor-delegation-allowlist',
    name: 'Supervisor Delegation Allowlist',
    description: 'Supervisor can only invoke explicitly registered task agents. NIST PR.AC-4 aligned.',
    tags: ['LOB', 'Multi-Agent', 'NIST'],
    icon: '👔',
    color: 'indigo',
    category: 'multiagent',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'unregistered_agent', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'F2-task-agent-lateral-block',
    name: 'Task Agent Lateral Block',
    description: 'Task agents cannot invoke other task agents directly — must route through supervisor.',
    tags: ['Enterprise', 'Multi-Agent', 'Safety'],
    icon: '🚧',
    color: 'indigo',
    category: 'multiagent',
    rules: [
      { id: '1', type: 'deny' as const, category: 'tools', target: 'bash_execution', condition: 'lateral_call', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'F3-context-propagation',
    name: 'Context Propagation Enforcement',
    description: 'Task agent tool calls must carry forward original user principal and audit context. SOX §404 aligned.',
    tags: ['Enterprise', 'SOX §404', 'PCI-DSS'],
    icon: '🔗',
    color: 'indigo',
    category: 'multiagent',
    rules: [
      { id: '1', type: 'require' as const, category: 'observability', target: 'tracing_enabled', condition: 'propagate', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'F4-delegation-scope-narrowing',
    name: 'Delegation Scope Narrowing',
    description: 'Task agent\'s permitted actions must be a strict subset of supervisor\'s delegated scope. Least privilege.',
    tags: ['Enterprise', 'NIST', 'Least Privilege'],
    icon: '📉',
    color: 'indigo',
    category: 'multiagent',
    rules: [
      { id: '1', type: 'deny' as const, category: 'compliance', target: 'human_approval', condition: 'scope_escalation', value: '', action: 'block' as const },
    ],
  },
  {
    id: 'F5-delegation-depth-limit',
    name: 'Delegation Depth Limit',
    description: 'Prevent delegation chains longer than N levels (e.g., supervisor → task → sub-task blocked).',
    tags: ['LOB', 'Multi-Agent', 'Safety'],
    icon: '📊',
    color: 'indigo',
    category: 'multiagent',
    rules: [
      { id: '1', type: 'limit' as const, category: 'execution', target: 'max_turns', condition: 'exceeds', value: '2', action: 'block' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL: COST CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'cost-model-tier',
    name: 'Model Tier Restriction',
    description: 'Limit which foundation models agents can invoke based on cost tier classification.',
    tags: ['Cost', 'Bedrock', 'All Scopes'],
    icon: '🧠',
    color: 'amber',
    category: 'cost',
    rules: [
      { id: '1', type: 'deny' as const, category: 'models', target: 'model_tier', condition: 'equals', value: 'opus', action: 'block' as const },
    ],
  },
  {
    id: 'cost-token-budget',
    name: 'Token Budget Policy',
    description: 'Enforce per-agent and per-session token consumption limits.',
    tags: ['Cost', 'Tokens', 'All Scopes'],
    icon: '📊',
    color: 'amber',
    category: 'cost',
    rules: [
      { id: '1', type: 'limit' as const, category: 'tokens', target: 'max_tokens_per_invocation', condition: 'exceeds', value: '100000', action: 'block' as const },
      { id: '2', type: 'limit' as const, category: 'tokens', target: 'max_daily_spend', condition: 'exceeds', value: '1000', action: 'warn' as const },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL: HEALTHCARE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'healthcare-phi-policy',
    name: 'Healthcare PHI Access Policy',
    description: 'HIPAA-compliant policy for agents handling Protected Health Information.',
    tags: ['Healthcare', 'HIPAA', 'PHI'],
    icon: '🏥',
    color: 'cyan',
    category: 'healthcare',
    rules: [
      { id: '1', type: 'require' as const, category: 'compliance', target: 'guardrail_attached', condition: 'always', value: '', action: 'block' as const },
      { id: '2', type: 'require' as const, category: 'compliance', target: 'data_classification', condition: 'always', value: '', action: 'block' as const },
      { id: '3', type: 'require' as const, category: 'observability', target: 'tracing_enabled', condition: 'always', value: '', action: 'block' as const },
      { id: '4', type: 'deny' as const, category: 'network', target: 'external_egress', condition: 'always', value: '', action: 'block' as const },
    ],
  },
];

const CATEGORY_META: Record<PresetCategory, { label: string; bg: string; text: string }> = {
  security: { label: 'Operational Safety', bg: 'bg-rose-50', text: 'text-rose-700' },
  hitl: { label: 'Human-in-Loop', bg: 'bg-orange-50', text: 'text-orange-700' },
  compliance: { label: 'FSI Compliance', bg: 'bg-violet-50', text: 'text-violet-700' },
  isolation: { label: 'Isolation', bg: 'bg-blue-50', text: 'text-blue-700' },
  operational: { label: 'Audit', bg: 'bg-slate-50', text: 'text-slate-700' },
  multiagent: { label: 'Multi-Agent', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  cost: { label: 'Cost Control', bg: 'bg-amber-50', text: 'text-amber-700' },
  fsi: { label: 'FSI', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  healthcare: { label: 'Healthcare', bg: 'bg-cyan-50', text: 'text-cyan-700' },
};

const RULE_CATEGORIES = [
  { id: 'tools', label: 'Tool Access', icon: '🔧', description: 'Control which tools agents can invoke' },
  { id: 'models', label: 'Model Access', icon: '🧠', description: 'Restrict model tiers and providers' },
  { id: 'tokens', label: 'Token Limits', icon: '📊', description: 'Budget caps per invocation or time period' },
  { id: 'data', label: 'Data Access', icon: '🗄️', description: 'S3, DynamoDB, Secrets Manager boundaries' },
  { id: 'network', label: 'Network', icon: '🌐', description: 'Egress controls and API allowlists' },
  { id: 'compliance', label: 'Compliance', icon: '✅', description: 'Require guardrails, approval workflows' },
  { id: 'observability', label: 'Observability', icon: '👁️', description: 'Mandate tracing and logging' },
  { id: 'execution', label: 'Execution', icon: '⚡', description: 'Timeout, concurrency, retry limits' },
];

const TARGET_OPTIONS: Record<string, { value: string; label: string }[]> = {
  tools: [
    { value: 'bash_execution', label: 'Shell/Bash Execution' },
    { value: 'file_write', label: 'File System Write' },
    { value: 'file_read', label: 'File System Read' },
    { value: 'http_request', label: 'HTTP Requests' },
    { value: 'database_write', label: 'Database Write' },
    { value: 'database_read', label: 'Database Read' },
  ],
  models: [
    { value: 'model_tier', label: 'Model Tier (opus/sonnet/haiku)' },
    { value: 'model_provider', label: 'Model Provider' },
    { value: 'model_region', label: 'Model Region' },
  ],
  tokens: [
    { value: 'max_tokens_per_invocation', label: 'Max Tokens Per Invocation' },
    { value: 'max_tokens_per_hour', label: 'Max Tokens Per Hour' },
    { value: 'max_daily_spend', label: 'Max Daily Spend ($)' },
    { value: 'max_monthly_spend', label: 'Max Monthly Spend ($)' },
  ],
  data: [
    { value: 's3_bucket', label: 'S3 Bucket' },
    { value: 'dynamodb_table', label: 'DynamoDB Table' },
    { value: 'secrets_manager', label: 'Secrets Manager' },
    { value: 'external_api', label: 'External API Endpoint' },
  ],
  network: [
    { value: 'external_egress', label: 'External Internet Egress' },
    { value: 'vpc_only', label: 'VPC-Only Communication' },
    { value: 'api_allowlist', label: 'API Domain Allowlist' },
  ],
  compliance: [
    { value: 'guardrail_attached', label: 'Guardrail Must Be Attached' },
    { value: 'human_approval', label: 'Human Approval Required' },
    { value: 'data_classification', label: 'Data Classification Check' },
  ],
  observability: [
    { value: 'tracing_enabled', label: 'Tracing Enabled' },
    { value: 'log_all_tool_calls', label: 'Log All Tool Calls' },
    { value: 'log_all_llm_calls', label: 'Log All LLM Invocations' },
    { value: 'log_data_access', label: 'Log Data Access Events' },
  ],
  execution: [
    { value: 'max_execution_time', label: 'Max Execution Time (seconds)' },
    { value: 'max_concurrent', label: 'Max Concurrent Invocations' },
    { value: 'max_retries', label: 'Max Retries' },
    { value: 'max_turns', label: 'Max Agent Turns' },
  ],
};

export default function PolicyBuilder({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('preset');
  const [config, setConfig] = useState<PolicyConfig>({
    name: '',
    description: '',
    resource_type: 'agent',
    resource_id: '',
    rules: [],
  });
  const [expandedCategory, setExpandedCategory] = useState<string | null>('tools');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setConfig({
      ...config,
      name: preset.name,
      description: preset.description,
      rules: preset.rules,
    });
    setStep('configure');
  };

  const addRule = (category: string) => {
    const targets = TARGET_OPTIONS[category] || [];
    const newRule: PolicyRule = {
      id: Date.now().toString(),
      type: 'deny',
      category,
      target: targets[0]?.value || '',
      condition: 'always',
      value: '',
      action: 'block',
    };
    setConfig({ ...config, rules: [...config.rules, newRule] });
  };

  const updateRule = (id: string, updates: Partial<PolicyRule>) => {
    setConfig({
      ...config,
      rules: config.rules.map(r => r.id === id ? { ...r, ...updates } : r),
    });
  };

  const removeRule = (id: string) => {
    setConfig({ ...config, rules: config.rules.filter(r => r.id !== id) });
  };

  const handleCreate = async () => {
    if (!config.name.trim()) { setError('Please provide a policy name'); return; }
    if (config.rules.length === 0) { setError('Add at least one rule'); return; }
    setCreating(true);
    setError('');
    try {
      await policiesApi.create({
        name: config.name,
        description: config.description || undefined,
        resource_type: config.resource_type,
        resource_id: config.resource_id || undefined,
        rules: config.rules,
      });
      onComplete();
    } catch (e: any) {
      setError(e?.message || 'Failed to create policy');
    } finally {
      setCreating(false);
    }
  };

  const getRulesForCategory = (cat: string) => config.rules.filter(r => r.category === cat);

  // Generate Cedar policy preview (mirrors backend rules_to_cedar logic)
  const generateCedarPreview = (): string => {
    const blockingRules = config.rules.filter(r => r.action === 'block' || r.action === 'warn');
    if (blockingRules.length === 0) {
      return 'permit(principal, action, resource is AgentCore::Gateway);';
    }

    const conditions = blockingRules.map((rule) => {
      const field = rule.target;
      if (rule.type === 'limit' && rule.value) {
        return `context has ${field} && context.${field} > ${rule.value}`;
      }
      if (rule.type === 'deny') {
        if (rule.value) {
          return `context has ${field} && context.${field} == "${rule.value}"`;
        }
        return `context has ${field} && context.${field} == true`;
      }
      if (rule.type === 'require') {
        return `!(context has ${field}) || context.${field} == false`;
      }
      if (rule.type === 'allow' && rule.value) {
        return `context has ${field} && !(context.${field} like "${rule.value}*")`;
      }
      return `context has ${field}`;
    });

    const combined = conditions.map(c => `(${c})`).join('\n    || ');
    return `forbid(\n  principal,\n  action,\n  resource is AgentCore::Gateway\n) when {\n    ${combined}\n};`;
  };

  const typeColors = {
    allow: 'bg-green-100 text-green-700 border-green-200',
    deny: 'bg-red-100 text-red-700 border-red-200',
    require: 'bg-blue-100 text-blue-700 border-blue-200',
    limit: 'bg-amber-100 text-amber-700 border-amber-200',
  };

  const actionColors = {
    block: 'bg-red-500 text-white',
    warn: 'bg-amber-500 text-white',
    log: 'bg-slate-500 text-white',
  };

  // --- Step: Preset selection ---
  const [presetChoice, setPresetChoice] = useState<'scratch' | 'template' | null>(null);
  const [filterCategory, setFilterCategory] = useState<'all' | PresetCategory>('all');

  if (step === 'preset') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create AgentCore Policy</h2>
            <p className="text-sm text-slate-500 mt-1">Choose how you want to get started</p>
          </div>
        </div>

        {/* Two Main Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start from scratch */}
          <button
            onClick={() => setPresetChoice('scratch')}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              presetChoice === 'scratch'
                ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                presetChoice === 'scratch' ? 'bg-indigo-100' : 'bg-slate-100'
              }`}>
                <svg className={`w-7 h-7 ${presetChoice === 'scratch' ? 'text-indigo-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${presetChoice === 'scratch' ? 'text-indigo-900' : 'text-slate-900'}`}>
                  Start from Scratch
                </h3>
                <p className="text-sm text-slate-500">Build a fully custom Cedar policy</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Full control over every rule
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Add rules one category at a time
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Best for unique requirements
              </li>
            </ul>
          </button>

          {/* Choose a template */}
          <button
            onClick={() => setPresetChoice('template')}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              presetChoice === 'template'
                ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                presetChoice === 'template' ? 'bg-indigo-100' : 'bg-slate-100'
              }`}>
                <svg className={`w-7 h-7 ${presetChoice === 'template' ? 'text-indigo-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${presetChoice === 'template' ? 'text-indigo-900' : 'text-slate-900'}`}>
                  Choose a Template
                </h3>
                <p className="text-sm text-slate-500">Start with a pre-built configuration</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {PRESETS.length} security & operational presets
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Production-ready configurations
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Customize after selecting
              </li>
            </ul>
          </button>
        </div>

        {/* Continue Button for Scratch */}
        {presetChoice === 'scratch' && (
          <div className="flex justify-end">
            <button
              onClick={() => setStep('configure')}
              className="btn-primary px-6 py-2.5 text-sm"
            >
              Continue with Empty Policy
            </button>
          </div>
        )}

        {/* Template Library (shown when template is selected) */}
        {presetChoice === 'template' && (
          <div className="mt-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Select a Template</h3>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {(['all', 'security', 'hitl', 'compliance', 'isolation', 'operational', 'multiagent', 'cost', 'healthcare'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                        filterCategory === cat
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {cat === 'all' ? 'All' : CATEGORY_META[cat as PresetCategory]?.label || cat}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-500">
                  {filterCategory === 'all' ? PRESETS.length : PRESETS.filter(p => p.category === filterCategory).length} templates
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[450px] overflow-y-auto pr-1">
              {PRESETS.filter(p => filterCategory === 'all' || p.category === filterCategory).map((preset) => {
                const catMeta = CATEGORY_META[preset.category];
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="bg-white p-4 rounded-xl border border-slate-200 text-left hover:border-indigo-300 hover:shadow-md transition-all group relative overflow-hidden"
                  >
                    {/* Gradient accent */}
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                      preset.color === 'red' ? 'from-rose-400 to-rose-600' :
                      preset.color === 'amber' ? 'from-amber-400 to-amber-600' :
                      preset.color === 'blue' ? 'from-blue-400 to-blue-600' :
                      preset.color === 'emerald' ? 'from-emerald-400 to-emerald-600' :
                      preset.color === 'cyan' ? 'from-cyan-400 to-cyan-600' :
                      'from-slate-400 to-slate-600'
                    }`} />

                    <div className="flex items-start gap-3 pt-2">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                        preset.color === 'red' ? 'bg-rose-50' :
                        preset.color === 'amber' ? 'bg-amber-50' :
                        preset.color === 'blue' ? 'bg-blue-50' :
                        preset.color === 'emerald' ? 'bg-emerald-50' :
                        preset.color === 'cyan' ? 'bg-cyan-50' :
                        'bg-slate-50'
                      }`}>
                        {preset.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${catMeta.bg} ${catMeta.text}`}>
                            {catMeta.label}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-slate-900 group-hover:text-indigo-700 line-clamp-1">{preset.name}</h4>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{preset.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {preset.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 text-[9px] font-medium bg-slate-100 text-slate-500 rounded">{tag}</span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-slate-400">{preset.rules.length} rules</span>
                          <span className="text-slate-300">·</span>
                          {preset.rules.slice(0, 3).map((r, i) => (
                            <span key={i} className={`px-1 py-0.5 text-[8px] font-bold rounded ${typeColors[r.type]}`}>
                              {r.type.toUpperCase()}
                            </span>
                          ))}
                          {preset.rules.length > 3 && (
                            <span className="text-[9px] text-slate-400">+{preset.rules.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Step: Configure ---
  if (step === 'configure') {
    return (
      <div className="h-[calc(100vh-12rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Configure Policy Rules</h2>
            <p className="text-sm text-slate-500 mt-0.5">{config.rules.length} rule{config.rules.length !== 1 ? 's' : ''} defined</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('preset')} className="btn-secondary text-sm">Back</button>
            <button onClick={() => setStep('review')} className="btn-primary text-sm">Review & Create</button>
          </div>
        </div>

        {/* Resource scope selector */}
        <div className="flex-shrink-0 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border border-indigo-200/60 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Attach to:</span>
            </div>
            <div className="flex gap-2">
              {(['agent', 'gateway', 'tool'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setConfig({ ...config, resource_type: type })}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    config.resource_type === type
                      ? 'bg-white text-indigo-700 shadow-md border border-indigo-200'
                      : 'text-indigo-500 hover:bg-white/50'
                  }`}
                >
                  {type === 'agent' && '🤖 '}
                  {type === 'gateway' && '🚪 '}
                  {type === 'tool' && '🔧 '}
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex-1 max-w-xs">
              <input
                type="text"
                value={config.resource_id}
                onChange={(e) => setConfig({ ...config, resource_id: e.target.value })}
                placeholder={`${config.resource_type} name or ID (optional)`}
                className="input-field w-full text-xs"
              />
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 grid grid-cols-5 gap-4 min-h-0">
          {/* Left: Rule categories + builder */}
          <div className="col-span-3 overflow-y-auto pr-1 space-y-2">
            {RULE_CATEGORIES.map(({ id, label, icon, description }) => {
              const isExpanded = expandedCategory === id;
              const catRules = getRulesForCategory(id);
              const hasRules = catRules.length > 0;

              return (
                <div key={id} className={`rounded-xl border transition-all duration-200 ${
                  isExpanded ? 'bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-100' : hasRules ? 'bg-white border-slate-200' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}>
                  {/* Category header */}
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-lg flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{label}</span>
                        {hasRules && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
                            {catRules.length} RULE{catRules.length > 1 ? 'S' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Category content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                      {/* Existing rules */}
                      {catRules.map((rule) => (
                        <div key={rule.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                          <div className="flex items-center gap-2">
                            {/* Rule type */}
                            <select
                              value={rule.type}
                              onChange={(e) => updateRule(rule.id, { type: e.target.value as PolicyRule['type'] })}
                              className={`px-2 py-1 rounded-md text-[11px] font-bold border ${typeColors[rule.type]} cursor-pointer`}
                            >
                              <option value="deny">DENY</option>
                              <option value="allow">ALLOW</option>
                              <option value="require">REQUIRE</option>
                              <option value="limit">LIMIT</option>
                            </select>

                            {/* Target */}
                            <select
                              value={rule.target}
                              onChange={(e) => updateRule(rule.id, { target: e.target.value })}
                              className="flex-1 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                            >
                              {(TARGET_OPTIONS[id] || []).map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>

                            {/* Action */}
                            <select
                              value={rule.action}
                              onChange={(e) => updateRule(rule.id, { action: e.target.value as PolicyRule['action'] })}
                              className={`px-2 py-1 rounded-md text-[11px] font-bold ${actionColors[rule.action]} cursor-pointer border-0`}
                            >
                              <option value="block">BLOCK</option>
                              <option value="warn">WARN</option>
                              <option value="log">LOG</option>
                            </select>

                            {/* Remove */}
                            <button
                              onClick={() => removeRule(rule.id)}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          {/* Value configuration row */}
                          <div className="flex items-center gap-2 pl-1">
                            {/* Token/spend limits */}
                            {(rule.target === 'max_tokens_per_invocation' || rule.target === 'max_tokens_per_hour') && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">Max tokens:</span>
                                <input
                                  type="number"
                                  value={rule.value}
                                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                  placeholder="e.g., 50000"
                                  className="w-28 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                                />
                                <div className="flex gap-1 ml-2">
                                  {['10000', '50000', '100000'].map(v => (
                                    <button key={v} onClick={() => updateRule(rule.id, { value: v })}
                                      className={`px-2 py-1 rounded text-[10px] font-medium ${rule.value === v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                      {Number(v).toLocaleString()}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(rule.target === 'max_daily_spend' || rule.target === 'max_monthly_spend') && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">Max spend ($):</span>
                                <input
                                  type="number"
                                  value={rule.value}
                                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                  placeholder="e.g., 500"
                                  className="w-24 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                                />
                                <div className="flex gap-1 ml-2">
                                  {['100', '500', '1000', '5000'].map(v => (
                                    <button key={v} onClick={() => updateRule(rule.id, { value: v })}
                                      className={`px-2 py-1 rounded text-[10px] font-medium ${rule.value === v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                      ${v}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Model tier selection */}
                            {rule.target === 'model_tier' && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">{rule.type === 'deny' ? 'Block model:' : 'Allow model:'}</span>
                                <div className="flex gap-1">
                                  {['haiku', 'sonnet', 'opus'].map(model => (
                                    <button key={model} onClick={() => updateRule(rule.id, { value: model })}
                                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                        rule.value === model
                                          ? model === 'opus' ? 'bg-purple-100 text-purple-700 border border-purple-300' :
                                            model === 'sonnet' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                                            'bg-green-100 text-green-700 border border-green-300'
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-transparent'
                                      }`}>
                                      {model.charAt(0).toUpperCase() + model.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Model provider */}
                            {rule.target === 'model_provider' && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">Provider:</span>
                                <div className="flex gap-1">
                                  {['anthropic', 'amazon', 'meta', 'cohere'].map(p => (
                                    <button key={p} onClick={() => updateRule(rule.id, { value: p })}
                                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${rule.value === p ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-transparent'}`}>
                                      {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Model region */}
                            {rule.target === 'model_region' && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">Region:</span>
                                <select
                                  value={rule.value}
                                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                  className="px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                                >
                                  <option value="">Select region</option>
                                  <option value="us-east-1">us-east-1</option>
                                  <option value="us-west-2">us-west-2</option>
                                  <option value="eu-west-1">eu-west-1</option>
                                  <option value="ap-southeast-1">ap-southeast-1</option>
                                </select>
                              </div>
                            )}
                            {/* S3 bucket / DynamoDB / API */}
                            {(rule.target === 's3_bucket' || rule.target === 'dynamodb_table' || rule.target === 'external_api' || rule.target === 'api_allowlist') && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">
                                  {rule.target === 's3_bucket' ? 'Bucket name/prefix:' :
                                   rule.target === 'dynamodb_table' ? 'Table name/prefix:' :
                                   'Domain/URL:'}
                                </span>
                                <input
                                  type="text"
                                  value={rule.value}
                                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                  placeholder={rule.target === 's3_bucket' ? 'e.g., customer-data-*' :
                                    rule.target === 'dynamodb_table' ? 'e.g., prod-*' : 'e.g., api.company.com'}
                                  className="flex-1 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                                />
                              </div>
                            )}
                            {/* Execution limits */}
                            {(rule.target === 'max_execution_time' || rule.target === 'max_concurrent' || rule.target === 'max_retries' || rule.target === 'max_turns') && (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[11px] text-slate-500">
                                  {rule.target === 'max_execution_time' ? 'Seconds:' :
                                   rule.target === 'max_concurrent' ? 'Max concurrent:' :
                                   rule.target === 'max_retries' ? 'Max retries:' : 'Max turns:'}
                                </span>
                                <input
                                  type="number"
                                  value={rule.value}
                                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                                  placeholder={rule.target === 'max_execution_time' ? '60' : '10'}
                                  className="w-20 px-2 py-1.5 rounded-md text-xs border border-slate-200 bg-white"
                                />
                                {rule.target === 'max_execution_time' && (
                                  <div className="flex gap-1 ml-2">
                                    {['30', '60', '120', '300'].map(v => (
                                      <button key={v} onClick={() => updateRule(rule.id, { value: v })}
                                        className={`px-2 py-1 rounded text-[10px] font-medium ${rule.value === v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                        {v}s
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Add rule button */}
                      <button
                        onClick={() => addRule(id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-600 text-xs font-medium hover:bg-indigo-50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Rule
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Live simulation preview */}
          <div className="col-span-2 overflow-y-auto">
            <div className="sticky top-0 bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col">
              {/* Preview header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-t-xl flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${config.rules.length > 0 ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-xs font-semibold text-slate-700">Policy Simulation</span>
                <span className="ml-auto text-[10px] text-slate-400">{config.rules.length} rules active</span>
              </div>

              {/* Simulation content */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                {config.rules.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
                    <svg className="w-12 h-12 text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-500">No rules defined</p>
                    <p className="text-xs text-slate-400 mt-1">Add rules to see how they affect agent behavior</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Simulated agent request */}
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Simulated Agent Request</div>

                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🤖</span>
                        <span className="text-xs font-semibold text-slate-700">customer_service_agent</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        "Retrieving customer data from S3, calling external API for credit check, executing analysis with Claude Opus..."
                      </p>
                    </div>

                    {/* Policy evaluation results */}
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mt-4 mb-2">Policy Evaluation</div>

                    {config.rules.map((rule) => {
                      const targets = TARGET_OPTIONS[rule.category] || [];
                      const targetLabel = targets.find(t => t.value === rule.target)?.label || rule.target;

                      return (
                        <div key={rule.id} className={`rounded-lg p-3 border ${
                          rule.action === 'block' ? 'bg-red-50 border-red-200' :
                          rule.action === 'warn' ? 'bg-amber-50 border-amber-200' :
                          'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${typeColors[rule.type]}`}>
                              {rule.type.toUpperCase()}
                            </span>
                            <span className="text-xs font-medium text-slate-700">{targetLabel}</span>
                            <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded ${actionColors[rule.action]}`}>
                              {rule.action.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">
                            {rule.action === 'block' && rule.type === 'deny' && `Agent request BLOCKED — ${targetLabel} is denied by policy`}
                            {rule.action === 'block' && rule.type === 'limit' && `Agent request BLOCKED — ${targetLabel} exceeds limit of ${rule.value}`}
                            {rule.action === 'block' && rule.type === 'require' && `Agent request BLOCKED — ${targetLabel} is required but not present`}
                            {rule.action === 'block' && rule.type === 'allow' && `Only requests matching ${targetLabel} = "${rule.value}" are allowed`}
                            {rule.action === 'warn' && `Warning logged — ${targetLabel} ${rule.type === 'limit' ? `approaching limit (${rule.value})` : 'policy triggered'}`}
                            {rule.action === 'log' && `Event logged — ${targetLabel} invocation recorded for audit`}
                          </p>
                        </div>
                      );
                    })}

                    {/* Summary */}
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-red-50 rounded-lg">
                          <p className="text-lg font-bold text-red-700">{config.rules.filter(r => r.action === 'block').length}</p>
                          <p className="text-[10px] text-red-600 font-medium">BLOCK</p>
                        </div>
                        <div className="p-2 bg-amber-50 rounded-lg">
                          <p className="text-lg font-bold text-amber-700">{config.rules.filter(r => r.action === 'warn').length}</p>
                          <p className="text-[10px] text-amber-600 font-medium">WARN</p>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <p className="text-lg font-bold text-slate-700">{config.rules.filter(r => r.action === 'log').length}</p>
                          <p className="text-[10px] text-slate-600 font-medium">LOG</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Step: Review & Create ---
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Review & Create Policy</h2>
          <p className="text-sm text-slate-500 mt-1">Confirm your policy configuration before creating</p>
        </div>
        <button onClick={() => setStep('configure')} className="btn-secondary text-sm">Back to Configure</button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Name and description */}
      <div className="card space-y-4">
        <div>
          <label className="label">Policy Name *</label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            placeholder="e.g., Production Agent Restrictions"
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            value={config.description}
            onChange={(e) => setConfig({ ...config, description: e.target.value })}
            placeholder="What does this policy enforce?"
            className="input-field w-full resize-none"
            rows={2}
          />
        </div>
      </div>

      {/* Resource scope */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Resource Scope</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
            <span className="text-lg">
              {config.resource_type === 'agent' && '🤖'}
              {config.resource_type === 'gateway' && '🚪'}
              {config.resource_type === 'tool' && '🔧'}
            </span>
            <span className="text-sm font-medium text-indigo-700 capitalize">{config.resource_type}</span>
          </div>
          {config.resource_id && (
            <span className="text-sm text-slate-600">→ {config.resource_id}</span>
          )}
          {!config.resource_id && (
            <span className="text-xs text-slate-400 italic">All {config.resource_type}s (no specific resource selected)</span>
          )}
        </div>
      </div>

      {/* Rules summary */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Rules ({config.rules.length})</h3>
        <div className="space-y-2">
          {config.rules.map((rule) => {
            const targets = TARGET_OPTIONS[rule.category] || [];
            const targetLabel = targets.find(t => t.value === rule.target)?.label || rule.target;
            const cat = RULE_CATEGORIES.find(c => c.id === rule.category);

            return (
              <div key={rule.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm">{cat?.icon}</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${typeColors[rule.type]}`}>
                  {rule.type.toUpperCase()}
                </span>
                <span className="text-xs text-slate-700 flex-1">{targetLabel}</span>
                {rule.value && <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">{rule.value}</span>}
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${actionColors[rule.action]}`}>
                  {rule.action.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cedar Policy Preview */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            Cedar Policy Statement
          </h3>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
            AgentCore Cedar Language
          </span>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs text-emerald-300 font-mono leading-relaxed whitespace-pre-wrap">
            {generateCedarPreview()}
          </pre>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          This Cedar statement will be deployed to the AgentCore Policy Engine. It defines the enforcement logic evaluated on every gateway request.
        </p>
      </div>

      {/* Gateway Deployment Info */}
      <div className="card bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border-indigo-200/60">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
          </svg>
          Deployment Target
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-indigo-100">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-800">Policy Engine</p>
              <p className="text-[11px] text-slate-500 font-mono">FsiAgentKitPolicyEngine</p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">ACTIVE</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-indigo-100">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-800">Gateway</p>
              <p className="text-[11px] text-slate-500 font-mono">fsi-agent-kit-gateway</p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">LOG_ONLY</span>
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            Policy will be enforced on all requests routed through this gateway. Mode: LOG_ONLY (violations are logged but not blocked).
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="card">
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900">{config.rules.length}</p>
            <p className="text-[10px] text-slate-500 uppercase">Total Rules</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg text-center">
            <p className="text-lg font-bold text-red-700">{config.rules.filter(r => r.action === 'block').length}</p>
            <p className="text-[10px] text-red-500 uppercase">Blocking</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg text-center">
            <p className="text-lg font-bold text-amber-700">{config.rules.filter(r => r.action === 'warn').length}</p>
            <p className="text-[10px] text-amber-500 uppercase">Warning</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-700">{config.rules.filter(r => r.action === 'log').length}</p>
            <p className="text-[10px] text-slate-500 uppercase">Logging</p>
          </div>
        </div>
      </div>

      {/* Create button */}
      <button
        onClick={handleCreate}
        disabled={creating || !config.name.trim() || config.rules.length === 0}
        className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Deploying to AgentCore...
          </span>
        ) : (
          'Deploy Cedar Policy to AgentCore'
        )}
      </button>
    </div>
  );
}
