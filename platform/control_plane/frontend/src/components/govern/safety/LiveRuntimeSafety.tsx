/**
 * LiveRuntimeSafety — LIVE runtime safety telemetry for the AI Safety surface.
 *
 * Aggregates the account's real Bedrock model-invocation logs (CloudWatch Logs
 * Insights) into a safety view: guardrail-intervention rate over generation calls,
 * stop-reason mix, per-model interventions, throughput, and a daily trend.
 *
 * Aggregates only — no raw prompts/responses or caller identities (those live in
 * the invocation records but are never surfaced). Distinct from the published
 * benchmarks below it, which are illustrative. Honest live badge + empty state.
 */
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { governInvocationSafetyApi, type AwsInvocationSafetyResponse } from '../../../api/client';
import LiveHeader from '../LiveHeader';
import { usePollingKey } from '../usePollingKey';
import { LiveDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

// Stop reasons that indicate a safety stop, coloured accordingly.
const reasonStyle: Record<string, string> = {
  guardrail_intervened: 'bg-rose-100 text-rose-700',
  end_turn: 'bg-emerald-100 text-emerald-700',
  max_tokens: 'bg-amber-100 text-amber-700',
  stop_sequence: 'bg-slate-100 text-slate-600',
  tool_use: 'bg-blue-100 text-blue-700',
  content_filtered: 'bg-rose-100 text-rose-700',
};
const prettyReason = (r: string) => r.replace(/_/g, ' ');

export default function LiveRuntimeSafety() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsInvocationSafetyResponse | null>(null);
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — keep telemetry on screen while refreshing.
    governInvocationSafetyApi.telemetry(7)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;
  const maxStop = Math.max(...(data?.stop_reasons ?? []).map(s => s.count), 1);
  const trend = (data?.trend ?? []).map(t => ({ ...t, label: t.date.slice(5) })); // MM-DD

  return (
    <div className="mb-8 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · runtime safety telemetry"
        caption={`real Bedrock invocation outcomes · last ${data?.window_days ?? 7}d · aggregates only (no prompt/response content)`}
        autoRefresh
        right={live ? (
          <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{data!.intervention_rate_pct}% intervened</span>
        ) : undefined}
      />

      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-400">Querying invocation logs…</div>
      ) : live ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Invocations" value={data!.total_calls.toLocaleString()} sub={`${data!.window_days}d · all calls`} />
            <StatCard label="Generation calls" value={data!.completion_calls.toLocaleString()} variant="info" sub="produced a stop reason" />
            <StatCard label="Guardrail intervened" value={data!.guardrail_intervened.toLocaleString()} variant="success" sub={`${data!.intervention_rate_pct}% of generations`} />
            <StatCard label="Tokens in / out" value={`${compact(data!.input_tokens)} / ${compact(data!.output_tokens)}`} variant="muted" sub="over the window" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily trend — calls vs interventions */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold text-slate-900">Daily calls &amp; interventions</h4>
                <LiveDataBadge />
              </div>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trend} margin={{ left: 0, right: 8, top: 6 }}>
                    <defs>
                      <linearGradient id="clr-calls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="clr-intv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} width={32} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="calls" name="Calls" stroke="#6366f1" strokeWidth={2} fill="url(#clr-calls)" />
                    <Area type="monotone" dataKey="guardrail_intervened" name="Intervened" stroke="#10b981" strokeWidth={2} fill="url(#clr-intv)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-[11px] text-slate-400">No daily data in the window.</div>
              )}
            </div>

            {/* Stop-reason distribution */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-semibold text-slate-900">Stop reasons</h4>
                <LiveDataBadge />
                <span className="text-[10px] text-slate-400">how generations ended</span>
              </div>
              <div className="space-y-2">
                {data!.stop_reasons.map(s => (
                  <div key={s.reason} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-40 shrink-0 font-medium px-1.5 py-0.5 rounded ${reasonStyle[s.reason] ?? 'bg-slate-100 text-slate-600'}`}>{prettyReason(s.reason)}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.max(2, (s.count / maxStop) * 100)}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums font-semibold text-slate-700">{s.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-2">
                <span className="font-semibold text-rose-600">guardrail intervened</span> = a configured guardrail blocked or modified the response.
              </div>
            </div>
          </div>

          {/* Per-model interventions */}
          {data!.by_model.length > 0 && (
            <div className="mt-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold text-slate-900">By model</h4>
                <LiveDataBadge />
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                    <th scope="col" className="font-medium pb-2">Model</th>
                    <th scope="col" className="font-medium pb-2 text-right">Calls</th>
                    <th scope="col" className="font-medium pb-2 text-right">Guardrail intervened</th>
                    <th scope="col" className="font-medium pb-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.by_model.map((m, i) => {
                    const rate = m.calls > 0 ? Math.round((m.guardrail_intervened / m.calls) * 100) : 0;
                    return (
                      <tr key={`${m.model_id}-${i}`} className={i > 0 ? 'border-t border-slate-100' : ''}>
                        <td className="py-1.5 pr-2 font-medium text-slate-800 max-w-[280px] truncate" title={m.model_id}>{m.model_id}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">{m.calls.toLocaleString()}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">{m.guardrail_intervened.toLocaleString()}</td>
                        <td className={`py-1.5 text-right tabular-nums font-semibold ${rate >= 50 ? 'text-rose-600' : rate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{rate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No live runtime telemetry</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Enable Bedrock model-invocation logging to CloudWatch to see runtime safety telemetry here.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
