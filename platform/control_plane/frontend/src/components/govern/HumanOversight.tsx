/**
 * HumanOversight — Human-in-the-Loop (HITL) Governance Configuration
 *
 * Configures when and how humans are involved in agent decisions:
 * - Gate criteria definitions (when HITL triggers)
 * - Escalation workflow builder
 * - Approval routing based on risk/action type
 * - Audit trail of human decisions
 *
 * AWS Integration:
 * - Amazon Bedrock Agents: RETURN_CONTROL for human confirmation
 * - Amazon A2I (Augmented AI): Human review workflows
 * - AWS Step Functions: Wait-for-callback approval patterns
 * - Amazon SNS: Approval notifications
 */

import { useState } from 'react';
import { Icon, type IconName } from './icons';
import UnifiedGuide, { HUMAN_OVERSIGHT_GUIDE } from './UnifiedGuide';
import { rowButtonProps } from './a11y';
import EarnedAutonomyView from './EarnedAutonomyView';
import HandoffWorkspace from './HandoffWorkspace';
import RuntimeEnforcementView from './RuntimeEnforcementView';
import MaskedIdentity from './MaskedIdentity';

// ─────────────────────────── Types ───────────────────────────

interface HITLGate {
  id: string;
  name: string;
  description: string;
  triggerType: 'risk-threshold' | 'action-type' | 'data-sensitivity' | 'cost-threshold' | 'compliance-required' | 'custom';
  triggerCondition: string;
  approvers: string[];
  escalationPath: string[];
  timeoutMinutes: number;
  timeoutAction: 'auto-deny' | 'auto-approve' | 'escalate';
  status: 'active' | 'testing' | 'disabled';
  awsIntegration?: 'bedrock-return-control' | 'a2i-workflow' | 'step-functions' | 'sns-approval';
}

interface ApprovalRecord {
  id: string;
  gateId: string;
  gateName: string;
  agentId: string;
  agentName: string;
  requestedAction: string;
  riskContext: string;
  requestedAt: string;
  decidedAt?: string;
  decision: 'pending' | 'approved' | 'denied' | 'escalated' | 'timed-out';
  decidedBy?: string;
  notes?: string;
}

interface EscalationLevel {
  level: number;
  role: string;
  timeoutMinutes: number;
  notificationChannel: 'email' | 'slack' | 'sns' | 'pagerduty';
}

// ─────────────────────────── Mock Data ───────────────────────────

const HITL_GATES: HITLGate[] = [
  {
    id: 'gate-001',
    name: 'High-Risk Action Gate',
    description: 'Require human approval for any action with risk score above 70',
    triggerType: 'risk-threshold',
    triggerCondition: 'action.risk_score > 70',
    approvers: ['risk-manager', 'compliance-officer'],
    escalationPath: ['team-lead', 'director', 'ciso'],
    timeoutMinutes: 30,
    timeoutAction: 'escalate',
    status: 'active',
    awsIntegration: 'bedrock-return-control',
  },
  {
    id: 'gate-002',
    name: 'Financial Transaction Gate',
    description: 'Human approval required for transactions exceeding $10,000',
    triggerType: 'cost-threshold',
    triggerCondition: 'transaction.amount > 10000',
    approvers: ['finance-approver', 'treasury'],
    escalationPath: ['cfo-delegate', 'cfo'],
    timeoutMinutes: 60,
    timeoutAction: 'auto-deny',
    status: 'active',
    awsIntegration: 'step-functions',
  },
  {
    id: 'gate-003',
    name: 'PII Data Access Gate',
    description: 'Approval required before agent accesses PII or sensitive data',
    triggerType: 'data-sensitivity',
    triggerCondition: 'data.classification in ["PII", "confidential", "restricted"]',
    approvers: ['data-steward', 'privacy-officer'],
    escalationPath: ['dpo', 'legal'],
    timeoutMinutes: 15,
    timeoutAction: 'auto-deny',
    status: 'active',
    awsIntegration: 'a2i-workflow',
  },
  {
    id: 'gate-004',
    name: 'External API Call Gate',
    description: 'Human verification before calling external third-party APIs',
    triggerType: 'action-type',
    triggerCondition: 'action.type == "external_api_call" && !action.preapproved',
    approvers: ['security-analyst'],
    escalationPath: ['security-lead', 'ciso'],
    timeoutMinutes: 10,
    timeoutAction: 'auto-deny',
    status: 'testing',
    awsIntegration: 'sns-approval',
  },
  {
    id: 'gate-005',
    name: 'Model Override Gate',
    description: 'Require approval when agent wants to override model recommendations',
    triggerType: 'custom',
    triggerCondition: 'agent.action == "override_recommendation" && model.confidence > 0.8',
    approvers: ['model-owner', 'mrm-analyst'],
    escalationPath: ['mrm-lead', 'cro'],
    timeoutMinutes: 45,
    timeoutAction: 'escalate',
    status: 'active',
    awsIntegration: 'bedrock-return-control',
  },
  {
    id: 'gate-006',
    name: 'EU AI Act HRAIS Gate',
    description: 'Mandatory human oversight for high-risk AI system decisions per EU AI Act Article 14',
    triggerType: 'compliance-required',
    triggerCondition: 'system.hrais_classification == "high-risk" && action.affects_natural_person',
    approvers: ['ai-compliance-officer', 'human-oversight-designated'],
    escalationPath: ['dpo', 'legal-counsel', 'board-liaison'],
    timeoutMinutes: 120,
    timeoutAction: 'auto-deny',
    status: 'active',
    awsIntegration: 'a2i-workflow',
  },
];

const APPROVAL_RECORDS: ApprovalRecord[] = [
  {
    id: 'apr-001',
    gateId: 'gate-001',
    gateName: 'High-Risk Action Gate',
    agentId: 'agent-fraud',
    agentName: 'Fraud Detection Agent',
    requestedAction: 'Block account and notify customer',
    riskContext: 'Risk score: 85, Potential fraud amount: $45,000',
    requestedAt: '2026-06-22T14:30:00Z',
    decidedAt: '2026-06-22T14:35:00Z',
    decision: 'approved',
    decidedBy: 'Sarah Chen (Risk Manager)',
    notes: 'Clear fraud indicators, approved immediate action',
  },
  {
    id: 'apr-002',
    gateId: 'gate-002',
    gateName: 'Financial Transaction Gate',
    agentId: 'agent-treasury',
    agentName: 'Treasury Operations Agent',
    requestedAction: 'Execute wire transfer $125,000',
    riskContext: 'Vendor payment, verified invoice, routine transfer',
    requestedAt: '2026-06-22T10:15:00Z',
    decidedAt: '2026-06-22T10:45:00Z',
    decision: 'approved',
    decidedBy: 'Mike Johnson (Treasury)',
    notes: 'Verified against PO, approved',
  },
  {
    id: 'apr-003',
    gateId: 'gate-003',
    gateName: 'PII Data Access Gate',
    agentId: 'agent-support',
    agentName: 'Customer Support Agent',
    requestedAction: 'Access customer SSN for identity verification',
    riskContext: 'Customer dispute, identity verification required',
    requestedAt: '2026-06-22T09:00:00Z',
    decision: 'pending',
  },
  {
    id: 'apr-004',
    gateId: 'gate-001',
    gateName: 'High-Risk Action Gate',
    agentId: 'agent-trading',
    agentName: 'Trading Assistant',
    requestedAction: 'Execute large position adjustment',
    riskContext: 'Risk score: 78, Position size: 15% of portfolio',
    requestedAt: '2026-06-21T16:00:00Z',
    decidedAt: '2026-06-21T16:30:00Z',
    decision: 'denied',
    decidedBy: 'Risk Committee',
    notes: 'Exceeded single-position limit, requires CIO approval',
  },
  {
    id: 'apr-005',
    gateId: 'gate-006',
    gateName: 'EU AI Act HRAIS Gate',
    agentId: 'agent-credit',
    agentName: 'Credit Decision Agent',
    requestedAction: 'Deny credit application',
    riskContext: 'EU citizen, credit score below threshold, HRAIS Article 14 applies',
    requestedAt: '2026-06-22T11:00:00Z',
    decision: 'pending',
  },
];

const DEFAULT_ESCALATION: EscalationLevel[] = [
  { level: 1, role: 'Primary Approver', timeoutMinutes: 15, notificationChannel: 'slack' },
  { level: 2, role: 'Team Lead', timeoutMinutes: 30, notificationChannel: 'email' },
  { level: 3, role: 'Director', timeoutMinutes: 60, notificationChannel: 'pagerduty' },
  { level: 4, role: 'Executive', timeoutMinutes: 120, notificationChannel: 'sns' },
];

// ─────────────────────────── AWS Integration Info ───────────────────────────

const AWS_INTEGRATIONS: { id: string; name: string; service: string; description: string; icon: IconName; color: string; configExample: string }[] = [
  {
    id: 'bedrock-return-control',
    name: 'Bedrock RETURN_CONTROL',
    service: 'Amazon Bedrock Agents',
    description: 'Pause agent execution and return control to application for human confirmation before proceeding.',
    icon: 'cpu-chip',
    color: '#FF9900',
    configExample: `// Bedrock Agent Action Group with RETURN_CONTROL
{
  "actionGroupName": "HighRiskActions",
  "actionGroupExecutor": {
    "customControl": "RETURN_CONTROL"
  },
  "functionSchema": {
    "functions": [{
      "name": "executeHighRiskAction",
      "requireConfirmation": "ENABLED"
    }]
  }
}`,
  },
  {
    id: 'a2i-workflow',
    name: 'Amazon A2I Workflow',
    service: 'Amazon Augmented AI',
    description: 'Route agent decisions to human reviewers using SageMaker A2I human review workflows.',
    icon: 'users',
    color: '#8B5CF6',
    configExample: `// A2I Human Review Workflow Definition
{
  "FlowDefinitionName": "agent-decision-review",
  "HumanLoopConfig": {
    "WorkteamArn": "arn:aws:sagemaker:...:workteam/...",
    "TaskTitle": "Review Agent Decision",
    "TaskDescription": "Approve or reject agent action",
    "TaskTimeLimitInSeconds": 3600
  },
  "HumanLoopActivationConditions": {
    "Conditions": [{
      "ConditionType": "ConfidenceThreshold",
      "ConditionValue": "0.7"
    }]
  }
}`,
  },
  {
    id: 'step-functions',
    name: 'Step Functions Callback',
    service: 'AWS Step Functions',
    description: 'Use waitForTaskToken pattern to pause workflow until human approves via callback.',
    icon: 'arrow-path',
    color: '#E91E63',
    configExample: `// Step Functions Wait-for-Callback State
{
  "HumanApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
    "Parameters": {
      "FunctionName": "SendApprovalRequest",
      "Payload": {
        "taskToken.$": "$$.Task.Token",
        "approvalRequest.$": "$.request"
      }
    },
    "TimeoutSeconds": 3600,
    "Catch": [{
      "ErrorEquals": ["States.Timeout"],
      "ResultPath": "$.error",
      "Next": "HandleTimeout"
    }]
  }
}`,
  },
  {
    id: 'sns-approval',
    name: 'SNS Approval Notification',
    service: 'Amazon SNS',
    description: 'Send approval requests via SNS to multiple channels (email, Slack, PagerDuty) with callback URLs.',
    icon: 'bell',
    color: '#3B82F6',
    configExample: `// SNS Message with Approval Links
{
  "TopicArn": "arn:aws:sns:...:agent-approvals",
  "Message": {
    "type": "APPROVAL_REQUEST",
    "agentId": "agent-123",
    "action": "Execute high-risk operation",
    "riskScore": 85,
    "approveUrl": "https://api.example.com/approve?token=...",
    "denyUrl": "https://api.example.com/deny?token=...",
    "expiresAt": "2026-06-22T15:00:00Z"
  },
  "MessageAttributes": {
    "urgency": { "DataType": "String", "StringValue": "high" }
  }
}`,
  },
];

// ─────────────────────────── Component ───────────────────────────

type TabId = 'gates' | 'approvals' | 'handoff' | 'enforcement' | 'escalation' | 'earned-autonomy' | 'aws-integration';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'gates', label: 'HITL Gates', icon: 'hand-raised' },
  { id: 'handoff', label: 'Action Queue', icon: 'inbox-stack' },
  { id: 'enforcement', label: 'Runtime Enforcement', icon: 'shield-check' },
  { id: 'approvals', label: 'Approval Log', icon: 'clipboard-list' },
  { id: 'escalation', label: 'Escalation Paths', icon: 'arrow-trending-up' },
  { id: 'earned-autonomy', label: 'Earned Autonomy', icon: 'arrow-trending-up' },
  { id: 'aws-integration', label: 'AWS Integration', icon: 'cloud' },
];

const triggerTypeIcons: Record<HITLGate['triggerType'], IconName> = {
  'risk-threshold': 'exclamation-triangle',
  'action-type': 'bolt',
  'data-sensitivity': 'lock-closed',
  'cost-threshold': 'banknotes',
  'compliance-required': 'clipboard-list',
  'custom': 'cog',
};

const triggerTypeColors: Record<HITLGate['triggerType'], string> = {
  'risk-threshold': '#EF4444',
  'action-type': '#F59E0B',
  'data-sensitivity': '#8B5CF6',
  'cost-threshold': '#10B981',
  'compliance-required': '#3B82F6',
  'custom': '#6B7280',
};

const decisionColors: Record<ApprovalRecord['decision'], string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  denied: 'bg-rose-100 text-rose-700 border-rose-200',
  escalated: 'bg-blue-100 text-blue-700 border-blue-200',
  'timed-out': 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function HumanOversight() {
  const [activeTab, setActiveTab] = useState<TabId>('gates');
  const [selectedGate, setSelectedGate] = useState<HITLGate | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all');
  const [showAddGateToast, setShowAddGateToast] = useState(false);
  const [approvalRecords, setApprovalRecords] = useState(APPROVAL_RECORDS);

  // Confidence-threshold governance policy — the model-confidence bar the fleet's
  // HITL gates key off. Previously hardcoded (0.8) inside a gate's trigger string;
  // now a visible, adjustable policy value that drives the confidence-gated gates.
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8);

  // Gates derive their confidence-gated trigger condition from the live policy value
  // so the governance control and the gate rules stay in lockstep.
  const gates = HITL_GATES.map(g =>
    g.triggerCondition.includes('model.confidence')
      ? { ...g, triggerCondition: `agent.action == "override_recommendation" && model.confidence > ${confidenceThreshold}` }
      : g,
  );
  const confidenceGatedCount = gates.filter(g => g.triggerCondition.includes('model.confidence')).length;

  const pendingCount = approvalRecords.filter(r => r.decision === 'pending').length;
  const todayApprovals = approvalRecords.filter(r => r.decidedAt?.startsWith('2026-06-22') || r.decidedAt?.startsWith(new Date().toISOString().slice(0, 10))).length;

  return (
    <div className="space-y-6">
      {/* How to Use Guide */}
      <UnifiedGuide {...HUMAN_OVERSIGHT_GUIDE} />

      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Active Gates</div>
          <div className="text-2xl font-bold text-slate-900">{HITL_GATES.filter(g => g.status === 'active').length}</div>
          <div className="text-[10px] text-slate-400 mt-1">{HITL_GATES.length} total configured</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Pending Approvals</div>
          <div className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{pendingCount}</div>
          <div className="text-[10px] text-slate-400 mt-1">Awaiting human decision</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Today's Decisions</div>
          <div className="text-2xl font-bold text-emerald-600">{todayApprovals}</div>
          <div className="text-[10px] text-slate-400 mt-1">Approved/denied today</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Avg Response Time</div>
          <div className="text-2xl font-bold text-blue-600">12m</div>
          <div className="text-[10px] text-slate-400 mt-1">Median approval time</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100/80 rounded-xl w-fit max-w-full" role="tablist" aria-label="Human Oversight sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`ho-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`ho-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
            {tab.id === 'approvals' && pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'gates' && (
        <div id="ho-panel-gates" role="tabpanel" aria-labelledby="ho-tab-gates" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Configure when human approval is required before agent actions proceed.
            </div>
            <button
              onClick={() => {
                setShowAddGateToast(true);
                setTimeout(() => setShowAddGateToast(false), 3000);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Icon name="plus" className="w-4 h-4" />
              Add Gate
            </button>
            {showAddGateToast && (
              <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
                <Icon name="information-circle" className="w-5 h-5 text-blue-400" />
                <span className="text-sm">Gate configuration coming soon</span>
              </div>
            )}
          </div>

          {/* Confidence-Threshold Governance Policy — a visible, configurable control */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50">
                  <Icon name="cog" className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">Model Confidence Threshold</h4>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">governance policy</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
                    The fleet-wide model-confidence bar HITL gates key off. Below this, an agent's proposed action is
                    routed for human review rather than executed. Drives {confidenceGatedCount} confidence-gated gate{confidenceGatedCount === 1 ? '' : 's'}
                    {' '}and maps to the Bedrock A2I <code className="bg-slate-100 px-1 rounded">ConfidenceThreshold</code> activation condition.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-600 tabular-nums">{confidenceThreshold.toFixed(2)}</div>
                <div className="text-[10px] text-slate-400">{Math.round(confidenceThreshold * 100)}% confidence</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="text-[10px] text-slate-400 w-16">Permissive<br/>0.50</span>
              <input
                type="range"
                min={0.5}
                max={0.99}
                step={0.01}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                aria-label="Model confidence threshold"
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[10px] text-slate-400 w-16 text-right">Strict<br/>0.99</span>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {[0.7, 0.8, 0.9, 0.95].map(preset => (
                <button
                  key={preset}
                  onClick={() => setConfidenceThreshold(preset)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    Math.abs(confidenceThreshold - preset) < 0.005
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset.toFixed(2)}
                </button>
              ))}
              <span className="text-[10px] text-slate-400 ml-1">
                Higher = more actions sent to humans (safer, slower); lower = more autonomy.
              </span>
            </div>
          </div>

          <div className="grid gap-4">
            {gates.map(gate => (
              <div
                key={gate.id}
                {...rowButtonProps(
                  () => setSelectedGate(selectedGate?.id === gate.id ? null : gate),
                  `${gate.name} HITL gate, ${gate.status}. Toggle details.`,
                )}
                aria-pressed={selectedGate?.id === gate.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${triggerTypeColors[gate.triggerType]}15` }}
                    >
                      <Icon
                        name={triggerTypeIcons[gate.triggerType]}
                        className="w-5 h-5"
                        style={{ color: triggerTypeColors[gate.triggerType] }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">{gate.name}</h4>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          gate.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          gate.status === 'testing' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {gate.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{gate.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                        <span>Trigger: <code className="bg-slate-100 px-1 rounded">{gate.triggerCondition}</code></span>
                        <span>Timeout: {gate.timeoutMinutes}m → {gate.timeoutAction}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {gate.awsIntegration && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                        {AWS_INTEGRATIONS.find(i => i.id === gate.awsIntegration)?.service.replace('Amazon ', '').replace('AWS ', '')}
                      </span>
                    )}
                    <Icon name="chevron-right" className={`w-4 h-4 text-slate-400 transition-transform ${selectedGate?.id === gate.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedGate?.id === gate.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Approvers</div>
                      <div className="space-y-1">
                        {gate.approvers.map((approver, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                            <Icon name="user" className="w-3 h-3 text-slate-400" />
                            {approver}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Escalation Path</div>
                      <div className="space-y-1">
                        {gate.escalationPath.map((level, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                            <span className="text-[10px] text-slate-400">L{i + 1}</span>
                            {level}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">AWS Integration</div>
                      {gate.awsIntegration ? (
                        <div className="text-xs text-slate-700">
                          <div className="font-medium">{AWS_INTEGRATIONS.find(i => i.id === gate.awsIntegration)?.name}</div>
                          <div className="text-slate-500 mt-0.5">{AWS_INTEGRATIONS.find(i => i.id === gate.awsIntegration)?.description}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Not configured</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'approvals' && (
        <div id="ho-panel-approvals" role="tabpanel" aria-labelledby="ho-tab-approvals" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1" role="group" aria-label="Filter approval records">
              {(['all', 'pending', 'approved', 'denied'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setApprovalFilter(filter)}
                  aria-pressed={approvalFilter === filter}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    approvalFilter === filter
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
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Request</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Agent</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Gate</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Requested</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-slate-600">Decision By</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvalRecords
                  .filter(record => approvalFilter === 'all' || record.decision === approvalFilter)
                  .map(record => (
                  <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{record.requestedAction}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{record.riskContext}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{record.agentName}</td>
                    <td className="py-3 px-4 text-slate-600 text-xs">{record.gateName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {new Date(record.requestedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${decisionColors[record.decision]}`}>
                        {record.decision}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {record.decidedBy ? <MaskedIdentity identity={record.decidedBy} /> : '—'}
                      {record.notes && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{record.notes}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {record.decision === 'pending' ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            aria-label="Approve request"
                            onClick={() => {
                              setApprovalRecords(prev => prev.map(r =>
                                r.id === record.id
                                  ? { ...r, decision: 'approved' as const, decidedAt: new Date().toISOString(), decidedBy: 'Current User', notes: 'Approved via UI' }
                                  : r
                              ));
                            }}
                            className="p-1.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors"
                          >
                            <Icon name="check" className="w-3 h-3" />
                          </button>
                          <button
                            aria-label="Deny request"
                            onClick={() => {
                              setApprovalRecords(prev => prev.map(r =>
                                r.id === record.id
                                  ? { ...r, decision: 'denied' as const, decidedAt: new Date().toISOString(), decidedBy: 'Current User', notes: 'Denied via UI' }
                                  : r
                              ));
                            }}
                            className="p-1.5 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 transition-colors"
                          >
                            <Icon name="x-mark" className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            alert(`Approval Record ${record.id}\n\nAction: ${record.requestedAction}\nDecision: ${record.decision}\nDecided By: ${record.decidedBy}\nNotes: ${record.notes || 'None'}`);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'escalation' && (
        <div id="ho-panel-escalation" role="tabpanel" aria-labelledby="ho-tab-escalation" className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <Icon name="information-circle" className="w-5 h-5 inline mr-2" />
            Escalation paths define how approval requests are routed when initial approvers don't respond within timeout.
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Default Escalation Path</h4>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
              <div className="space-y-4">
                {DEFAULT_ESCALATION.map((level, i) => (
                  <div key={i} className="flex items-center gap-4 relative">
                    <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center z-10 text-xs font-bold text-slate-600">
                      {level.level}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{level.role}</div>
                          <div className="text-xs text-slate-500">Timeout: {level.timeoutMinutes} minutes</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded ${
                            level.notificationChannel === 'slack' ? 'bg-purple-100 text-purple-700' :
                            level.notificationChannel === 'email' ? 'bg-blue-100 text-blue-700' :
                            level.notificationChannel === 'pagerduty' ? 'bg-green-100 text-green-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {level.notificationChannel}
                          </span>
                        </div>
                      </div>
                    </div>
                    {i < DEFAULT_ESCALATION.length - 1 && (
                      <Icon name="arrow-down" className="w-4 h-4 text-slate-300 absolute left-2 -bottom-2.5 z-20" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Escalation Best Practices</h4>
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Icon name="check" className="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Set shorter timeouts for high-risk actions (15-30 min)</span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="check" className="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Use PagerDuty/SNS for urgent escalations requiring immediate attention</span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="check" className="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Include at least 3 escalation levels before auto-deny</span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="check" className="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Configure backup approvers for each level during holidays/PTO</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'handoff' && <div id="ho-panel-handoff" role="tabpanel" aria-labelledby="ho-tab-handoff"><HandoffWorkspace /></div>}

      {activeTab === 'enforcement' && <div id="ho-panel-enforcement" role="tabpanel" aria-labelledby="ho-tab-enforcement"><RuntimeEnforcementView /></div>}

      {activeTab === 'earned-autonomy' && <div id="ho-panel-earned-autonomy" role="tabpanel" aria-labelledby="ho-tab-earned-autonomy"><EarnedAutonomyView /></div>}

      {activeTab === 'aws-integration' && (
        <div id="ho-panel-aws-integration" role="tabpanel" aria-labelledby="ho-tab-aws-integration" className="space-y-4">
          <div className="text-sm text-slate-600">
            Integrate HITL gates with AWS services for production-grade human approval workflows.
          </div>

          <div className="grid grid-cols-2 gap-4">
            {AWS_INTEGRATIONS.map(integration => (
              <div
                key={integration.id}
                {...rowButtonProps(
                  () => setSelectedIntegration(selectedIntegration === integration.id ? null : integration.id),
                  `${integration.name} (${integration.service}). Toggle configuration example.`,
                )}
                aria-pressed={selectedIntegration === integration.id}
                className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none ${
                  selectedIntegration === integration.id
                    ? 'border-blue-500 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${integration.color}15` }}
                  >
                    <Icon name={integration.icon} className="w-5 h-5" style={{ color: integration.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{integration.name}</h4>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{integration.service}</div>
                    <p className="text-xs text-slate-600 mt-1">{integration.description}</p>
                  </div>
                </div>

                {selectedIntegration === integration.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Configuration Example</div>
                    <pre className="bg-slate-900 text-slate-100 text-[10px] p-3 rounded-lg overflow-x-auto">
                      {integration.configExample}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <Icon name="exclamation-triangle" className="w-5 h-5 inline mr-2" />
            <strong>Implementation Note:</strong> These integrations require AWS credentials and service configuration.
            See the <button onClick={() => setActiveTab('gates')} className="underline hover:no-underline">Go Live Guide</button> (at the top of this page) for setup instructions.
          </div>
        </div>
      )}
    </div>
  );
}
