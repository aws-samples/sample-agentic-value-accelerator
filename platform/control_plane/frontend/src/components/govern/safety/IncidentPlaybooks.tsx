/**
 * IncidentPlaybooks — SSM-backed AI incident response playbooks for the Safety module.
 *
 * Provides pre-built runbook templates for AI-specific incident scenarios:
 * - Agent Quarantine (isolate misbehaving agent)
 * - Guardrail Escalation (tighten guardrail thresholds)
 * - Model Rollback (revert to previous version)
 * - PII Exposure Response
 * - Prompt Injection Containment
 *
 * Each playbook shows description, steps, AWS services used, and can be executed
 * via AWS SSM StartAutomationExecution or provides manual guidance.
 *
 * Also includes EU AI Act Article 73 countdown timers for statutory reporting deadlines.
 *
 * AWS Integration:
 * - AWS Systems Manager (SSM): Automation runbooks, StartAutomationExecution
 * - Amazon EventBridge: Incident trigger automation
 * - AWS Lambda: Custom remediation functions
 * - Amazon SNS: Notification and escalation
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import GovernPageLayout from '../GovernPageLayout';
import { MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon, type IconName } from '../icons';

// ─────────────────────────── Types ───────────────────────────

interface PlaybookStep {
  order: number;
  action: string;
  service: string;
  automated: boolean;
  description: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  icon: IconName;
  color: string;
  ssmDocumentName: string;
  estimatedDuration: string;
  steps: PlaybookStep[];
  awsServices: string[];
  triggers: string[];
}

interface PlaybookExecution {
  id: string;
  playbookId: string;
  playbookName: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  incidentId: string | null;
}

interface Article73Deadline {
  id: string;
  incidentId: string;
  incidentTitle: string;
  clockDays: 2 | 10 | 15;
  detectedAt: string;
  deadline: string;
  status: 'pending' | 'approaching' | 'overdue' | 'reported';
  reportingAuthority: string;
}

// ─────────────────────────── Data ───────────────────────────

const PLAYBOOKS: Playbook[] = [
  {
    id: 'pb-agent-quarantine',
    name: 'Agent Quarantine',
    description: 'Immediately isolate a misbehaving agent from production traffic while preserving state for investigation.',
    severity: 'critical',
    category: 'Containment',
    icon: 'stop-circle',
    color: '#EF4444',
    ssmDocumentName: 'AVA-AgentQuarantine-v1',
    estimatedDuration: '2-5 minutes',
    steps: [
      { order: 1, action: 'Update ALB target group to drain agent', service: 'ALB', automated: true, description: 'Remove agent from load balancer to stop new requests' },
      { order: 2, action: 'Invoke Lambda to disable Bedrock agent alias', service: 'Lambda', automated: true, description: 'Disable the agent alias in Amazon Bedrock' },
      { order: 3, action: 'Snapshot agent state to S3', service: 'S3', automated: true, description: 'Preserve conversation history and context for forensics' },
      { order: 4, action: 'Send SNS notification to incident team', service: 'SNS', automated: true, description: 'Alert on-call responders via email/Slack/PagerDuty' },
      { order: 5, action: 'Update agent status in registry', service: 'DynamoDB', automated: true, description: 'Mark agent as quarantined in the governance registry' },
      { order: 6, action: 'Create incident ticket', service: 'Jira/ServiceNow', automated: false, description: 'Manual: Create incident ticket with quarantine evidence' },
    ],
    awsServices: ['SSM', 'Lambda', 'ALB', 'S3', 'SNS', 'DynamoDB', 'Bedrock'],
    triggers: ['Guardrail critical violation', 'Anomaly detection alert', 'Manual kill switch', 'Rate limit breach'],
  },
  {
    id: 'pb-guardrail-escalation',
    name: 'Guardrail Escalation',
    description: 'Tighten guardrail thresholds in response to emerging threats or policy violations.',
    severity: 'high',
    category: 'Mitigation',
    icon: 'shield-check',
    color: '#F59E0B',
    ssmDocumentName: 'AVA-GuardrailEscalation-v1',
    estimatedDuration: '3-8 minutes',
    steps: [
      { order: 1, action: 'Retrieve current guardrail configuration', service: 'Bedrock', automated: true, description: 'Get current thresholds and topic policies' },
      { order: 2, action: 'Apply escalation tier config from Parameter Store', service: 'SSM Parameter Store', automated: true, description: 'Load pre-defined escalation tier settings' },
      { order: 3, action: 'Update Bedrock guardrail via API', service: 'Bedrock', automated: true, description: 'Apply tightened content filters and denied topics' },
      { order: 4, action: 'Invalidate prompt cache', service: 'ElastiCache', automated: true, description: 'Clear cached responses that may bypass new rules' },
      { order: 5, action: 'Log escalation to CloudWatch', service: 'CloudWatch', automated: true, description: 'Record escalation event with before/after config' },
      { order: 6, action: 'Notify stakeholders', service: 'SNS', automated: true, description: 'Alert compliance and risk teams of policy change' },
    ],
    awsServices: ['SSM', 'Bedrock', 'SSM Parameter Store', 'ElastiCache', 'CloudWatch', 'SNS'],
    triggers: ['Repeated guardrail hits', 'New threat vector identified', 'Compliance review finding', 'Manual escalation request'],
  },
  {
    id: 'pb-model-rollback',
    name: 'Model Rollback',
    description: 'Revert an AI model or agent to a previous known-good version after detecting degradation or issues.',
    severity: 'high',
    category: 'Recovery',
    icon: 'arrow-path',
    color: '#8B5CF6',
    ssmDocumentName: 'AVA-ModelRollback-v1',
    estimatedDuration: '5-15 minutes',
    steps: [
      { order: 1, action: 'Identify rollback target version', service: 'DynamoDB', automated: true, description: 'Query model registry for previous stable version' },
      { order: 2, action: 'Validate rollback target exists', service: 'S3/SageMaker', automated: true, description: 'Confirm model artifact or endpoint is available' },
      { order: 3, action: 'Update Bedrock agent alias to previous version', service: 'Bedrock', automated: true, description: 'Point agent alias to previous model version' },
      { order: 4, action: 'Run smoke tests', service: 'Lambda', automated: true, description: 'Execute validation tests against rolled-back version' },
      { order: 5, action: 'Update traffic routing', service: 'ALB', automated: true, description: 'Gradually shift traffic to rolled-back version' },
      { order: 6, action: 'Archive failed version for analysis', service: 'S3', automated: true, description: 'Preserve failed version artifacts for root cause analysis' },
      { order: 7, action: 'Update deployment log', service: 'CloudWatch', automated: true, description: 'Record rollback event with version details' },
    ],
    awsServices: ['SSM', 'Bedrock', 'SageMaker', 'DynamoDB', 'S3', 'Lambda', 'ALB', 'CloudWatch'],
    triggers: ['Model evaluation failure', 'Accuracy degradation', 'Bias drift detected', 'Customer escalation'],
  },
  {
    id: 'pb-pii-exposure',
    name: 'PII Exposure Response',
    description: 'Contain and remediate PII exposure incidents, including data quarantine and notification workflows.',
    severity: 'critical',
    category: 'Data Protection',
    icon: 'lock-closed',
    color: '#DC2626',
    ssmDocumentName: 'AVA-PIIExposureResponse-v1',
    estimatedDuration: '10-30 minutes',
    steps: [
      { order: 1, action: 'Isolate affected data sources', service: 'Lambda', automated: true, description: 'Disable access to knowledge bases or data stores involved' },
      { order: 2, action: 'Quarantine exposed records', service: 'S3/DynamoDB', automated: true, description: 'Move affected records to secure quarantine location' },
      { order: 3, action: 'Revoke active sessions', service: 'Cognito', automated: true, description: 'Invalidate sessions that may have accessed PII' },
      { order: 4, action: 'Generate exposure report', service: 'Lambda', automated: true, description: 'Document scope, affected data subjects, and timeline' },
      { order: 5, action: 'Notify Privacy Officer', service: 'SNS', automated: true, description: 'Alert DPO with incident summary and initial assessment' },
      { order: 6, action: 'Initiate data subject notification workflow', service: 'Step Functions', automated: false, description: 'Manual: Trigger notification process if required by GDPR/CCPA' },
      { order: 7, action: 'Log to compliance audit trail', service: 'CloudTrail', automated: true, description: 'Record incident for regulatory reporting' },
    ],
    awsServices: ['SSM', 'Lambda', 'S3', 'DynamoDB', 'Cognito', 'SNS', 'Step Functions', 'CloudTrail'],
    triggers: ['PII detection in output', 'Data leak alert', 'RAG retrieval audit finding', 'Customer complaint'],
  },
  {
    id: 'pb-prompt-injection',
    name: 'Prompt Injection Containment',
    description: 'Respond to prompt injection attacks by blocking vectors, updating filters, and preserving evidence.',
    severity: 'high',
    category: 'Security',
    icon: 'syringe',
    color: '#0EA5E9',
    ssmDocumentName: 'AVA-PromptInjectionResponse-v1',
    estimatedDuration: '5-12 minutes',
    steps: [
      { order: 1, action: 'Block attack source', service: 'WAF', automated: true, description: 'Add attacker IP/pattern to WAF blocklist' },
      { order: 2, action: 'Update input filter patterns', service: 'Bedrock', automated: true, description: 'Add detected injection pattern to guardrail blocklist' },
      { order: 3, action: 'Scan recent inputs for similar patterns', service: 'Lambda', automated: true, description: 'Retrospective scan for related attack attempts' },
      { order: 4, action: 'Preserve attack evidence', service: 'S3', automated: true, description: 'Archive attack payload and context for threat intel' },
      { order: 5, action: 'Update threat model', service: 'DynamoDB', automated: false, description: 'Manual: Add attack vector to threat model catalog' },
      { order: 6, action: 'Notify Security team', service: 'SNS', automated: true, description: 'Alert security operations with attack details' },
      { order: 7, action: 'Publish IOC to shared threat feed', service: 'EventBridge', automated: false, description: 'Optional: Share indicators of compromise with partners' },
    ],
    awsServices: ['SSM', 'WAF', 'Bedrock', 'Lambda', 'S3', 'DynamoDB', 'SNS', 'EventBridge'],
    triggers: ['Guardrail injection detection', 'Anomalous input pattern', 'Security scan finding', 'Red team exercise'],
  },
];

const MOCK_EXECUTIONS: PlaybookExecution[] = [
  {
    id: 'exec-001',
    playbookId: 'pb-guardrail-escalation',
    playbookName: 'Guardrail Escalation',
    status: 'success',
    startedAt: '2026-07-22T14:32:00Z',
    completedAt: '2026-07-22T14:38:15Z',
    triggeredBy: 'CloudWatch Alarm: guardrail-hit-rate',
    incidentId: 'INC-2026-0044',
  },
  {
    id: 'exec-002',
    playbookId: 'pb-agent-quarantine',
    playbookName: 'Agent Quarantine',
    status: 'success',
    startedAt: '2026-07-21T09:15:00Z',
    completedAt: '2026-07-21T09:18:42Z',
    triggeredBy: 'Manual: j.martinez@company.com',
    incidentId: 'INC-2026-0043',
  },
  {
    id: 'exec-003',
    playbookId: 'pb-prompt-injection',
    playbookName: 'Prompt Injection Containment',
    status: 'running',
    startedAt: '2026-07-23T08:45:00Z',
    completedAt: null,
    triggeredBy: 'Bedrock Guardrail: injection-filter',
    incidentId: null,
  },
  {
    id: 'exec-004',
    playbookId: 'pb-model-rollback',
    playbookName: 'Model Rollback',
    status: 'failed',
    startedAt: '2026-07-20T16:20:00Z',
    completedAt: '2026-07-20T16:28:33Z',
    triggeredBy: 'Manual: ops-team@company.com',
    incidentId: 'INC-2026-0039',
  },
];

const MOCK_DEADLINES: Article73Deadline[] = [
  {
    id: 'dl-001',
    incidentId: 'INC-2026-0043',
    incidentTitle: 'PII leaked in RAG response',
    clockDays: 15,
    detectedAt: '2026-07-20',
    deadline: '2026-08-04',
    status: 'approaching',
    reportingAuthority: 'BaFin (DE)',
  },
  {
    id: 'dl-002',
    incidentId: 'INC-2026-0041',
    incidentTitle: 'Claims-triage agent emitted unsafe guidance',
    clockDays: 15,
    detectedAt: '2026-07-18',
    deadline: '2026-08-02',
    status: 'approaching',
    reportingAuthority: 'CNIL (FR)',
  },
  {
    id: 'dl-003',
    incidentId: 'INC-2026-0040',
    incidentTitle: 'Critical infrastructure disruption (simulated)',
    clockDays: 2,
    detectedAt: '2026-07-22',
    deadline: '2026-07-24',
    status: 'approaching',
    reportingAuthority: 'BSI (DE)',
  },
];

// ─────────────────────────── Helpers ───────────────────────────

const TODAY = '2026-07-23';

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function formatDaysRemaining(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

const severityBadge: Record<Playbook['severity'], string> = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
};

const statusBadge: Record<PlaybookExecution['status'], string> = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-700',
};

const deadlineStatusBadge: Record<Article73Deadline['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  approaching: 'bg-amber-100 text-amber-700',
  overdue: 'bg-rose-100 text-rose-700',
  reported: 'bg-emerald-100 text-emerald-700',
};

const clockBadge: Record<2 | 10 | 15, string> = {
  2: 'bg-rose-100 text-rose-700 border-rose-300',
  10: 'bg-orange-100 text-orange-700 border-orange-300',
  15: 'bg-amber-100 text-amber-700 border-amber-300',
};

// ─────────────────────────── Component ───────────────────────────

type ViewTab = 'playbooks' | 'executions' | 'deadlines';

export default function IncidentPlaybooks() {
  const [view, setView] = useState<ViewTab>('playbooks');
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executionFilter, setExecutionFilter] = useState<'all' | PlaybookExecution['status']>('all');

  // Calculate deadline statistics
  const deadlineStats = useMemo(() => {
    const approaching = MOCK_DEADLINES.filter(d => {
      const days = daysBetween(TODAY, d.deadline);
      return days >= 0 && days <= 7;
    }).length;
    const overdue = MOCK_DEADLINES.filter(d => daysBetween(TODAY, d.deadline) < 0).length;
    const critical = MOCK_DEADLINES.filter(d => d.clockDays === 2).length;
    return { approaching, overdue, critical, total: MOCK_DEADLINES.length };
  }, []);

  const filteredExecutions = useMemo(() => {
    if (executionFilter === 'all') return MOCK_EXECUTIONS;
    return MOCK_EXECUTIONS.filter(e => e.status === executionFilter);
  }, [executionFilter]);

  const handleExecutePlaybook = useCallback((playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setShowExecuteModal(true);
  }, []);

  return (
    <GovernPageLayout
      title="Incident Playbooks"
      description="SSM-backed runbook templates for AI incident response. Pre-built automations for agent quarantine, guardrail escalation, model rollback, and more."
      badge={<MockDataBadge integration="AWS SSM Automation · EventBridge · Lambda" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Playbooks Available"
          value={PLAYBOOKS.length}
          variant="info"
          sub="pre-built templates"
        />
        <StatCard
          label="Executions (7d)"
          value={MOCK_EXECUTIONS.length}
          variant="default"
          sub={`${MOCK_EXECUTIONS.filter(e => e.status === 'success').length} successful`}
        />
        <StatCard
          label="Art. 73 Deadlines"
          value={deadlineStats.approaching}
          variant={deadlineStats.overdue > 0 ? 'danger' : deadlineStats.approaching > 0 ? 'warning' : 'success'}
          sub={deadlineStats.overdue > 0 ? `${deadlineStats.overdue} overdue` : 'within 7 days'}
        />
        <StatCard
          label="Critical Clock (2d)"
          value={deadlineStats.critical}
          variant={deadlineStats.critical > 0 ? 'danger' : 'muted'}
          sub="infrastructure disruption"
        />
      </div>

      {/* View tabs */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist">
        {([
          ['playbooks', 'Playbook Templates', 'clipboard-list'],
          ['executions', 'Execution History', 'arrow-path'],
          ['deadlines', 'Art. 73 Deadlines', 'calendar'],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={icon} className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ─────────── Playbooks view ─────────── */}
      {view === 'playbooks' && (
        <div className="space-y-4">
          {PLAYBOOKS.map(playbook => (
            <div
              key={playbook.id}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${playbook.color}15` }}
                    >
                      <Icon name={playbook.icon} className="w-6 h-6" style={{ color: playbook.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-slate-900">{playbook.name}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${severityBadge[playbook.severity]}`}>
                          {playbook.severity}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {playbook.category}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 max-w-2xl">{playbook.description}</p>

                      <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Icon name="clock" className="w-3.5 h-3.5" />
                          {playbook.estimatedDuration}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="rectangle-stack" className="w-3.5 h-3.5" />
                          {playbook.steps.length} steps
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="cloud" className="w-3.5 h-3.5" />
                          {playbook.awsServices.length} AWS services
                        </span>
                        <span className="font-mono text-slate-400">{playbook.ssmDocumentName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPlaybook(selectedPlaybook?.id === playbook.id ? null : playbook)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                    >
                      {selectedPlaybook?.id === playbook.id ? 'Hide Details' : 'View Details'}
                    </button>
                    <button
                      onClick={() => handleExecutePlaybook(playbook)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 transition flex items-center gap-1.5"
                    >
                      <Icon name="play-circle" className="w-4 h-4" />
                      Execute
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {selectedPlaybook?.id === playbook.id && (
                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
                      {/* Steps */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">Playbook Steps</h4>
                        <div className="space-y-2">
                          {playbook.steps.map((step, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                                {step.order}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-800">{step.action}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                    step.automated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {step.automated ? 'Automated' : 'Manual'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">{step.description}</div>
                                <div className="text-[10px] text-slate-400 mt-1 font-mono">{step.service}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Sidebar: Services & Triggers */}
                      <div className="space-y-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-slate-900 mb-2">AWS Services</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {playbook.awsServices.map((service, i) => (
                              <span key={i} className="text-[10px] px-2 py-1 rounded bg-orange-100 text-orange-700 font-medium">
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-slate-900 mb-2">Triggers</h4>
                          <div className="space-y-1.5">
                            {playbook.triggers.map((trigger, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px] text-slate-600">
                                <Icon name="bolt" className="w-3 h-3 text-slate-400" />
                                {trigger}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                          <h4 className="text-sm font-semibold text-blue-900 mb-1">SSM Document</h4>
                          <code className="text-[11px] text-blue-700 font-mono">{playbook.ssmDocumentName}</code>
                          <p className="text-[10px] text-blue-600 mt-2">
                            This playbook can be executed via SSM StartAutomationExecution or triggered from EventBridge rules.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────── Executions view ─────────── */}
      {view === 'executions' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-1" role="group" aria-label="Filter executions">
            {(['all', 'running', 'success', 'failed', 'cancelled'] as const).map(status => (
              <button
                key={status}
                onClick={() => setExecutionFilter(status)}
                aria-pressed={executionFilter === status}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  executionFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Execution list */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Playbook</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Started</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Duration</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Triggered By</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Incident</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExecutions.map(exec => {
                    const durationMs = exec.completedAt
                      ? Date.parse(exec.completedAt) - Date.parse(exec.startedAt)
                      : Date.now() - Date.parse(exec.startedAt);
                    const durationMin = Math.round(durationMs / 60000);

                    return (
                      <tr key={exec.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{exec.playbookName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{exec.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge[exec.status]}`}>
                            {exec.status === 'running' && <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                            {exec.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-600">
                          {new Date(exec.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-600">
                          {durationMin}m {exec.status === 'running' && '(running)'}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-600 max-w-[200px] truncate">
                          {exec.triggeredBy}
                        </td>
                        <td className="px-4 py-3">
                          {exec.incidentId ? (
                            <Link to={`/govern/safety?incident=${exec.incidentId}`} className="text-[11px] text-blue-600 hover:underline font-mono">
                              {exec.incidentId}
                            </Link>
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Deadlines view (EU AI Act Article 73) ─────────── */}
      {view === 'deadlines' && (
        <div className="space-y-6">
          {/* Article 73 explainer */}
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-amber-50/70 border-b border-amber-200">
              <Icon name="clipboard-list" className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-amber-900">EU AI Act Article 73 - Serious Incident Reporting</h2>
              <span className="ml-auto text-[10px] text-amber-700 font-medium">in force 2026-08-02</span>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-slate-600 leading-relaxed mb-4 max-w-3xl">
                Providers of high-risk AI systems must report serious incidents to market surveillance authorities within statutory deadlines.
                Failure to comply can result in significant fines (up to 3% of global annual turnover for SMEs, higher for larger enterprises).
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-rose-700">2</div>
                    <div className="text-[10px] text-rose-600 font-semibold uppercase">days</div>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    Widespread infringement or serious/irreversible disruption of critical infrastructure
                  </div>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-orange-700">10</div>
                    <div className="text-[10px] text-orange-600 font-semibold uppercase">days</div>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    Incident resulting in a person's death
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-amber-700">15</div>
                    <div className="text-[10px] text-amber-600 font-semibold uppercase">days</div>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    General serious incident (default reporting clock)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Countdown timers */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Active Reporting Deadlines</h3>
                <p className="text-[11px] text-slate-500">{MOCK_DEADLINES.length} incidents requiring statutory reporting</p>
              </div>
              <Link
                to="/govern/audit?tab=reports"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View Compliance Reports
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {MOCK_DEADLINES.map(deadline => {
                const daysRemaining = daysBetween(TODAY, deadline.deadline);
                const urgency = daysRemaining < 0 ? 'overdue' : daysRemaining <= 3 ? 'critical' : daysRemaining <= 7 ? 'approaching' : 'ok';

                return (
                  <div key={deadline.id} className="p-4 hover:bg-slate-50/60 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4">
                        {/* Countdown badge */}
                        <div className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                          urgency === 'overdue' ? 'bg-rose-100 border-2 border-rose-300' :
                          urgency === 'critical' ? 'bg-rose-50 border-2 border-rose-200' :
                          urgency === 'approaching' ? 'bg-amber-50 border-2 border-amber-200' :
                          'bg-slate-50 border-2 border-slate-200'
                        }`}>
                          <div className={`text-2xl font-bold ${
                            urgency === 'overdue' ? 'text-rose-700' :
                            urgency === 'critical' ? 'text-rose-600' :
                            urgency === 'approaching' ? 'text-amber-600' :
                            'text-slate-600'
                          }`}>
                            {Math.abs(daysRemaining)}
                          </div>
                          <div className="text-[9px] font-semibold uppercase text-slate-500">
                            {daysRemaining < 0 ? 'overdue' : 'days left'}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${clockBadge[deadline.clockDays]}`}>
                              {deadline.clockDays}-day clock
                            </span>
                            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${deadlineStatusBadge[deadline.status]}`}>
                              {deadline.status}
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900">{deadline.incidentTitle}</h4>
                          <div className="text-[11px] text-slate-500 mt-1">
                            <span className="font-mono">{deadline.incidentId}</span>
                            <span className="mx-2">|</span>
                            <span>Detected: {deadline.detectedAt}</span>
                            <span className="mx-2">|</span>
                            <span>Deadline: <span className="font-semibold">{deadline.deadline}</span></span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Reporting authority: {deadline.reportingAuthority}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 transition">
                          Prepare Report
                        </button>
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                          View Incident
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4 ml-24">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            urgency === 'overdue' ? 'bg-rose-500' :
                            urgency === 'critical' ? 'bg-rose-400' :
                            urgency === 'approaching' ? 'bg-amber-400' :
                            'bg-emerald-400'
                          }`}
                          style={{
                            width: `${Math.max(0, Math.min(100, ((deadline.clockDays - daysRemaining) / deadline.clockDays) * 100))}%`
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[9px] text-slate-400">
                        <span>Detected</span>
                        <span className="font-semibold">{formatDaysRemaining(daysRemaining)}</span>
                        <span>Deadline</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reporting requirements */}
          <div className="bg-blue-50/60 rounded-xl border border-blue-100 p-4">
            <div className="flex items-start gap-3">
              <Icon name="information-circle" className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-blue-900 leading-relaxed">
                <span className="font-semibold">Reporting Requirements.</span> Article 73 reports must include: incident description,
                AI system identification, root cause analysis (if known), corrective measures taken or planned, and contact information.
                Initial reports can be followed up with additional details within 14 days. See the{' '}
                <Link to="/govern/compliance?framework=euaiact" className="font-medium underline decoration-blue-300 hover:text-blue-700">
                  EU AI Act compliance center
                </Link>{' '}
                for report templates and submission guidance.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Execute playbook modal */}
      {showExecuteModal && selectedPlaybook && (
        <ExecutePlaybookModal
          playbook={selectedPlaybook}
          onClose={() => {
            setShowExecuteModal(false);
            setSelectedPlaybook(null);
          }}
        />
      )}
    </GovernPageLayout>
  );
}

// ─────────────────────────── Execute Modal ───────────────────────────

interface ExecutePlaybookModalProps {
  playbook: Playbook;
  onClose: () => void;
}

function ExecutePlaybookModal({ playbook, onClose }: ExecutePlaybookModalProps) {
  const [executing, setExecuting] = useState(false);
  const [incidentId, setIncidentId] = useState('');
  const [notes, setNotes] = useState('');

  const handleExecute = () => {
    setExecuting(true);
    // Simulate execution
    setTimeout(() => {
      alert(`Playbook "${playbook.name}" would be executed via SSM StartAutomationExecution.\n\nDocument: ${playbook.ssmDocumentName}\nIncident: ${incidentId || 'None'}\n\nIn production, this would invoke the SSM Automation runbook.`);
      setExecuting(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${playbook.color}15` }}
            >
              <Icon name={playbook.icon} className="w-5 h-5" style={{ color: playbook.color }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Execute Playbook</h3>
              <p className="text-sm text-slate-500">{playbook.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-[11px] text-amber-800">
                <span className="font-semibold">Warning:</span> This will execute the SSM Automation document
                <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded text-[10px]">{playbook.ssmDocumentName}</code>
                in your AWS account. Ensure you have the necessary permissions and understand the impact.
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Incident ID (optional)
            </label>
            <input
              type="text"
              value={incidentId}
              onChange={e => setIncidentId(e.target.value)}
              placeholder="e.g., INC-2026-0044"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-slate-400 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">Link this execution to an existing incident for traceability.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Execution Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for execution, context, or special instructions..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-slate-400 focus:outline-none resize-none"
            />
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Execution Preview</h4>
            <div className="space-y-1 text-[11px] text-slate-600">
              <div><span className="text-slate-500">Document:</span> <span className="font-mono">{playbook.ssmDocumentName}</span></div>
              <div><span className="text-slate-500">Steps:</span> {playbook.steps.length} ({playbook.steps.filter(s => s.automated).length} automated)</div>
              <div><span className="text-slate-500">Est. Duration:</span> {playbook.estimatedDuration}</div>
              <div><span className="text-slate-500">Services:</span> {playbook.awsServices.join(', ')}</div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={executing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {executing ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Icon name="play-circle" className="w-4 h-4" />
                Execute Playbook
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
