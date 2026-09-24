/**
 * InvestigationQueue - Content safety investigation workflow for flagged AI interactions
 *
 * Implements a case management system for investigating flagged audit events, similar
 * to Microsoft Agent365's "retain and investigate unethical interactions" feature.
 *
 * Features:
 * - Case lifecycle: New -> Investigating -> Pending Review -> Resolved / Escalated
 * - Priority and category classification
 * - Timeline with evidence (audit logs, traces, screenshots)
 * - Related cases (same agent, same user)
 * - Resolution with required fields (root cause, remediation, preventive action)
 * - SLA tracking and compliance metrics
 *
 * All data is mock/illustrative; in production this would integrate with:
 * - Audit event store (DynamoDB / PostgreSQL)
 * - Case management backend
 * - Evidence storage (S3)
 * - Notification service (SNS/EventBridge)
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon, type IconName } from './icons';
import { usePersistedState } from './usePersistedState';
import { rowButtonProps } from './a11y';

// ─────────────────────────── Types ───────────────────────────

export type CaseStatus = 'new' | 'investigating' | 'pending-review' | 'resolved' | 'escalated';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';
export type CaseCategory =
  | 'content-safety'
  | 'data-leak'
  | 'bias'
  | 'policy-violation'
  | 'other';

export interface TimelineEvent {
  id: string;
  ts: string;
  type: 'created' | 'assigned' | 'note' | 'evidence' | 'status-change' | 'escalated' | 'resolved';
  actor: string;
  description: string;
  details?: string;
}

export interface Evidence {
  id: string;
  type: 'audit-log' | 'trace' | 'screenshot' | 'document' | 'transcript';
  name: string;
  addedAt: string;
  addedBy: string;
  link?: string;
}

export interface Resolution {
  rootCause: string;
  remediation: string;
  preventiveAction: string;
  resolvedBy: string;
  resolvedAt: string;
}

export interface InvestigationCase {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  category: CaseCategory;
  // Source audit event
  sourceEventId: string;
  sourceEventTs: string;
  // Parties involved
  agentId: string;
  agentName: string;
  userId?: string;
  userName?: string;
  // Assignment
  assignee?: string;
  assignedAt?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  // SLA
  slaDueAt: string;
  slaBreached: boolean;
  // Timeline and evidence
  timeline: TimelineEvent[];
  evidence: Evidence[];
  // Related cases
  relatedCaseIds: string[];
  // Resolution (when resolved)
  resolution?: Resolution;
}

// ─────────────────────────── Mock Data ───────────────────────────

const FIXTURE_TODAY = '2026-08-11';

const MOCK_CASES: InvestigationCase[] = [
  {
    id: 'INV-2026-0087',
    title: 'Customer service agent provided medical advice outside scope',
    description: 'Agent responded to a customer query about medication dosage with specific medical recommendations, violating the "no medical advice" content policy. Customer was asking about a product recall and the agent extrapolated into health guidance.',
    status: 'investigating',
    priority: 'critical',
    category: 'content-safety',
    sourceEventId: 'AUD-2026-08-09-1142',
    sourceEventTs: '2026-08-09T11:42:00Z',
    agentId: 'agent-cs-001',
    agentName: 'Customer Service Copilot',
    userId: 'user-9284',
    userName: 'J. Martinez',
    assignee: 'sarah.chen@example.com',
    assignedAt: '2026-08-09T14:00:00Z',
    createdAt: '2026-08-09T12:30:00Z',
    updatedAt: '2026-08-10T09:15:00Z',
    slaDueAt: '2026-08-12T12:30:00Z',
    slaBreached: false,
    timeline: [
      { id: 'tl-1', ts: '2026-08-09T12:30:00Z', type: 'created', actor: 'system', description: 'Case created from flagged audit event' },
      { id: 'tl-2', ts: '2026-08-09T14:00:00Z', type: 'assigned', actor: 'maria.garcia@example.com', description: 'Assigned to Sarah Chen (Content Safety Lead)' },
      { id: 'tl-3', ts: '2026-08-09T14:30:00Z', type: 'status-change', actor: 'sarah.chen@example.com', description: 'Status changed to Investigating' },
      { id: 'tl-4', ts: '2026-08-09T15:00:00Z', type: 'evidence', actor: 'sarah.chen@example.com', description: 'Added full conversation transcript' },
      { id: 'tl-5', ts: '2026-08-10T09:15:00Z', type: 'note', actor: 'sarah.chen@example.com', description: 'Initial analysis: guardrail failed to catch medical terminology in context of product inquiry', details: 'The denied-topics filter is configured for explicit medical keywords but did not recognize contextual medical advice. Recommending guardrail policy expansion.' },
    ],
    evidence: [
      { id: 'ev-1', type: 'audit-log', name: 'Audit Event AUD-2026-08-09-1142', addedAt: '2026-08-09T12:30:00Z', addedBy: 'system', link: '/govern/audit?id=AUD-2026-08-09-1142' },
      { id: 'ev-2', type: 'transcript', name: 'Full conversation transcript', addedAt: '2026-08-09T15:00:00Z', addedBy: 'sarah.chen@example.com' },
      { id: 'ev-3', type: 'trace', name: 'Bedrock invocation trace', addedAt: '2026-08-09T15:30:00Z', addedBy: 'sarah.chen@example.com' },
    ],
    relatedCaseIds: ['INV-2026-0072'],
  },
  {
    id: 'INV-2026-0086',
    title: 'PII exposure in RAG response - unredacted SSN',
    description: 'Knowledge retrieval returned a document chunk containing an unredacted Social Security Number. The customer-facing response included partial SSN digits.',
    status: 'pending-review',
    priority: 'critical',
    category: 'data-leak',
    sourceEventId: 'AUD-2026-08-08-0923',
    sourceEventTs: '2026-08-08T09:23:00Z',
    agentId: 'agent-kb-003',
    agentName: 'HR Benefits Assistant',
    userId: 'user-4521',
    userName: 'R. Thompson',
    assignee: 'david.kim@example.com',
    assignedAt: '2026-08-08T10:00:00Z',
    createdAt: '2026-08-08T09:45:00Z',
    updatedAt: '2026-08-10T16:00:00Z',
    slaDueAt: '2026-08-10T09:45:00Z',
    slaBreached: true,
    timeline: [
      { id: 'tl-1', ts: '2026-08-08T09:45:00Z', type: 'created', actor: 'system', description: 'Case created - PII guardrail triggered post-response' },
      { id: 'tl-2', ts: '2026-08-08T10:00:00Z', type: 'assigned', actor: 'system', description: 'Auto-assigned to David Kim (Data Protection)' },
      { id: 'tl-3', ts: '2026-08-08T10:15:00Z', type: 'status-change', actor: 'david.kim@example.com', description: 'Status changed to Investigating' },
      { id: 'tl-4', ts: '2026-08-08T11:00:00Z', type: 'evidence', actor: 'david.kim@example.com', description: 'Added knowledge base document audit' },
      { id: 'tl-5', ts: '2026-08-09T14:00:00Z', type: 'note', actor: 'david.kim@example.com', description: 'Root cause identified: document ingested without PII scan', details: 'HR uploaded benefits enrollment forms directly to KB without running through PII redaction pipeline.' },
      { id: 'tl-6', ts: '2026-08-10T16:00:00Z', type: 'status-change', actor: 'david.kim@example.com', description: 'Remediation complete - moved to pending review' },
    ],
    evidence: [
      { id: 'ev-1', type: 'audit-log', name: 'Original audit event', addedAt: '2026-08-08T09:45:00Z', addedBy: 'system' },
      { id: 'ev-2', type: 'document', name: 'KB document with PII', addedAt: '2026-08-08T11:00:00Z', addedBy: 'david.kim@example.com' },
      { id: 'ev-3', type: 'screenshot', name: 'Response screenshot (redacted)', addedAt: '2026-08-08T11:30:00Z', addedBy: 'david.kim@example.com' },
    ],
    relatedCaseIds: [],
  },
  {
    id: 'INV-2026-0085',
    title: 'Loan pre-screen model showing demographic disparity',
    description: 'Fairness monitoring detected statistically significant difference in approval recommendations across demographic groups. Model may be exhibiting proxy discrimination through zip code features.',
    status: 'escalated',
    priority: 'high',
    category: 'bias',
    sourceEventId: 'AUD-2026-08-07-1630',
    sourceEventTs: '2026-08-07T16:30:00Z',
    agentId: 'model-loan-001',
    agentName: 'Loan Pre-Screen Model',
    assignee: 'ethics-committee@example.com',
    assignedAt: '2026-08-08T09:00:00Z',
    createdAt: '2026-08-07T17:00:00Z',
    updatedAt: '2026-08-09T11:00:00Z',
    slaDueAt: '2026-08-14T17:00:00Z',
    slaBreached: false,
    timeline: [
      { id: 'tl-1', ts: '2026-08-07T17:00:00Z', type: 'created', actor: 'fairness-monitor', description: 'Case auto-created from fairness drift alert' },
      { id: 'tl-2', ts: '2026-08-07T17:30:00Z', type: 'assigned', actor: 'system', description: 'Assigned to Lisa Wong (ML Fairness)' },
      { id: 'tl-3', ts: '2026-08-08T09:00:00Z', type: 'escalated', actor: 'lisa.wong@example.com', description: 'Escalated to Ethics Committee - potential fair lending implications' },
      { id: 'tl-4', ts: '2026-08-09T11:00:00Z', type: 'note', actor: 'ethics-committee@example.com', description: 'Committee review scheduled for 2026-08-12', details: 'Pending independent audit of model features and training data. Production scoring paused for affected zip codes.' },
    ],
    evidence: [
      { id: 'ev-1', type: 'audit-log', name: 'Fairness monitoring alert', addedAt: '2026-08-07T17:00:00Z', addedBy: 'fairness-monitor' },
      { id: 'ev-2', type: 'document', name: 'Demographic parity analysis', addedAt: '2026-08-08T10:00:00Z', addedBy: 'lisa.wong@example.com' },
      { id: 'ev-3', type: 'document', name: 'Feature importance breakdown', addedAt: '2026-08-08T14:00:00Z', addedBy: 'lisa.wong@example.com' },
    ],
    relatedCaseIds: ['INV-2026-0061'],
  },
  {
    id: 'INV-2026-0084',
    title: 'Trading assistant accessed restricted market data',
    description: 'Agent made API call to internal market data service for securities the user was not authorized to view. Access control policy should have prevented this.',
    status: 'resolved',
    priority: 'high',
    category: 'policy-violation',
    sourceEventId: 'AUD-2026-08-05-1415',
    sourceEventTs: '2026-08-05T14:15:00Z',
    agentId: 'agent-trade-002',
    agentName: 'Trading Research Assistant',
    userId: 'user-7823',
    userName: 'M. Patel',
    assignee: 'james.wilson@example.com',
    assignedAt: '2026-08-05T15:00:00Z',
    createdAt: '2026-08-05T14:30:00Z',
    updatedAt: '2026-08-07T10:00:00Z',
    slaDueAt: '2026-08-08T14:30:00Z',
    slaBreached: false,
    timeline: [
      { id: 'tl-1', ts: '2026-08-05T14:30:00Z', type: 'created', actor: 'system', description: 'Case created from access control violation' },
      { id: 'tl-2', ts: '2026-08-05T15:00:00Z', type: 'assigned', actor: 'system', description: 'Assigned to James Wilson (Security)' },
      { id: 'tl-3', ts: '2026-08-05T16:00:00Z', type: 'status-change', actor: 'james.wilson@example.com', description: 'Status changed to Investigating' },
      { id: 'tl-4', ts: '2026-08-06T09:00:00Z', type: 'note', actor: 'james.wilson@example.com', description: 'Root cause: IAM policy attached to agent role was overly permissive' },
      { id: 'tl-5', ts: '2026-08-06T14:00:00Z', type: 'evidence', actor: 'james.wilson@example.com', description: 'Added IAM policy diff and remediation PR' },
      { id: 'tl-6', ts: '2026-08-07T10:00:00Z', type: 'resolved', actor: 'james.wilson@example.com', description: 'Case resolved - IAM policy corrected, no data exfiltration confirmed' },
    ],
    evidence: [
      { id: 'ev-1', type: 'audit-log', name: 'CloudTrail API call log', addedAt: '2026-08-05T14:30:00Z', addedBy: 'system' },
      { id: 'ev-2', type: 'document', name: 'IAM policy before/after', addedAt: '2026-08-06T14:00:00Z', addedBy: 'james.wilson@example.com' },
      { id: 'ev-3', type: 'trace', name: 'Agent execution trace', addedAt: '2026-08-06T14:30:00Z', addedBy: 'james.wilson@example.com' },
    ],
    relatedCaseIds: [],
    resolution: {
      rootCause: 'Agent IAM role had overly broad permissions due to copy-paste from development environment. The wildcard resource policy allowed access to all market data endpoints.',
      remediation: 'Updated IAM policy to use resource-level permissions. Added service control policy to prevent wildcard grants on market data APIs.',
      preventiveAction: 'Implemented automated IAM policy review in CI/CD pipeline. Added guardrail to validate agent permissions at deployment time.',
      resolvedBy: 'james.wilson@example.com',
      resolvedAt: '2026-08-07T10:00:00Z',
    },
  },
  {
    id: 'INV-2026-0083',
    title: 'Claims agent used outdated policy version',
    description: 'Insurance claims agent referenced a superseded policy document from the knowledge base, potentially providing incorrect coverage information.',
    status: 'new',
    priority: 'medium',
    category: 'other',
    sourceEventId: 'AUD-2026-08-10-0845',
    sourceEventTs: '2026-08-10T08:45:00Z',
    agentId: 'agent-claims-001',
    agentName: 'Claims Processing Agent',
    userId: 'user-3156',
    userName: 'A. Johnson',
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-10T09:00:00Z',
    slaDueAt: '2026-08-13T09:00:00Z',
    slaBreached: false,
    timeline: [
      { id: 'tl-1', ts: '2026-08-10T09:00:00Z', type: 'created', actor: 'system', description: 'Case created from manual flag by claims reviewer' },
    ],
    evidence: [
      { id: 'ev-1', type: 'audit-log', name: 'RAG retrieval log', addedAt: '2026-08-10T09:00:00Z', addedBy: 'system' },
    ],
    relatedCaseIds: [],
  },
  {
    id: 'INV-2026-0082',
    title: 'Chatbot generated inappropriate content in response to adversarial prompt',
    description: 'External user crafted a jailbreak prompt that bypassed content filters. Agent generated text that violated community guidelines before being caught by output filter.',
    status: 'resolved',
    priority: 'high',
    category: 'content-safety',
    sourceEventId: 'AUD-2026-08-03-2210',
    sourceEventTs: '2026-08-03T22:10:00Z',
    agentId: 'agent-chat-005',
    agentName: 'Public FAQ Chatbot',
    userId: 'anonymous',
    assignee: 'sarah.chen@example.com',
    assignedAt: '2026-08-04T08:00:00Z',
    createdAt: '2026-08-03T22:30:00Z',
    updatedAt: '2026-08-06T15:00:00Z',
    slaDueAt: '2026-08-06T22:30:00Z',
    slaBreached: false,
    timeline: [
      { id: 'tl-1', ts: '2026-08-03T22:30:00Z', type: 'created', actor: 'output-filter', description: 'Case auto-created from blocked output' },
      { id: 'tl-2', ts: '2026-08-04T08:00:00Z', type: 'assigned', actor: 'on-call', description: 'Assigned to Sarah Chen' },
      { id: 'tl-3', ts: '2026-08-04T10:00:00Z', type: 'status-change', actor: 'sarah.chen@example.com', description: 'Status changed to Investigating' },
      { id: 'tl-4', ts: '2026-08-05T11:00:00Z', type: 'note', actor: 'sarah.chen@example.com', description: 'Jailbreak pattern identified and added to input filter' },
      { id: 'tl-5', ts: '2026-08-06T15:00:00Z', type: 'resolved', actor: 'sarah.chen@example.com', description: 'Resolved - guardrails updated, red-team test added' },
    ],
    evidence: [
      { id: 'ev-1', type: 'audit-log', name: 'Guardrail block event', addedAt: '2026-08-03T22:30:00Z', addedBy: 'system' },
      { id: 'ev-2', type: 'transcript', name: 'Redacted conversation log', addedAt: '2026-08-04T10:30:00Z', addedBy: 'sarah.chen@example.com' },
    ],
    relatedCaseIds: ['INV-2026-0087'],
    resolution: {
      rootCause: 'Novel jailbreak technique using role-play framing combined with base64 encoding bypassed input content filter.',
      remediation: 'Added pattern to input guardrail denied-topics list. Implemented base64 detection in pre-processing.',
      preventiveAction: 'Scheduled monthly red-team sessions. Added this pattern to automated adversarial testing suite.',
      resolvedBy: 'sarah.chen@example.com',
      resolvedAt: '2026-08-06T15:00:00Z',
    },
  },
];

// Current user for demo purposes
const CURRENT_USER = 'sarah.chen@example.com';

// ─────────────────────────── Helpers ───────────────────────────

const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; icon: IconName }> = {
  'new': { label: 'New', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: 'plus' },
  'investigating': { label: 'Investigating', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: 'magnifying-glass' },
  'pending-review': { label: 'Pending Review', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: 'eye' },
  'resolved': { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: 'check-circle' },
  'escalated': { label: 'Escalated', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: 'arrow-trending-up' },
};

const PRIORITY_CONFIG: Record<CasePriority, { label: string; color: string }> = {
  'low': { label: 'Low', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  'medium': { label: 'Medium', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  'high': { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  'critical': { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200' },
};

const CATEGORY_CONFIG: Record<CaseCategory, { label: string; icon: IconName }> = {
  'content-safety': { label: 'Content Safety', icon: 'shield-exclamation' },
  'data-leak': { label: 'Data Leak', icon: 'lock-closed' },
  'bias': { label: 'Bias', icon: 'scale' },
  'policy-violation': { label: 'Policy Violation', icon: 'document-check' },
  'other': { label: 'Other', icon: 'folder' },
};

const EVIDENCE_TYPE_CONFIG: Record<Evidence['type'], { label: string; icon: IconName }> = {
  'audit-log': { label: 'Audit Log', icon: 'clipboard-list' },
  'trace': { label: 'Trace', icon: 'arrow-path' },
  'screenshot': { label: 'Screenshot', icon: 'device-phone-mobile' },
  'document': { label: 'Document', icon: 'document-text' },
  'transcript': { label: 'Transcript', icon: 'chat-bubble' },
};

const TIMELINE_TYPE_CONFIG: Record<TimelineEvent['type'], { label: string; icon: IconName; color: string }> = {
  'created': { label: 'Created', icon: 'plus', color: 'text-blue-500' },
  'assigned': { label: 'Assigned', icon: 'user', color: 'text-indigo-500' },
  'note': { label: 'Note', icon: 'chat-bubble', color: 'text-slate-500' },
  'evidence': { label: 'Evidence', icon: 'paper-clip', color: 'text-amber-500' },
  'status-change': { label: 'Status Change', icon: 'arrow-path', color: 'text-purple-500' },
  'escalated': { label: 'Escalated', icon: 'arrow-trending-up', color: 'text-rose-500' },
  'resolved': { label: 'Resolved', icon: 'check-circle', color: 'text-emerald-500' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(from: string, to: string): number {
  const fromD = new Date(from);
  const toD = new Date(to);
  return Math.ceil((toD.getTime() - fromD.getTime()) / (1000 * 60 * 60 * 24));
}

function computeMetrics(cases: InvestigationCase[], today: string = FIXTURE_TODAY) {
  const total = cases.length;
  const open = cases.filter(c => !['resolved'].includes(c.status)).length;
  const resolved = cases.filter(c => c.status === 'resolved').length;
  const escalated = cases.filter(c => c.status === 'escalated').length;
  const slaBreached = cases.filter(c => c.slaBreached).length;
  const critical = cases.filter(c => c.priority === 'critical').length;

  // Average time to resolution (only resolved cases)
  const resolvedCases = cases.filter(c => c.status === 'resolved' && c.resolution?.resolvedAt);
  const avgResolutionDays = resolvedCases.length > 0
    ? Math.round(
        resolvedCases.reduce((sum, c) => {
          return sum + daysBetween(c.createdAt, c.resolution!.resolvedAt);
        }, 0) / resolvedCases.length
      )
    : 0;

  // Cases by category
  const byCategory = Object.keys(CATEGORY_CONFIG).reduce((acc, cat) => {
    acc[cat as CaseCategory] = cases.filter(c => c.category === cat).length;
    return acc;
  }, {} as Record<CaseCategory, number>);

  // Cases by status
  const byStatus = Object.keys(STATUS_CONFIG).reduce((acc, status) => {
    acc[status as CaseStatus] = cases.filter(c => c.status === status).length;
    return acc;
  }, {} as Record<CaseStatus, number>);

  // This period (last 30 days)
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const periodStart = thirtyDaysAgo.toISOString();
  const openedThisPeriod = cases.filter(c => c.createdAt >= periodStart).length;
  const closedThisPeriod = cases.filter(c => c.status === 'resolved' && c.resolution?.resolvedAt && c.resolution.resolvedAt >= periodStart).length;

  return {
    total,
    open,
    resolved,
    escalated,
    slaBreached,
    critical,
    avgResolutionDays,
    byCategory,
    byStatus,
    openedThisPeriod,
    closedThisPeriod,
  };
}

// ─────────────────────────── Tab Views ───────────────────────────

type QueueTab = 'my-cases' | 'unassigned' | 'all-open' | 'metrics';

// ─────────────────────────── Component ───────────────────────────

interface Props {
  /**
   * When true, render without the standalone GovernPageLayout header. Used when
   * InvestigationQueue is embedded as a tab inside the OperationsLanding hub
   * (which provides its own header). Defaults to false to preserve the
   * standalone page behavior.
   */
  embedded?: boolean;
}

export default function InvestigationQueue({ embedded = false }: Props) {
  const [cases, setCases] = usePersistedState<InvestigationCase[]>('investigation_cases', MOCK_CASES);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QueueTab>('my-cases');
  const [filterStatus, setFilterStatus] = useState<CaseStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<CaseCategory | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<CasePriority | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const metrics = useMemo(() => computeMetrics(cases), [cases]);

  const selectedCase = selectedCaseId ? cases.find(c => c.id === selectedCaseId) : null;

  // Filtered cases based on active tab
  const filteredCases = useMemo(() => {
    let result = cases;

    // Tab filters
    switch (activeTab) {
      case 'my-cases':
        result = result.filter(c => c.assignee === CURRENT_USER);
        break;
      case 'unassigned':
        result = result.filter(c => !c.assignee);
        break;
      case 'all-open':
        result = result.filter(c => !['resolved'].includes(c.status));
        break;
      case 'metrics':
        // Show all for metrics view
        break;
    }

    // Additional filters
    if (filterStatus !== 'all') {
      result = result.filter(c => c.status === filterStatus);
    }
    if (filterCategory !== 'all') {
      result = result.filter(c => c.category === filterCategory);
    }
    if (filterPriority !== 'all') {
      result = result.filter(c => c.priority === filterPriority);
    }

    // Sort by priority (critical first) then by creation date (newest first)
    const priorityOrder: CasePriority[] = ['critical', 'high', 'medium', 'low'];
    result = [...result].sort((a, b) => {
      const pA = priorityOrder.indexOf(a.priority);
      const pB = priorityOrder.indexOf(b.priority);
      if (pA !== pB) return pA - pB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [cases, activeTab, filterStatus, filterCategory, filterPriority]);

  // Case actions
  const assignToMe = (caseId: string) => {
    setCases(prev => prev.map(c => {
      if (c.id !== caseId) return c;
      const now = new Date().toISOString();
      return {
        ...c,
        assignee: CURRENT_USER,
        assignedAt: now,
        updatedAt: now,
        timeline: [
          ...c.timeline,
          {
            id: `tl-${Date.now()}`,
            ts: now,
            type: 'assigned' as const,
            actor: CURRENT_USER,
            description: `Assigned to ${CURRENT_USER}`,
          },
        ],
      };
    }));
    showToast('Case assigned to you');
  };

  const updateStatus = (caseId: string, newStatus: CaseStatus) => {
    setCases(prev => prev.map(c => {
      if (c.id !== caseId) return c;
      const now = new Date().toISOString();
      const eventType = newStatus === 'escalated' ? 'escalated' : newStatus === 'resolved' ? 'resolved' : 'status-change';
      return {
        ...c,
        status: newStatus,
        updatedAt: now,
        timeline: [
          ...c.timeline,
          {
            id: `tl-${Date.now()}`,
            ts: now,
            type: eventType as TimelineEvent['type'],
            actor: CURRENT_USER,
            description: `Status changed to ${STATUS_CONFIG[newStatus].label}`,
          },
        ],
      };
    }));
    showToast(`Status updated to ${STATUS_CONFIG[newStatus].label}`);
  };

  const addNote = (caseId: string, note: string) => {
    setCases(prev => prev.map(c => {
      if (c.id !== caseId) return c;
      const now = new Date().toISOString();
      return {
        ...c,
        updatedAt: now,
        timeline: [
          ...c.timeline,
          {
            id: `tl-${Date.now()}`,
            ts: now,
            type: 'note',
            actor: CURRENT_USER,
            description: note,
          },
        ],
      };
    }));
    showToast('Note added');
  };

  // Related cases lookup
  const getRelatedCases = (caseIds: string[]): InvestigationCase[] => {
    return cases.filter(c => caseIds.includes(c.id));
  };

  // Cases involving the same agent
  const getSameAgentCases = (agentId: string, excludeId: string): InvestigationCase[] => {
    return cases.filter(c => c.agentId === agentId && c.id !== excludeId);
  };

  const tabs: { id: QueueTab; label: string; count: number }[] = [
    { id: 'my-cases', label: 'My Cases', count: cases.filter(c => c.assignee === CURRENT_USER).length },
    { id: 'unassigned', label: 'Unassigned', count: cases.filter(c => !c.assignee).length },
    { id: 'all-open', label: 'All Open', count: cases.filter(c => !['resolved'].includes(c.status)).length },
    { id: 'metrics', label: 'Metrics', count: 0 },
  ];

  const body = (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Open Cases" value={metrics.open} variant={metrics.open > 0 ? 'warning' : 'success'} />
        <StatCard label="Critical" value={metrics.critical} variant={metrics.critical > 0 ? 'danger' : 'success'} />
        <StatCard label="SLA Breached" value={metrics.slaBreached} variant={metrics.slaBreached > 0 ? 'danger' : 'success'} />
        <StatCard label="Resolved" value={metrics.resolved} variant="success" />
        <StatCard label="Avg Resolution" value={`${metrics.avgResolutionDays}d`} sub="days to close" />
        <StatCard label="This Period" value={`+${metrics.openedThisPeriod}/-${metrics.closedThisPeriod}`} sub="opened/closed (30d)" />
      </div>

      {/* Framing */}
      <div className="mb-6 flex items-start gap-2 bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-3">
        <Icon name="information-circle" className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-blue-800 leading-relaxed max-w-4xl">
          Investigation cases are created when audit events are flagged for review. Each case tracks the full
          lifecycle from detection through resolution, with evidence collection, timeline, and required
          resolution fields (root cause, remediation, preventive action). SLA is based on priority:
          Critical = 3 days, High = 5 days, Medium = 7 days, Low = 14 days.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'metrics' ? (
        /* Metrics Dashboard */
        <MetricsView metrics={metrics} cases={cases} />
      ) : (
        /* Case List and Detail */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
          {/* Case List */}
          <div>
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <select
                aria-label="Filter by status"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as CaseStatus | 'all')}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                aria-label="Filter by category"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value as CaseCategory | 'all')}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                aria-label="Filter by priority"
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value as CasePriority | 'all')}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Priorities</option>
                {Object.entries(PRIORITY_CONFIG).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <div className="flex-1" />
              <span className="text-xs text-slate-400">{filteredCases.length} cases</span>
            </div>

            {/* Case Table */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Case</th>
                    <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Priority</th>
                    <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Status</th>
                    <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Agent</th>
                    <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Assignee</th>
                    <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                        No cases match the current filters
                      </td>
                    </tr>
                  ) : (
                    filteredCases.map(c => {
                      const isSelected = selectedCaseId === c.id;
                      const daysToSLA = daysBetween(FIXTURE_TODAY, c.slaDueAt);
                      const slaUrgent = daysToSLA <= 1 && !['resolved'].includes(c.status);
                      return (
                        <tr
                          key={c.id}
                          {...rowButtonProps(
                            () => setSelectedCaseId(isSelected ? null : c.id),
                            `View case ${c.id}`
                          )}
                          className={`border-b border-slate-100 cursor-pointer transition-colors focus:outline-none focus:bg-indigo-50/50 ${
                            isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-[10px] text-slate-400">{c.id}</span>
                              <Icon name={CATEGORY_CONFIG[c.category].icon} className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <div className="text-sm font-medium text-slate-900 line-clamp-1">{c.title}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${PRIORITY_CONFIG[c.priority].color}`}>
                              {PRIORITY_CONFIG[c.priority].label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${STATUS_CONFIG[c.status].color}`}>
                              {STATUS_CONFIG[c.status].label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 max-w-[150px] truncate" title={c.agentName}>
                            {c.agentName}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {c.assignee ? (
                              <span className="truncate max-w-[120px] inline-block" title={c.assignee}>
                                {c.assignee.split('@')[0]}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {c.status === 'resolved' ? (
                              <span className="text-xs text-emerald-600">Closed</span>
                            ) : c.slaBreached ? (
                              <span className="text-xs text-red-600 font-semibold">Breached</span>
                            ) : slaUrgent ? (
                              <span className="text-xs text-orange-600 font-semibold">{daysToSLA}d left</span>
                            ) : (
                              <span className="text-xs text-slate-500">{daysToSLA}d left</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Case Detail Panel */}
          {selectedCase ? (
            <CaseDetailPanel
              caseData={selectedCase}
              relatedCases={getRelatedCases(selectedCase.relatedCaseIds)}
              sameAgentCases={getSameAgentCases(selectedCase.agentId, selectedCase.id)}
              onClose={() => setSelectedCaseId(null)}
              onAssignToMe={() => assignToMe(selectedCase.id)}
              onUpdateStatus={(status) => updateStatus(selectedCase.id, status)}
              onAddNote={(note) => addNote(selectedCase.id, note)}
              currentUser={CURRENT_USER}
            />
          ) : (
            <div className="bg-slate-50/60 rounded-xl border border-slate-200/60 p-8 flex items-center justify-center">
              <div className="text-center">
                <Icon name="folder" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Select a case to view details</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Flag for Investigation Button info */}
      <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Integration Points</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-[11px]">
          <div className="flex items-start gap-2">
            <Icon name="flag" className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-slate-700">Flag for Investigation</div>
              <div className="text-slate-500">Add button to Audit & Incidents table to create cases</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="clipboard-list" className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-slate-700">Audit Event Link</div>
              <div className="text-slate-500">Deep link to source audit event details</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="robot" className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-slate-700">Agent Registry Link</div>
              <div className="text-slate-500">Navigate to agent in Fleet Registry</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="document-arrow-down" className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-slate-700">Export for Compliance</div>
              <div className="text-slate-500">Generate PDF/CSV case report for regulators</div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
          {toast}
        </div>
      )}
    </>
  );

  // Embedded (Operations hub tab): render the content without the standalone
  // page header, keeping the honest Mock badge visible.
  if (embedded) {
    return (
      <div className="space-y-6">
        <div>
          <MockDataBadge integration="Case management backend + Evidence storage (S3)" />
        </div>
        {body}
      </div>
    );
  }

  return (
    <GovernPageLayout
      title="Investigation Queue"
      description="Content safety investigation workflow for flagged AI interactions. Manage cases from detection through resolution with full audit trail."
      badge={<MockDataBadge integration="Case management backend + Evidence storage (S3)" />}
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {body}
    </GovernPageLayout>
  );
}

// ─────────────────────────── Case Detail Panel ───────────────────────────

interface CaseDetailPanelProps {
  caseData: InvestigationCase;
  relatedCases: InvestigationCase[];
  sameAgentCases: InvestigationCase[];
  onClose: () => void;
  onAssignToMe: () => void;
  onUpdateStatus: (status: CaseStatus) => void;
  onAddNote: (note: string) => void;
  currentUser: string;
}

function CaseDetailPanel({
  caseData,
  relatedCases,
  sameAgentCases,
  onClose,
  onAssignToMe,
  onUpdateStatus,
  onAddNote,
  currentUser,
}: CaseDetailPanelProps) {
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const handleAddNote = () => {
    if (noteText.trim()) {
      onAddNote(noteText.trim());
      setNoteText('');
      setShowNoteInput(false);
    }
  };

  const daysToSLA = daysBetween(FIXTURE_TODAY, caseData.slaDueAt);
  const isAssignedToMe = caseData.assignee === currentUser;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden max-h-[calc(100vh-280px)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-slate-400">{caseData.id}</span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_CONFIG[caseData.priority].color}`}>
                {PRIORITY_CONFIG[caseData.priority].label}
              </span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_CONFIG[caseData.status].color}`}>
                {STATUS_CONFIG[caseData.status].label}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 leading-tight">{caseData.title}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Description */}
        <div>
          <p className="text-xs text-slate-600 leading-relaxed">{caseData.description}</p>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Category</div>
            <div className="flex items-center gap-1.5 mt-1">
              <Icon name={CATEGORY_CONFIG[caseData.category].icon} className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-medium text-slate-700">{CATEGORY_CONFIG[caseData.category].label}</span>
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Assignee</div>
            <div className="text-xs font-medium text-slate-700 mt-1">
              {caseData.assignee ? caseData.assignee.split('@')[0] : <span className="text-slate-400 italic">Unassigned</span>}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Agent</div>
            <div className="text-xs font-medium text-slate-700 mt-1 truncate" title={caseData.agentName}>
              {caseData.agentName}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">User Involved</div>
            <div className="text-xs font-medium text-slate-700 mt-1">
              {caseData.userName || <span className="text-slate-400">N/A</span>}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Created</div>
            <div className="text-xs font-medium text-slate-700 mt-1">{formatDate(caseData.createdAt)}</div>
          </div>
          <div className={`p-2.5 rounded-lg ${caseData.slaBreached ? 'bg-red-50' : daysToSLA <= 1 ? 'bg-orange-50' : 'bg-slate-50'}`}>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">SLA Due</div>
            <div className={`text-xs font-medium mt-1 ${caseData.slaBreached ? 'text-red-700' : daysToSLA <= 1 ? 'text-orange-700' : 'text-slate-700'}`}>
              {formatDate(caseData.slaDueAt)}
              {caseData.slaBreached && <span className="ml-1 text-[9px]">(BREACHED)</span>}
            </div>
          </div>
        </div>

        {/* Source Event Link */}
        <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] text-blue-600 uppercase tracking-wide">Source Audit Event</div>
              <div className="text-xs font-mono text-blue-800 mt-0.5">{caseData.sourceEventId}</div>
            </div>
            <Link
              to={`/govern/audit?id=${caseData.sourceEventId}`}
              className="text-[10px] font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              View Event
              <Icon name="arrow-right" className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Timeline */}
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-3">Timeline</div>
          <div className="space-y-3 relative">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
            {caseData.timeline.map((event) => {
              const config = TIMELINE_TYPE_CONFIG[event.type];
              return (
                <div key={event.id} className="flex items-start gap-3 relative">
                  <div className={`w-4 h-4 rounded-full bg-white border-2 ${config.color.replace('text-', 'border-')} flex items-center justify-center flex-shrink-0 z-10`}>
                    <Icon name={config.icon} className={`w-2.5 h-2.5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-slate-700">{event.description}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {formatDateTime(event.ts)} by {event.actor}
                    </div>
                    {event.details && (
                      <div className="mt-1.5 p-2 bg-slate-50 rounded text-[10px] text-slate-600 leading-relaxed">
                        {event.details}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Evidence */}
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-2">Evidence ({caseData.evidence.length})</div>
          <div className="space-y-2">
            {caseData.evidence.map(ev => {
              const config = EVIDENCE_TYPE_CONFIG[ev.type];
              return (
                <div key={ev.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <Icon name={config.icon} className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-700 truncate">{ev.name}</div>
                    <div className="text-[9px] text-slate-400">{config.label} - {formatDateTime(ev.addedAt)}</div>
                  </div>
                  {ev.link && (
                    <Link to={ev.link} className="text-[10px] text-blue-600 hover:text-blue-800">
                      View
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Related Cases */}
        {(relatedCases.length > 0 || sameAgentCases.length > 0) && (
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-2">Related Cases</div>
            <div className="space-y-2">
              {relatedCases.map(rc => (
                <div key={rc.id} className="flex items-center gap-2 p-2 bg-amber-50/50 rounded-lg border border-amber-100">
                  <Icon name="link" className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono text-amber-700">{rc.id}</span>
                    <span className="text-[10px] text-slate-500 ml-2 truncate">{rc.title}</span>
                  </div>
                </div>
              ))}
              {sameAgentCases.slice(0, 3).map(rc => (
                <div key={rc.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <Icon name="robot" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono text-slate-500">{rc.id}</span>
                    <span className="text-[9px] text-slate-400 ml-2">(same agent)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolution (if resolved) */}
        {caseData.resolution && (
          <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
            <div className="text-xs font-semibold text-emerald-800 mb-2">Resolution</div>
            <div className="space-y-2 text-[11px]">
              <div>
                <span className="font-medium text-slate-600">Root Cause:</span>
                <p className="text-slate-700 mt-0.5">{caseData.resolution.rootCause}</p>
              </div>
              <div>
                <span className="font-medium text-slate-600">Remediation:</span>
                <p className="text-slate-700 mt-0.5">{caseData.resolution.remediation}</p>
              </div>
              <div>
                <span className="font-medium text-slate-600">Preventive Action:</span>
                <p className="text-slate-700 mt-0.5">{caseData.resolution.preventiveAction}</p>
              </div>
              <div className="text-[10px] text-emerald-600 mt-2">
                Resolved by {caseData.resolution.resolvedBy} on {formatDate(caseData.resolution.resolvedAt)}
              </div>
            </div>
          </div>
        )}

        {/* Add Note Input */}
        {showNoteInput ? (
          <div className="space-y-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add investigation note..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
              >
                Add Note
              </button>
              <button
                onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
          {!caseData.assignee && (
            <button
              onClick={onAssignToMe}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Assign to Me
            </button>
          )}
          {caseData.status === 'new' && isAssignedToMe && (
            <button
              onClick={() => onUpdateStatus('investigating')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
            >
              Start Investigation
            </button>
          )}
          {caseData.status === 'investigating' && isAssignedToMe && (
            <>
              <button
                onClick={() => onUpdateStatus('pending-review')}
                className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                Submit for Review
              </button>
              <button
                onClick={() => onUpdateStatus('escalated')}
                className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
              >
                Escalate
              </button>
            </>
          )}
          {caseData.status === 'pending-review' && (
            <button
              onClick={() => onUpdateStatus('resolved')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Resolve Case
            </button>
          )}
          {!showNoteInput && caseData.status !== 'resolved' && (
            <button
              onClick={() => setShowNoteInput(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Add Note
            </button>
          )}
          <button
            onClick={() => alert('Export functionality would generate PDF/CSV case report')}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
          >
            <Icon name="document-arrow-down" className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Metrics View ───────────────────────────

interface MetricsViewProps {
  metrics: ReturnType<typeof computeMetrics>;
  cases: InvestigationCase[];
}

function MetricsView({ metrics, cases }: MetricsViewProps) {
  // Top offending agents
  const agentCounts = cases.reduce((acc, c) => {
    acc[c.agentName] = (acc[c.agentName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topAgents = Object.entries(agentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Cases" value={metrics.total} />
        <StatCard label="Open Cases" value={metrics.open} variant={metrics.open > 0 ? 'warning' : 'success'} />
        <StatCard label="Resolved" value={metrics.resolved} variant="success" />
        <StatCard label="Avg Resolution" value={`${metrics.avgResolutionDays} days`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cases by Category */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Cases by Category</h3>
          <div className="space-y-3">
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
              const count = metrics.byCategory[key as CaseCategory];
              const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <Icon name={config.icon} className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{config.label}</span>
                      <span className="text-xs text-slate-500">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cases by Status */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Cases by Status</h3>
          <div className="space-y-3">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => {
              const count = metrics.byStatus[key as CaseStatus];
              const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <Icon name={config.icon} className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{config.label}</span>
                      <span className="text-xs text-slate-500">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          key === 'resolved' ? 'bg-emerald-500' :
                          key === 'escalated' ? 'bg-rose-500' :
                          key === 'new' ? 'bg-blue-500' :
                          'bg-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Offending Agents */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Top Agents by Case Count</h3>
          {topAgents.length === 0 ? (
            <p className="text-xs text-slate-400">No data</p>
          ) : (
            <div className="space-y-2">
              {topAgents.map(([agent, count], i) => (
                <div key={agent} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-xs font-medium text-slate-700 truncate">{agent}</span>
                  <span className="text-xs text-slate-500">{count} cases</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Period Summary */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">30-Day Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-700">{metrics.openedThisPeriod}</div>
              <div className="text-[10px] text-blue-600 uppercase tracking-wide">Cases Opened</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-emerald-700">{metrics.closedThisPeriod}</div>
              <div className="text-[10px] text-emerald-600 uppercase tracking-wide">Cases Closed</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-amber-700">{metrics.avgResolutionDays}</div>
              <div className="text-[10px] text-amber-600 uppercase tracking-wide">Avg Days to Close</div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-700">{metrics.slaBreached}</div>
              <div className="text-[10px] text-red-600 uppercase tracking-wide">SLA Breaches</div>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Note */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Compliance Reporting</h3>
        <p className="text-xs text-slate-600 mb-3">
          Investigation metrics feed into regulatory reporting. For EU AI Act Article 73 serious incidents,
          track time-to-report against statutory clocks (2/10/15 days). Export case data for auditors via the
          Export button on each case.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => alert('Would export compliance summary CSV')}
            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1"
          >
            <Icon name="document-arrow-down" className="w-3.5 h-3.5" />
            Export Compliance Summary
          </button>
          <button
            onClick={() => alert('Would export all case data')}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
          >
            <Icon name="circle-stack" className="w-3.5 h-3.5" />
            Export All Cases
          </button>
        </div>
      </div>
    </div>
  );
}
