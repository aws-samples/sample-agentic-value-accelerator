/**
 * DeveloperAiUsageView -- Developer AI Usage and Shadow AI Detection dashboard.
 *
 * Surfaces:
 * 1. Usage Overview (24h/7d/30d): tokens consumed, cost, active users, sessions
 * 2. Usage by Team/Department: table with tokens, cost, users per team
 * 3. Top Users: user email, tokens, cost, sessions, last active, anomaly flags
 * 4. Anomaly Alerts: spend spikes, runaway loops with severity
 * 5. Shadow AI Detection: unapproved users, unknown tools, unapproved model access
 *
 * Uses LiveDataBadge when data is live from CloudWatch/CloudTrail; MockDataBadge otherwise.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import GovernPageLayout from './GovernPageLayout';
import StatCard from './StatCard';
import { Icon } from './icons';
import { governDeveloperAiApi, type DeveloperAiUsageResponse } from '../../api/client';

// ─────────────────────────── Types ───────────────────────────

type TimeWindow = '24h' | '7d' | '30d';

// ─────────────────────────── Mock Data for Illustration ───────────────────────────

const MOCK_USAGE_DATA: DeveloperAiUsageResponse = {
  overview: {
    '24h': { tokens: 2_450_000, cost: 312.50, active_users: 47, sessions: 234 },
    '7d': { tokens: 14_200_000, cost: 1_845.00, active_users: 89, sessions: 1_420 },
    '30d': { tokens: 58_000_000, cost: 7_320.00, active_users: 124, sessions: 5_890 },
  },
  by_team: [
    { team: 'Platform Engineering', tokens: 18_500_000, cost: 2_340.00, users: 28, pct_of_total: 31.9 },
    { team: 'Data Science', tokens: 15_200_000, cost: 1_920.00, users: 18, pct_of_total: 26.2 },
    { team: 'Product Development', tokens: 12_800_000, cost: 1_620.00, users: 34, pct_of_total: 22.1 },
    { team: 'DevOps / SRE', tokens: 6_400_000, cost: 810.00, users: 12, pct_of_total: 11.0 },
    { team: 'QA / Testing', tokens: 3_200_000, cost: 405.00, users: 22, pct_of_total: 5.5 },
    { team: 'Other', tokens: 1_900_000, cost: 225.00, users: 10, pct_of_total: 3.3 },
  ],
  top_users: [
    { email: 'alice.chen@company.com', tokens: 4_200_000, cost: 530.00, sessions: 342, last_active: '2026-07-21T10:15:00Z', anomaly: null },
    { email: 'bob.kumar@company.com', tokens: 3_800_000, cost: 480.00, sessions: 289, last_active: '2026-07-21T09:45:00Z', anomaly: 'spend_spike' },
    { email: 'carol.smith@company.com', tokens: 3_100_000, cost: 392.00, sessions: 267, last_active: '2026-07-20T18:30:00Z', anomaly: null },
    { email: 'dave.jones@company.com', tokens: 2_900_000, cost: 366.00, sessions: 198, last_active: '2026-07-21T08:22:00Z', anomaly: null },
    { email: 'eve.wilson@company.com', tokens: 2_600_000, cost: 328.00, sessions: 234, last_active: '2026-07-21T07:50:00Z', anomaly: 'runaway_loop' },
    { email: 'frank.lee@company.com', tokens: 2_400_000, cost: 303.00, sessions: 187, last_active: '2026-07-20T22:10:00Z', anomaly: null },
    { email: 'grace.brown@company.com', tokens: 2_100_000, cost: 265.00, sessions: 156, last_active: '2026-07-20T16:45:00Z', anomaly: null },
    { email: 'henry.davis@company.com', tokens: 1_950_000, cost: 246.00, sessions: 142, last_active: '2026-07-21T11:05:00Z', anomaly: null },
  ],
  anomalies: [
    { id: 'anom-001', type: 'spend_spike', user: 'bob.kumar@company.com', amount: 480.00, baseline: 210.00, timestamp: '2026-07-21T09:00:00Z', severity: 'high', description: 'User spent 2.3x their 30-day average in a single day' },
    { id: 'anom-002', type: 'runaway_loop', user: 'eve.wilson@company.com', amount: 145_000, baseline: 8_000, timestamp: '2026-07-20T14:30:00Z', severity: 'critical', description: 'Sustained high token rate (145K tokens/hour) for 3+ hours' },
    { id: 'anom-003', type: 'spend_spike', user: 'new.hire@company.com', amount: 89.00, baseline: 0, timestamp: '2026-07-19T11:15:00Z', severity: 'medium', description: 'New user with unusually high first-day usage' },
    { id: 'anom-004', type: 'off_hours', user: 'night.owl@company.com', amount: 125.00, baseline: 45.00, timestamp: '2026-07-18T03:30:00Z', severity: 'low', description: 'Significant usage outside normal business hours (3 AM)' },
  ],
  shadow_ai: {
    unapproved_users: [
      { email: 'contractor.ext@vendor.com', first_seen: '2026-07-15T10:00:00Z', tokens: 45_000, source: 'API key shared via Slack', recommended_action: 'Review contractor access, provision proper credentials' },
      { email: 'unknown-user@gmail.com', first_seen: '2026-07-18T14:22:00Z', tokens: 12_000, source: 'Personal email using corporate API key', recommended_action: 'Revoke API key, investigate source' },
    ],
    unknown_tools: [
      { tool_name: 'cursor-ai-extension', first_seen: '2026-07-10T09:00:00Z', users: 8, requests: 1_240, evidence: 'User-Agent: Cursor/0.42.0', recommended_action: 'Evaluate for approved tool list or block' },
      { tool_name: 'github-copilot-chat', first_seen: '2026-07-12T11:30:00Z', users: 15, requests: 3_420, evidence: 'User-Agent: GithubCopilot-Chat/1.0', recommended_action: 'Already approved - update detection rules' },
      { tool_name: 'custom-cli-wrapper', first_seen: '2026-07-20T08:15:00Z', users: 2, requests: 89, evidence: 'User-Agent: python-requests/2.31.0', recommended_action: 'Identify owner, add to approved list or block' },
    ],
    unapproved_models: [
      { model_id: 'anthropic.claude-3-opus-20240229', users: 3, requests: 156, cost: 45.00, evidence: 'Model not in approved list for this team', recommended_action: 'Request approval via Model Governance or block' },
      { model_id: 'meta.llama3-70b-instruct-v1:0', users: 1, requests: 23, cost: 2.80, evidence: 'Model disabled in guardrail policy', recommended_action: 'Investigate bypass, enforce guardrail' },
    ],
    total_shadow_events: 5,
    shadow_cost_estimate: 47.80,
  },
  live: false,
  source: 'mock',
  note: 'Connect CloudWatch and CloudTrail for live developer AI usage metrics',
};

// ─────────────────────────── Severity Badge ───────────────────────────

const severityConfig: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

function SeverityBadge({ severity }: { severity: string }) {
  const config = severityConfig[severity] || severityConfig.low;
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${config.bg} ${config.text}`}>
      {severity}
    </span>
  );
}

// ─────────────────────────── Anomaly Type Badge ───────────────────────────

const anomalyTypeConfig: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  spend_spike: { label: 'Spend Spike', icon: 'arrow-trending-up', bg: 'bg-orange-50', text: 'text-orange-700' },
  runaway_loop: { label: 'Runaway Loop', icon: 'arrow-path', bg: 'bg-rose-50', text: 'text-rose-700' },
  off_hours: { label: 'Off-Hours', icon: 'calendar', bg: 'bg-purple-50', text: 'text-purple-700' },
};

// ─────────────────────────── Sort Icon ───────────────────────────

function SortIcon({ col, sortColumn, sortDirection }: { col: 'tokens' | 'cost' | 'users'; sortColumn: string; sortDirection: string }) {
  return (
    <span className="ml-0.5 text-[8px]">
      {sortColumn === col ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
    </span>
  );
}

// ─────────────────────────── Utility Functions ───────────────────────────

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const formatCost = (n: number): string => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatTimestamp = (ts: string): string => {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─────────────────────────── Main Component ───────────────────────────

export default function DeveloperAiUsageView() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [data, setData] = useState<DeveloperAiUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<'tokens' | 'cost' | 'users'>('tokens');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch data from API (falls back to mock if API unavailable)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governDeveloperAiApi.usage()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(MOCK_USAGE_DATA); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const effectiveData = data || MOCK_USAGE_DATA;
  const isLive = effectiveData.live;
  const overview = effectiveData.overview[timeWindow];

  // Sorted team data
  const sortedTeams = useMemo(() => {
    const teams = [...effectiveData.by_team];
    teams.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return teams;
  }, [effectiveData.by_team, sortColumn, sortDirection]);

  const toggleSort = (col: 'tokens' | 'cost' | 'users') => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(col);
      setSortDirection('desc');
    }
  };

  // Count shadow AI issues for the badge
  const shadowIssueCount = (effectiveData.shadow_ai.unapproved_users.length +
    effectiveData.shadow_ai.unknown_tools.length +
    effectiveData.shadow_ai.unapproved_models.length);

  return (
    <GovernPageLayout
      title="Developer AI Usage"
      description="Monitor developer AI tool consumption, detect anomalies, and identify shadow AI usage."
      badge={isLive
        ? <LiveDataBadge source="CloudWatch + CloudTrail" />
        : <MockDataBadge integration="CloudWatch Metrics + CloudTrail Events" />
      }
      actions={
        <Link
          to="/govern/shadow-ai"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Shadow AI Detection →
        </Link>
      }
    >
      {/* Time Window Selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Icon name="chart-bar" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Usage Overview</span>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[11px]">
          {(['24h', '7d', '30d'] as TimeWindow[]).map(w => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                timeWindow === w
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      {loading ? (
        <div className="h-24 flex items-center justify-center text-sm text-slate-400 mb-6">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Tokens Consumed"
            value={formatNumber(overview.tokens)}
            sub={`${timeWindow} window`}
            variant="default"
          />
          <StatCard
            label="Total Cost"
            value={formatCost(overview.cost)}
            sub={`${timeWindow} window`}
            variant="info"
          />
          <StatCard
            label="Active Users"
            value={overview.active_users}
            sub="unique developers"
            variant="success"
          />
          <StatCard
            label="Sessions"
            value={formatNumber(overview.sessions)}
            sub="coding sessions"
            variant="default"
          />
        </div>
      )}

      {/* Usage by Team/Department */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="users" className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900">Usage by Team / Department</span>
          </div>
          <span className="text-[11px] text-slate-400">30-day window</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                <th className="font-medium pb-2">Team</th>
                <th
                  className="font-medium pb-2 text-right cursor-pointer hover:text-slate-600"
                  onClick={() => toggleSort('tokens')}
                >
                  Tokens<SortIcon col="tokens" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
                <th
                  className="font-medium pb-2 text-right cursor-pointer hover:text-slate-600"
                  onClick={() => toggleSort('cost')}
                >
                  Cost<SortIcon col="cost" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
                <th
                  className="font-medium pb-2 text-right cursor-pointer hover:text-slate-600"
                  onClick={() => toggleSort('users')}
                >
                  Users<SortIcon col="users" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
                <th className="font-medium pb-2 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team, i) => (
                <tr key={team.team} className={i > 0 ? 'border-t border-slate-50' : ''}>
                  <td className="py-2.5 font-medium text-slate-700">{team.team}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatNumber(team.tokens)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-slate-900">{formatCost(team.cost)}</td>
                  <td className="py-2.5 text-right tabular-nums">{team.users}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${team.pct_of_total}%` }}
                        />
                      </div>
                      <span className="text-slate-500 w-10">{team.pct_of_total.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Users */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="user" className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900">Top Users</span>
          </div>
          <span className="text-[11px] text-slate-400">30-day window</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                <th className="font-medium pb-2">User</th>
                <th className="font-medium pb-2 text-right">Tokens</th>
                <th className="font-medium pb-2 text-right">Cost</th>
                <th className="font-medium pb-2 text-right">Sessions</th>
                <th className="font-medium pb-2 text-right">Last Active</th>
                <th className="font-medium pb-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {effectiveData.top_users.map((user, i) => (
                <tr key={user.email} className={i > 0 ? 'border-t border-slate-50' : ''}>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[10px] font-medium text-slate-600">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-slate-700">{user.email}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatNumber(user.tokens)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-slate-900">{formatCost(user.cost)}</td>
                  <td className="py-2.5 text-right tabular-nums">{user.sessions}</td>
                  <td className="py-2.5 text-right text-slate-500">{formatTimestamp(user.last_active)}</td>
                  <td className="py-2.5 text-center">
                    {user.anomaly ? (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                        user.anomaly === 'runaway_loop' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {user.anomaly === 'runaway_loop' ? 'Loop' : 'Spike'}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400">Normal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Anomaly Alerts */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-slate-900">Anomaly Alerts</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              {effectiveData.anomalies.length} detected
            </span>
          </div>
        </div>

        {effectiveData.anomalies.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">No anomalies detected</div>
        ) : (
          <div className="space-y-3">
            {effectiveData.anomalies.map(anomaly => {
              const typeConfig = anomalyTypeConfig[anomaly.type] || anomalyTypeConfig.spend_spike;
              return (
                <div
                  key={anomaly.id}
                  className={`p-3 rounded-lg border ${
                    anomaly.severity === 'critical' ? 'border-rose-200 bg-rose-50/50' :
                    anomaly.severity === 'high' ? 'border-orange-200 bg-orange-50/50' :
                    'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon name={typeConfig.icon} className={`w-4 h-4 ${typeConfig.text}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${typeConfig.text}`}>{typeConfig.label}</span>
                          <SeverityBadge severity={anomaly.severity} />
                        </div>
                        <div className="text-xs text-slate-700">{anomaly.user}</div>
                        <div className="text-[11px] text-slate-500 mt-1">{anomaly.description}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {typeof anomaly.amount === 'number' && anomaly.amount > 1000
                          ? formatNumber(anomaly.amount) + ' tokens/hr'
                          : formatCost(anomaly.amount)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        vs {typeof anomaly.baseline === 'number' && anomaly.baseline > 1000
                          ? formatNumber(anomaly.baseline) + ' baseline'
                          : formatCost(anomaly.baseline) + ' avg'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{formatTimestamp(anomaly.timestamp)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shadow AI Detection */}
      <div className="bg-gradient-to-br from-rose-50/50 via-white to-white rounded-xl border border-rose-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="viewfinder-circle" className="w-4 h-4 text-rose-600" />
            <span className="text-sm font-semibold text-slate-900">Shadow AI Detection</span>
            {shadowIssueCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                {shadowIssueCount} issues
              </span>
            )}
          </div>
          <Link to="/govern/shadow-ai" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
            Full Shadow AI View →
          </Link>
        </div>

        {/* Unapproved Users */}
        {effectiveData.shadow_ai.unapproved_users.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide mb-2">
              Unapproved Users ({effectiveData.shadow_ai.unapproved_users.length})
            </div>
            <div className="space-y-2">
              {effectiveData.shadow_ai.unapproved_users.map(user => (
                <div key={user.email} className="p-3 bg-white rounded-lg border border-rose-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-medium text-slate-800">{user.email}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {formatNumber(user.tokens)} tokens since {formatTimestamp(user.first_seen)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Source: {user.source}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-rose-600 font-medium">{user.recommended_action}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unknown Tools */}
        {effectiveData.shadow_ai.unknown_tools.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Unknown Tools / Sources ({effectiveData.shadow_ai.unknown_tools.length})
            </div>
            <div className="space-y-2">
              {effectiveData.shadow_ai.unknown_tools.map(tool => (
                <div key={tool.tool_name} className="p-3 bg-white rounded-lg border border-amber-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-medium text-slate-800">{tool.tool_name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {tool.users} users, {formatNumber(tool.requests)} requests
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{tool.evidence}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-amber-600 font-medium">{tool.recommended_action}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unapproved Models */}
        {effectiveData.shadow_ai.unapproved_models.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide mb-2">
              Unapproved Model Access ({effectiveData.shadow_ai.unapproved_models.length})
            </div>
            <div className="space-y-2">
              {effectiveData.shadow_ai.unapproved_models.map(model => (
                <div key={model.model_id} className="p-3 bg-white rounded-lg border border-purple-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-medium text-slate-800 font-mono">{model.model_id}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {model.users} users, {model.requests} requests, {formatCost(model.cost)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{model.evidence}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-purple-600 font-medium">{model.recommended_action}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No issues state */}
        {shadowIssueCount === 0 && (
          <div className="text-center py-6">
            <Icon name="check-circle" className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-emerald-700">No Shadow AI Detected</div>
            <div className="text-[11px] text-slate-500 mt-1">
              All usage is from approved users, tools, and models
            </div>
          </div>
        )}

        {/* Shadow AI Summary */}
        {shadowIssueCount > 0 && (
          <div className="mt-4 pt-4 border-t border-rose-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              Estimated shadow AI cost: <span className="font-semibold text-rose-600">{formatCost(effectiveData.shadow_ai.shadow_cost_estimate)}</span>
            </div>
            <button className="text-[11px] px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium">
              Generate Report
            </button>
          </div>
        )}
      </div>
    </GovernPageLayout>
  );
}
