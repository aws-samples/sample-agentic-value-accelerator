/**
 * CostAnomalies — Shadow AI spend detection via Cost Explorer anomaly monitoring.
 *
 * Surfaces unexpected AI spend that could indicate shadow AI usage:
 * - Bedrock/SageMaker cost spikes outside normal patterns
 * - Anomaly trend over time
 * - Direct links to investigate in Cost Explorer
 * - Alert indicators for active high-impact anomalies
 *
 * Part of the FinOps module's cost governance surface.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useCostAnomalies } from '../useCostAnomalies';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { Icon } from '../icons';
import { tooltipStyle } from '../mockData';
import { governCostApi, type AwsAnomalyMonitorsResponse } from '../../../api/client';

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

const severityConfig = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: 'text-rose-500', badge: 'bg-rose-100 text-rose-700' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-500', badge: 'bg-orange-100 text-orange-700' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: 'text-slate-400', badge: 'bg-slate-100 text-slate-600' },
};

// Illustrative anomaly trend for when no live data is available. Fully
// deterministic (a fixed sinusoidal shape, no randomness) so the chart is
// stable across renders and never masquerades as a live series. Rendered
// under a Demo badge.
const MOCK_ANOMALY_TREND = Array.from({ length: 12 }, (_, i) => {
  const week = `W${i + 1}`;
  const base = 2 + Math.sin(i / 2) * 1.5;
  return {
    week,
    count: Math.max(0, Math.round(base)),
    impact: Math.round((150 + Math.sin(i / 3) * 80) * (base > 2 ? 1.3 : 1)),
  };
});

interface Props {
  /** Days to look back for anomalies (default 60) */
  days?: number;
  /** Compact mode for dashboard embedding */
  compact?: boolean;
}

export default function CostAnomalies({ days = 60, compact = false }: Props) {
  const {
    loading,
    live,
    aiAnomalies,
    alertAnomalies,
    totalImpact,
    bySeverity,
    hasAlerts: hasActiveAlerts,
    avgScore,
  } = useCostAnomalies(days, true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Configured AWS Cost Anomaly Detection monitors — which monitors & dimensions
  // are set up to watch for spend anomalies.
  const [monitors, setMonitors] = useState<AwsAnomalyMonitorsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    governCostApi.anomalyMonitors()
      .then(d => { if (!cancelled) setMonitors(d); })
      .catch(() => { if (!cancelled) setMonitors(null); });
    return () => { cancelled = true; };
  }, []);
  const monitorsLive = !!monitors?.live;

  const criticalCount = bySeverity.critical;
  const highCount = bySeverity.high;

  // Build the weekly trend series by bucketing the SAME aiAnomalies the list below
  // renders, so the charts and the list can never disagree.
  //
  // Gated on `live` (the anomaly feed's own flag, from useCostAnomalies) — NOT on the
  // daily-spend trend feed. Those are two independent Cost Explorer calls that can
  // disagree, and gating on the wrong one produced a dishonest render both ways:
  // when the spend feed was live but the anomaly feed was not, these charts drew
  // all-zero buckets (aiAnomalies is empty) under a Live badge, asserting a *measured*
  // "no anomalies" when nothing had actually been measured. Keep this predicate
  // identical to the one behind the charts' badges — if you gate the badge and the
  // data on different flags, the badge stops describing what is on screen.
  const trendData = useMemo(() => {
    if (!live) return MOCK_ANOMALY_TREND;
    // Bucket by whole weeks-ago (0 = the most recent 7-day window … 7 = eight weeks
    // back) using the SAME index the fill loop below uses, so no anomaly is dropped
    // (the old "week of month" ceil(day/7) produced W1-W5 while the loop only made
    // W1-W4) and no two calendar weeks collide onto one label across month boundaries.
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets: Record<number, { count: number; impact: number }> = {};
    aiAnomalies.forEach(a => {
      const weeksAgo = Math.floor((startOfToday.getTime() - new Date(a.start).getTime()) / MS_PER_WEEK);
      if (weeksAgo < 0 || weeksAgo > 7) return;
      buckets[weeksAgo] = buckets[weeksAgo] || { count: 0, impact: 0 };
      buckets[weeksAgo].count += 1;
      buckets[weeksAgo].impact += a.impact;
    });
    // Fill 8 weeks, oldest first, labeling each bucket by its most-recent day.
    const result = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      result.push({
        week: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: buckets[i]?.count ?? 0,
        impact: buckets[i]?.impact ?? 0,
      });
    }
    return result;
  }, [live, aiAnomalies]);

  // Compact view for dashboard embedding
  if (compact) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">AI Spend Anomalies</h3>
            {live ? <LiveDataBadge /> : <MockDataBadge />}
          </div>
          {hasActiveAlerts && (
            <div className="flex items-center gap-1.5">
              {criticalCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  {criticalCount} critical
                </span>
              )}
              {highCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  {highCount} high
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-slate-900">{aiAnomalies.length}</span>
          <span className="text-sm text-slate-500">detected ({days}d)</span>
          {totalImpact > 0 && (
            <span className="text-sm font-semibold text-rose-600 ml-auto">{usd(totalImpact)} impact</span>
          )}
        </div>
        <Link to="/govern/finops?tab=optimization" className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block">
          View details &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with alert banner */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">AI Cost Anomalies</h2>
            {live ? (
              <LiveDataBadge source="Cost Explorer" detail="Anomaly detection from AWS Cost Anomaly Detection" />
            ) : (
              <MockDataBadge integration="Enable AWS Cost Anomaly Detection monitors for Bedrock/SageMaker" />
            )}
          </div>
          <p className="text-sm text-slate-500">
            Unexpected AI spend patterns that could indicate shadow AI usage, runaway agents, or cost optimization opportunities.
          </p>
        </div>
        <a
          href="https://console.aws.amazon.com/cost-management/home#/anomaly-detection/monitors"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
          Open Cost Explorer
        </a>
      </div>

      {/* Alert banner when critical/high anomalies detected */}
      {hasActiveAlerts && (
        <div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl border border-rose-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
              <Icon name="exclamation-triangle" className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-rose-800">Shadow AI Spend Alert</div>
              <div className="text-xs text-rose-600">
                {criticalCount + highCount} high-severity anomalies detected in AI services — potential ungoverned usage or cost spike.
                Total unexpected spend: {usd(alertAnomalies.reduce((s, a) => s + a.impact, 0))}
              </div>
            </div>
            <Link
              to="/govern/shadow-ai"
              className="flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <Icon name="eye" className="w-3.5 h-3.5" />
              Shadow AI Detection
            </Link>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Anomalies ({days}d)</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{aiAnomalies.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">in AI services</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Impact</div>
          <div className={`text-2xl font-semibold mt-1 ${totalImpact > 1000 ? 'text-rose-600' : 'text-slate-900'}`}>{usd(totalImpact)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">unexpected spend</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Critical / High</div>
          <div className={`text-2xl font-semibold mt-1 ${criticalCount + highCount > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
            {criticalCount + highCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">need investigation</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Avg Score</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">
            {Math.round(avgScore * 100)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">anomaly confidence</div>
        </div>
      </div>

      {/* Configured anomaly monitors — from AWS Cost Anomaly Detection */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">Configured Anomaly Monitors</div>
            {monitorsLive
              ? <LiveDataBadge source="Cost Explorer" detail="AWS Cost Anomaly Detection monitors" />
              : <MockDataBadge integration="Create AWS Cost Anomaly Detection monitors" />}
            <span className="text-[11px] text-slate-400">what AWS is watching for spend anomalies</span>
          </div>
          {monitorsLive && (
            <span className="text-[11px] text-slate-500">{monitors?.total ?? 0} monitor{(monitors?.total ?? 0) === 1 ? '' : 's'}</span>
          )}
        </div>
        {!monitorsLive ? (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500">*</span>
            <span>{monitors?.note ?? 'No anomaly monitors detected — enable AWS Cost Anomaly Detection and create a monitor (e.g. by SERVICE, or a Bedrock/SageMaker cost category) to power live anomaly alerts.'}</span>
          </div>
        ) : (monitors?.monitors.length ?? 0) === 0 ? (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-amber-50 rounded-lg px-4 py-3">
            <span className="text-amber-500">*</span>
            <span>Cost Anomaly Detection is reachable but no monitors are configured yet. Create a monitor in Cost Explorer to start detecting AI spend anomalies.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(monitors?.monitors ?? []).map((m, i) => (
              <div key={i} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="eye" className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 truncate" title={m.monitor_name}>{m.monitor_name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{m.monitor_type}</span>
                  {m.monitor_dimension && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{m.monitor_dimension}</span>}
                </div>
                {m.creation_date && <div className="text-[10px] text-slate-400 mt-1">Created {m.creation_date.slice(0, 10)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trend chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-slate-900">Anomaly Trend</div>
            {/* Same `live` predicate that selects trendData above — the card carries its
                own badge so this chart never borrows provenance from the page header. */}
            {live
              ? <LiveDataBadge source="Cost Explorer" detail="Weekly anomaly counts from AWS Cost Anomaly Detection" />
              : <MockDataBadge integration="Illustrative — powered by live anomalies once Cost Explorer data flows" />}
          </div>
          <div className="text-[11px] text-slate-500 mb-3">Weekly anomaly count and impact over time</div>
          {loading ? (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} width={28} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => [name === 'impact' ? usd(Number(v)) : v, name === 'impact' ? 'Impact' : 'Count']}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Anomalies" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-slate-900">Impact by Week</div>
            {/* Dollar figures — the most damaging thing to mislabel. Gated on the anomaly
                feed's own flag, never on the page header or the daily-spend feed. */}
            {live
              ? <LiveDataBadge source="Cost Explorer" detail="Weekly dollar impact from AWS Cost Anomaly Detection" />
              : <MockDataBadge integration="Illustrative — powered by live anomalies once Cost Explorer data flows" />}
          </div>
          <div className="text-[11px] text-slate-500 mb-3">Dollar impact of detected anomalies</div>
          {loading ? (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="impactGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} width={40} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [usd(Number(v)), 'Impact']} />
                <ReferenceLine y={500} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: 'Alert threshold', fill: '#d97706', fontSize: 9 }} />
                <Area type="monotone" dataKey="impact" stroke="#ef4444" strokeWidth={2} fill="url(#impactGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Anomaly list */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Detected Anomalies</div>
            <div className="text-[11px] text-slate-500">AI service spend anomalies sorted by impact</div>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Critical</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> High</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Medium</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> Low</span>
          </div>
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">Loading anomalies...</div>
        ) : aiAnomalies.length === 0 ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
            <Icon name="check-circle" className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-emerald-800">No AI cost anomalies detected</div>
              <div className="text-xs text-emerald-600">Spend patterns are within normal bounds for the past {days} days.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {aiAnomalies.map(a => {
              const cfg = severityConfig[a.severity];
              const isExpanded = expandedId === a.id;
              const dateRange = a.end && a.end !== a.start ? `${a.start.slice(5)} - ${a.end.slice(5)}` : a.start.slice(5);
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 cursor-pointer transition-all hover:shadow-sm`}
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0`}>
                      <Icon name="exclamation-circle" className={`w-4 h-4 ${cfg.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{a.service ?? 'Unknown Service'}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${cfg.badge}`}>
                          {a.severity}
                        </span>
                        <span className="text-[10px] text-slate-500">{dateRange}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-600">
                        <span>Impact: <span className="font-semibold text-slate-900">{usd(a.impact)}</span></span>
                        <span>Score: <span className="font-semibold text-slate-900">{(a.score * 100).toFixed(0)}%</span></span>
                      </div>
                    </div>
                    <Icon name="chevron-down" className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50">
                      <div className="grid grid-cols-2 gap-4 text-[11px]">
                        <div>
                          <div className="text-slate-500 uppercase tracking-wide text-[9px] mb-1">Investigation Steps</div>
                          <ul className="space-y-1 text-slate-700">
                            <li className="flex items-start gap-1.5">
                              <Icon name="arrow-right" className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                              Check CloudTrail for unusual API activity on this date
                            </li>
                            <li className="flex items-start gap-1.5">
                              <Icon name="arrow-right" className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                              Review Agent Registry for unregistered callers
                            </li>
                            <li className="flex items-start gap-1.5">
                              <Icon name="arrow-right" className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                              Correlate with Shadow AI detection findings
                            </li>
                          </ul>
                        </div>
                        <div>
                          <div className="text-slate-500 uppercase tracking-wide text-[9px] mb-1">Possible Causes</div>
                          <ul className="space-y-1 text-slate-700">
                            <li className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                              Ungoverned AI tool or agent deployment
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                              Runaway agent loop or retry storm
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                              New legitimate workload (verify governance)
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <a
                          href={`https://console.aws.amazon.com/cost-management/home#/anomaly-detection/anomalies?timeRange=CUSTOM&startDate=${a.start}&endDate=${a.end || a.start}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                          View in Cost Explorer
                        </a>
                        <Link
                          to={`/govern/shadow-ai`}
                          className="flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <Icon name="eye" className="w-3 h-3" />
                          Shadow AI Detection
                        </Link>
                        <Link
                          to={`/govern/audit?filter=cost-anomaly`}
                          className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <Icon name="document-text" className="w-3 h-3" />
                          Audit Trail
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shadow AI connection callout */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
              <Icon name="eye" className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-violet-800">Connect with Shadow AI Detection</div>
              <div className="text-xs text-violet-600">
                Cost anomalies are one signal — combine with CloudTrail AI-caller analysis and Agent Registry gaps for full visibility.
              </div>
            </div>
          </div>
          <Link
            to="/govern/shadow-ai"
            className="flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800 bg-violet-100 hover:bg-violet-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Shadow AI Detection
            <Icon name="arrow-right" className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
