/**
 * TokenEconomics — cost-per-useful-work view, live from CloudWatch AWS/Bedrock.
 *
 * Turns raw token telemetry into the governance signals that matter:
 *   - tokens per invocation (verbosity / prompt weight)
 *   - prompt-cache hit rate (cache-read ÷ (cache-read + fresh input) tokens)
 *   - cost per 1k tokens (real Bedrock spend ÷ tokens, when both are live)
 *
 * All derived from the govern_models runtime metrics + govern_cost by-model, both
 * already live. Honest live badge; graceful empty state when metrics are absent.
 */
import { useMemo } from 'react';
import { useGovernModels } from '../useGovernModels';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;
const shortModel = (m: string) => m.replace(/^[a-z]+\./, '').replace(/-v\d+(:\d+)?$/, '');

// Normalize a model id so a CloudWatch metric row lines up with a Cost Explorer row.
const normKey = (s: string) =>
  s.toLowerCase().replace(/^(us|eu|apac|us-gov)\./, '').replace(/^[a-z]+\./, '')
    .replace(/-v\d+(:\d+)?$/, '').replace(/[.:_-]+/g, ' ').replace(/\d{6,}/g, '').trim();

export default function TokenEconomics() {
  const { loading, metrics, cost, metricsLive } = useGovernModels(7, 3);

  const rows = useMemo(() => {
    const costByKey = new Map((cost?.by_model ?? []).map(c => [normKey(c.model), c.amount]));
    return (metrics?.by_model ?? []).map(m => {
      const totalTokens = m.input_tokens + m.output_tokens;
      const freshIn = m.input_tokens + m.cache_read_tokens; // cache-read replaces fresh input
      const cacheHit = freshIn > 0 ? (m.cache_read_tokens / freshIn) * 100 : 0;
      const tokensPerInv = m.invocations > 0 ? totalTokens / m.invocations : 0;
      const spend = costByKey.get(normKey(m.model_id));
      // Billable tokens ≈ input + output (cache-read is discounted, but keep the
      // ratio honest against total observed tokens); cost-per-1k on billable input+output.
      const costPer1k = spend != null && totalTokens > 0 ? (spend / (totalTokens / 1000)) : undefined;
      return {
        id: m.model_id,
        name: shortModel(m.model_id),
        invocations: m.invocations,
        totalTokens,
        tokensPerInv,
        cacheHit,
        cacheReadTokens: m.cache_read_tokens,
        spend,
        costPer1k,
      };
    }).sort((a, b) => b.totalTokens - a.totalTokens);
  }, [metrics, cost]);

  const fleet = useMemo(() => {
    const inv = rows.reduce((s, r) => s + r.invocations, 0);
    const tok = rows.reduce((s, r) => s + r.totalTokens, 0);
    const cacheRead = rows.reduce((s, r) => s + r.cacheReadTokens, 0);
    const freshIn = rows.reduce((s, r) => s + (r.totalTokens - r.cacheReadTokens), 0) + cacheRead; // approx denom
    return {
      tokensPerInv: inv > 0 ? tok / inv : 0,
      cacheHit: (cacheRead + freshIn) > 0 ? (cacheRead / (cacheRead + freshIn)) * 100 : 0,
      totalTokens: tok,
      anyCache: cacheRead > 0,
    };
  }, [rows]);

  const hasData = rows.length > 0 && rows.some(r => r.totalTokens > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Token Economics</h2>
            {metricsLive ? <LiveDataBadge /> : <MockDataBadge integration="CloudWatch AWS/Bedrock token metrics" />}
          </div>
          <p className="text-sm text-slate-500">
            Cost per useful work — tokens per invocation, prompt-cache hit rate, and cost per 1k tokens, from real CloudWatch AWS/Bedrock telemetry (trailing {metrics?.window_days ?? 7}d).
          </p>
        </div>
      </div>

      {/* Fleet tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{hasData ? compact(fleet.totalTokens) : '—'}</div>
          <div className="text-xs text-slate-500">Total tokens</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-indigo-600 tabular-nums">{hasData ? Math.round(fleet.tokensPerInv).toLocaleString() : '—'}</div>
          <div className="text-xs text-slate-500">Avg tokens / invocation</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 p-4">
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">{hasData && fleet.anyCache ? `${fleet.cacheHit.toFixed(1)}%` : '—'}</div>
          <div className="text-xs text-slate-500">Prompt-cache hit rate</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{rows.some(r => r.costPer1k != null) ? `$${(rows.filter(r => r.costPer1k != null).reduce((s, r) => s + r.costPer1k!, 0) / Math.max(1, rows.filter(r => r.costPer1k != null).length)).toFixed(4)}` : '—'}</div>
          <div className="text-xs text-slate-500">Avg cost / 1k tokens</div>
        </div>
      </div>

      {/* Per-model table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Per-Model Token Economics</h3>
          {metricsLive && <LiveDataBadge />}
        </div>
        {loading ? (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : hasData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                  <th scope="col" className="font-medium pb-2">Model</th>
                  <th scope="col" className="font-medium pb-2 text-right">Invocations</th>
                  <th scope="col" className="font-medium pb-2 text-right">Total tokens</th>
                  <th scope="col" className="font-medium pb-2 text-right">Tokens / inv</th>
                  <th scope="col" className="font-medium pb-2 text-right">Cache hit</th>
                  <th scope="col" className="font-medium pb-2 text-right">Cost / 1k</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    <td className="py-2 pr-2 font-medium text-slate-800">{r.name}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{r.invocations.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{compact(r.totalTokens)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{Math.round(r.tokensPerInv).toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">
                      {r.cacheReadTokens > 0
                        ? <span className="text-emerald-600 font-semibold">{r.cacheHit.toFixed(1)}%</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{r.costPer1k != null ? `$${r.costPer1k.toFixed(4)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 mt-2">
              Cache hit = cache-read ÷ (cache-read + fresh input) tokens; prompt caching cuts input cost on repeated context. Cost/1k uses real Bedrock spend where a model matches a Cost Explorer line.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500 mt-0.5">●</span>
            <div>
              <div className="font-medium text-slate-600">No token metrics yet</div>
              <div className="text-[11px] mt-0.5">{metrics?.note ?? 'CloudWatch AWS/Bedrock has no token metrics for this account yet — invoke a model to populate this.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
