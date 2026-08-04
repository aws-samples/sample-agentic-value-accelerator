/**
 * ScorecardStrip — the executive board-tier roll-up for the Command Center.
 * PROPOSED (see metricContract.ts).
 *
 * Reads the board-tier metrics from every module's contribution THROUGH THE
 * SHARED CONTRACT (risk, data, finops) — no recomputation — so the numbers are
 * identical to what each owning module shows and to what Plan's scorecard reads.
 * Each tile deep-links into its owning module for the detail, giving the
 * seamless cross-module navigation.
 *
 * LIVE DATA: Uses useLiveMetrics hook to wire actual values from AWS APIs
 * (CloudWatch, Guardrails, SecurityHub, Config, Cost Explorer) into the
 * scorecard. Metrics with live data show "[LIVE]" in their source field.
 */
import { Link } from 'react-router-dom';
import { useLiveMetrics, aggregateBoardMetrics, computeGoNoGo } from './useLiveMetrics';
import { LiveDataBadge } from '../DataSourceIndicator';
import {
  formatMetricValue,
  type ComputedMetric,
  type OwningModule,
} from './metricContract';

/** Where each owning module's detail lives — the deep-link target. */
const MODULE_LINK: Record<OwningModule, { to: string; label: string }> = {
  risk:   { to: '/govern/risk?tab=dashboard',   label: 'Risk Management' },
  data:   { to: '/govern/data/quality',          label: 'Data Governance' },
  finops: { to: '/govern/finops',                label: 'Cost & FinOps' },
  model:  { to: '/govern/models',                label: 'Model Management' },
  audit:  { to: '/govern/audit',                 label: 'Audit & Incidents' },
  plan:   { to: '/plan',                          label: 'Plan' },
};

const fmtValue = (m: ComputedMetric): string => formatMetricValue(m.actual, m.unit);

/** Display order of module groups on the scorecard (governance-first). */
const GROUP_ORDER: OwningModule[] = ['risk', 'audit', 'data', 'finops', 'model', 'plan'];

interface ScorecardStripProps {
  compact?: boolean;
}

export default function ScorecardStrip({ compact = false }: ScorecardStripProps) {
  // Use the live metrics hook to get AWS-backed actuals
  const { loading, contributions, liveDataSources } = useLiveMetrics();

  const boardMetrics = aggregateBoardMetrics(contributions);

  // Health summary across the board tiles.
  const onTrack = boardMetrics.filter(m => m.rag === 'green').length;
  const needAttention = boardMetrics.filter(m => m.rag === 'amber' || m.rag === 'red').length;
  const critical = boardMetrics.filter(m => m.rag === 'red').length;

  // Go/No-Go verdict from the shared computation
  const { verdict: goNoGo, reason: verdictReason } = computeGoNoGo(boardMetrics);
  const verdict = goNoGo === 'go' ? 'GO' : goNoGo === 'review' ? 'CONDITIONAL' : 'NO GO';
  const verdictStyle =
    verdict === 'GO' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : verdict === 'CONDITIONAL' ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-rose-50 border-rose-200 text-rose-700';

  // Count live vs illustrative metrics
  const liveCount = boardMetrics.filter(m => m.source?.includes('[LIVE]')).length;

  // Deliberate governance-first ordering (no vertical grouping — a single
  // compact fill-width strip that matches the rest of the Command Center).
  const ordered = [...boardMetrics].sort(
    (a, b) => GROUP_ORDER.indexOf(a.owningModule) - GROUP_ORDER.indexOf(b.owningModule),
  );

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading scorecard metrics...</span>
        </div>
      </div>
    );
  }

  // Compact mode: just show the Go/No-Go and key metrics inline
  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{onTrack} on track</span>
            <span className="flex items-center gap-1 text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{needAttention} attention</span>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${verdictStyle}`} title={verdictReason}>{verdict}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ordered.slice(0, 3).map(m => {
            const link = MODULE_LINK[m.owningModule];
            return (
              <Link key={m.id} to={link.to} className="rounded-lg border border-slate-200/60 bg-white/60 p-2 hover:border-blue-300/70 transition-all">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${m.rag === 'green' ? 'bg-emerald-500' : m.rag === 'amber' ? 'bg-amber-500' : m.rag === 'red' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                  <span className="text-[8px] text-slate-400 uppercase truncate">{link.label}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900">{fmtValue(m)}</div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      {/* Compact header + at-a-glance health + Go/No-Go */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Value &amp; Governance Scorecard</h2>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">board-tier</span>
          {liveDataSources.length > 0 && (
            <span className="flex items-center gap-1">
              <LiveDataBadge />
              <span className="text-[9px] text-slate-400">{liveCount}/{boardMetrics.length} live</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500" />{onTrack} on track</span>
          <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-500" />{needAttention} need attention</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${verdictStyle}`} title={verdictReason}>Go/No-Go: {verdict}</span>
        </div>
      </div>

      {/* Single compact fill-width strip — module shown as a per-tile tag. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {ordered.map(m => {
          const link = MODULE_LINK[m.owningModule];
          return (
            <Link key={m.id} to={link.to} className="group block rounded-lg border border-slate-200/60 bg-white p-2.5 hover:border-blue-300/70 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${m.rag === 'green' ? 'bg-emerald-500' : m.rag === 'amber' ? 'bg-amber-500' : m.rag === 'red' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wide truncate">{link.label}</span>
              </div>
              <div className="text-lg font-semibold text-slate-900 leading-tight">{fmtValue(m)}</div>
              <div className="text-[10px] text-slate-500 leading-tight truncate" title={m.label}>{m.label}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
