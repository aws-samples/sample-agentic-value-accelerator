/**
 * FleetScaleView — "Fleet at Scale" governance view for 10,000+ agents.
 *
 * Additive to the existing Agent Registry: the original per-agent table is
 * unchanged and remains the default. This view demonstrates the management-by-
 * exception pattern needed at fleet scale — summary-first hero, segment risk
 * heatmap, and a bounded exception queue — without ever rendering 10k rows.
 *
 * Supports two data modes:
 * - useRealData=false (default): synthetic fleet for scale demos/testing
 * - useRealData=true: real agent registry data via useFleetScale hook
 */
import { useCallback, useMemo, useState } from 'react';
import {
  generateFleet, summarize, segmentBy, exceptionQueue, inventoryBy, riskTier, type ScaleAgent,
} from './fleetScaleData';
import { useFleetScale } from './useFleetScale';
import { AGENT_SCOPE_META, type AgentScopeLevel } from './autonomyLadder';
import StatCard from './StatCard';
import { rowButtonProps } from './a11y';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';

const FLEET_SIZES = [100, 1000, 10000, 50000];

const govMeta = {
  compliant:     { label: 'Compliant',      text: 'text-emerald-700', dot: '#10b981' },
  review_needed: { label: 'Review Needed',  text: 'text-amber-700',   dot: '#f59e0b' },
  blocked:       { label: 'Blocked',        text: 'text-rose-700',    dot: '#e11d48' },
  unknown:       { label: 'Unknown',        text: 'text-slate-500',   dot: '#94a3b8' },
} as const;

const riskMeta = {
  critical: { label: 'Critical', text: 'text-rose-700',    bg: 'bg-rose-100' },
  high:     { label: 'High',     text: 'text-orange-700',  bg: 'bg-orange-100' },
  medium:   { label: 'Medium',   text: 'text-amber-700',   bg: 'bg-amber-100' },
  low:      { label: 'Low',      text: 'text-emerald-700', bg: 'bg-emerald-100' },
} as const;

// Heatmap cell color by % compliant (higher = greener).
function cellColor(pct: number): string {
  if (pct >= 90) return '#10b981';
  if (pct >= 75) return '#84cc16';
  if (pct >= 60) return '#f59e0b';
  if (pct >= 40) return '#f97316';
  return '#ef4444';
}

const fmt = (n: number) => n.toLocaleString();

interface FleetScaleViewProps {
  variant?: 'fleet' | 'registry';
  useRealData?: boolean;
}

/**
 * variant controls the lens:
 *  - 'fleet'    (operations): leads with the exception/attention queue.
 *  - 'registry' (inventory):  adds a model/provider inventory breakdown and
 *                             frames the queue as a coverage/gap list.
 * useRealData:
 *  - false (default): synthetic fleet for scale demos
 *  - true: real agent registry data
 */
export default function FleetScaleView({ variant = 'fleet', useRealData = false }: FleetScaleViewProps) {
  const isRegistry = variant === 'registry';
  const [syntheticSize, setSyntheticSize] = useState(10000);
  const [groupBy, setGroupBy] = useState<'businessUnit' | 'provider' | 'environment'>('businessUnit');
  const [filterBU, setFilterBU] = useState<string | null>(null);

  const realData = useFleetScale();

  const syntheticFleet = useMemo(() => generateFleet(syntheticSize), [syntheticSize]);
  const syntheticSummary = useMemo(() => summarize(syntheticFleet), [syntheticFleet]);

  const fleet = useRealData ? realData.fleet : syntheticFleet;
  const summary = useRealData ? realData.summary : syntheticSummary;
  const isLive = useRealData && realData.source !== 'demo';

  const keyOf = useCallback(
    (a: ScaleAgent) => (groupBy === 'businessUnit' ? a.businessUnit : groupBy === 'provider' ? a.provider : a.environment),
    [groupBy],
  );
  const segments = useMemo(() => segmentBy(fleet, keyOf), [fleet, keyOf]);

  // Heatmap: segment (rows) × scope level (cols), cell = % compliant.
  const scopeHeatmap = useMemo(() => {
    return segments.map(seg => {
      const segAgents = fleet.filter(a => keyOf(a) === seg.key);
      const cols = ([1, 2, 3, 4] as AgentScopeLevel[]).map(scope => {
        const inCell = segAgents.filter(a => a.scopeLevel === scope);
        const compliant = inCell.filter(a => a.governanceStatus === 'compliant').length;
        return { scope, count: inCell.length, pct: inCell.length ? Math.round((compliant / inCell.length) * 100) : 100 };
      });
      return { key: seg.key, cols };
    });
  }, [segments, fleet, keyOf]);

  const queue = useMemo(() => {
    const pool = filterBU ? fleet.filter(a => a.businessUnit === filterBU) : fleet;
    return exceptionQueue(pool, 100);
  }, [fleet, filterBU]);

  // Registry lens: inventory breakdowns ("what exists").
  const byModel = useMemo(() => (isRegistry ? inventoryBy(fleet, a => a.model) : []), [isRegistry, fleet]);
  const byProvider = useMemo(() => (isRegistry ? inventoryBy(fleet, a => a.provider) : []), [isRegistry, fleet]);

  if (useRealData && realData.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <span className="animate-pulse">Loading fleet data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + scale selector or live indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{isRegistry ? 'Registry at Scale' : 'Fleet at Scale'}</h2>
            {useRealData ? (
              isLive ? (
                <LiveDataBadge integration="Agent Registry" />
              ) : (
                <MockDataBadge integration="Demo agent registry data" />
              )
            ) : (
              <MockDataBadge integration="Synthetic fleet data for scale demonstration" />
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {isRegistry
              ? `Inventory at scale — what's deployed across ${fmt(summary.total)} agents by model, provider, and autonomy, with governance coverage. Summary-first, never a per-agent table.`
              : `Management-by-exception view for large agent fleets. Summary-first: rollups + a bounded attention queue, never a ${fmt(summary.total)}-row table.`}
          </p>
        </div>
        {!useRealData && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Simulated fleet size
            <select
              value={syntheticSize}
              onChange={e => { setSyntheticSize(parseInt(e.target.value, 10)); setFilterBU(null); }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              {FLEET_SIZES.map(n => <option key={n} value={n}>{fmt(n)} agents</option>)}
            </select>
          </label>
        )}
        {useRealData && (
          <button
            onClick={realData.refresh}
            className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            Refresh
          </button>
        )}
      </div>

      {/* KPI strip — inventory lens (registry) vs risk/ops lens (fleet) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {isRegistry ? (
          <>
            <StatCard label="Registered Agents" value={fmt(summary.total)} />
            <StatCard label="Models in Use" value={fmt(byModel.length)} sub="distinct" />
            <StatCard label="Providers" value={fmt(byProvider.length)} variant="info" />
            <StatCard label="At L3+ Autonomy" value={`${Math.round(((summary.scope[3] + summary.scope[4]) / summary.total) * 100)}%`} sub="supervised or full" />
            <StatCard label="Policy Coverage" value={`${Math.round(((summary.total - summary.unprotected) / summary.total) * 100)}%`} variant={summary.unprotected > 0 ? 'warning' : 'success'} sub="have active policy" />
            <StatCard label="Tool-Using Agents" value={fmt(summary.total - summary.scope[1])} sub="L2+ (non-static)" />
          </>
        ) : (
          <>
            <StatCard label="Total Agents" value={fmt(summary.total)} />
            <StatCard label="% Compliant" value={`${summary.pctCompliant}%`} variant={summary.pctCompliant >= 80 ? 'success' : summary.pctCompliant >= 60 ? 'warning' : 'danger'} />
            <StatCard label="Needs Attention" value={fmt(summary.needsAttention)} variant="warning" sub={`${Math.round((summary.needsAttention / summary.total) * 100)}% of fleet`} />
            <StatCard label="Blocked" value={fmt(summary.governance.blocked)} variant="danger" />
            <StatCard label="Prod · Full Agency" value={fmt(summary.prodFullAgency)} variant="info" sub="highest blast radius" />
            <StatCard label="Open Incidents" value={fmt(summary.openIncidents)} variant={summary.openIncidents > 0 ? 'danger' : 'success'} />
          </>
        )}
      </div>

      {/* Registry lens: inventory breakdown leads (what's deployed) */}
      {isRegistry && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {([['Agents by Model', byModel], ['Agents by Provider', byProvider]] as const).map(([title, rows]) => (
            <div key={title} className={card}>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
              <div className="space-y-1.5">
                {rows.map(r => (
                  <div key={r.key} className="flex items-center gap-2 text-[11px]">
                    <span className="w-36 truncate text-slate-600">{r.key}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${r.pctOfFleet}%` }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-slate-600">{fmt(r.count)}</span>
                    <span className="w-10 text-right text-slate-400">{r.pctOfFleet}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Distributions — fleet lens leads with governance/risk; registry shows scope + governance only */}
      <div className={`grid grid-cols-1 ${isRegistry ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-4`}>
        {/* Governance posture */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Governance Posture</h3>
          <div className="space-y-2">
            {(['compliant', 'review_needed', 'blocked'] as const).map(g => {
              const n = summary.governance[g];
              const pct = Math.round((n / summary.total) * 100);
              return (
                <div key={g}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: govMeta[g].dot }} />{govMeta[g].label}</span>
                    <span className={`font-semibold ${govMeta[g].text}`}>{fmt(n)} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: govMeta[g].dot }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk tiers — fleet/ops lens only */}
        {!isRegistry && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Risk Distribution</h3>
          <div className="grid grid-cols-4 gap-2">
            {(['critical', 'high', 'medium', 'low'] as const).map(t => (
              <div key={t} className={`rounded-lg p-2.5 text-center ${riskMeta[t].bg}`}>
                <div className={`text-lg font-bold tabular-nums ${riskMeta[t].text}`}>{fmt(summary.risk[t])}</div>
                <div className={`text-[9px] font-semibold uppercase tracking-wide ${riskMeta[t].text}`}>{riskMeta[t].label}</div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Scope (AWS Scoping Matrix L1-L4) */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Autonomy Scope (L1–L4)</h3>
          <div className="space-y-1.5">
            {([4, 3, 2, 1] as AgentScopeLevel[]).map(scope => {
              const n = summary.scope[scope];
              const pct = Math.round((n / summary.total) * 100);
              const meta = AGENT_SCOPE_META[scope];
              return (
                <div key={scope} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 text-slate-500">L{scope}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <span className="w-20 text-right tabular-nums text-slate-600">{fmt(n)}</span>
                  <span className="w-24 text-slate-400 truncate">{meta.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Segment heatmap: segment × scope, cell = % compliant */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Compliance Heatmap</h3>
            <p className="text-[10px] text-slate-400">Cell = % compliant. Darker red = concentration of governance gaps. Click a row to focus the attention queue.</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            Group by
            <select value={groupBy} onChange={e => { setGroupBy(e.target.value as typeof groupBy); setFilterBU(null); }}
              className="px-2 py-1 border border-slate-200 rounded-md text-[11px] focus:outline-none focus:border-blue-500">
              <option value="businessUnit">Business Unit</option>
              <option value="provider">Provider</option>
              <option value="environment">Environment</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[560px]">
            <thead>
              <tr className="text-slate-400">
                <th scope="col" className="text-left font-medium py-1.5 pr-3">{groupBy === 'businessUnit' ? 'Business Unit' : groupBy === 'provider' ? 'Provider' : 'Environment'}</th>
                {([1, 2, 3, 4] as AgentScopeLevel[]).map(s => <th scope="col" key={s} className="font-medium py-1.5 px-1 text-center">L{s}</th>)}
                <th scope="col" className="font-medium py-1.5 pl-3 text-right">Agents</th>
                <th scope="col" className="font-medium py-1.5 pl-3 text-right">% Comp</th>
              </tr>
            </thead>
            <tbody>
              {scopeHeatmap.map(row => {
                const seg = segments.find(s => s.key === row.key)!;
                const isFocused = filterBU === row.key && groupBy === 'businessUnit';
                const focusable = groupBy === 'businessUnit';
                return (
                  <tr
                    key={row.key}
                    {...(focusable ? rowButtonProps(() => setFilterBU(filterBU === row.key ? null : row.key), `Focus attention queue on ${row.key}`) : {})}
                    className={`border-t border-slate-100 ${focusable ? 'cursor-pointer hover:bg-slate-50/60 focus:outline-none focus:bg-blue-50/50' : ''} ${isFocused ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="py-1.5 pr-3 font-medium text-slate-700">{row.key}</td>
                    {row.cols.map(c => (
                      <td key={c.scope} className="py-1 px-1 text-center">
                        {c.count === 0
                          ? <span className="text-slate-200">·</span>
                          : <span className="inline-block w-full rounded px-1 py-0.5 text-white font-semibold tabular-nums" style={{ background: cellColor(c.pct) }} title={`${c.count} agents · ${c.pct}% compliant`}>{c.pct}</span>}
                      </td>
                    ))}
                    <td className="py-1.5 pl-3 text-right tabular-nums text-slate-600">{fmt(seg.total)}</td>
                    <td className={`py-1.5 pl-3 text-right tabular-nums font-semibold ${seg.pctCompliant >= 80 ? 'text-emerald-600' : seg.pctCompliant >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{seg.pctCompliant}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exception queue */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{isRegistry ? 'Coverage Gaps' : 'Attention Queue'}</h3>
            <p className="text-[10px] text-slate-400">
              {isRegistry ? 'Registered agents with governance gaps' : 'Top'} {queue.length} of {fmt(summary.needsAttention)} agents {isRegistry ? 'to remediate' : 'needing action'}{filterBU ? `, filtered to ${filterBU}` : ''}, ranked by risk × scope × incidents × policy gaps.
            </p>
          </div>
          {filterBU && (
            <button onClick={() => setFilterBU(null)} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">Clear filter</button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-5 text-left font-medium">Agent</th>
              <th scope="col" className="py-2 px-2 text-left font-medium">Business Unit</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Scope</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Env</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Governance</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Risk</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Incidents</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Why flagged</th>
            </tr>
          </thead>
          <tbody>
            {queue.slice(0, 25).map(a => {
              const reasons: string[] = [];
              if (a.governanceStatus === 'blocked') reasons.push('blocked');
              else if (a.governanceStatus === 'review_needed') reasons.push('review needed');
              if (!a.hasPolicy) reasons.push('no policy');
              if (a.openIncidents > 0) reasons.push(`${a.openIncidents} open incident${a.openIncidents > 1 ? 's' : ''}`);
              if (a.scopeLevel === 4 && a.environment === 'prod') reasons.push('prod full-agency');
              const t = riskTier(a.riskScore);
              return (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-2 px-5 font-medium text-slate-800">{a.name}</td>
                  <td className="py-2 px-2 text-slate-600">{a.businessUnit}</td>
                  <td className="py-2 px-2 text-center"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: AGENT_SCOPE_META[a.scopeLevel].color }}>L{a.scopeLevel}</span></td>
                  <td className="py-2 px-2 text-center text-[11px] text-slate-500">{a.environment}</td>
                  <td className="py-2 px-2 text-center"><span className={`text-[11px] font-semibold ${govMeta[a.governanceStatus].text}`}>{govMeta[a.governanceStatus].label}</span></td>
                  <td className="py-2 px-2 text-center"><span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${riskMeta[t].bg} ${riskMeta[t].text}`}>{a.riskScore}</span></td>
                  <td className="py-2 px-2 text-center tabular-nums text-slate-600">{a.openIncidents || '—'}</td>
                  <td className="py-2 px-3 text-[10px] text-slate-500">{reasons.join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {queue.length > 25 && (
          <div className="px-5 py-2.5 text-[10px] text-slate-400 border-t border-slate-100">
            Showing top 25 by attention score. {fmt(queue.length - 25)} more in queue · {fmt(summary.needsAttention - queue.length)} beyond the top 100 cap.
          </div>
        )}
      </div>

    </div>
  );
}
