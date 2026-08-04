/**
 * Optimization — spend-reduction opportunities, grounded in real signals.
 *
 * Distinct from ROI (value realized): this is the action side — where money can be
 * taken OUT without losing value. Grounded, in priority order:
 *  1. LIVE signals — real Bedrock by-model spend (commitment/right-size candidates)
 *     + real cost anomalies (investigate-the-spike opportunities), from Cost Explorer.
 *  2. MOCK — illustrative COMMITMENTS + OPTIMIZATION_OPPS when nothing live.
 *
 * The commitment planner keys off concentration: a model with high, steady
 * on-demand spend is the strongest Provisioned-Throughput / commitment candidate.
 */
import { useMemo } from 'react';
import { useAwsCostDetail } from '../useAwsCost';
import { COMMITMENTS, OPTIMIZATION_OPPS, TOTAL_POTENTIAL_SAVINGS } from '../mockData';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Heuristic commitment discount for steady, concentrated Bedrock spend (illustrative
// rate — real Provisioned Throughput / savings-plan terms vary by model & region).
const COMMIT_DISCOUNT = 0.22;

const shortModel = (m: string) => m.replace(/^[a-z]+\./, '').replace(/-(mantle|standard).*$/, '');

const commitStatusBg: Record<string, string> = {
  Recommended: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Evaluating: 'bg-amber-50 text-amber-700 border-amber-200',
  Active: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function Optimization() {
  const { byModel, anomalies, loading } = useAwsCostDetail(30, 3, 60, 3);

  const live = !!(byModel?.live || anomalies?.live);

  // Commitment candidates from real by-model spend: top models by spend, each a
  // Provisioned-Throughput / commitment candidate with an estimated saving.
  const commitments = useMemo(() => {
    if (!byModel?.live || byModel.by_model.length === 0) return null;
    const monthlyFactor = 30 / 90; // by-model window is 3mo; approximate monthly
    return byModel.by_model
      .filter(m => m.amount > 0)
      .slice(0, 5)
      .map(m => {
        const monthly = m.amount * monthlyFactor;
        const saving = monthly * COMMIT_DISCOUNT;
        return {
          model: shortModel(m.model),
          monthlySpend: monthly,
          savingsIfCommitted: saving,
          status: monthly > 100 ? 'Recommended' : 'Evaluating',
        };
      });
  }, [byModel]);

  const totalCommitSavings = useMemo(
    () => (commitments ? commitments.reduce((s, c) => s + c.savingsIfCommitted, 0) : 0),
    [commitments],
  );

  // Anomaly-driven opportunities: each real spike is an "investigate / cap" action.
  const anomalyOpps = useMemo(() => {
    if (!anomalies?.live || anomalies.anomalies.length === 0) return null;
    return anomalies.anomalies
      .slice()
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5)
      .map((a, i) => ({
        id: `anom-${i}`,
        rec: `Investigate ${a.service ?? 'spend'} spike (${a.start}${a.end && a.end !== a.start ? `–${a.end}` : ''})`,
        savings: Math.round(a.impact),
        effort: 'Low',
        risk: a.score >= 0.8 ? 'High signal' : 'Medium signal',
      }));
  }, [anomalies]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Optimization</h2>
            {live ? <LiveDataBadge /> : <MockDataBadge integration="Real by-model spend + anomalies drive these once Cost Explorer data flows" />}
          </div>
          <p className="text-sm text-slate-500">
            {live
              ? 'Spend-reduction opportunities from real Bedrock by-model spend (commitments) and Cost Explorer anomalies.'
              : 'Illustrative — commitment planning and right-sizing opportunities. Grounds in live spend once available.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Commitment planner */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900">Commitment Planner</div>
            <span className="text-[11px] font-semibold text-emerald-600">
              {usd0(commitments ? totalCommitSavings : COMMITMENTS.reduce((s, c) => s + c.savingsIfCommitted, 0))}/mo saveable
            </span>
          </div>
          {loading && !commitments ? (
            <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
          ) : commitments ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 mb-1">Top Bedrock models by spend — each a Provisioned-Throughput / commitment candidate ({Math.round(COMMIT_DISCOUNT * 100)}% est. discount on steady usage).</p>
              {commitments.map(c => (
                <div key={c.model} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold text-slate-900">{c.model}</div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${commitStatusBg[c.status]}`}>{c.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-slate-400 uppercase tracking-widest text-[9px]">Spend / mo</div>
                      <div className="text-slate-700 font-medium tabular-nums mt-0.5">{usd0(c.monthlySpend)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-widest text-[9px]">If committed</div>
                      <div className="text-emerald-600 font-semibold tabular-nums mt-0.5">-{usd0(c.savingsIfCommitted)}/mo</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-widest text-[9px]">Share</div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(c.monthlySpend / (commitments[0]?.monthlySpend || 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {COMMITMENTS.map(c => (
                <div key={c.model} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold text-slate-900">{c.model}</div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${commitStatusBg[c.status]}`}>{c.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Mode</div><div className="text-slate-700 font-medium mt-0.5">{c.mode}</div></div>
                    <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Spend / mo</div><div className="text-slate-700 font-medium tabular-nums mt-0.5">${c.monthlySpend}</div></div>
                    <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">If committed</div><div className="text-emerald-600 font-semibold tabular-nums mt-0.5">-${c.savingsIfCommitted}/mo</div></div>
                    <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Break-even</div><div className="text-slate-700 font-medium mt-0.5">{c.breakEvenMo > 0 ? `${c.breakEvenMo} mo` : '—'}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optimization opportunities */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900">Optimization Opportunities</div>
            <span className="text-[11px] font-semibold text-emerald-600">
              {anomalyOpps ? `${usd0(anomalyOpps.reduce((s, o) => s + o.savings, 0))} flagged` : `$${TOTAL_POTENTIAL_SAVINGS}/mo potential`}
            </span>
          </div>
          {anomalyOpps ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 mb-1">From real Cost Explorer anomalies — highest-impact spend spikes to investigate or cap.</p>
              {anomalyOpps.map(o => (
                <div key={o.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50/60 transition-colors">
                  <div className="text-lg font-bold text-rose-600 w-16 flex-shrink-0 text-right">{usd0(o.savings)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-700 leading-tight">{o.rec}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="text-slate-400">Effort: <span className="text-slate-600 font-medium">{o.effort}</span></span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">Signal: <span className="text-slate-600 font-medium">{o.risk}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {OPTIMIZATION_OPPS.map(o => (
                <div key={o.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50/60 transition-colors">
                  <div className="text-lg font-bold text-emerald-600 w-16 flex-shrink-0 text-right">${o.savings}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-700 leading-tight">{o.rec}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="text-slate-400">Effort: <span className="text-slate-600 font-medium">{o.effort}</span></span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">Risk: <span className="text-slate-600 font-medium">{o.risk}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
