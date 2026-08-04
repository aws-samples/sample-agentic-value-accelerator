import { useEffect, useState } from 'react';
import { llmGatewayApi, type GatewayInstance, type SpendReport } from '../../api/llmGateway';

export default function SpendDashboard({ instance }: { instance: GatewayInstance }) {
  const [data, setData] = useState<SpendReport | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setData(await llmGatewayApi.getSpend(instance.id, days));
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [instance.id, days]);

  if (loading) return <div className="text-sm text-slate-500">Loading spend…</div>;
  if (!data) return <div className="text-sm text-slate-500">Spend data unavailable.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Spend (last {data.days} days)</h3>
            <p className="text-xs text-slate-500 mt-0.5">From LiteLLM `/global/spend/report` — feeds Govern → FinOps.</p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
          >
            <option value={7}>7d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
          </select>
        </div>
        <div className="mt-4 text-4xl font-bold text-indigo-700">${data.total_usd.toFixed(2)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SpendList title="By virtual key" rows={data.by_key.map((r) => ({ name: r.key_alias || r.api_key || '—', spend: r.spend }))} />
        <SpendList title="By model" rows={data.by_model.map((r) => ({ name: r.model || '—', spend: r.spend }))} />
      </div>
    </div>
  );
}

function SpendList({ title, rows }: { title: string; rows: Array<{ name: string; spend: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.spend));
  return (
    <div className="bg-white/95 rounded-2xl border border-slate-200/70 p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">{title}</h4>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">No spend yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-mono truncate pr-2">{r.name}</span>
                <span className="font-semibold text-slate-700">${r.spend.toFixed(2)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-rose-500" style={{ width: `${(r.spend / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
