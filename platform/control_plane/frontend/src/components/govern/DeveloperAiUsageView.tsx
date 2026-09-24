/**
 * DeveloperAiUsageView -- Developer AI Usage and Shadow AI Detection dashboard.
 *
 * Surfaces (all sourced from the backend /developer-ai endpoints):
 * 1. Usage Overview (24h/7d/30d): tokens consumed, cost, active users, sessions
 * 2. Usage by Team/Department: table with tokens, cost, users per team
 * 3. Top Users: user email, tokens, cost, sessions, last active
 * 4. Anomaly Alerts: spend spikes, runaway loops with severity
 * 5. Shadow AI Detection: unapproved users, unknown tools, unapproved model access
 *
 * Data is live from CloudWatch (OTel metrics) + CloudTrail. When those integrations
 * emit no data, the surfaces render honest empty states rather than fabricated values.
 *
 * Nullability contract: shadow-AI token counts and per-model cost are `number | null`.
 * `null` means "not measured" (no matching Bedrock invocation-log record, or no published
 * per-1K rate — there is no default rate to fall back on) and renders as an em-dash with a
 * tooltip, never as 0 / $0.00. A measured 0 is a real 0 and renders as 0, so every check
 * uses `== null` rather than truthiness.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import GovernPageLayout from './GovernPageLayout';
import StatCard from './StatCard';
import { Icon, type IconName } from './icons';
import { governDeveloperAiApi, type DeveloperAiUsageResponse, type DeveloperAiAnomaly } from '../../api/client';

// ─────────────────────────── Types ───────────────────────────

type TimeWindow = '24h' | '7d' | '30d';
const WINDOW_DAYS: Record<TimeWindow, number> = { '24h': 1, '7d': 7, '30d': 30 };

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
// Keyed on backend UsageAnomaly.anomaly_type values.

const anomalyTypeConfig: Record<string, { label: string; icon: IconName; bg: string; text: string }> = {
  'spend-spike': { label: 'Spend Spike', icon: 'arrow-trending-up', bg: 'bg-orange-50', text: 'text-orange-700' },
  'runaway-loop': { label: 'Runaway Loop', icon: 'arrow-path', bg: 'bg-rose-50', text: 'text-rose-700' },
  'burst': { label: 'Usage Burst', icon: 'bolt', bg: 'bg-amber-50', text: 'text-amber-700' },
  'unusual-hours': { label: 'Off-Hours', icon: 'calendar', bg: 'bg-purple-50', text: 'text-purple-700' },
};

// ─────────────────────────── Sort Icon ───────────────────────────

function SortIcon({ col, sortColumn, sortDirection }: { col: 'tokens' | 'cost' | 'users'; sortColumn: string; sortDirection: string }) {
  return (
    <span className="ml-0.5 text-[8px]">
      {sortColumn === col ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
    </span>
  );
}

// ─────────────────────────── Unmeasured Value ───────────────────────────

/**
 * Glyph used for a value the backend could not measure.
 *
 * Honesty contract for the developer-AI DTOs: `null` means "not measured", which is
 * NOT the same as zero. Shadow-AI per-identity token counts come from Bedrock
 * invocation logs and per-model cost from per-1K pricing — either can be absent, and
 * there is no default pricing rate to fall back on. So a null must never render as
 * `0`, `$0.00` or a blank cell. A *measured* 0 is a real 0 and still renders as `0`,
 * which is why every check below is `== null` / `!= null` and never truthiness.
 */
const NOT_MEASURED = '—';

/** Em-dash placeholder with a tooltip saying why the value is absent. */
function Unmeasured({ reason }: { reason: string }) {
  return (
    <span className="text-slate-300 cursor-help" title={reason}>
      {NOT_MEASURED}
    </span>
  );
}

/** Inline "this number is incomplete" marker for a measured total whose components are partly unmeasured. */
function PartialMeasurement({ reason }: { reason: string }) {
  return (
    <span className="ml-1 text-slate-400 cursor-help" title={reason}>
      (partial)
    </span>
  );
}

// ─────────────────────────── Utility Functions ───────────────────────────

// Both formatters accept null/undefined and centrally return the not-measured glyph,
// so no call site can render `NaN`, `$0.00`, or throw on `null.toLocaleString()`.
const formatNumber = (n: number | null | undefined): string => {
  if (n == null) return NOT_MEASURED;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const formatCost = (n: number | null | undefined): string =>
  n == null ? NOT_MEASURED : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatTimestamp = (ts?: string | null): string => {
  if (!ts) return '—';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '—';
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
  const [anomalies, setAnomalies] = useState<DeveloperAiAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sortColumn, setSortColumn] = useState<'tokens' | 'cost' | 'users'>('tokens');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch usage + anomalies for the selected window. No fabricated fallback:
  // if the API is unavailable we surface an honest degraded state.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const days = WINDOW_DAYS[timeWindow];
    Promise.all([
      governDeveloperAiApi.usage(days).then(d => ({ ok: true as const, d })).catch(() => ({ ok: false as const, d: null })),
      governDeveloperAiApi.anomalies(days).then(r => r.anomalies).catch(() => [] as DeveloperAiAnomaly[]),
    ])
      .then(([usage, anom]) => {
        if (cancelled) return;
        setData(usage.d);
        setFailed(!usage.ok);
        setAnomalies(anom ?? []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [timeWindow]);

  const isLive = !!data?.live;
  const shadow = data?.shadow_ai ?? null;

  // Overview cards from flat backend totals.
  const overview = {
    tokens: data?.total_tokens ?? 0,
    cost: data?.total_cost_usd ?? 0,
    active_users: data?.active_users ?? 0,
    sessions: data?.total_sessions ?? 0,
  };

  // Team breakdown — map backend fields and compute share of total tokens.
  const sortedTeams = useMemo(() => {
    const teams = data?.by_team ?? [];
    const totalTokens = teams.reduce((s, t) => s + (t.total_tokens || 0), 0) || 1;
    const rows = teams.map(t => ({
      team: t.team_id,
      tokens: t.total_tokens,
      cost: t.total_cost_usd,
      users: t.user_count,
      pct_of_total: (t.total_tokens / totalTokens) * 100,
    }));
    rows.sort((a, b) => (sortDirection === 'desc' ? b[sortColumn] - a[sortColumn] : a[sortColumn] - b[sortColumn]));
    return rows;
  }, [data?.by_team, sortColumn, sortDirection]);

  // Top users by token consumption.
  const topUsers = useMemo(() => {
    const users = [...(data?.by_user ?? [])];
    users.sort((a, b) => (b.total_tokens || 0) - (a.total_tokens || 0));
    return users.slice(0, 8);
  }, [data?.by_user]);

  const toggleSort = (col: 'tokens' | 'cost' | 'users') => {
    if (sortColumn === col) {
      setSortDirection(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortColumn(col);
      setSortDirection('desc');
    }
  };

  const shadowIssueCount = shadow
    ? shadow.unapproved_users.length + shadow.unknown_tools.length + shadow.unapproved_models.length
    : 0;

  // Coverage of the shadow-AI numbers. `shadow_cost_estimate` is a backend sum over the
  // models it could actually price; models with `cost === null` are absent from it, so the
  // total is a floor. Rather than blanking a total that is mostly real, we keep the measured
  // subtotal and disclose exactly how many rows it excludes right next to it.
  const unpricedModelCount = shadow?.unapproved_models.filter(m => m.cost == null).length ?? 0;
  const unmeasuredUserTokenCount = shadow?.unapproved_users.filter(u => u.tokens == null).length ?? 0;

  return (
    <GovernPageLayout
      title="Developer AI Usage"
      description="See how developers use AI — tool consumption, spend, usage anomalies, and shadow-AI detection across teams."
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
      {/* Degraded / no-instrumentation notice */}
      {!loading && (failed || (!data?.total_tokens && (data?.by_user?.length ?? 0) === 0)) && (
        <div className="mb-6 rounded-xl border border-slate-200/70 bg-slate-50/70 p-4 text-[12px] text-slate-600 flex items-start gap-2">
          <Icon name="information-circle" className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <span>
            {failed
              ? 'Developer AI usage service is unavailable right now.'
              : 'No developer AI usage recorded in this window. Emit OpenTelemetry metrics from developer tools (Claude Code, etc.) to CloudWatch, and enable CloudTrail, to populate this view.'}
          </span>
        </div>
      )}

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
          <span className="text-[11px] text-slate-400">{timeWindow} window</span>
        </div>

        {sortedTeams.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">No team usage in this window</div>
        ) : (
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
        )}
      </div>

      {/* Top Users */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="user" className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900">Top Users</span>
          </div>
          <span className="text-[11px] text-slate-400">{timeWindow} window</span>
        </div>

        {topUsers.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">No user activity in this window</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th className="font-medium pb-2">User</th>
                  <th className="font-medium pb-2 text-right">Tokens</th>
                  <th className="font-medium pb-2 text-right">Cost</th>
                  <th className="font-medium pb-2 text-right">Sessions</th>
                  <th className="font-medium pb-2 text-right">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((user, i) => {
                  const label = user.email || user.user_id;
                  return (
                    <tr key={user.user_id} className={i > 0 ? 'border-t border-slate-50' : ''}>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[10px] font-medium text-slate-600">
                            {label.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-slate-700">{label}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatNumber(user.total_tokens)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium text-slate-900">{formatCost(user.total_cost_usd)}</td>
                      <td className="py-2.5 text-right tabular-nums">{user.session_count}</td>
                      <td className="py-2.5 text-right text-slate-500">{formatTimestamp(user.last_active)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Anomaly Alerts */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-slate-900">Anomaly Alerts</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              {anomalies.length} detected
            </span>
          </div>
        </div>

        {anomalies.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">No anomalies detected</div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((anomaly, idx) => {
              const typeConfig = anomalyTypeConfig[anomaly.anomaly_type] || anomalyTypeConfig['spend-spike'];
              const isTokenMetric = anomaly.anomaly_type !== 'spend-spike';
              return (
                <div
                  key={`${anomaly.anomaly_type}-${anomaly.user_id ?? 'na'}-${idx}`}
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
                        <div className="text-xs text-slate-700">{anomaly.user_id || anomaly.team_id || 'Fleet-wide'}</div>
                        <div className="text-[11px] text-slate-500 mt-1">{anomaly.description}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {isTokenMetric
                          ? formatNumber(anomaly.metric_value) + ' tokens'
                          : formatCost(anomaly.metric_value)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        vs {isTokenMetric
                          ? formatNumber(anomaly.baseline_value) + ' baseline'
                          : formatCost(anomaly.baseline_value) + ' avg'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{formatTimestamp(anomaly.detected_at)}</div>
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
            {/* Gated on the detector's own honest-degrade flag, not on "the fetch succeeded".
                Shadow AI has a separate live/source/note triple from the usage response. */}
            {shadow && <LiveDataBadge live={shadow.live} source={shadow.source} />}
          </div>
          <Link to="/govern/shadow-ai" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
            Full Shadow AI View →
          </Link>
        </div>

        {/* Detector caveats straight from the backend note (unmeasured models, paging bounds). */}
        {shadow?.note && (
          <div className="mb-4 rounded-lg border border-slate-200/70 bg-slate-50/70 p-2.5 text-[10px] text-slate-600 flex items-start gap-1.5">
            <Icon name="information-circle" className="w-3.5 h-3.5 text-slate-400 mt-px flex-shrink-0" />
            <span>{shadow.note}</span>
          </div>
        )}

        {/* Unapproved Users */}
        {shadow && shadow.unapproved_users.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide mb-2">
              Unapproved Users ({shadow.unapproved_users.length})
            </div>
            <div className="space-y-2">
              {shadow.unapproved_users.map(user => {
                // Which halves of the input/output split the backend explicitly reported as
                // unmeasured. `=== null` (never falsiness) so a genuine 0-token side still
                // counts as measured; `undefined` means the field was not sent at all, which
                // is not a claim of non-measurement and so must not flag the row as partial.
                const missingSides: string[] = [];
                if (user.input_tokens === null) missingSides.push('input');
                if (user.output_tokens === null) missingSides.push('output');
                return (
                  <div key={user.email} className="p-3 bg-white rounded-lg border border-rose-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-medium text-slate-800">{user.email}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {user.tokens == null ? (
                            <>
                              <Unmeasured reason="No Bedrock invocation-log token count could be matched to this identity. Not measured — not zero." />{' '}
                              tokens since {formatTimestamp(user.first_seen)}
                            </>
                          ) : (
                            <>
                              {formatNumber(user.tokens)} tokens
                              {missingSides.length > 0 && (
                                <PartialMeasurement
                                  reason={`Unmeasured: ${missingSides.join(' and ')} tokens for this identity. The total shown covers only the tokens that were measured — treat it as a floor.`}
                                />
                              )}{' '}
                              since {formatTimestamp(user.first_seen)}
                            </>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Source: {user.source}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-rose-600 font-medium">{user.recommended_action}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unknown Tools */}
        {shadow && shadow.unknown_tools.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Unknown Tools / Sources ({shadow.unknown_tools.length})
            </div>
            <div className="space-y-2">
              {shadow.unknown_tools.map(tool => (
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
        {shadow && shadow.unapproved_models.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide mb-2">
              Unapproved Model Access ({shadow.unapproved_models.length})
            </div>
            <div className="space-y-2">
              {shadow.unapproved_models.map(model => {
                const missingSides: string[] = [];
                // See the unapproved-users block above for why this is `=== null`.
                if (model.input_tokens === null) missingSides.push('input');
                if (model.output_tokens === null) missingSides.push('output');
                return (
                  <div key={model.model_id} className="p-3 bg-white rounded-lg border border-purple-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-medium text-slate-800 font-mono">{model.model_id}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {model.users} users, {model.requests} requests,{' '}
                          {model.cost == null ? (
                            <Unmeasured reason="No published per-1K rate for this model, or no measured tokens in the Bedrock invocation logs. Cost is unknown — not $0.00." />
                          ) : (
                            <>
                              {formatCost(model.cost)}
                              {missingSides.length > 0 && (
                                <PartialMeasurement
                                  reason={`Unmeasured: ${missingSides.join(' and ')} tokens for this model. The cost shown is priced only from the tokens that were measured — treat it as a floor.`}
                                />
                              )}
                            </>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{model.evidence}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-purple-600 font-medium">{model.recommended_action}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No issues state */}
        {shadowIssueCount === 0 && (
          <div className="text-center py-6">
            <Icon name="check-circle" className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-emerald-700">No Shadow AI Detected</div>
            <div className="text-[11px] text-slate-500 mt-1">
              All observed usage is from approved users, tools, and models
            </div>
          </div>
        )}

        {/* Shadow AI Summary */}
        {shadow && shadowIssueCount > 0 && (
          <div className="mt-4 pt-4 border-t border-rose-100 flex items-start justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              Estimated shadow AI cost: <span className="font-semibold text-rose-600">{formatCost(shadow.shadow_cost_estimate)}</span>
              {/* The total is a sum over priced models only. Disclose what it leaves out
                  rather than letting a Live badge imply it is complete. */}
              {(unpricedModelCount > 0 || unmeasuredUserTokenCount > 0) && (
                <span
                  className="block mt-1 text-[10px] text-slate-400 cursor-help"
                  title="Models with no published per-1K rate (or no measured tokens) contribute nothing to this sum. Their cost is unknown, not zero, so the total is a floor."
                >
                  Floor, not a total — excludes{' '}
                  {unpricedModelCount > 0 && `${unpricedModelCount} model${unpricedModelCount === 1 ? '' : 's'} with unmeasured cost`}
                  {unpricedModelCount > 0 && unmeasuredUserTokenCount > 0 && ' and '}
                  {unmeasuredUserTokenCount > 0 && `${unmeasuredUserTokenCount} identit${unmeasuredUserTokenCount === 1 ? 'y' : 'ies'} with unmeasured tokens`}
                </span>
              )}
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
