/**
 * GuardrailsCoverage — per-guardrail usage & block ratios, live from Bedrock.
 *
 * The guardrail COUNT is already surfaced elsewhere; this adds the missing
 * dimension: for each active guardrail, its features, invocations, and
 * blocked/allowed/anonymized ratios — all from the already-live useGuardrailMetrics
 * hook (bedrock:ListGuardrails + per-guardrail CloudWatch metrics). No new API.
 * Honest: 'Live' when a guardrail has real metrics, quiet when it has none yet.
 */
import { useMemo } from 'react';
import { useGuardrailMetrics } from './useGuardrailMetrics';
import { LiveDataBadge } from './DataSourceIndicator';

const featureColor: Record<string, string> = {
  Content: 'bg-rose-100 text-rose-700',
  PII: 'bg-violet-100 text-violet-700',
  Topics: 'bg-amber-100 text-amber-700',
  Words: 'bg-blue-100 text-blue-700',
  Grounding: 'bg-emerald-100 text-emerald-700',
};

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
};

export default function GuardrailsCoverage() {
  const { loading, guardrails, metrics, activeCount, totalCount } = useGuardrailMetrics();

  const rows = useMemo(
    () => guardrails.filter(g => g.status !== 'deleted').sort((a, b) => (b.metrics?.total_invocations ?? 0) - (a.metrics?.total_invocations ?? 0)),
    [guardrails],
  );
  const anyMetrics = metrics.totalInvocations > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 shadow-sm bg-white/80 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-slate-900">Guardrails Coverage</h3>
          {anyMetrics && <LiveDataBadge />}
          <span className="text-[11px] text-slate-400">per-guardrail usage &amp; block ratios · Bedrock Guardrails</span>
        </div>
        <span className="text-[11px] font-medium text-slate-600 tabular-nums">{activeCount}/{totalCount} active</span>
      </div>

      {/* Aggregate block-rate strip (only when there's real usage) */}
      {anyMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div><div className="text-xl font-bold text-slate-900 tabular-nums">{metrics.totalInvocations.toLocaleString()}</div><div className="text-[11px] text-slate-500">Invocations (24h)</div></div>
          <div><div className="text-xl font-bold text-rose-600 tabular-nums">{metrics.blockedCount.toLocaleString()}</div><div className="text-[11px] text-slate-500">Blocked</div></div>
          <div><div className="text-xl font-bold text-violet-600 tabular-nums">{metrics.anonymizedCount.toLocaleString()}</div><div className="text-[11px] text-slate-500">Anonymized</div></div>
          <div><div className="text-xl font-bold text-slate-900 tabular-nums">{metrics.blockRate.toFixed(1)}%</div><div className="text-[11px] text-slate-500">Block rate</div></div>
        </div>
      )}

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map(g => {
            const m = g.metrics;
            const inv = m?.total_invocations ?? 0;
            const blocked = m?.blocked_count ?? 0;
            const allowed = m?.allowed_count ?? 0;
            const anon = m?.anonymized_count ?? 0;
            const blockPct = inv > 0 ? (blocked / inv) * 100 : 0;
            const anonPct = inv > 0 ? (anon / inv) * 100 : 0;
            const allowPct = inv > 0 ? (allowed / inv) * 100 : 0;
            return (
              <div key={g.template_id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{g.name}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadge[g.status] ?? 'bg-slate-100 text-slate-600'}`}>{g.status}</span>
                    {g.features.map(f => (
                      <span key={f} className={`text-[9px] px-1.5 py-0.5 rounded ${featureColor[f] ?? 'bg-slate-100 text-slate-600'}`}>{f}</span>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums">{inv > 0 ? `${inv.toLocaleString()} invocations (24h)` : 'no usage in 24h'}</span>
                </div>
                {inv > 0 ? (
                  <>
                    <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                      <div className="bg-rose-500" style={{ width: `${blockPct}%` }} title={`Blocked ${blocked}`} />
                      <div className="bg-violet-400" style={{ width: `${anonPct}%` }} title={`Anonymized ${anon}`} />
                      <div className="bg-emerald-400" style={{ width: `${allowPct}%` }} title={`Allowed ${allowed}`} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Blocked {blockPct.toFixed(1)}%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />Anonymized {anonPct.toFixed(1)}%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Allowed {allowPct.toFixed(1)}%</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-400">Deployed but idle in the last 24h — no invocations to report yet.</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No guardrails configured</div>
            <div className="text-[11px] mt-0.5">Create a Bedrock guardrail in the Secure module to track per-guardrail block ratios here.</div>
          </div>
        </div>
      )}
    </div>
  );
}
