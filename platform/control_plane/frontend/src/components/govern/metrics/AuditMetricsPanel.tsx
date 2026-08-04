/**
 * AuditMetricsPanel — Audit & Incidents' contribution to the shared metric
 * contract. PROPOSED (see metricContract.ts).
 *
 * Shows the incident KPIs (MTTR, open incidents, resolution rate) that feed the
 * scorecard, PLUS the audit-event evidence feed — presented as a log, not as
 * metrics, because it is the examiner trail the metrics are computed from.
 *
 * Uses live audit events from governAuditApi when available; otherwise falls
 * back to mock data.
 */
import StatCard from '../StatCard';
import MetricsTable from './MetricsTable';
import { auditContribution, auditEvidenceFeed } from './auditMetrics';
import { ragToStatCardVariant, type ComputedMetric } from './metricContract';
import { useAuditEvents, useIsAuditLive } from '../auditLog';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

const sevMeta: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
  critical: 'bg-rose-100 text-rose-700',
};

export default function AuditMetricsPanel({ showTrail = true }: { showTrail?: boolean } = {}) {
  // Use live audit events when backend is available
  const liveEvents = useAuditEvents();
  const isLive = useIsAuditLive();

  // Pass live events to compute metrics from real data
  const contribution = auditContribution('audit-incidents', isLive ? liveEvents : undefined);
  const rows = contribution.metrics;
  const mttr = rows.find(r => r.id === 'audit.mttr') as ComputedMetric;
  const evidence = auditEvidenceFeed(6, isLive ? liveEvents : undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Incident & Audit Metrics</h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">shared scorecard feed</span>
        {isLive ? (
          <LiveDataBadge source="Audit API" detail={`Metrics computed from ${liveEvents.length} live events`} />
        ) : (
          <MockDataBadge integration="governAuditApi" />
        )}
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl">
        Audit &amp; Incidents owns these operational KPIs; the executive scorecard reads Incident Resolution Time. The audit-event feed below is the examiner trail — evidence the risk and incident metrics are computed from, not a metric itself.
      </p>

      {/* Incident KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Incident Resolution (MTTR)" value={`${mttr.actual} min`} variant={ragToStatCardVariant(mttr.rag)} sub={`target ≤ ${mttr.expected} min`} />
        {rows.filter(r => r.id !== 'audit.mttr').map(r => (
          <StatCard
            key={r.id}
            label={r.label}
            value={r.unit === '%' ? `${Math.round((r.actual ?? 0) * 1000) / 10}%` : `${r.actual}`}
            variant={ragToStatCardVariant(r.rag)}
          />
        ))}
      </div>

      <MetricsTable metrics={rows} />

      {/* Audit-event evidence feed (log, not metrics). Hidden when the full
          filterable timeline is shown elsewhere (e.g. a dedicated Audit Trail tab). */}
      {showTrail && (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Audit Trail</span>
          <span className="text-[9px] text-slate-400">examiner evidence · append-only</span>
        </div>
        <div className="divide-y divide-slate-100">
          {evidence.map(e => (
            <div key={e.id} className="px-5 py-2.5 flex items-start gap-3">
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${sevMeta[e.severity] ?? sevMeta.low}`}>{e.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-slate-700">{e.summary}</div>
                <div className="text-[10px] text-slate-400">{e.ts} · {e.category} · {e.actor}{e.evidence ? ` · ${e.evidence}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
