/**
 * AgentLifecyclePolicies - Automated agent lifecycle management
 *
 * Implements lifecycle policies similar to Microsoft Agent365:
 * - Inactivity policies: auto-disable after X days inactive
 * - Age policies: require review after X months, sunset after Y months
 * - Owner verification: flag agents with unverified owners
 * - Risk-based: auto-block agents exceeding risk threshold
 *
 * Features:
 * - Policy configuration with conditions and actions
 * - Dashboard showing active policies with stats
 * - Upcoming actions timeline
 * - Recent actions audit log
 * - Agents at risk (approaching thresholds)
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from './icons';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';

// ─────────────────────────── Types ───────────────────────────

type PolicyType = 'inactivity' | 'age' | 'owner-verification' | 'risk-based';

type ActionType = 'warn' | 'disable' | 'archive' | 'delete' | 'escalate';

type PolicyCondition = {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number | string | boolean;
};

type LifecyclePolicy = {
  id: string;
  name: string;
  description: string;
  type: PolicyType;
  enabled: boolean;
  conditions: PolicyCondition[];
  action: ActionType;
  gracePeriodDays: number;
  exceptions: string[]; // Agent IDs exempt from this policy
  affectedAgents: number;
  lastTriggered: string | null;
  createdAt: string;
  createdBy: string;
};

type ScheduledAction = {
  id: string;
  agentId: string;
  agentName: string;
  policyId: string;
  policyName: string;
  action: ActionType;
  scheduledDate: string;
  reason: string;
  canOverride: boolean;
};

type AuditLogEntry = {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  policyId: string;
  policyName: string;
  action: ActionType;
  result: 'executed' | 'overridden' | 'failed';
  executedBy: string;
  details: string;
};

type AgentLifecycleStatus = {
  id: string;
  name: string;
  owner: string;
  ownerVerified: boolean;
  businessUnit: string;
  onboardedDate: string;
  lastActivity: string;
  lastReviewDate: string | null;
  nextRequiredReview: string | null;
  sunsetDate: string | null;
  riskScore: number;
  status: 'active' | 'warning' | 'at-risk' | 'disabled' | 'archived';
  daysInactive: number;
  ageMonths: number;
};

// ─────────────────────────── Mock Data ───────────────────────────

const MOCK_POLICIES: LifecyclePolicy[] = [
  {
    id: 'pol-inactive-30',
    name: 'Inactivity Auto-Disable (30 days)',
    description: 'Automatically disable agents with no activity for 30+ days',
    type: 'inactivity',
    enabled: true,
    conditions: [{ field: 'daysInactive', operator: 'gte', value: 30 }],
    action: 'disable',
    gracePeriodDays: 7,
    exceptions: ['agent-monitoring', 'agent-audit-compliance'],
    affectedAgents: 4,
    lastTriggered: '2026-08-08',
    createdAt: '2026-01-15',
    createdBy: 'Platform Team',
  },
  {
    id: 'pol-inactive-60',
    name: 'Inactivity Archive (60 days)',
    description: 'Archive agents with no activity for 60+ days after warning',
    type: 'inactivity',
    enabled: true,
    conditions: [{ field: 'daysInactive', operator: 'gte', value: 60 }],
    action: 'archive',
    gracePeriodDays: 14,
    exceptions: ['agent-monitoring', 'agent-audit-compliance', 'agent-disaster-recovery'],
    affectedAgents: 2,
    lastTriggered: '2026-08-01',
    createdAt: '2026-01-15',
    createdBy: 'Platform Team',
  },
  {
    id: 'pol-review-6mo',
    name: 'Mandatory Review (6 months)',
    description: 'Require governance review for agents older than 6 months',
    type: 'age',
    enabled: true,
    conditions: [{ field: 'ageMonths', operator: 'gte', value: 6 }],
    action: 'escalate',
    gracePeriodDays: 30,
    exceptions: [],
    affectedAgents: 12,
    lastTriggered: '2026-08-05',
    createdAt: '2026-02-01',
    createdBy: 'Governance Council',
  },
  {
    id: 'pol-sunset-12mo',
    name: 'Sunset After 12 Months',
    description: 'Schedule sunset review for agents older than 12 months',
    type: 'age',
    enabled: true,
    conditions: [{ field: 'ageMonths', operator: 'gte', value: 12 }],
    action: 'warn',
    gracePeriodDays: 60,
    exceptions: ['agent-core-banking', 'agent-fraud-detection'],
    affectedAgents: 6,
    lastTriggered: '2026-07-20',
    createdAt: '2026-02-01',
    createdBy: 'Governance Council',
  },
  {
    id: 'pol-owner-verify',
    name: 'Owner Verification Required',
    description: 'Flag agents without verified ownership for review',
    type: 'owner-verification',
    enabled: true,
    conditions: [{ field: 'ownerVerified', operator: 'eq', value: false }],
    action: 'escalate',
    gracePeriodDays: 14,
    exceptions: [],
    affectedAgents: 3,
    lastTriggered: '2026-08-09',
    createdAt: '2026-03-01',
    createdBy: 'Security Team',
  },
  {
    id: 'pol-risk-high',
    name: 'High Risk Auto-Block',
    description: 'Automatically block agents exceeding risk score of 85',
    type: 'risk-based',
    enabled: true,
    conditions: [{ field: 'riskScore', operator: 'gt', value: 85 }],
    action: 'disable',
    gracePeriodDays: 0,
    exceptions: [],
    affectedAgents: 1,
    lastTriggered: '2026-08-07',
    createdAt: '2026-03-15',
    createdBy: 'Risk Management',
  },
  {
    id: 'pol-risk-elevated',
    name: 'Elevated Risk Warning',
    description: 'Send warning for agents with risk score between 70-85',
    type: 'risk-based',
    enabled: true,
    conditions: [
      { field: 'riskScore', operator: 'gte', value: 70 },
      { field: 'riskScore', operator: 'lte', value: 85 },
    ],
    action: 'warn',
    gracePeriodDays: 7,
    exceptions: [],
    affectedAgents: 5,
    lastTriggered: '2026-08-10',
    createdAt: '2026-03-15',
    createdBy: 'Risk Management',
  },
];

const MOCK_SCHEDULED_ACTIONS: ScheduledAction[] = [
  {
    id: 'action-001',
    agentId: 'agent-legacy-reports',
    agentName: 'Legacy Reports Generator',
    policyId: 'pol-inactive-30',
    policyName: 'Inactivity Auto-Disable (30 days)',
    action: 'disable',
    scheduledDate: '2026-08-14',
    reason: '35 days since last activity',
    canOverride: true,
  },
  {
    id: 'action-002',
    agentId: 'agent-old-analytics',
    agentName: 'Old Analytics Pipeline',
    policyId: 'pol-inactive-60',
    policyName: 'Inactivity Archive (60 days)',
    action: 'archive',
    scheduledDate: '2026-08-15',
    reason: '67 days since last activity',
    canOverride: true,
  },
  {
    id: 'action-003',
    agentId: 'agent-customer-service',
    agentName: 'Customer Service Bot',
    policyId: 'pol-review-6mo',
    policyName: 'Mandatory Review (6 months)',
    action: 'escalate',
    scheduledDate: '2026-08-16',
    reason: 'Agent is 8 months old, review required',
    canOverride: false,
  },
  {
    id: 'action-004',
    agentId: 'agent-data-sync',
    agentName: 'Data Sync Agent',
    policyId: 'pol-owner-verify',
    policyName: 'Owner Verification Required',
    action: 'escalate',
    scheduledDate: '2026-08-12',
    reason: 'Owner J. Smith left organization, need reassignment',
    canOverride: false,
  },
  {
    id: 'action-005',
    agentId: 'agent-trade-assistant',
    agentName: 'Trade Assistant',
    policyId: 'pol-sunset-12mo',
    policyName: 'Sunset After 12 Months',
    action: 'warn',
    scheduledDate: '2026-08-18',
    reason: 'Agent approaching 12-month anniversary',
    canOverride: true,
  },
];

const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: 'audit-001',
    timestamp: '2026-08-10T14:30:00Z',
    agentId: 'agent-email-classifier',
    agentName: 'Email Classifier (Deprecated)',
    policyId: 'pol-inactive-30',
    policyName: 'Inactivity Auto-Disable (30 days)',
    action: 'disable',
    result: 'executed',
    executedBy: 'System',
    details: 'Agent disabled after 45 days of inactivity',
  },
  {
    id: 'audit-002',
    timestamp: '2026-08-09T10:15:00Z',
    agentId: 'agent-test-automation',
    agentName: 'Test Automation Agent',
    policyId: 'pol-inactive-30',
    policyName: 'Inactivity Auto-Disable (30 days)',
    action: 'disable',
    result: 'overridden',
    executedBy: 'M. Chen',
    details: 'Override approved: Agent required for quarterly testing cycle',
  },
  {
    id: 'audit-003',
    timestamp: '2026-08-08T16:45:00Z',
    agentId: 'agent-credit-risk',
    agentName: 'Credit Risk Analyzer',
    policyId: 'pol-risk-high',
    policyName: 'High Risk Auto-Block',
    action: 'disable',
    result: 'executed',
    executedBy: 'System',
    details: 'Agent blocked due to risk score 92 exceeding threshold of 85',
  },
  {
    id: 'audit-004',
    timestamp: '2026-08-07T09:00:00Z',
    agentId: 'agent-hr-assistant',
    agentName: 'HR Assistant',
    policyId: 'pol-review-6mo',
    policyName: 'Mandatory Review (6 months)',
    action: 'escalate',
    result: 'executed',
    executedBy: 'System',
    details: 'Review escalated to Governance Council - agent is 7 months old',
  },
  {
    id: 'audit-005',
    timestamp: '2026-08-05T11:20:00Z',
    agentId: 'agent-document-processor',
    agentName: 'Document Processor',
    policyId: 'pol-owner-verify',
    policyName: 'Owner Verification Required',
    action: 'escalate',
    result: 'executed',
    executedBy: 'System',
    details: 'Escalated for owner verification - current owner status unknown',
  },
  {
    id: 'audit-006',
    timestamp: '2026-08-03T14:00:00Z',
    agentId: 'agent-old-scheduler',
    agentName: 'Legacy Scheduler',
    policyId: 'pol-inactive-60',
    policyName: 'Inactivity Archive (60 days)',
    action: 'archive',
    result: 'executed',
    executedBy: 'System',
    details: 'Agent archived after 75 days of inactivity',
  },
];

const MOCK_AGENTS: AgentLifecycleStatus[] = [
  {
    id: 'agent-customer-service',
    name: 'Customer Service Bot',
    owner: 'J. Martinez',
    ownerVerified: true,
    businessUnit: 'Customer Operations',
    onboardedDate: '2025-12-01',
    lastActivity: '2026-08-11',
    lastReviewDate: '2026-05-15',
    nextRequiredReview: '2026-11-15',
    sunsetDate: null,
    riskScore: 42,
    status: 'active',
    daysInactive: 0,
    ageMonths: 8,
  },
  {
    id: 'agent-fraud-detection',
    name: 'Fraud Detection Agent',
    owner: 'R. Singh',
    ownerVerified: true,
    businessUnit: 'Risk & Compliance',
    onboardedDate: '2025-08-15',
    lastActivity: '2026-08-11',
    lastReviewDate: '2026-06-01',
    nextRequiredReview: '2026-12-01',
    sunsetDate: null,
    riskScore: 68,
    status: 'active',
    daysInactive: 0,
    ageMonths: 12,
  },
  {
    id: 'agent-legacy-reports',
    name: 'Legacy Reports Generator',
    owner: 'A. Williams',
    ownerVerified: true,
    businessUnit: 'Finance',
    onboardedDate: '2025-10-01',
    lastActivity: '2026-07-07',
    lastReviewDate: '2026-03-01',
    nextRequiredReview: '2026-09-01',
    sunsetDate: '2026-10-01',
    riskScore: 35,
    status: 'warning',
    daysInactive: 35,
    ageMonths: 10,
  },
  {
    id: 'agent-old-analytics',
    name: 'Old Analytics Pipeline',
    owner: 'K. Brown',
    ownerVerified: false,
    businessUnit: 'Data Science',
    onboardedDate: '2025-06-01',
    lastActivity: '2026-06-05',
    lastReviewDate: '2025-12-01',
    nextRequiredReview: '2026-06-01',
    sunsetDate: '2026-09-15',
    riskScore: 48,
    status: 'at-risk',
    daysInactive: 67,
    ageMonths: 14,
  },
  {
    id: 'agent-data-sync',
    name: 'Data Sync Agent',
    owner: 'J. Smith (departed)',
    ownerVerified: false,
    businessUnit: 'Platform',
    onboardedDate: '2026-02-01',
    lastActivity: '2026-08-10',
    lastReviewDate: null,
    nextRequiredReview: '2026-08-15',
    sunsetDate: null,
    riskScore: 55,
    status: 'warning',
    daysInactive: 1,
    ageMonths: 6,
  },
  {
    id: 'agent-credit-risk',
    name: 'Credit Risk Analyzer',
    owner: 'P. Johnson',
    ownerVerified: true,
    businessUnit: 'Credit',
    onboardedDate: '2026-01-15',
    lastActivity: '2026-08-08',
    lastReviewDate: '2026-07-01',
    nextRequiredReview: '2027-01-01',
    sunsetDate: null,
    riskScore: 92,
    status: 'disabled',
    daysInactive: 3,
    ageMonths: 7,
  },
  {
    id: 'agent-trade-assistant',
    name: 'Trade Assistant',
    owner: 'W. Chang',
    ownerVerified: true,
    businessUnit: 'Trading',
    onboardedDate: '2025-08-20',
    lastActivity: '2026-08-11',
    lastReviewDate: '2026-04-01',
    nextRequiredReview: '2026-10-01',
    sunsetDate: null,
    riskScore: 72,
    status: 'warning',
    daysInactive: 0,
    ageMonths: 12,
  },
  {
    id: 'agent-hr-assistant',
    name: 'HR Assistant',
    owner: 'L. Thompson',
    ownerVerified: true,
    businessUnit: 'Human Resources',
    onboardedDate: '2026-01-05',
    lastActivity: '2026-08-09',
    lastReviewDate: null,
    nextRequiredReview: '2026-08-20',
    sunsetDate: null,
    riskScore: 38,
    status: 'active',
    daysInactive: 2,
    ageMonths: 7,
  },
];

// ─────────────────────────── Constants ───────────────────────────

const POLICY_TYPE_CONFIG: Record<PolicyType, { label: string; icon: IconName; color: string; bgColor: string }> = {
  'inactivity': { label: 'Inactivity', icon: 'clock', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  'age': { label: 'Age-Based', icon: 'calendar', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  'owner-verification': { label: 'Owner Verification', icon: 'user', color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
  'risk-based': { label: 'Risk-Based', icon: 'exclamation-triangle', color: 'text-rose-600', bgColor: 'bg-rose-50 border-rose-200' },
};

const ACTION_CONFIG: Record<ActionType, { label: string; icon: IconName; color: string; bgColor: string }> = {
  'warn': { label: 'Warn', icon: 'bell', color: 'text-amber-600', bgColor: 'bg-amber-100 text-amber-700' },
  'disable': { label: 'Disable', icon: 'pause-circle', color: 'text-rose-600', bgColor: 'bg-rose-100 text-rose-700' },
  'archive': { label: 'Archive', icon: 'archive-box', color: 'text-slate-600', bgColor: 'bg-slate-100 text-slate-700' },
  'delete': { label: 'Delete', icon: 'x-circle', color: 'text-rose-700', bgColor: 'bg-rose-200 text-rose-800' },
  'escalate': { label: 'Escalate', icon: 'arrow-up-circle', color: 'text-indigo-600', bgColor: 'bg-indigo-100 text-indigo-700' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  'active': { label: 'Active', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' },
  'warning': { label: 'Warning', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
  'at-risk': { label: 'At Risk', color: 'text-rose-700', bgColor: 'bg-rose-50 border-rose-200' },
  'disabled': { label: 'Disabled', color: 'text-slate-600', bgColor: 'bg-slate-100 border-slate-300' },
  'archived': { label: 'Archived', color: 'text-slate-500', bgColor: 'bg-slate-50 border-slate-200' },
};

const daysUntil = (dateStr: string): number => {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─────────────────────────── Component ───────────────────────────

export default function AgentLifecyclePolicies() {
  const [activeTab, setActiveTab] = useState<'policies' | 'upcoming' | 'audit' | 'agents'>('policies');
  const [selectedPolicy, setSelectedPolicy] = useState<LifecyclePolicy | null>(null);
  const [, setShowPolicyEditor] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);

  const stats = useMemo(() => ({
    totalPolicies: MOCK_POLICIES.length,
    activePolicies: MOCK_POLICIES.filter(p => p.enabled).length,
    totalAffected: MOCK_POLICIES.reduce((sum, p) => sum + p.affectedAgents, 0),
    upcomingActions: MOCK_SCHEDULED_ACTIONS.filter(a => { const d = daysUntil(a.scheduledDate); return d >= 0 && d <= 7; }).length,
    agentsAtRisk: MOCK_AGENTS.filter(a => a.status === 'at-risk' || a.status === 'warning').length,
  }), []);

  const filteredAgents = statusFilter === 'all'
    ? MOCK_AGENTS
    : MOCK_AGENTS.filter(a => a.status === statusFilter);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <GovernPageLayout
      title="Agent Lifecycle Policies"
      description="Automated agent-lifecycle governance — inactivity, age limits, owner verification, and risk-threshold policies with auto-enforcement."
      badge={<MockDataBadge />}
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="clipboard-document-list" className="w-4 h-4 text-slate-500" strokeWidth={2} />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Total Policies</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.totalPolicies}</div>
            <div className="text-xs text-slate-500">{stats.activePolicies} active</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="cpu-chip" className="w-4 h-4 text-blue-500" strokeWidth={2} />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Agents Affected</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.totalAffected}</div>
            <div className="text-xs text-slate-500">across all policies</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="calendar" className="w-4 h-4 text-amber-500" strokeWidth={2} />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Upcoming (7d)</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.upcomingActions}</div>
            <div className="text-xs text-slate-500">scheduled actions</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-500" strokeWidth={2} />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">At Risk</span>
            </div>
            <div className="text-2xl font-bold text-rose-600">{stats.agentsAtRisk}</div>
            <div className="text-xs text-slate-500">agents need attention</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="check-circle" className="w-4 h-4 text-emerald-500" strokeWidth={2} />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Compliant</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {MOCK_AGENTS.filter(a => a.status === 'active').length}
            </div>
            <div className="text-xs text-slate-500">agents in good standing</div>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Lifecycle policy tabs" className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit">
          {([
            { id: 'policies', label: 'Policies', icon: 'clipboard-list' },
            { id: 'upcoming', label: 'Upcoming Actions', icon: 'calendar' },
            { id: 'audit', label: 'Audit Log', icon: 'clock' },
            { id: 'agents', label: 'Agent Status', icon: 'cpu-chip' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4" strokeWidth={2} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Policies Tab */}
        {activeTab === 'policies' && (
          <div className="space-y-4">
            {/* Header with Add Button */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Active Lifecycle Policies</h3>
              <button
                onClick={() => {
                  setShowPolicyEditor(true);
                  showToast('Opening policy editor...');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
                New Policy
              </button>
            </div>

            {/* Policy Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {MOCK_POLICIES.map(policy => {
                const typeConfig = POLICY_TYPE_CONFIG[policy.type];
                const actionConfig = ACTION_CONFIG[policy.action];
                return (
                  <button
                    key={policy.id}
                    onClick={() => setSelectedPolicy(selectedPolicy?.id === policy.id ? null : policy)}
                    className={`text-left p-4 bg-white/80 backdrop-blur-sm rounded-xl border transition-all ${
                      selectedPolicy?.id === policy.id
                        ? 'border-indigo-300 ring-2 ring-indigo-100'
                        : 'border-slate-200/60 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeConfig.bgColor}`}>
                          <Icon name={typeConfig.icon} className={`w-4 h-4 ${typeConfig.color}`} strokeWidth={2} />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{policy.name}</div>
                          <div className="text-[10px] text-slate-500">{typeConfig.label}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${actionConfig.bgColor}`}>
                          {actionConfig.label}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${policy.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 mb-3">{policy.description}</p>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-slate-900">{policy.affectedAgents}</div>
                        <div className="text-[9px] text-slate-500 uppercase">Affected</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-slate-900">{policy.gracePeriodDays}d</div>
                        <div className="text-[9px] text-slate-500 uppercase">Grace Period</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-slate-900">{policy.exceptions.length}</div>
                        <div className="text-[9px] text-slate-500 uppercase">Exceptions</div>
                      </div>
                    </div>

                    {policy.lastTriggered && (
                      <div className="mt-3 text-[10px] text-slate-400">
                        Last triggered: {formatDate(policy.lastTriggered)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Policy Detail */}
            {selectedPolicy && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">{selectedPolicy.name}</h4>
                    <p className="text-sm text-slate-500 mt-1">{selectedPolicy.description}</p>
                  </div>
                  <button
                    onClick={() => setSelectedPolicy(null)}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                  >
                    <Icon name="x-mark" className="w-5 h-5 text-slate-400" strokeWidth={2} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Conditions */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 uppercase mb-2">Conditions</div>
                    <div className="space-y-2">
                      {selectedPolicy.conditions.map((cond, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                          <Icon name="funnel" className="w-4 h-4 text-slate-400" strokeWidth={2} />
                          <span className="font-medium text-slate-700">{cond.field}</span>
                          <span className="text-slate-500">{cond.operator}</span>
                          <span className="font-mono text-indigo-600">{String(cond.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action & Grace Period */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 uppercase mb-2">Action Configuration</div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                        <Icon name={ACTION_CONFIG[selectedPolicy.action].icon} className={`w-4 h-4 ${ACTION_CONFIG[selectedPolicy.action].color}`} strokeWidth={2} />
                        <span className="font-medium text-slate-700">Action:</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ACTION_CONFIG[selectedPolicy.action].bgColor}`}>
                          {ACTION_CONFIG[selectedPolicy.action].label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                        <Icon name="clock" className="w-4 h-4 text-slate-400" strokeWidth={2} />
                        <span className="font-medium text-slate-700">Grace Period:</span>
                        <span className="text-slate-900">{selectedPolicy.gracePeriodDays} days</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exceptions */}
                {selectedPolicy.exceptions.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] font-semibold text-slate-600 uppercase mb-2">Exempt Agents</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPolicy.exceptions.map(agentId => (
                        <span key={agentId} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-200">
                          {agentId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => showToast(`Editing policy: ${selectedPolicy.name}`)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Edit Policy
                  </button>
                  <button
                    onClick={() => showToast(`${selectedPolicy.enabled ? 'Disabling' : 'Enabling'} policy...`)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      selectedPolicy.enabled
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    }`}
                  >
                    {selectedPolicy.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <div className="flex-1" />
                  <span className="text-xs text-slate-400">
                    Created by {selectedPolicy.createdBy} on {formatDate(selectedPolicy.createdAt)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upcoming Actions Tab */}
        {activeTab === 'upcoming' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Scheduled Actions (Next 7 Days)</h3>
                <span className="text-xs text-slate-500">{stats.upcomingActions} pending</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {MOCK_SCHEDULED_ACTIONS.filter(a => {
                const d = daysUntil(a.scheduledDate);
                return d >= 0 && d <= 7;
              }).sort((a, b) =>
                new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
              ).map(action => {
                const days = daysUntil(action.scheduledDate);
                const actionConfig = ACTION_CONFIG[action.action];
                return (
                  <div key={action.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        days <= 1 ? 'bg-rose-100' : days <= 3 ? 'bg-amber-100' : 'bg-slate-100'
                      }`}>
                        <Icon
                          name={actionConfig.icon}
                          className={`w-5 h-5 ${days <= 1 ? 'text-rose-600' : days <= 3 ? 'text-amber-600' : 'text-slate-600'}`}
                          strokeWidth={2}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">{action.agentName}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${actionConfig.bgColor}`}>
                            {actionConfig.label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 mb-2">{action.reason}</div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>Policy: {action.policyName}</span>
                          <span className={`font-semibold ${days <= 1 ? 'text-rose-600' : days <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {action.canOverride && (
                          <button
                            onClick={() => showToast(`Override requested for ${action.agentName}`)}
                            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
                          >
                            Override
                          </button>
                        )}
                        <button
                          onClick={() => showToast(`Viewing agent: ${action.agentName}`)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          View Agent
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Recent Policy Actions</h3>
                <button
                  onClick={() => showToast('Exporting audit log...')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Export Log
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Policy</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Result</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MOCK_AUDIT_LOG.map(entry => {
                    const actionConfig = ACTION_CONFIG[entry.action];
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs text-slate-600">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{entry.agentName}</div>
                          <div className="text-[10px] text-slate-400">{entry.agentId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600 max-w-[200px] truncate">{entry.policyName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${actionConfig.bgColor}`}>
                            {actionConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            entry.result === 'executed' ? 'bg-emerald-100 text-emerald-700' :
                            entry.result === 'overridden' ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {entry.result === 'executed' ? 'Executed' : entry.result === 'overridden' ? 'Overridden' : 'Failed'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-600 max-w-[250px]">{entry.details}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">by {entry.executedBy}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Agent Status Tab */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Filter by status:</span>
              <div className="flex gap-1">
                {['all', 'active', 'warning', 'at-risk', 'disabled'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-all capitalize ${
                      statusFilter === status
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label || status}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgents.map(agent => {
                const statusConfig = STATUS_CONFIG[agent.status];
                return (
                  <div
                    key={agent.id}
                    className={`p-4 bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm ${statusConfig.bgColor}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-medium text-slate-900">{agent.name}</div>
                        <div className="text-xs text-slate-500">{agent.businessUnit}</div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Owner</span>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-700">{agent.owner}</span>
                          {agent.ownerVerified ? (
                            <Icon name="check-badge" className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />
                          ) : (
                            <Icon name="exclamation-triangle" className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Risk Score</span>
                        <span className={`font-semibold ${
                          agent.riskScore > 85 ? 'text-rose-600' :
                          agent.riskScore > 70 ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>{agent.riskScore}/100</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Age</span>
                        <span className="text-slate-700">{agent.ageMonths} months</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Days Inactive</span>
                        <span className={`font-semibold ${
                          agent.daysInactive > 30 ? 'text-rose-600' :
                          agent.daysInactive > 14 ? 'text-amber-600' :
                          'text-slate-700'
                        }`}>{agent.daysInactive}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/50 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Onboarded</span>
                        <span className="text-slate-600">{formatDate(agent.onboardedDate)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Last Activity</span>
                        <span className="text-slate-600">{formatDate(agent.lastActivity)}</span>
                      </div>
                      {agent.nextRequiredReview && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Next Review</span>
                          <span className={`font-medium ${
                            daysUntil(agent.nextRequiredReview) < 0 ? 'text-rose-600' :
                            daysUntil(agent.nextRequiredReview) < 14 ? 'text-amber-600' :
                            'text-slate-600'
                          }`}>
                            {formatDate(agent.nextRequiredReview)}
                          </span>
                        </div>
                      )}
                      {agent.sunsetDate && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Sunset Date</span>
                          <span className="text-rose-600 font-medium">{formatDate(agent.sunsetDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
            {toast}
          </div>
        )}
      </div>
    </GovernPageLayout>
  );
}
