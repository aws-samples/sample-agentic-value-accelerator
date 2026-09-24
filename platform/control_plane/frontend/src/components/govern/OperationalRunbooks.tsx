/**
 * OperationalRunbooks — Automated response playbooks for AI agent operations
 *
 * Provides pre-built and custom runbooks for common operational scenarios:
 * - High latency remediation
 * - Error spike investigation
 * - Cost overrun response
 * - Agent recovery procedures
 */

import { useState, useMemo } from 'react';
import { Icon } from './icons';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';

// ─── Types ───────────────────────────────────────────────────────────────────

type RunbookStatus = 'active' | 'draft' | 'deprecated';
type RunbookTrigger = 'manual' | 'alert' | 'scheduled' | 'incident';
type StepType = 'check' | 'action' | 'decision' | 'notify' | 'wait' | 'escalate';

interface RunbookStep {
  id: string;
  order: number;
  type: StepType;
  title: string;
  description: string;
  automated: boolean;
  timeout_minutes?: number;
  on_failure?: 'continue' | 'abort' | 'escalate';
}

interface Runbook {
  id: string;
  name: string;
  description: string;
  category: string;
  status: RunbookStatus;
  triggers: RunbookTrigger[];
  steps: RunbookStep[];
  avg_duration_minutes: number;
  success_rate: number;
  last_executed?: string;
  executions_30d: number;
  owner: string;
  created_at: string;
  updated_at: string;
}

interface RunbookExecution {
  id: string;
  runbook_id: string;
  runbook_name: string;
  trigger: RunbookTrigger;
  trigger_source?: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  started_at: string;
  completed_at?: string;
  duration_minutes?: number;
  executed_by: string;
  current_step?: number;
  total_steps: number;
  outcome?: string;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_RUNBOOKS: Runbook[] = [
  {
    id: 'rb-001',
    name: 'High Latency Response',
    description: 'Diagnose and remediate high latency in agent responses. Checks model performance, queue depth, and resource utilization.',
    category: 'Performance',
    status: 'active',
    triggers: ['alert', 'manual'],
    steps: [
      { id: 's1', order: 1, type: 'check', title: 'Check CloudWatch Metrics', description: 'Pull latency percentiles from CloudWatch AWS/Bedrock namespace', automated: true },
      { id: 's2', order: 2, type: 'check', title: 'Check Agent Queue Depth', description: 'Verify pending request queue is not backed up', automated: true },
      { id: 's3', order: 3, type: 'decision', title: 'Identify Root Cause', description: 'Determine if issue is model-side, network, or application', automated: false },
      { id: 's4', order: 4, type: 'action', title: 'Scale Provisioned Throughput', description: 'Increase PTUs if model capacity is the bottleneck', automated: true, on_failure: 'escalate' },
      { id: 's5', order: 5, type: 'wait', title: 'Wait for Stabilization', description: 'Monitor for 5 minutes after scaling', automated: true, timeout_minutes: 5 },
      { id: 's6', order: 6, type: 'check', title: 'Verify Resolution', description: 'Confirm latency is back within SLA thresholds', automated: true },
      { id: 's7', order: 7, type: 'notify', title: 'Update Stakeholders', description: 'Post resolution summary to Slack channel', automated: true },
    ],
    avg_duration_minutes: 12,
    success_rate: 94,
    last_executed: '2026-08-11T08:15:00Z',
    executions_30d: 8,
    owner: 'Platform Team',
    created_at: '2026-03-15',
    updated_at: '2026-07-20',
  },
  {
    id: 'rb-002',
    name: 'Error Spike Investigation',
    description: 'Investigate sudden increase in agent errors. Checks for model issues, guardrail blocks, and upstream dependencies.',
    category: 'Reliability',
    status: 'active',
    triggers: ['alert', 'manual'],
    steps: [
      { id: 's1', order: 1, type: 'check', title: 'Pull Error Logs', description: 'Query CloudWatch Logs for error patterns in last 15 minutes', automated: true },
      { id: 's2', order: 2, type: 'check', title: 'Check Guardrail Events', description: 'Review Bedrock guardrail block events for false positives', automated: true },
      { id: 's3', order: 3, type: 'check', title: 'Verify Model Health', description: 'Check model invocation success rate and throttling', automated: true },
      { id: 's4', order: 4, type: 'decision', title: 'Categorize Error Type', description: 'Classify as model error, guardrail block, or application error', automated: false },
      { id: 's5', order: 5, type: 'action', title: 'Apply Mitigation', description: 'Execute appropriate fix based on error category', automated: false, on_failure: 'escalate' },
      { id: 's6', order: 6, type: 'notify', title: 'Create Incident', description: 'If not auto-resolved, create incident for tracking', automated: true },
    ],
    avg_duration_minutes: 18,
    success_rate: 87,
    last_executed: '2026-08-10T14:30:00Z',
    executions_30d: 12,
    owner: 'Platform Team',
    created_at: '2026-03-20',
    updated_at: '2026-08-01',
  },
  {
    id: 'rb-003',
    name: 'Cost Overrun Response',
    description: 'Respond to cost alerts when spend exceeds budget thresholds. Identifies cost drivers and implements controls.',
    category: 'FinOps',
    status: 'active',
    triggers: ['alert', 'scheduled'],
    steps: [
      { id: 's1', order: 1, type: 'check', title: 'Pull Cost Breakdown', description: 'Query Cost Explorer for spend by model and agent', automated: true },
      { id: 's2', order: 2, type: 'check', title: 'Identify Top Spenders', description: 'Find agents/users with highest cost delta vs baseline', automated: true },
      { id: 's3', order: 3, type: 'decision', title: 'Evaluate Legitimacy', description: 'Determine if cost increase is expected (new feature, traffic) or anomalous', automated: false },
      { id: 's4', order: 4, type: 'action', title: 'Apply Rate Limits', description: 'If runaway, apply temporary rate limits to affected agents', automated: true, on_failure: 'continue' },
      { id: 's5', order: 5, type: 'notify', title: 'Alert Cost Owners', description: 'Notify BU owners of cost spike and actions taken', automated: true },
      { id: 's6', order: 6, type: 'escalate', title: 'Escalate if Needed', description: 'Escalate to FinOps lead if spend continues to grow', automated: true },
    ],
    avg_duration_minutes: 25,
    success_rate: 91,
    last_executed: '2026-08-09T09:00:00Z',
    executions_30d: 4,
    owner: 'FinOps Team',
    created_at: '2026-04-10',
    updated_at: '2026-07-15',
  },
  {
    id: 'rb-004',
    name: 'Agent Recovery',
    description: 'Full recovery procedure for a non-responsive agent. Includes health checks, restart, and validation.',
    category: 'Reliability',
    status: 'active',
    triggers: ['alert', 'manual', 'incident'],
    steps: [
      { id: 's1', order: 1, type: 'check', title: 'Verify Agent Status', description: 'Confirm agent is actually non-responsive (not false alarm)', automated: true },
      { id: 's2', order: 2, type: 'action', title: 'Stop Active Sessions', description: 'Gracefully terminate any active sessions', automated: true },
      { id: 's3', order: 3, type: 'action', title: 'Clear Agent State', description: 'Reset conversation memory and pending queues', automated: true },
      { id: 's4', order: 4, type: 'action', title: 'Restart Agent Runtime', description: 'Trigger AgentCore runtime restart', automated: true, on_failure: 'escalate' },
      { id: 's5', order: 5, type: 'wait', title: 'Wait for Initialization', description: 'Allow 2 minutes for agent to fully initialize', automated: true, timeout_minutes: 2 },
      { id: 's6', order: 6, type: 'check', title: 'Run Health Check', description: 'Execute synthetic probe to verify agent responds', automated: true },
      { id: 's7', order: 7, type: 'check', title: 'Validate Functionality', description: 'Run standard test prompt to verify correct behavior', automated: true },
      { id: 's8', order: 8, type: 'notify', title: 'Confirm Recovery', description: 'Post recovery status to ops channel', automated: true },
    ],
    avg_duration_minutes: 8,
    success_rate: 96,
    last_executed: '2026-08-11T02:45:00Z',
    executions_30d: 3,
    owner: 'Platform Team',
    created_at: '2026-02-28',
    updated_at: '2026-06-10',
  },
  {
    id: 'rb-005',
    name: 'Security Incident Response',
    description: 'Initial response to security alerts: prompt injection attempts, data exfiltration, or policy violations.',
    category: 'Security',
    status: 'active',
    triggers: ['alert', 'incident'],
    steps: [
      { id: 's1', order: 1, type: 'action', title: 'Isolate Agent', description: 'Immediately block affected agent from external requests', automated: true },
      { id: 's2', order: 2, type: 'check', title: 'Capture Evidence', description: 'Export relevant logs, traces, and audit events', automated: true },
      { id: 's3', order: 3, type: 'notify', title: 'Alert Security Team', description: 'Page security on-call with initial assessment', automated: true },
      { id: 's4', order: 4, type: 'check', title: 'Assess Blast Radius', description: 'Identify affected users, data, and systems', automated: false },
      { id: 's5', order: 5, type: 'action', title: 'Revoke Credentials', description: 'Rotate any potentially compromised API keys or tokens', automated: true, on_failure: 'escalate' },
      { id: 's6', order: 6, type: 'escalate', title: 'Engage IR Team', description: 'Formal handoff to Incident Response team', automated: true },
    ],
    avg_duration_minutes: 15,
    success_rate: 100,
    last_executed: '2026-07-28T16:20:00Z',
    executions_30d: 1,
    owner: 'Security Team',
    created_at: '2026-03-01',
    updated_at: '2026-08-05',
  },
  {
    id: 'rb-006',
    name: 'Capacity Scale-Up',
    description: 'Proactive scaling when approaching capacity limits. Triggered by quota utilization alerts.',
    category: 'Capacity',
    status: 'active',
    triggers: ['alert', 'scheduled'],
    steps: [
      { id: 's1', order: 1, type: 'check', title: 'Check Current Utilization', description: 'Pull Service Quotas usage for AI services', automated: true },
      { id: 's2', order: 2, type: 'decision', title: 'Evaluate Scale Need', description: 'Determine if organic growth or traffic spike', automated: false },
      { id: 's3', order: 3, type: 'action', title: 'Request Quota Increase', description: 'Submit Service Quotas increase request', automated: true },
      { id: 's4', order: 4, type: 'action', title: 'Add Provisioned Capacity', description: 'Increase PTUs for affected models', automated: true, on_failure: 'continue' },
      { id: 's5', order: 5, type: 'notify', title: 'Update Capacity Plan', description: 'Log capacity change in planning dashboard', automated: true },
    ],
    avg_duration_minutes: 10,
    success_rate: 98,
    last_executed: '2026-08-08T11:00:00Z',
    executions_30d: 2,
    owner: 'Platform Team',
    created_at: '2026-05-01',
    updated_at: '2026-07-25',
  },
];

const MOCK_EXECUTIONS: RunbookExecution[] = [
  {
    id: 'ex-001',
    runbook_id: 'rb-001',
    runbook_name: 'High Latency Response',
    trigger: 'alert',
    trigger_source: 'Alert: KYC Agent p99 > 5s',
    status: 'completed',
    started_at: '2026-08-11T08:15:00Z',
    completed_at: '2026-08-11T08:27:00Z',
    duration_minutes: 12,
    executed_by: 'auto (alert trigger)',
    total_steps: 7,
    outcome: 'Resolved - scaled PTUs from 1 to 3',
  },
  {
    id: 'ex-002',
    runbook_id: 'rb-004',
    runbook_name: 'Agent Recovery',
    trigger: 'alert',
    trigger_source: 'Alert: Fraud Detection Agent down',
    status: 'completed',
    started_at: '2026-08-11T02:45:00Z',
    completed_at: '2026-08-11T02:53:00Z',
    duration_minutes: 8,
    executed_by: 'auto (alert trigger)',
    total_steps: 8,
    outcome: 'Recovered - runtime restart successful',
  },
  {
    id: 'ex-003',
    runbook_id: 'rb-002',
    runbook_name: 'Error Spike Investigation',
    trigger: 'manual',
    status: 'running',
    started_at: '2026-08-11T09:30:00Z',
    executed_by: 'sarah.chen@company.com',
    current_step: 4,
    total_steps: 6,
  },
  {
    id: 'ex-004',
    runbook_id: 'rb-003',
    runbook_name: 'Cost Overrun Response',
    trigger: 'alert',
    trigger_source: 'Alert: Daily spend > 120% budget',
    status: 'completed',
    started_at: '2026-08-09T09:00:00Z',
    completed_at: '2026-08-09T09:25:00Z',
    duration_minutes: 25,
    executed_by: 'auto (alert trigger)',
    total_steps: 6,
    outcome: 'Controlled - rate limits applied to runaway agent',
  },
  {
    id: 'ex-005',
    runbook_id: 'rb-002',
    runbook_name: 'Error Spike Investigation',
    trigger: 'alert',
    status: 'failed',
    started_at: '2026-08-07T15:10:00Z',
    completed_at: '2026-08-07T15:28:00Z',
    duration_minutes: 18,
    executed_by: 'auto (alert trigger)',
    current_step: 5,
    total_steps: 6,
    outcome: 'Failed - manual intervention required (escalated)',
  },
];

const STEP_TYPE_CONFIG: Record<StepType, { icon: string; color: string; label: string }> = {
  check: { icon: 'magnifying-glass', color: '#3b82f6', label: 'Check' },
  action: { icon: 'bolt', color: '#f59e0b', label: 'Action' },
  decision: { icon: 'question-mark-circle', color: '#8b5cf6', label: 'Decision' },
  notify: { icon: 'bell', color: '#10b981', label: 'Notify' },
  wait: { icon: 'clock', color: '#6b7280', label: 'Wait' },
  escalate: { icon: 'arrow-up-circle', color: '#ef4444', label: 'Escalate' },
};

const CATEGORY_COLORS: Record<string, string> = {
  Performance: '#3b82f6',
  Reliability: '#10b981',
  FinOps: '#f59e0b',
  Security: '#ef4444',
  Capacity: '#8b5cf6',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function OperationalRunbooks() {
  const [activeTab, setActiveTab] = useState<'runbooks' | 'executions'>('runbooks');
  const [selectedRunbook, setSelectedRunbook] = useState<Runbook | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [executionFilter, setExecutionFilter] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = new Set(MOCK_RUNBOOKS.map(r => r.category));
    return ['all', ...Array.from(cats)];
  }, []);

  const filteredRunbooks = useMemo(() => {
    return MOCK_RUNBOOKS.filter(r => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [categoryFilter, statusFilter]);

  const filteredExecutions = useMemo(() => {
    return MOCK_EXECUTIONS.filter(e => {
      if (executionFilter === 'all') return true;
      return e.status === executionFilter;
    });
  }, [executionFilter]);

  const stats = useMemo(() => ({
    totalRunbooks: MOCK_RUNBOOKS.length,
    activeRunbooks: MOCK_RUNBOOKS.filter(r => r.status === 'active').length,
    executions30d: MOCK_RUNBOOKS.reduce((sum, r) => sum + r.executions_30d, 0),
    avgSuccessRate: Math.round(MOCK_RUNBOOKS.reduce((sum, r) => sum + r.success_rate, 0) / MOCK_RUNBOOKS.length),
    runningNow: MOCK_EXECUTIONS.filter(e => e.status === 'running').length,
  }), []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'failed': return 'bg-rose-100 text-rose-700';
      case 'aborted': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <GovernPageLayout
      title="Operational Runbooks"
      description="Standardized response playbooks for agent-ops scenarios — cut MTTR with repeatable, automatable procedures."
      badge={<MockDataBadge />}
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total Runbooks', value: stats.totalRunbooks, color: 'slate' },
          { label: 'Active', value: stats.activeRunbooks, color: 'emerald' },
          { label: 'Executions (30d)', value: stats.executions30d, color: 'blue' },
          { label: 'Avg Success Rate', value: `${stats.avgSuccessRate}%`, color: 'purple' },
          { label: 'Running Now', value: stats.runningNow, color: stats.runningNow > 0 ? 'amber' : 'slate' },
        ].map(s => (
          <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase">{s.label}</div>
            <div className={`text-2xl font-semibold mt-1 text-${s.color}-600`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { id: 'runbooks', label: 'Runbooks', count: filteredRunbooks.length },
          { id: 'executions', label: 'Execution History', count: filteredExecutions.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-white/20' : 'bg-slate-100'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Runbooks Tab */}
      {activeTab === 'runbooks' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="deprecated">Deprecated</option>
            </select>
            <button className="ml-auto px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2">
              <Icon name="plus" className="w-4 h-4" />
              Create Runbook
            </button>
          </div>

          {/* Runbook Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {filteredRunbooks.map(runbook => (
              <div
                key={runbook.id}
                onClick={() => setSelectedRunbook(runbook)}
                className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{runbook.name}</h3>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${CATEGORY_COLORS[runbook.category]}15`, color: CATEGORY_COLORS[runbook.category] }}
                      >
                        {runbook.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{runbook.description}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    runbook.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    runbook.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {runbook.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Icon name="list-bullet" className="w-3.5 h-3.5" />
                    {runbook.steps.length} steps
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="clock" className="w-3.5 h-3.5" />
                    ~{runbook.avg_duration_minutes}m
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="check-circle" className="w-3.5 h-3.5" />
                    {runbook.success_rate}% success
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="arrow-path" className="w-3.5 h-3.5" />
                    {runbook.executions_30d}x / 30d
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">Triggers:</span>
                  {runbook.triggers.map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded capitalize">
                      {t}
                    </span>
                  ))}
                  <button
                    onClick={e => { e.stopPropagation(); }}
                    className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Icon name="play" className="w-3.5 h-3.5" />
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Executions Tab */}
      {activeTab === 'executions' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <select
              value={executionFilter}
              onChange={e => setExecutionFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="aborted">Aborted</option>
            </select>
          </div>

          {/* Executions Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                  <th className="text-left py-2.5 px-4 font-medium">Runbook</th>
                  <th className="text-left py-2.5 px-3 font-medium">Trigger</th>
                  <th className="text-center py-2.5 px-3 font-medium">Status</th>
                  <th className="text-center py-2.5 px-3 font-medium">Progress</th>
                  <th className="text-left py-2.5 px-3 font-medium">Started</th>
                  <th className="text-center py-2.5 px-3 font-medium">Duration</th>
                  <th className="text-left py-2.5 px-4 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filteredExecutions.map(exec => (
                  <tr key={exec.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{exec.runbook_name}</div>
                      {exec.trigger_source && (
                        <div className="text-[11px] text-slate-400">{exec.trigger_source}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded capitalize">
                        {exec.trigger}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${getStatusColor(exec.status)}`}>
                        {exec.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {exec.status === 'running' ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs text-slate-600">{exec.current_step}/{exec.total_steps}</span>
                          <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full animate-pulse"
                              style={{ width: `${((exec.current_step || 0) / exec.total_steps) * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{exec.total_steps}/{exec.total_steps}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      {formatDate(exec.started_at)}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                      {exec.duration_minutes ? `${exec.duration_minutes}m` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {exec.outcome || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Runbook Detail Drawer */}
      {selectedRunbook && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedRunbook(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedRunbook.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${CATEGORY_COLORS[selectedRunbook.category]}15`, color: CATEGORY_COLORS[selectedRunbook.category] }}
                  >
                    {selectedRunbook.category}
                  </span>
                  <span className="text-xs text-slate-400">Owner: {selectedRunbook.owner}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRunbook(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <Icon name="x-mark" className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 mb-6">{selectedRunbook.description}</p>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Steps', value: selectedRunbook.steps.length },
                  { label: 'Avg Duration', value: `${selectedRunbook.avg_duration_minutes}m` },
                  { label: 'Success Rate', value: `${selectedRunbook.success_rate}%` },
                  { label: 'Executions', value: selectedRunbook.executions_30d },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-semibold text-slate-900">{s.value}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Steps */}
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Steps</h3>
              <div className="space-y-3 mb-6">
                {selectedRunbook.steps.map((step, idx) => {
                  const config = STEP_TYPE_CONFIG[step.type];
                  return (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${config.color}15` }}
                        >
                          <Icon name={config.icon as any} className="w-4 h-4" style={{ color: config.color }} />
                        </div>
                        {idx < selectedRunbook.steps.length - 1 && (
                          <div className="w-0.5 h-full bg-slate-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{step.title}</span>
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${config.color}15`, color: config.color }}
                          >
                            {config.label}
                          </span>
                          {step.automated && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded">
                              Auto
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                        {step.timeout_minutes && (
                          <span className="text-[10px] text-slate-400 mt-1 inline-block">
                            Timeout: {step.timeout_minutes}m
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Icon name="play" className="w-4 h-4" />
                  Execute Runbook
                </button>
                <button className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors">
                  Edit
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </GovernPageLayout>
  );
}
