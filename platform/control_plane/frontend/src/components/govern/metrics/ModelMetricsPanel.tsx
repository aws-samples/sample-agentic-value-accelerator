/**
 * ModelMetricsPanel — Model Management's contribution to the shared metric
 * contract. PROPOSED (see metricContract.ts).
 *
 * Surfaces the model-governance metrics (accuracy, drift, bias, versioning)
 * that feed the scorecard. Model Management owns these; the executive scorecard
 * reads production model accuracy as the board-tier headline.
 */
import StatCard from '../StatCard';
import MetricsTable from './MetricsTable';
import { modelContribution, modelAccuracyHeadline } from './modelMetrics';
import { ragToStatCardVariant, formatMetricValue } from './metricContract';

export default function ModelMetricsPanel() {
  const contribution = modelContribution('model-registry');
  const rows = contribution.metrics;
  const accuracy = modelAccuracyHeadline(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Model Governance Metrics</h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">shared scorecard feed</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl">
        Model Management owns these model-governance metrics; the executive scorecard reads production model accuracy. Distinct from Data Governance's data-quality metrics — model accuracy/drift/bias/versioning land with their true owner.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Model Accuracy (prod avg)" value={formatMetricValue(accuracy.actual, '%')} variant={ragToStatCardVariant(accuracy.rag)} sub={`target ${Math.round((accuracy.expected ?? 0) * 100)}%`} />
        <StatCard label="Metrics Tracked" value={rows.length} variant="info" />
        <StatCard label="On Track" value={rows.filter(r => r.rag === 'green').length} variant="success" />
        <StatCard label="Below Target" value={rows.filter(r => r.rag !== 'green').length} variant={rows.some(r => r.rag === 'red') ? 'danger' : 'muted'} />
      </div>

      <MetricsTable metrics={rows} />
    </div>
  );
}
