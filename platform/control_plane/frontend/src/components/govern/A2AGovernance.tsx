/**
 * A2AGovernance — Agent-to-Agent Communication Governance
 *
 * Configures trust relationships and communication policies between agents:
 * - A2A trust policies (which agents can invoke which)
 * - Communication protocols and contracts
 * - Cross-application boundary controls
 * - Message validation schemas
 * - Inter-agent audit trails
 *
 * AWS Integration:
 * - Amazon Bedrock Agents: Multi-agent collaboration, supervisor patterns
 * - AWS Step Functions: Agent orchestration, distributed workflows
 * - Amazon EventBridge: Event-driven agent communication, schema registry
 * - Amazon SNS/SQS: Message validation, dead letter queues
 * - AWS IAM: Cross-agent authorization, assume role patterns
 * - Amazon API Gateway: Request validation between agents
 */

import { useState } from 'react';
import { Icon, type IconName } from './icons';
import UnifiedGuide, { A2A_GUIDE } from './UnifiedGuide';
import { rowButtonProps } from './a11y';
import A2ATrustEvaluator from './A2ATrustEvaluator';
import { MockDataBadge } from './DataSourceIndicator';

// ─────────────────────────── Types ───────────────────────────

interface AgentNode {
  id: string;
  name: string;
  type: 'orchestrator' | 'worker' | 'supervisor' | 'specialist';
  application: string;
  trustLevel: 'high' | 'medium' | 'low' | 'untrusted';
}

interface A2ATrustPolicy {
  id: string;
  name: string;
  description: string;
  sourceAgent: string;
  targetAgent: string;
  allowedActions: string[];
  dataClassifications: string[];
  requiresAuthentication: boolean;
  requiresEncryption: boolean;
  maxChainDepth: number;
  rateLimit: number;
  status: 'active' | 'testing' | 'disabled';
}

interface CommunicationProtocol {
  id: string;
  name: string;
  description: string;
  messageSchema: string;
  validationRules: string[];
  awsService: 'eventbridge' | 'sns' | 'sqs' | 'api-gateway' | 'step-functions';
  dlqEnabled: boolean;
  retryPolicy: { maxRetries: number; backoffSeconds: number };
}

interface A2AEvent {
  id: string;
  timestamp: string;
  sourceAgent: string;
  targetAgent: string;
  action: string;
  status: 'success' | 'denied' | 'failed' | 'rate-limited';
  latencyMs: number;
  policyApplied?: string;
  reason?: string;
}

// ─────────────────────────── Mock Data ───────────────────────────

const AGENT_NODES: AgentNode[] = [
  { id: 'agent-orchestrator', name: 'Main Orchestrator', type: 'orchestrator', application: 'Core Platform', trustLevel: 'high' },
  { id: 'agent-supervisor', name: 'Risk Supervisor', type: 'supervisor', application: 'Risk Management', trustLevel: 'high' },
  { id: 'agent-fraud', name: 'Fraud Detection Agent', type: 'specialist', application: 'Fraud Prevention', trustLevel: 'medium' },
  { id: 'agent-kyc', name: 'KYC Verification Agent', type: 'specialist', application: 'Compliance', trustLevel: 'medium' },
  { id: 'agent-credit', name: 'Credit Decision Agent', type: 'specialist', application: 'Lending', trustLevel: 'medium' },
  { id: 'agent-support', name: 'Customer Support Agent', type: 'worker', application: 'CX Platform', trustLevel: 'low' },
  { id: 'agent-external', name: 'Third-Party Data Agent', type: 'worker', application: 'External', trustLevel: 'untrusted' },
];

const A2A_TRUST_POLICIES: A2ATrustPolicy[] = [
  {
    id: 'trust-001',
    name: 'Orchestrator to Specialists',
    description: 'Main orchestrator can invoke any specialist agent for task delegation',
    sourceAgent: 'agent-orchestrator',
    targetAgent: '*-specialist',
    allowedActions: ['invoke', 'query', 'delegate'],
    dataClassifications: ['public', 'internal', 'confidential'],
    requiresAuthentication: true,
    requiresEncryption: true,
    maxChainDepth: 3,
    rateLimit: 100,
    status: 'active',
  },
  {
    id: 'trust-002',
    name: 'Supervisor Override',
    description: 'Risk supervisor can halt or override any agent decision',
    sourceAgent: 'agent-supervisor',
    targetAgent: '*',
    allowedActions: ['halt', 'override', 'audit', 'query'],
    dataClassifications: ['public', 'internal', 'confidential', 'restricted'],
    requiresAuthentication: true,
    requiresEncryption: true,
    maxChainDepth: 5,
    rateLimit: 1000,
    status: 'active',
  },
  {
    id: 'trust-003',
    name: 'Fraud to KYC Collaboration',
    description: 'Fraud agent can request identity verification from KYC agent',
    sourceAgent: 'agent-fraud',
    targetAgent: 'agent-kyc',
    allowedActions: ['verify_identity', 'query_history'],
    dataClassifications: ['internal', 'confidential'],
    requiresAuthentication: true,
    requiresEncryption: true,
    maxChainDepth: 2,
    rateLimit: 50,
    status: 'active',
  },
  {
    id: 'trust-004',
    name: 'Credit to Fraud Check',
    description: 'Credit agent must consult fraud agent before approving high-value applications',
    sourceAgent: 'agent-credit',
    targetAgent: 'agent-fraud',
    allowedActions: ['fraud_check', 'risk_score'],
    dataClassifications: ['internal', 'confidential'],
    requiresAuthentication: true,
    requiresEncryption: true,
    maxChainDepth: 1,
    rateLimit: 200,
    status: 'active',
  },
  {
    id: 'trust-005',
    name: 'External Agent Sandbox',
    description: 'Third-party agents restricted to public data only with limited actions',
    sourceAgent: 'agent-external',
    targetAgent: 'agent-orchestrator',
    allowedActions: ['query'],
    dataClassifications: ['public'],
    requiresAuthentication: true,
    requiresEncryption: true,
    maxChainDepth: 1,
    rateLimit: 10,
    status: 'active',
  },
  {
    id: 'trust-006',
    name: 'Support Agent Boundaries',
    description: 'Customer support agent limited to non-sensitive customer interactions',
    sourceAgent: 'agent-support',
    targetAgent: 'agent-kyc',
    allowedActions: ['query_status'],
    dataClassifications: ['public', 'internal'],
    requiresAuthentication: true,
    requiresEncryption: false,
    maxChainDepth: 1,
    rateLimit: 100,
    status: 'testing',
  },
];

const COMMUNICATION_PROTOCOLS: CommunicationProtocol[] = [
  {
    id: 'proto-001',
    name: 'Agent Invocation Protocol',
    description: 'Standard protocol for synchronous agent-to-agent invocation',
    awsService: 'step-functions',
    messageSchema: `{
  "type": "object",
  "properties": {
    "correlationId": { "type": "string", "format": "uuid" },
    "sourceAgentId": { "type": "string" },
    "targetAgentId": { "type": "string" },
    "action": { "type": "string" },
    "payload": { "type": "object" },
    "timestamp": { "type": "string", "format": "date-time" },
    "traceId": { "type": "string" }
  },
  "required": ["correlationId", "sourceAgentId", "targetAgentId", "action"]
}`,
    validationRules: [
      'correlationId must be unique per request',
      'sourceAgentId must be registered in agent registry',
      'action must be allowed per trust policy',
      'payload size must not exceed 256KB',
    ],
    dlqEnabled: true,
    retryPolicy: { maxRetries: 3, backoffSeconds: 5 },
  },
  {
    id: 'proto-002',
    name: 'Event-Driven Notification',
    description: 'Asynchronous agent notifications via EventBridge',
    awsService: 'eventbridge',
    messageSchema: `{
  "type": "object",
  "properties": {
    "version": { "type": "string", "const": "1.0" },
    "source": { "type": "string", "pattern": "^agent\\\\." },
    "detail-type": { "type": "string" },
    "detail": {
      "type": "object",
      "properties": {
        "agentId": { "type": "string" },
        "eventType": { "type": "string" },
        "severity": { "enum": ["info", "warning", "critical"] },
        "data": { "type": "object" }
      }
    }
  }
}`,
    validationRules: [
      'source must match agent registration',
      'detail-type must be registered in schema registry',
      'severity determines routing priority',
    ],
    dlqEnabled: true,
    retryPolicy: { maxRetries: 5, backoffSeconds: 10 },
  },
  {
    id: 'proto-003',
    name: 'API Gateway Contract',
    description: 'REST API contract for external agent integrations',
    awsService: 'api-gateway',
    messageSchema: `{
  "openapi": "3.0.0",
  "paths": {
    "/agents/{agentId}/invoke": {
      "post": {
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/InvokeRequest" }
            }
          }
        },
        "responses": {
          "200": { "description": "Success" },
          "403": { "description": "Trust policy denied" },
          "429": { "description": "Rate limit exceeded" }
        }
      }
    }
  }
}`,
    validationRules: [
      'Request must include valid API key or IAM signature',
      'agentId path parameter must match registered agent',
      'Content-Type must be application/json',
      'Request body must pass JSON Schema validation',
    ],
    dlqEnabled: false,
    retryPolicy: { maxRetries: 2, backoffSeconds: 1 },
  },
];

const A2A_EVENTS: A2AEvent[] = [
  { id: 'evt-001', timestamp: '2026-06-22T14:35:00Z', sourceAgent: 'agent-orchestrator', targetAgent: 'agent-fraud', action: 'invoke', status: 'success', latencyMs: 245, policyApplied: 'trust-001' },
  { id: 'evt-002', timestamp: '2026-06-22T14:34:00Z', sourceAgent: 'agent-fraud', targetAgent: 'agent-kyc', action: 'verify_identity', status: 'success', latencyMs: 890, policyApplied: 'trust-003' },
  { id: 'evt-003', timestamp: '2026-06-22T14:33:00Z', sourceAgent: 'agent-external', targetAgent: 'agent-credit', action: 'invoke', status: 'denied', latencyMs: 12, reason: 'No trust policy exists for this agent pair' },
  { id: 'evt-004', timestamp: '2026-06-22T14:32:00Z', sourceAgent: 'agent-credit', targetAgent: 'agent-fraud', action: 'fraud_check', status: 'success', latencyMs: 156, policyApplied: 'trust-004' },
  { id: 'evt-005', timestamp: '2026-06-22T14:31:00Z', sourceAgent: 'agent-support', targetAgent: 'agent-kyc', action: 'query_pii', status: 'denied', latencyMs: 8, reason: 'Action not allowed: query_pii not in allowedActions' },
  { id: 'evt-006', timestamp: '2026-06-22T14:30:00Z', sourceAgent: 'agent-external', targetAgent: 'agent-orchestrator', action: 'query', status: 'rate-limited', latencyMs: 5, reason: 'Rate limit exceeded: 10 req/min' },
  { id: 'evt-007', timestamp: '2026-06-22T14:29:00Z', sourceAgent: 'agent-supervisor', targetAgent: 'agent-credit', action: 'audit', status: 'success', latencyMs: 78, policyApplied: 'trust-002' },
];

// ─────────────────────────── AWS Integration Info ───────────────────────────

const AWS_A2A_PATTERNS: { id: string; name: string; service: string; description: string; icon: IconName; color: string; useCase: string; configExample: string }[] = [
  {
    id: 'bedrock-multi-agent',
    name: 'Bedrock Multi-Agent Collaboration',
    service: 'Amazon Bedrock Agents',
    description: 'Orchestrate multiple specialized agents with a supervisor pattern. Each agent handles specific tasks, coordinated by a primary orchestrator.',
    icon: 'cpu-chip',
    color: '#FF9900',
    useCase: 'Complex workflows requiring multiple AI capabilities (fraud check + KYC + credit decision)',
    configExample: `// Bedrock Agent with Multi-Agent Collaboration
{
  "agentName": "OrchestratorAgent",
  "agentCollaboration": "SUPERVISOR_ROUTER",
  "subAgents": [
    {
      "agentAliasArn": "arn:aws:bedrock:...:agent-alias/fraud-agent",
      "agentDescription": "Fraud detection specialist",
      "relayConversationHistory": "TO_COLLABORATOR"
    },
    {
      "agentAliasArn": "arn:aws:bedrock:...:agent-alias/kyc-agent",
      "agentDescription": "KYC verification specialist"
    }
  ]
}`,
  },
  {
    id: 'step-functions-orchestration',
    name: 'Step Functions Orchestration',
    service: 'AWS Step Functions',
    description: 'Orchestrate agent invocations with explicit control flow, parallel execution, and error handling.',
    icon: 'arrow-path',
    color: '#E91E63',
    useCase: 'Deterministic agent workflows with retry logic and timeout controls',
    configExample: `// Step Functions Agent Chain
{
  "StartAt": "FraudCheck",
  "States": {
    "FraudCheck": {
      "Type": "Task",
      "Resource": "arn:aws:states:::bedrock:invokeAgent",
      "Parameters": {
        "agentId": "fraud-agent",
        "agentAliasId": "TSTALIASID",
        "sessionId.$": "$.sessionId",
        "inputText.$": "$.fraudCheckRequest"
      },
      "ResultPath": "$.fraudResult",
      "Next": "CheckFraudScore",
      "Retry": [{ "ErrorEquals": ["States.ALL"], "MaxAttempts": 3 }]
    },
    "CheckFraudScore": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.fraudResult.riskScore",
        "NumericGreaterThan": 70,
        "Next": "HumanReview"
      }],
      "Default": "CreditDecision"
    }
  }
}`,
  },
  {
    id: 'eventbridge-events',
    name: 'EventBridge Agent Events',
    service: 'Amazon EventBridge',
    description: 'Decouple agent communication via events. Schema registry validates message contracts between agents.',
    icon: 'bolt',
    color: '#8B5CF6',
    useCase: 'Loosely-coupled agent notifications and async workflows',
    configExample: `// EventBridge Schema for Agent Events
{
  "SchemaName": "agent-decision-event",
  "Type": "JSONSchemaDraft4",
  "Content": {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
      "agentId": { "type": "string" },
      "decision": { "type": "string", "enum": ["approve", "deny", "escalate"] },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "correlationId": { "type": "string" }
    },
    "required": ["agentId", "decision", "correlationId"]
  }
}

// EventBridge Rule for Agent Routing
{
  "Name": "RouteAgentDecisions",
  "EventPattern": {
    "source": ["agent.fraud", "agent.credit"],
    "detail-type": ["AgentDecision"],
    "detail": {
      "decision": ["escalate"]
    }
  },
  "Targets": [{
    "Arn": "arn:aws:lambda:...:HumanReviewHandler"
  }]
}`,
  },
  {
    id: 'iam-cross-agent',
    name: 'IAM Cross-Agent Authorization',
    service: 'AWS IAM',
    description: 'Use IAM roles and trust policies to control which agents can invoke which other agents.',
    icon: 'shield-check',
    color: '#10B981',
    useCase: 'Fine-grained authorization between agent execution roles',
    configExample: `// IAM Trust Policy for Agent A invoking Agent B
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::123456789012:role/FraudAgentRole"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "aws:SourceArn": "arn:aws:bedrock:...:agent/fraud-agent"
      }
    }
  }]
}

// IAM Permission Policy for Cross-Agent Invocation
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "bedrock:InvokeAgent",
    "Resource": [
      "arn:aws:bedrock:...:agent/kyc-agent",
      "arn:aws:bedrock:...:agent-alias/kyc-agent/*"
    ],
    "Condition": {
      "ForAllValues:StringEquals": {
        "bedrock:AgentAliasTag/TrustLevel": ["high", "medium"]
      }
    }
  }]
}`,
  },
  {
    id: 'sqs-dlq',
    name: 'SQS Dead Letter Queues',
    service: 'Amazon SQS',
    description: 'Capture failed agent-to-agent messages for analysis and replay. Essential for reliability and debugging.',
    icon: 'inbox-stack',
    color: '#3B82F6',
    useCase: 'Message reliability, failed communication analysis, replay capabilities',
    configExample: `// SQS Queue with DLQ for Agent Messages
{
  "QueueName": "agent-messages",
  "Attributes": {
    "RedrivePolicy": {
      "deadLetterTargetArn": "arn:aws:sqs:...:agent-messages-dlq",
      "maxReceiveCount": 3
    },
    "MessageRetentionPeriod": "1209600"
  }
}

// CloudWatch Alarm for DLQ Monitoring
{
  "AlarmName": "AgentMessageFailures",
  "MetricName": "ApproximateNumberOfMessagesVisible",
  "Namespace": "AWS/SQS",
  "Dimensions": [{
    "Name": "QueueName",
    "Value": "agent-messages-dlq"
  }],
  "Threshold": 10,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": ["arn:aws:sns:...:ops-alerts"]
}`,
  },
];

// ─────────────────────────── Component ───────────────────────────

type TabId = 'trust-policies' | 'protocols' | 'topology' | 'audit' | 'aws-patterns';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'trust-policies', label: 'Trust Policies', icon: 'shield-check' },
  { id: 'topology', label: 'Agent Topology', icon: 'share' },
  { id: 'protocols', label: 'Protocols', icon: 'document-text' },
  { id: 'audit', label: 'Audit Trail', icon: 'clipboard-list' },
  { id: 'aws-patterns', label: 'AWS Patterns', icon: 'cloud' },
];

const trustLevelColors: Record<AgentNode['trustLevel'], string> = {
  high: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-orange-100 text-orange-700 border-orange-200',
  untrusted: 'bg-rose-100 text-rose-700 border-rose-200',
};

const agentTypeIcons: Record<AgentNode['type'], IconName> = {
  orchestrator: 'cpu-chip',
  supervisor: 'eye',
  specialist: 'beaker',
  worker: 'wrench-screwdriver',
};

const statusColors: Record<A2AEvent['status'], string> = {
  success: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-rose-100 text-rose-700',
  failed: 'bg-red-100 text-red-700',
  'rate-limited': 'bg-amber-100 text-amber-700',
};

export default function A2AGovernance() {
  const [activeTab, setActiveTab] = useState<TabId>('trust-policies');
  const [selectedPolicy, setSelectedPolicy] = useState<A2ATrustPolicy | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'success' | 'denied' | 'failed'>('all');
  const [showAddPolicyToast, setShowAddPolicyToast] = useState(false);

  const activePolices = A2A_TRUST_POLICIES.filter(p => p.status === 'active').length;
  const successRate = Math.round((A2A_EVENTS.filter(e => e.status === 'success').length / A2A_EVENTS.length) * 100);
  const deniedCount = A2A_EVENTS.filter(e => e.status === 'denied').length;

  return (
    <div className="space-y-6">
      {/* How to Use Guide */}
      <UnifiedGuide {...A2A_GUIDE} />

      {/* Live delegation-authorization engine (autonomy ceiling) */}
      <A2ATrustEvaluator />

      {/* Header Stats */}
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-slate-900">A2A Governance</h2>
        <MockDataBadge />
      </div>
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">A2A Trust Network</div>
          <div className="text-2xl font-bold text-slate-900">{AGENT_NODES.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">{AGENT_NODES.filter(n => n.trustLevel === 'high').length} high trust · {AGENT_NODES.filter(n => n.trustLevel === 'medium').length} medium</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Trust Policies</div>
          <div className="text-2xl font-bold text-blue-600">{activePolices}</div>
          <div className="text-[10px] text-slate-400 mt-1">{A2A_TRUST_POLICIES.length} total defined</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">A2A Success Rate</div>
          <div className={`text-2xl font-bold ${successRate >= 90 ? 'text-emerald-600' : successRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{successRate}%</div>
          <div className="text-[10px] text-slate-400 mt-1">Last 24 hours</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Denied Requests</div>
          <div className={`text-2xl font-bold ${deniedCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{deniedCount}</div>
          <div className="text-[10px] text-slate-400 mt-1">Policy violations</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Avg Latency</div>
          <div className="text-2xl font-bold text-slate-900">185ms</div>
          <div className="text-[10px] text-slate-400 mt-1">P50 A2A calls</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div role="tablist" aria-label="A2A governance tabs" className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'trust-policies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Define which agents can communicate with each other and what actions are permitted.
            </div>
            <button
              onClick={() => {
                setShowAddPolicyToast(true);
                setTimeout(() => setShowAddPolicyToast(false), 3000);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Icon name="plus" className="w-4 h-4" />
              Add Policy
            </button>
            {showAddPolicyToast && (
              <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
                <Icon name="information-circle" className="w-5 h-5 text-blue-400" />
                <span className="text-sm">Policy creation coming soon</span>
              </div>
            )}
          </div>

          <div className="grid gap-4">
            {A2A_TRUST_POLICIES.map(policy => (
              <div
                key={policy.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none"
                aria-pressed={selectedPolicy?.id === policy.id}
                {...rowButtonProps(() => setSelectedPolicy(selectedPolicy?.id === policy.id ? null : policy), `Trust policy ${policy.name}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{policy.name}</h4>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                        policy.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        policy.status === 'testing' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {policy.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{policy.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Icon name="arrow-right" className="w-3 h-3" />
                        {policy.sourceAgent} → {policy.targetAgent}
                      </span>
                      <span>Actions: {policy.allowedActions.join(', ')}</span>
                      <span>Max depth: {policy.maxChainDepth}</span>
                      <span>Rate: {policy.rateLimit}/min</span>
                    </div>
                  </div>
                  <Icon name="chevron-right" className={`w-4 h-4 text-slate-400 transition-transform ${selectedPolicy?.id === policy.id ? 'rotate-90' : ''}`} />
                </div>

                {selectedPolicy?.id === policy.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Allowed Actions</div>
                      <div className="space-y-1">
                        {policy.allowedActions.map((action, i) => (
                          <div key={i} className="text-xs text-slate-700 flex items-center gap-1">
                            <Icon name="check" className="w-3 h-3 text-emerald-500" />
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Data Access</div>
                      <div className="space-y-1">
                        {policy.dataClassifications.map((cls, i) => (
                          <div key={i} className="text-xs text-slate-700">{cls}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Security</div>
                      <div className="space-y-1 text-xs text-slate-700">
                        <div className="flex items-center gap-1">
                          {policy.requiresAuthentication ? <Icon name="check" className="w-3 h-3 text-emerald-500" /> : <Icon name="x-mark" className="w-3 h-3 text-rose-500" />}
                          Authentication
                        </div>
                        <div className="flex items-center gap-1">
                          {policy.requiresEncryption ? <Icon name="check" className="w-3 h-3 text-emerald-500" /> : <Icon name="x-mark" className="w-3 h-3 text-rose-500" />}
                          Encryption
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Limits</div>
                      <div className="space-y-1 text-xs text-slate-700">
                        <div>Chain Depth: {policy.maxChainDepth}</div>
                        <div>Rate Limit: {policy.rateLimit}/min</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'topology' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Agent Trust Network</h4>
            <div className="grid grid-cols-4 gap-4">
              {AGENT_NODES.map(agent => (
                <div
                  key={agent.id}
                  className={`p-4 rounded-lg border-2 ${trustLevelColors[agent.trustLevel]}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={agentTypeIcons[agent.type]} className="w-5 h-5" />
                    <span className="text-sm font-semibold">{agent.name}</span>
                  </div>
                  <div className="text-[10px] space-y-1">
                    <div>Type: {agent.type}</div>
                    <div>App: {agent.application}</div>
                    <div>Trust: {agent.trustLevel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Trust Level Definitions</h4>
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="font-semibold text-emerald-800 mb-1">High Trust</div>
                <div className="text-emerald-700">Core platform agents with full access to other agents and all data classifications.</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="font-semibold text-amber-800 mb-1">Medium Trust</div>
                <div className="text-amber-700">Specialist agents with scoped access to specific agents and confidential data.</div>
              </div>
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                <div className="font-semibold text-orange-800 mb-1">Low Trust</div>
                <div className="text-orange-700">Worker agents with limited actions and internal data only.</div>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                <div className="font-semibold text-rose-800 mb-1">Untrusted</div>
                <div className="text-rose-700">External agents sandboxed to public data and query-only actions.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'protocols' && (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Message schemas and validation rules for agent-to-agent communication.
          </div>

          {COMMUNICATION_PROTOCOLS.map(protocol => (
            <div key={protocol.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{protocol.name}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                      {protocol.awsService}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{protocol.description}</p>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  {protocol.dlqEnabled && (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">DLQ Enabled</span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {protocol.retryPolicy.maxRetries} retries
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Message Schema</div>
                  <pre className="bg-slate-900 text-slate-100 text-[10px] p-3 rounded-lg overflow-x-auto max-h-48">
                    {protocol.messageSchema}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Validation Rules</div>
                  <div className="space-y-1">
                    {protocol.validationRules.map((rule, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <Icon name="check" className="w-3 h-3 text-emerald-500 mt-0.5" />
                        {rule}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1" role="group" aria-label="Filter audit events">
              {(['all', 'success', 'denied', 'failed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setAuditFilter(filter)}
                  aria-pressed={auditFilter === filter}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    auditFilter === filter
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Timestamp</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Source → Target</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Action</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-slate-600">Latency</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {A2A_EVENTS.filter(event => auditFilter === 'all' || event.status === auditFilter || (auditFilter === 'failed' && event.status === 'rate-limited')).map(event => (
                  <tr key={event.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-medium text-slate-700">{event.sourceAgent.replace('agent-', '')}</span>
                        <Icon name="arrow-right" className="w-3 h-3 text-slate-400" />
                        <span className="font-medium text-slate-700">{event.targetAgent.replace('agent-', '')}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{event.action}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded ${statusColors[event.status]}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-500">{event.latencyMs}ms</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {event.policyApplied ? (
                        <span className="text-blue-600">Policy: {event.policyApplied}</span>
                      ) : event.reason ? (
                        <span className="text-rose-600">{event.reason}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'aws-patterns' && (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Implement A2A governance using AWS services for production-grade multi-agent systems.
          </div>

          <div className="grid gap-4">
            {AWS_A2A_PATTERNS.map(pattern => (
              <div
                key={pattern.id}
                className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                  selectedPattern === pattern.id
                    ? 'border-blue-500 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
                aria-pressed={selectedPattern === pattern.id}
                {...rowButtonProps(() => setSelectedPattern(selectedPattern === pattern.id ? null : pattern.id), `AWS pattern ${pattern.name}`)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${pattern.color}15` }}
                  >
                    <Icon name={pattern.icon} className="w-5 h-5" style={{ color: pattern.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{pattern.name}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                        {pattern.service}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{pattern.description}</p>
                    <div className="mt-2 text-[10px] text-slate-500">
                      <strong>Use case:</strong> {pattern.useCase}
                    </div>
                  </div>
                  <Icon name="chevron-right" className={`w-4 h-4 text-slate-400 transition-transform ${selectedPattern === pattern.id ? 'rotate-90' : ''}`} />
                </div>

                {selectedPattern === pattern.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Configuration Example</div>
                    <pre className="bg-slate-900 text-slate-100 text-[10px] p-3 rounded-lg overflow-x-auto max-h-80">
                      {pattern.configExample}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
            <Icon name="check-circle" className="w-5 h-5 inline mr-2" />
            <strong>Best Practice:</strong> Combine multiple patterns for defense in depth — use IAM for authorization,
            EventBridge schemas for contract validation, and SQS DLQs for reliability.
          </div>
        </div>
      )}
    </div>
  );
}
