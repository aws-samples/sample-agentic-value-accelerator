/**
 * RiskMetricsPanel — surfaces Govern Risk's contribution to the shared metric
 * contract inside Risk Management. PROPOSED (see metricContract.ts).
 *
 * Shows the board-level Aggregate Risk Score with its Go/No-Go gate context
 * (the number Plan consumes), plus per-risk residual / velocity / leading-
 * indicator rows. Everything is computed once via the contract, so these values
 * match whatever Plan's scorecard shows.
 */
import StatCard from '../StatCard';
import { riskContribution, type RiskMetricRow } from './riskMetrics';
import { RAG_META, ragToStatCardVariant, type ComputedMetric } from './metricContract';

const velocityMeta: Record<string, { label: string; cls: string }> = {
  immediate: { label: 'Immediate', cls: 'bg-rose-100 text-rose-700' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
  slow: { label: 'Slow', cls: 'bg-slate-100 text-slate-600' },
};

export default function RiskMetricsPanel() {
  // Static "as of" — this surface reads the register; a real integration would
  // stamp generatedAt from the data source. Kept deterministic for now.
  const contribution = riskContribution('register');
  const aggregate = contribution.metrics.find(m => m.id === 'risk.aggregate-score') as ComputedMetric;
  const residualPosture = contribution.metrics.find(m => m.id === 'risk.residual-posture') as ComputedMetric;
  // Only the per-category rows carry `residual`; exclude the two aggregate metrics.
  const rows = contribution.metrics.filter(
    m => m.id !== 'risk.aggregate-score' && m.id !== 'risk.residual-posture',
  ) as RiskMetricRow[];
  const goGatePass = (aggregate.actual ?? 0) <= (aggregate.expected ?? 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Risk Metrics</h3>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">shared scorecard feed</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-3xl">
        Risk Management owns these metrics; the Plan scorecard reads the Aggregate Risk Score as one of its three Go/No-Go gates. Aggregate = mean of raw Likelihood×Impact scores (gate ≤ {aggregate.expected}); residual = raw × (1 − control effectiveness), banded against each risk's threshold.
      </p>

      {/* Board-level aggregate + gate */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Aggregate Risk Score" value={aggregate.actual ?? '—'} variant={ragToStatCardVariant(aggregate.rag)} sub={`gate ≤ ${aggregate.expected} · raw L×I mean`} />
        <StatCard label="Residual (post-control)" value={residualPosture.actual ?? '—'} variant={ragToStatCardVariant(residualPosture.rag)} sub="after mitigations" />
        <StatCard label="Go/No-Go (Risk gate)" value={goGatePass ? 'PASS' : 'FAIL'} variant={goGatePass ? 'success' : 'danger'} sub="feeds Plan verdict" />
        <StatCard label="Over Threshold" value={rows.filter(r => r.rag === 'red').length} variant={rows.some(r => r.rag === 'red') ? 'danger' : 'muted'} sub="residual > threshold" />
      </div>

      {/* Per-risk residual rows */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">Residual Risk by Category</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-5 text-left font-medium">Risk</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Residual</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Threshold</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Control Eff.</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Velocity</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Leading Indicator</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">RAG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const vm = r.velocity ? velocityMeta[r.velocity] : null;
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 px-5 font-medium text-slate-700">{r.label}</td>
                  <td className="py-2 px-2 text-center tabular-nums font-semibold text-slate-800">{r.residual}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-slate-500">{r.threshold}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-slate-500">{Math.round(r.controlEffectiveness * 100)}%</td>
                  <td className="py-2 px-2 text-center">{vm ? <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${vm.cls}`}>{vm.label}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2 px-3 text-[10px] text-slate-500">{r.leadingIndicator ?? <span className="text-slate-300">—</span>}</td>
                  <td className="py-2 px-3 text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${RAG_META[r.rag].badge}`}>{RAG_META[r.rag].label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
