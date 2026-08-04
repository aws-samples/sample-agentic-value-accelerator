/**
 * MetricsTable — shared renderer for a list of ComputedMetrics (expected vs
 * actual + RAG). PROPOSED (see metricContract.ts). Used by the Data Governance
 * and FinOps metric panels so target-vs-actual + RAG render identically
 * everywhere.
 */
import { RAG_META, formatMetricValue as fmt, type ComputedMetric } from './metricContract';

export default function MetricsTable({
  metrics,
  groupBy,
}: {
  metrics: (ComputedMetric & { category?: string })[];
  groupBy?: boolean;
}) {
  const rows = metrics;
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-slate-500 uppercase tracking-wide bg-slate-50/50">
            <th scope="col" className="py-2 px-5 text-left font-medium">Metric</th>
            {groupBy && <th scope="col" className="py-2 px-2 text-left font-medium">Category</th>}
            <th scope="col" className="py-2 px-2 text-center font-medium">Target</th>
            <th scope="col" className="py-2 px-2 text-center font-medium">Actual</th>
            <th scope="col" className="py-2 px-2 text-center font-medium">Variance</th>
            <th scope="col" className="py-2 px-3 text-center font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.id} className="border-t border-slate-100">
              <td className="py-2 px-5 font-medium text-slate-700">{m.label}</td>
              {groupBy && <td className="py-2 px-2 text-[10px] text-slate-500">{m.category ?? '—'}</td>}
              <td className="py-2 px-2 text-center tabular-nums text-slate-500">{fmt(m.expected, m.unit)}</td>
              <td className="py-2 px-2 text-center tabular-nums font-semibold text-slate-800">{fmt(m.actual, m.unit)}</td>
              <td className="py-2 px-2 text-center tabular-nums text-slate-500">
                {m.variancePct == null ? '—' : `${m.variancePct > 0 ? '+' : ''}${Math.round(m.variancePct * 1000) / 10}%`}
              </td>
              <td className="py-2 px-3 text-center">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${RAG_META[m.rag].badge}`}>{RAG_META[m.rag].label}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
