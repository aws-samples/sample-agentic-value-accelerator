/**
 * DataQualityMetricsPanel — Data Governance's contribution to the shared metric
 * contract, surfaced for observability. PROPOSED (see metricContract.ts).
 *
 * Data Governance owns these; the Command Center / Plan scorecard read the
 * composite "Data Quality Health". Model-governance metrics live in Model
 * Management, not here.
 */
import StatCard from '../StatCard';
import MetricsTable from './MetricsTable';
import { dataContribution, type DataQualityRow } from './dataMetrics';
import { ragToStatCardVariant, type ComputedMetric } from './metricContract';

export default function DataQualityMetricsPanel() {
  const contribution = dataContribution('data-governance');
  const composite = contribution.metrics.find(m => m.id === 'data.quality-composite') as ComputedMetric;
  const rows = contribution.metrics.filter(m => m.id !== 'data.quality-composite') as DataQualityRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Data Quality Metrics</h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">shared scorecard feed</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl">
        Data Governance owns these quality, lineage, and PII-protection metrics; the executive scorecard reads the composite Data Quality Health. Each is measured against its target with shared RAG banding, giving cross-module observability.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Data Quality Health" value={composite.actual != null ? `${Math.round(composite.actual * 1000) / 10}%` : '—'} variant={ragToStatCardVariant(composite.rag)} sub={`target ${Math.round((composite.expected ?? 0) * 100)}%`} />
        <StatCard label="Metrics Tracked" value={rows.length} variant="info" />
        <StatCard label="Below Target" value={rows.filter(r => r.rag !== 'green').length} variant={rows.some(r => r.rag === 'red') ? 'danger' : 'warning'} />
        <StatCard label="Critical Gaps" value={rows.filter(r => r.rag === 'red').length} variant={rows.some(r => r.rag === 'red') ? 'danger' : 'muted'} sub=">15% below target" />
      </div>

      <MetricsTable metrics={rows} groupBy />
    </div>
  );
}
