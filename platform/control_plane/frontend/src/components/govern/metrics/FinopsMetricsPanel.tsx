/**
 * FinopsMetricsPanel — FinOps's operational-cost contribution to the shared
 * metric contract. PROPOSED (see metricContract.ts).
 *
 * FinOps owns operational cost/efficiency; the executive scorecard reads the
 * Cost Reduction headline. Investment-appraisal financials (NPV/IRR/DCF) stay
 * in Plan and are not shown here.
 */
import StatCard from '../StatCard';
import MetricsTable from './MetricsTable';
import { finopsContribution, costEfficiencyHeadline } from './finopsMetrics';
import { ragToStatCardVariant } from './metricContract';

export default function FinopsMetricsPanel() {
  const contribution = finopsContribution('finops');
  const rows = contribution.metrics;
  const headline = costEfficiencyHeadline(rows);

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Cost & Efficiency Metrics</h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">shared scorecard feed</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl">
        FinOps owns operational cost & efficiency; the executive scorecard reads Cost Reduction from AI. These reconcile with Plan's financial sheet. Investment-appraisal metrics (NPV, IRR, payback) remain in Plan's business case.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Cost Reduction from AI" value={headline.actual != null ? `${Math.round(headline.actual * 1000) / 10}%` : '—'} variant={ragToStatCardVariant(headline.rag)} sub={`target ${Math.round((headline.target ?? 0) * 100)}%`} />
        <StatCard label="Metrics Tracked" value={rows.length} variant="info" />
        <StatCard label="On Track" value={rows.filter(r => r.rag === 'green').length} variant="success" />
        <StatCard label="Off Track" value={rows.filter(r => r.rag === 'red').length} variant={rows.some(r => r.rag === 'red') ? 'danger' : 'muted'} />
      </div>

      <MetricsTable metrics={rows} />
    </div>
  );
}
