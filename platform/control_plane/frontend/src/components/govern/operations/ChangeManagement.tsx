/**
 * ChangeManagement - Operations change tracking for the agentic platform.
 *
 * Tracks all changes to the agentic platform for ops and compliance:
 * - KPI metrics for change management health
 * - Change log with filtering and detail drawer
 * - Change calendar with freeze periods
 * - Approval queue with risk assessment
 * - Change policies (freeze schedules, auto-approval rules)
 *
 * Designed for FSI compliance requirements where change management is audit-critical.
 */

import { useState, useMemo } from 'react';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import Drawer from '../Drawer';
import { Icon, type IconName } from '../icons';
import { rowButtonProps } from '../a11y';
import { usePersistedState } from '../usePersistedState';
import { useChanges, usePendingApprovals, useChangeMutations, type ChangeType, type ChangeStatus, type RiskLevel, type Outcome } from './useOpsLiveData';

// =============================================================================
// Types
// =============================================================================

// Types moved to useOpsLiveData.ts

interface ApprovalStep {
  role: string;
  approver: string;
  status: string;
  timestamp: string | null;
  comment?: string;
}

interface ExecutionLogEntry {
  timestamp: string;
  action: string;
  status: string;
  detail?: string;
}

interface RelatedIncident {
  id: string;
  title: string;
  severity: string;
}

interface ConfigDiff {
  field: string;
  before: string;
  after: string;
}

interface Change {
  id: string;
  type: ChangeType;
  title: string;
  description: string;
  agentOrResource: string;
  requester: string;
  approver: string | null;
  status: ChangeStatus;
  scheduledTime: string;
  completedTime: string | null;
  outcome: Outcome;
  riskLevel: RiskLevel;
  complianceImpact: string;
  approvalChain: ApprovalStep[];
  executionLog: ExecutionLogEntry[];
  configDiff?: ConfigDiff[];
  relatedIncidents: RelatedIncident[];
  rollbackAvailable: boolean;
  testingRequired: boolean;
  testingCompleted: boolean;
}

interface ScheduledChange {
  id: string;
  title: string;
  type: ChangeType;
  scheduledDate: string;
  riskLevel: RiskLevel;
  hasConflict: boolean;
}

interface FreezePeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  reason: string;
}

interface ChangePolicy {
  id: string;
  name: string;
  description: string;
  type: 'freeze' | 'auto-approval' | 'required-approver' | 'testing';
  active: boolean;
  conditions: string;
}

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_CHANGES: Change[] = [
  {
    id: 'CHG-2026-0847',
    type: 'deployment',
    title: 'Deploy Claims Agent v2.4.1',
    description: 'Production deployment of Claims Processing Agent with enhanced fraud detection guardrails and improved latency optimization.',
    agentOrResource: 'claims-agent-prod',
    requester: 'Sarah Chen',
    approver: 'Mike Rodriguez',
    status: 'completed',
    scheduledTime: '2026-08-10T14:00:00Z',
    completedTime: '2026-08-10T14:23:00Z',
    outcome: 'success',
    riskLevel: 'medium',
    complianceImpact: 'No regulatory impact. Fraud detection improvements align with NAIC Model AI Bulletin requirements.',
    approvalChain: [
      { role: 'Tech Lead', approver: 'Mike Rodriguez', status: 'approved', timestamp: '2026-08-10T10:15:00Z', comment: 'LGTM - tested in staging' },
      { role: 'Release Manager', approver: 'Lisa Park', status: 'approved', timestamp: '2026-08-10T11:30:00Z' },
    ],
    executionLog: [
      { timestamp: '2026-08-10T14:00:12Z', action: 'Initiated blue-green deployment', status: 'success' },
      { timestamp: '2026-08-10T14:08:45Z', action: 'Health checks passed on green instances', status: 'success' },
      { timestamp: '2026-08-10T14:15:22Z', action: 'Traffic shifted 25% to green', status: 'success' },
      { timestamp: '2026-08-10T14:19:38Z', action: 'Traffic shifted 100% to green', status: 'success' },
      { timestamp: '2026-08-10T14:23:00Z', action: 'Deployment completed, blue instances terminated', status: 'success' },
    ],
    relatedIncidents: [],
    rollbackAvailable: true,
    testingRequired: true,
    testingCompleted: true,
  },
  {
    id: 'CHG-2026-0846',
    type: 'config-change',
    title: 'Update Guardrail Thresholds for PII Detection',
    description: 'Tightening PII detection sensitivity from 0.7 to 0.85 confidence threshold based on false negative audit findings.',
    agentOrResource: 'guardrail-pii-detector',
    requester: 'James Wilson',
    approver: 'Emily Chang',
    status: 'completed',
    scheduledTime: '2026-08-09T16:00:00Z',
    completedTime: '2026-08-09T16:05:00Z',
    outcome: 'success',
    riskLevel: 'low',
    complianceImpact: 'Positive: Improved PII protection aligns with CCPA/GDPR requirements.',
    approvalChain: [
      { role: 'Compliance Officer', approver: 'Emily Chang', status: 'approved', timestamp: '2026-08-09T14:30:00Z', comment: 'Required per audit finding A-2026-042' },
    ],
    executionLog: [
      { timestamp: '2026-08-09T16:00:05Z', action: 'Configuration update initiated', status: 'success' },
      { timestamp: '2026-08-09T16:02:15Z', action: 'Guardrail rules reloaded', status: 'success' },
      { timestamp: '2026-08-09T16:05:00Z', action: 'Verification tests passed', status: 'success' },
    ],
    configDiff: [
      { field: 'pii_detection.confidence_threshold', before: '0.7', after: '0.85' },
      { field: 'pii_detection.ssn_pattern.enabled', before: 'true', after: 'true' },
      { field: 'pii_detection.credit_card.mask_output', before: 'partial', after: 'full' },
    ],
    relatedIncidents: [
      { id: 'INC-2026-0124', title: 'PII exposure in support transcript', severity: 'high' },
    ],
    rollbackAvailable: true,
    testingRequired: false,
    testingCompleted: false,
  },
  {
    id: 'CHG-2026-0845',
    type: 'model-update',
    title: 'Swap Claude 3.5 Sonnet to Claude 4 Sonnet',
    description: 'Model upgrade for Customer Service Agent to leverage improved reasoning and reduced hallucination rates.',
    agentOrResource: 'customer-service-agent',
    requester: 'David Kim',
    approver: null,
    status: 'pending-approval',
    scheduledTime: '2026-08-12T02:00:00Z',
    completedTime: null,
    outcome: 'pending',
    riskLevel: 'high',
    complianceImpact: 'Model change requires MRM review per SR 11-7. 30-day parallel run results attached.',
    approvalChain: [
      { role: 'Tech Lead', approver: 'Mike Rodriguez', status: 'approved', timestamp: '2026-08-10T09:00:00Z' },
      { role: 'MRM Officer', approver: 'Dr. Patricia Lee', status: 'pending', timestamp: null },
      { role: 'CISO', approver: 'Robert Chen', status: 'pending', timestamp: null },
    ],
    executionLog: [],
    relatedIncidents: [],
    rollbackAvailable: true,
    testingRequired: true,
    testingCompleted: true,
  },
  {
    id: 'CHG-2026-0844',
    type: 'rollback',
    title: 'Rollback Underwriting Agent v3.1.0',
    description: 'Emergency rollback due to elevated false positive rate in risk scoring. Reverting to v3.0.2.',
    agentOrResource: 'underwriting-agent',
    requester: 'System (Auto)',
    approver: 'On-Call: Alex Thompson',
    status: 'completed',
    scheduledTime: '2026-08-09T03:15:00Z',
    completedTime: '2026-08-09T03:22:00Z',
    outcome: 'success',
    riskLevel: 'critical',
    complianceImpact: 'Triggered by compliance alert. Rollback prevents further biased underwriting decisions.',
    approvalChain: [
      { role: 'On-Call Engineer', approver: 'Alex Thompson', status: 'approved', timestamp: '2026-08-09T03:16:00Z', comment: 'Emergency approval per runbook RB-AGENT-001' },
    ],
    executionLog: [
      { timestamp: '2026-08-09T03:15:00Z', action: 'Anomaly detected: risk score bias +23%', status: 'error' },
      { timestamp: '2026-08-09T03:15:30Z', action: 'Auto-rollback triggered', status: 'warning' },
      { timestamp: '2026-08-09T03:17:45Z', action: 'Traffic shifted to v3.0.2', status: 'success' },
      { timestamp: '2026-08-09T03:22:00Z', action: 'Rollback completed, incident created', status: 'success' },
    ],
    relatedIncidents: [
      { id: 'INC-2026-0127', title: 'Underwriting Agent bias anomaly', severity: 'critical' },
    ],
    rollbackAvailable: false,
    testingRequired: true,
    testingCompleted: false,
  },
  {
    id: 'CHG-2026-0843',
    type: 'policy-update',
    title: 'Enable Cedar A2A Trust Policy',
    description: 'Deploying new Cedar policy to restrict agent-to-agent communication to approved trust paths only.',
    agentOrResource: 'cedar-policy-store',
    requester: 'Emily Chang',
    approver: 'Robert Chen',
    status: 'in-progress',
    scheduledTime: '2026-08-11T10:00:00Z',
    completedTime: null,
    outcome: 'pending',
    riskLevel: 'high',
    complianceImpact: 'Required for Zero Trust architecture compliance. Affects all agent communications.',
    approvalChain: [
      { role: 'Security Architect', approver: 'Maria Santos', status: 'approved', timestamp: '2026-08-10T15:00:00Z' },
      { role: 'CISO', approver: 'Robert Chen', status: 'approved', timestamp: '2026-08-10T17:30:00Z', comment: 'Approved with staged rollout' },
    ],
    executionLog: [
      { timestamp: '2026-08-11T10:00:15Z', action: 'Policy deployment initiated', status: 'success' },
      { timestamp: '2026-08-11T10:02:30Z', action: 'Policy validation passed', status: 'success' },
      { timestamp: '2026-08-11T10:05:00Z', action: 'Staged rollout: 10% of traffic', status: 'success' },
    ],
    relatedIncidents: [],
    rollbackAvailable: true,
    testingRequired: true,
    testingCompleted: true,
  },
  {
    id: 'CHG-2026-0842',
    type: 'scale-event',
    title: 'Auto-scale Fraud Detection Fleet',
    description: 'Automatic horizontal scaling triggered by sustained high throughput during quarter-end processing.',
    agentOrResource: 'fraud-detection-fleet',
    requester: 'System (Auto)',
    approver: 'System (Pre-approved)',
    status: 'completed',
    scheduledTime: '2026-08-08T22:30:00Z',
    completedTime: '2026-08-08T22:35:00Z',
    outcome: 'success',
    riskLevel: 'low',
    complianceImpact: 'None. Auto-scaling within pre-approved capacity limits.',
    approvalChain: [
      { role: 'System', approver: 'Auto-Scaling Policy', status: 'approved', timestamp: '2026-08-08T22:30:00Z', comment: 'Pre-approved: capacity < 80% threshold' },
    ],
    executionLog: [
      { timestamp: '2026-08-08T22:30:00Z', action: 'CPU utilization 78%, scaling threshold met', status: 'warning' },
      { timestamp: '2026-08-08T22:30:30Z', action: 'Scaling out: 4 -> 8 instances', status: 'success' },
      { timestamp: '2026-08-08T22:35:00Z', action: 'All instances healthy, scale complete', status: 'success' },
    ],
    relatedIncidents: [],
    rollbackAvailable: false,
    testingRequired: false,
    testingCompleted: false,
  },
  {
    id: 'CHG-2026-0841',
    type: 'deployment',
    title: 'Deploy RAG Knowledge Base Update',
    description: 'Updating product knowledge base embeddings with Q3 2026 policy documents.',
    agentOrResource: 'product-kb-vectorstore',
    requester: 'Jennifer Adams',
    approver: 'Mike Rodriguez',
    status: 'failed',
    scheduledTime: '2026-08-07T18:00:00Z',
    completedTime: '2026-08-07T18:45:00Z',
    outcome: 'failed',
    riskLevel: 'medium',
    complianceImpact: 'Delayed compliance update. Reschedule required within 48 hours per data freshness SLA.',
    approvalChain: [
      { role: 'Tech Lead', approver: 'Mike Rodriguez', status: 'approved', timestamp: '2026-08-07T16:00:00Z' },
    ],
    executionLog: [
      { timestamp: '2026-08-07T18:00:05Z', action: 'Embedding generation started', status: 'success' },
      { timestamp: '2026-08-07T18:25:00Z', action: 'Embedding generation completed', status: 'success' },
      { timestamp: '2026-08-07T18:30:15Z', action: 'Vector store sync initiated', status: 'success' },
      { timestamp: '2026-08-07T18:42:30Z', action: 'Sync failed: timeout exceeded', status: 'error' },
      { timestamp: '2026-08-07T18:45:00Z', action: 'Deployment failed, rollback initiated', status: 'error' },
    ],
    relatedIncidents: [
      { id: 'INC-2026-0121', title: 'KB sync timeout', severity: 'medium' },
    ],
    rollbackAvailable: false,
    testingRequired: true,
    testingCompleted: true,
  },
  {
    id: 'CHG-2026-0840',
    type: 'config-change',
    title: 'Increase Agent Memory TTL',
    description: 'Extending conversation memory retention from 24h to 72h for improved customer context.',
    agentOrResource: 'agent-memory-config',
    requester: 'David Kim',
    approver: null,
    status: 'pending-approval',
    scheduledTime: '2026-08-13T06:00:00Z',
    completedTime: null,
    outcome: 'pending',
    riskLevel: 'medium',
    complianceImpact: 'Requires data retention review. Extended PII retention window needs GDPR assessment.',
    approvalChain: [
      { role: 'Tech Lead', approver: 'Mike Rodriguez', status: 'approved', timestamp: '2026-08-10T14:00:00Z' },
      { role: 'Privacy Officer', approver: 'Amanda Foster', status: 'pending', timestamp: null },
    ],
    executionLog: [],
    configDiff: [
      { field: 'memory.conversation_ttl_hours', before: '24', after: '72' },
      { field: 'memory.cleanup_batch_size', before: '1000', after: '500' },
    ],
    relatedIncidents: [],
    rollbackAvailable: true,
    testingRequired: false,
    testingCompleted: false,
  },
];

const MOCK_SCHEDULED_CHANGES: ScheduledChange[] = [
  { id: 'CHG-2026-0845', title: 'Model Upgrade: Claude 4 Sonnet', type: 'model-update', scheduledDate: '2026-08-12', riskLevel: 'high', hasConflict: false },
  { id: 'CHG-2026-0840', title: 'Memory TTL Increase', type: 'config-change', scheduledDate: '2026-08-13', riskLevel: 'medium', hasConflict: false },
  { id: 'CHG-2026-0850', title: 'Quarterly Security Patch', type: 'deployment', scheduledDate: '2026-08-15', riskLevel: 'high', hasConflict: true },
  { id: 'CHG-2026-0851', title: 'Guardrail Policy Refresh', type: 'policy-update', scheduledDate: '2026-08-18', riskLevel: 'medium', hasConflict: false },
  { id: 'CHG-2026-0852', title: 'Fleet Capacity Review', type: 'scale-event', scheduledDate: '2026-08-20', riskLevel: 'low', hasConflict: false },
];

const MOCK_FREEZE_PERIODS: FreezePeriod[] = [
  { id: 'FRZ-001', name: 'Q3 Earnings Blackout', startDate: '2026-08-14', endDate: '2026-08-16', reason: 'No changes during earnings announcement window' },
  { id: 'FRZ-002', name: 'Mobile Release Freeze', startDate: '2026-08-22', endDate: '2026-08-24', reason: 'Mobile app release to App Store - backend freeze' },
  { id: 'FRZ-003', name: 'Labor Day Weekend', startDate: '2026-09-05', endDate: '2026-09-08', reason: 'Holiday weekend - reduced staffing' },
];

const MOCK_POLICIES: ChangePolicy[] = [
  {
    id: 'POL-001',
    name: 'Auto-approve Low-Risk Scale Events',
    description: 'Automatically approve scaling events within pre-approved capacity limits',
    type: 'auto-approval',
    active: true,
    conditions: 'type = scale-event AND risk = low AND capacity_delta < 100%',
  },
  {
    id: 'POL-002',
    name: 'CISO Approval for Model Changes',
    description: 'All model updates require CISO approval regardless of risk level',
    type: 'required-approver',
    active: true,
    conditions: 'type = model-update',
  },
  {
    id: 'POL-003',
    name: 'MRM Review for Production Agents',
    description: 'Model Risk Management review required for production agent deployments',
    type: 'required-approver',
    active: true,
    conditions: 'type = deployment AND environment = production',
  },
  {
    id: 'POL-004',
    name: 'Mandatory Testing - High Risk',
    description: 'High and critical risk changes must pass staging tests before approval',
    type: 'testing',
    active: true,
    conditions: 'risk IN (high, critical)',
  },
  {
    id: 'POL-005',
    name: 'Weekend Change Freeze',
    description: 'No non-emergency changes during weekends',
    type: 'freeze',
    active: false,
    conditions: 'day_of_week IN (Saturday, Sunday)',
  },
];

// =============================================================================
// Demo date reseeding
// =============================================================================
// All mock timestamps are shifted by a fixed offset so the data stays anchored
// near "today". This keeps KPIs like "Changes This Week" meaningful and avoids
// every change rendering as weeks-old. Relative ordering between timestamps is
// preserved because every value is shifted by the same amount.

const DEMO_ANCHOR_MS = new Date('2026-08-11T12:00:00Z').getTime();
const DEMO_SHIFT_MS = Date.now() - DEMO_ANCHOR_MS;

function shiftIso(iso: string | null): string | null {
  if (!iso) return iso;
  return new Date(new Date(iso).getTime() + DEMO_SHIFT_MS).toISOString();
}

function shiftDateOnly(date: string): string {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + DEMO_SHIFT_MS).toISOString().slice(0, 10);
}

const SEEDED_CHANGES: Change[] = MOCK_CHANGES.map((c) => ({
  ...c,
  scheduledTime: shiftIso(c.scheduledTime)!,
  completedTime: shiftIso(c.completedTime),
  approvalChain: c.approvalChain.map((step) => ({ ...step, timestamp: shiftIso(step.timestamp) })),
  executionLog: c.executionLog.map((entry) => ({ ...entry, timestamp: shiftIso(entry.timestamp)! })),
}));

const SEEDED_SCHEDULED_CHANGES: ScheduledChange[] = MOCK_SCHEDULED_CHANGES.map((s) => ({
  ...s,
  scheduledDate: shiftDateOnly(s.scheduledDate),
}));

const SEEDED_FREEZE_PERIODS: FreezePeriod[] = MOCK_FREEZE_PERIODS.map((f) => ({
  ...f,
  startDate: shiftDateOnly(f.startDate),
  endDate: shiftDateOnly(f.endDate),
}));

// =============================================================================
// Helper Functions
// =============================================================================

const TYPE_CONFIG: Record<ChangeType, { label: string; icon: IconName; color: string }> = {
  deployment: { label: 'Deployment', icon: 'rocket-launch', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  'config-change': { label: 'Config Change', icon: 'cog', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  'policy-update': { label: 'Policy Update', icon: 'shield-check', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  'model-update': { label: 'Model Update', icon: 'sparkles', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  rollback: { label: 'Rollback', icon: 'arrow-path', color: 'text-rose-600 bg-rose-50 border-rose-200' },
  'scale-event': { label: 'Scale Event', icon: 'chart-bar', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
};

const STATUS_CONFIG: Record<ChangeStatus, { label: string; color: string }> = {
  'pending-approval': { label: 'Pending Approval', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  'in-progress': { label: 'In Progress', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  failed: { label: 'Failed', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  'rolled-back': { label: 'Rolled Back', color: 'bg-orange-100 text-orange-700 border-orange-200' },
};

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: 'Low', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const OUTCOME_CONFIG: Record<Outcome, { label: string; icon: IconName; color: string }> = {
  success: { label: 'Success', icon: 'check-circle', color: 'text-emerald-600' },
  partial: { label: 'Partial', icon: 'exclamation-triangle', color: 'text-amber-600' },
  failed: { label: 'Failed', icon: 'x-circle', color: 'text-rose-600' },
  pending: { label: 'Pending', icon: 'clock', color: 'text-slate-400' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// =============================================================================
// Sub-Components
// =============================================================================

function ChangeTypeBadge({ type }: { type: ChangeType }) {
  const config = TYPE_CONFIG[type];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded border ${config.color}`}>
      <Icon name={config.icon} className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ChangeStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${config.color}`}>
      {config.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const config = RISK_CONFIG[risk];
  return (
    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${config.color}`}>
      {config.label}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type TabView = 'log' | 'calendar' | 'approvals' | 'policies';

export default function ChangeManagement() {
  const [localChanges, setLocalChanges] = usePersistedState<Change[]>('change_management_changes_v2', SEEDED_CHANGES);
  const [selectedChange, setSelectedChange] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('log');
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<string>('all');
  const [filterRequester, setFilterRequester] = useState<string>('all');

  // Live data hooks
  const { loading: changesLoading, changes: liveChanges, live: isChangesLive } = useChanges({
    type: filterType !== 'all' ? filterType as ChangeType : undefined,
    status: filterStatus !== 'all' ? filterStatus as ChangeStatus : undefined,
    dateRange: filterDateRange !== 'all' ? filterDateRange : undefined,
  });
  const { loading: approvalsLoading, pendingApprovals: livePendingApprovals, live: isApprovalsLive } = usePendingApprovals();
  const { approve, reject, rollback } = useChangeMutations();

  // Use live data if available, otherwise fall back to local/mock
  const changes: Change[] = liveChanges.length > 0 ? liveChanges : localChanges;
  const setChanges = setLocalChanges;
  const isLive = isChangesLive || isApprovalsLive;
  const isLoading = changesLoading || approvalsLoading;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Compute KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const thisWeek = changes.filter(c => new Date(c.scheduledTime) >= weekAgo);
    const completed = changes.filter(c => c.status === 'completed' || c.status === 'failed' || c.status === 'rolled-back');
    const failed = completed.filter(c => c.status === 'failed');
    const rollbacks = changes.filter(c => c.type === 'rollback');
    const pending = changes.filter(c => c.status === 'pending-approval');
    const successful = completed.filter(c => c.outcome === 'success');

    const failureRate = completed.length > 0 ? (failed.length / completed.length * 100) : 0;
    const successRate = completed.length > 0 ? (successful.length / completed.length * 100) : 0;

    // Lead time (request -> deploy) can't be derived from the available fields —
    // no request/creation timestamp is captured, only scheduled and completed times.
    // So this stays an illustrative demo figure, surfaced with a Demo marker on the
    // KPI card rather than presented as a computed metric.
    const leadTimeDays = 2.3;

    return {
      changesThisWeek: thisWeek.length,
      failureRate: failureRate.toFixed(1),
      rollbackCount: rollbacks.length,
      pendingApprovals: pending.length,
      successRate: successRate.toFixed(1),
      leadTimeDays: leadTimeDays.toFixed(1),
    };
  }, [changes]);

  // Filter changes
  const filteredChanges = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    return changes.filter(c => {
      if (filterType !== 'all' && c.type !== filterType) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterRequester !== 'all' && c.requester !== filterRequester) return false;
      if (filterDateRange !== 'all') {
        const t = new Date(c.scheduledTime).getTime();
        if (filterDateRange === 'today' && t < startOfToday) return false;
        if (filterDateRange === 'week' && t < weekAgo) return false;
        if (filterDateRange === 'month' && t < monthAgo) return false;
      }
      return true;
    });
  }, [changes, filterType, filterStatus, filterRequester, filterDateRange]);

  // Get pending approvals - use live if available
  const pendingApprovals = useMemo<Change[]>(() => {
    if (livePendingApprovals.length > 0) return livePendingApprovals;
    return changes.filter(c => c.status === 'pending-approval');
  }, [changes, livePendingApprovals]);

  // Get unique requesters for filter
  const requesters = useMemo(() => {
    return [...new Set(changes.map(c => c.requester))];
  }, [changes]);

  const selectedData = selectedChange ? changes.find(c => c.id === selectedChange) : null;

  // Action handlers
  const handleApprove = async (id: string) => {
    if (isLive) {
      await approve(id);
    } else {
      setChanges(prev => prev.map(c => {
        if (c.id === id) {
          const updatedChain = c.approvalChain.map(step => {
            if (step.status === 'pending') {
              return { ...step, status: 'approved' as const, timestamp: new Date().toISOString() };
            }
            return step;
          });
          const allApproved = updatedChain.every(step => step.status === 'approved');
          return {
            ...c,
            approvalChain: updatedChain,
            status: allApproved ? 'approved' as const : c.status,
            approver: 'You (Demo)',
          };
        }
        return c;
      }));
    }
    showToast(`Change ${id} approved`);
  };

  const handleReject = async (id: string) => {
    if (isLive) {
      await reject(id, 'Rejected via Change Management');
    } else {
      setChanges(prev => prev.map(c => {
        if (c.id === id) {
          return { ...c, status: 'failed' as const, outcome: 'failed' as const };
        }
        return c;
      }));
    }
    showToast(`Change ${id} rejected`);
    setSelectedChange(null);
  };

  const handleRollback = async (id: string) => {
    if (isLive) {
      await rollback(id);
    } else {
      setChanges(prev => prev.map(c => {
        if (c.id === id) {
          return { ...c, status: 'rolled-back' as const };
        }
        return c;
      }));
    }
    showToast(`Rollback initiated for ${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Data Source Badge */}
      <div className="flex justify-end">
        {isLive ? <LiveDataBadge source="ITIL Change Management" /> : <MockDataBadge integration="ITIL Change Management / FSI Ops Compliance" />}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="spinner" className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading change data...</span>
        </div>
      )}

      {!isLoading && (
      <>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard
          label="Changes This Week"
          value={kpis.changesThisWeek}
          variant="default"
          icon={<Icon name="calendar" className="w-4 h-4 text-slate-400" />}
        />
        <StatCard
          label="Failure Rate"
          value={`${kpis.failureRate}%`}
          variant={parseFloat(kpis.failureRate) > 10 ? 'danger' : parseFloat(kpis.failureRate) > 5 ? 'warning' : 'success'}
          icon={<Icon name="exclamation-triangle" className="w-4 h-4" />}
        />
        <StatCard
          label="Rollbacks"
          value={kpis.rollbackCount}
          variant={kpis.rollbackCount > 0 ? 'warning' : 'success'}
          icon={<Icon name="arrow-path" className="w-4 h-4" />}
        />
        <StatCard
          label="Pending Approvals"
          value={kpis.pendingApprovals}
          variant={kpis.pendingApprovals > 5 ? 'warning' : 'default'}
          icon={<Icon name="clock" className="w-4 h-4" />}
        />
        <StatCard
          label="Success Rate"
          value={`${kpis.successRate}%`}
          variant={parseFloat(kpis.successRate) >= 95 ? 'success' : parseFloat(kpis.successRate) >= 80 ? 'warning' : 'danger'}
          icon={<Icon name="check-circle" className="w-4 h-4" />}
        />
        <StatCard
          label="Lead Time"
          value={`${kpis.leadTimeDays}d`}
          variant="info"
          sub={<span className="inline-flex items-center gap-1">avg. to deploy <MockDataBadge integration="ITIL lead-time metrics" /></span>}
          icon={<Icon name="bolt" className="w-4 h-4" />}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {[
          { id: 'log' as const, label: 'Change Log', icon: 'clipboard-list' as IconName },
          { id: 'calendar' as const, label: 'Calendar', icon: 'calendar' as IconName },
          { id: 'approvals' as const, label: 'Approval Queue', icon: 'inbox-stack' as IconName, badge: kpis.pendingApprovals },
          { id: 'policies' as const, label: 'Policies', icon: 'document-check' as IconName },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Change Log Tab */}
      {activeTab === 'log' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <select
              aria-label="Filter by type"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <select
              aria-label="Filter by requester"
              value={filterRequester}
              onChange={e => setFilterRequester(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Requesters</option>
              {requesters.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              aria-label="Filter by date range"
              value={filterDateRange}
              onChange={e => setFilterDateRange(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>

          {/* Change Log Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">ID</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Type</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Description</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Agent/Resource</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Requester</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Status</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Time</th>
                  <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filteredChanges.map(change => {
                  const outcomeConfig = OUTCOME_CONFIG[change.outcome];
                  return (
                    <tr
                      key={change.id}
                      {...rowButtonProps(
                        () => setSelectedChange(selectedChange === change.id ? null : change.id),
                        `View change ${change.id}: ${change.title}`
                      )}
                      className={`border-b border-slate-100 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50 ${
                        selectedChange === change.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-600">{change.id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ChangeTypeBadge type={change.type} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900 max-w-xs truncate">{change.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-600 font-mono">{change.agentOrResource}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{change.requester}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={change.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(change.scheduledTime)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs ${outcomeConfig.color}`}>
                          <Icon name={outcomeConfig.icon} className="w-3.5 h-3.5" />
                          {outcomeConfig.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Calendar View */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Scheduled Changes</h3>
            <div className="space-y-3">
              {SEEDED_SCHEDULED_CHANGES.map(change => (
                <div
                  key={change.id}
                  className={`p-3 rounded-lg border ${
                    change.hasConflict ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">{change.id}</span>
                      <ChangeTypeBadge type={change.type} />
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge risk={change.riskLevel} />
                      {change.hasConflict && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                          CONFLICT
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-900">{change.title}</div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Icon name="calendar" className="w-3.5 h-3.5" />
                    {formatDate(change.scheduledDate)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Freeze Periods */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="no-symbol" className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900">Freeze Periods</h3>
            </div>
            <div className="space-y-3">
              {SEEDED_FREEZE_PERIODS.map(freeze => (
                <div key={freeze.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                  <div className="text-sm font-semibold text-amber-900">{freeze.name}</div>
                  <div className="text-xs text-amber-700 mt-1">
                    {formatDate(freeze.startDate)} - {formatDate(freeze.endDate)}
                  </div>
                  <div className="text-xs text-slate-600 mt-2">{freeze.reason}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled
              title="Freeze scheduling is not available yet"
              className="w-full mt-4 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-400 bg-amber-50 rounded-lg cursor-not-allowed"
            >
              <Icon name="plus" className="w-4 h-4" />
              Add Freeze Period
            </button>
          </div>
        </div>
      )}

      {/* Approval Queue Tab */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-8 text-center">
              <Icon name="check-circle" className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <div className="text-lg font-semibold text-emerald-900">No Pending Approvals</div>
              <div className="text-sm text-emerald-700 mt-1">All changes have been reviewed</div>
            </div>
          ) : (
            pendingApprovals.map(change => (
              <div key={change.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-400">{change.id}</span>
                      <ChangeTypeBadge type={change.type} />
                      <RiskBadge risk={change.riskLevel} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{change.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">{change.description}</p>
                  </div>
                </div>

                {/* Risk Assessment */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 mb-4">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Risk Assessment</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Risk Level</div>
                      <div className="font-semibold text-slate-900">{RISK_CONFIG[change.riskLevel].label}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Compliance Impact</div>
                      <div className="text-slate-700 text-xs">{change.complianceImpact.slice(0, 60)}...</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Testing</div>
                      <div className={`font-semibold ${change.testingCompleted ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {change.testingRequired ? (change.testingCompleted ? 'Passed' : 'Required') : 'Not Required'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Approval Chain */}
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Approval Chain</div>
                  <div className="flex items-center gap-2">
                    {change.approvalChain.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                          step.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          step.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {step.role}: {step.approver}
                          {step.status === 'approved' && <Icon name="check" className="w-3 h-3 inline ml-1" />}
                        </div>
                        {i < change.approvalChain.length - 1 && (
                          <Icon name="arrow-right" className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => handleApprove(change.id)}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(change.id)}
                    className="px-4 py-2 text-sm font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setSelectedChange(change.id)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Request More Info
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900">Change Policies</h3>
            <button
              type="button"
              disabled
              title="Policy authoring is not available yet"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
            >
              <Icon name="plus" className="w-4 h-4" />
              Add Policy
            </button>
          </div>
          {MOCK_POLICIES.map(policy => (
            <div key={policy.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                    policy.type === 'freeze' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    policy.type === 'auto-approval' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                    policy.type === 'required-approver' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                    'bg-violet-100 text-violet-700 border-violet-200'
                  }`}>
                    {policy.type.replace('-', ' ').toUpperCase()}
                  </span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                    policy.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {policy.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled
                  title="Policy settings are not available yet"
                  className="text-slate-300 cursor-not-allowed"
                >
                  <Icon name="cog" className="w-4 h-4" />
                </button>
              </div>
              <h4 className="text-sm font-semibold text-slate-900">{policy.name}</h4>
              <p className="text-xs text-slate-600 mt-1">{policy.description}</p>
              <div className="mt-3 p-2 rounded bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-mono text-slate-600">{policy.conditions}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Change Detail Drawer */}
      <Drawer
        open={!!selectedData}
        onClose={() => setSelectedChange(null)}
        title={selectedData?.title || ''}
        subtitle={selectedData?.id}
        width="xl"
      >
        {selectedData && (
          <div className="space-y-6">
            {/* Header Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <ChangeTypeBadge type={selectedData.type} />
              <StatusBadge status={selectedData.status} />
              <RiskBadge risk={selectedData.riskLevel} />
              {selectedData.rollbackAvailable && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                  Rollback Available
                </span>
              )}
            </div>

            {/* Full Description */}
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Description</div>
              <p className="text-sm text-slate-700">{selectedData.description}</p>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Agent/Resource</div>
                <div className="text-sm font-medium text-slate-900 font-mono">{selectedData.agentOrResource}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Requester</div>
                <div className="text-sm font-medium text-slate-900">{selectedData.requester}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Scheduled</div>
                <div className="text-sm font-medium text-slate-900">{formatDateTime(selectedData.scheduledTime)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Completed</div>
                <div className="text-sm font-medium text-slate-900">
                  {selectedData.completedTime ? formatDateTime(selectedData.completedTime) : '-'}
                </div>
              </div>
            </div>

            {/* Config Diff (if applicable) */}
            {selectedData.configDiff && selectedData.configDiff.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Configuration Changes</div>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="text-slate-400 text-xs">
                        <th className="text-left pb-2">Field</th>
                        <th className="text-left pb-2">Before</th>
                        <th className="text-left pb-2">After</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {selectedData.configDiff.map((diff, i) => (
                        <tr key={i} className="border-t border-slate-700">
                          <td className="py-2 text-slate-400">{diff.field}</td>
                          <td className="py-2 text-rose-400">{diff.before}</td>
                          <td className="py-2 text-emerald-400">{diff.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Approval Chain */}
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Approval Chain</div>
              <div className="space-y-2">
                {selectedData.approvalChain.map((step, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border flex items-center justify-between ${
                      step.status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
                      step.status === 'rejected' ? 'bg-rose-50 border-rose-200' :
                      'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{step.role}</div>
                      <div className="text-xs text-slate-600">{step.approver}</div>
                      {step.comment && (
                        <div className="text-xs text-slate-500 mt-1 italic">"{step.comment}"</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-semibold ${
                        step.status === 'approved' ? 'text-emerald-600' :
                        step.status === 'rejected' ? 'text-rose-600' :
                        'text-amber-600'
                      }`}>
                        {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                      </div>
                      {step.timestamp && (
                        <div className="text-[10px] text-slate-400">{formatDateTime(step.timestamp)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution Log */}
            {selectedData.executionLog.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Execution Log</div>
                <div className="bg-slate-900 rounded-lg p-4 max-h-60 overflow-y-auto">
                  {selectedData.executionLog.map((entry, i) => (
                    <div key={i} className="flex items-start gap-3 py-1.5 text-sm font-mono">
                      <span className="text-slate-500 text-xs whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        entry.status === 'success' ? 'bg-emerald-500' :
                        entry.status === 'warning' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`} />
                      <span className="text-slate-300">{entry.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Incidents */}
            {selectedData.relatedIncidents.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Related Incidents</div>
                <div className="space-y-2">
                  {selectedData.relatedIncidents.map(inc => (
                    <div key={inc.id} className="p-3 rounded-lg border border-rose-200 bg-rose-50 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-slate-400 mr-2">{inc.id}</span>
                        <span className="text-sm text-slate-900">{inc.title}</span>
                      </div>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                        inc.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                        inc.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {inc.severity.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance Impact */}
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Compliance Impact Assessment</div>
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
                <p className="text-sm text-slate-700">{selectedData.complianceImpact}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
              {selectedData.status === 'pending-approval' && (
                <>
                  <button
                    onClick={() => handleApprove(selectedData.id)}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(selectedData.id)}
                    className="px-4 py-2 text-sm font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
              {selectedData.rollbackAvailable && selectedData.status === 'completed' && (
                <button
                  onClick={() => handleRollback(selectedData.id)}
                  className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Icon name="arrow-path" className="w-4 h-4" />
                  Initiate Rollback
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
          {toast}
        </div>
      )}
      </>
      )}
    </div>
  );
}
