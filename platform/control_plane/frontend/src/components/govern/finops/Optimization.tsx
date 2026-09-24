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
import { useEffect, useMemo, useState } from 'react';
import { useAwsCostDetail, useRightsizing } from '../useAwsCost';
import { COMMITMENTS, OPTIMIZATION_OPPS, TOTAL_POTENTIAL_SAVINGS } from '../mockData';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import {
  governCostApi,
  type AwsSavingsPlansPurchaseResponse,
  type AwsRIPurchaseResponse,
  type AwsSavingsPlansUtilizationResponse,
} from '../../../api/client';

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

  // Rightsizing — same live EC2 rightsizing feed the FinOps dashboard already renders.
  const { data: rightsizing, live: rightsizingLive } = useRightsizing('AmazonEC2', 'FOURTEEN_DAYS');

  // Real Cost Explorer commitment purchase recommendations (Savings Plans + Reserved
  // Instances) plus current Savings Plans utilization. These concrete "buy this"
  // recs supersede the heuristic by-model commitment planner when live.
  const [spRecs, setSpRecs] = useState<AwsSavingsPlansPurchaseResponse | null>(null);
  const [riRecs, setRiRecs] = useState<AwsRIPurchaseResponse | null>(null);
  const [spUtil, setSpUtil] = useState<AwsSavingsPlansUtilizationResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    governCostApi.savingsPlansRecommendations()
      .then(d => { if (!cancelled) setSpRecs(d); })
      .catch(() => { if (!cancelled) setSpRecs(null); });
    governCostApi.riRecommendations()
      .then(d => { if (!cancelled) setRiRecs(d); })
      .catch(() => { if (!cancelled) setRiRecs(null); });
    governCostApi.savingsPlansUtilization()
      .then(d => { if (!cancelled) setSpUtil(d); })
      .catch(() => { if (!cancelled) setSpUtil(null); });
    return () => { cancelled = true; };
  }, []);

  const spRecList = spRecs?.live ? spRecs.recommendations : [];
  const riRecList = riRecs?.live ? riRecs.recommendations : [];
  const purchaseRecsLive = !!(spRecs?.live || riRecs?.live);
  const totalPurchaseSavings =
    (spRecs?.live ? spRecs.total_estimated_monthly_savings : 0) +
    (riRecs?.live ? riRecs.total_estimated_monthly_savings : 0);

  const live = !!(byModel?.live || anomalies?.live || purchaseRecsLive || rightsizingLive);

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
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">Commitment Planner</div>
              {purchaseRecsLive
                ? <LiveDataBadge source="Cost Explorer" detail="Savings Plans & Reserved Instance purchase recommendations" />
                : commitments
                  ? <LiveDataBadge source="Cost Explorer" detail="Commitment candidates derived from live by-model spend" />
                  : <MockDataBadge integration="Enable Cost Explorer for real Savings Plans / RI recommendations" />}
            </div>
            <span className="text-[11px] font-semibold text-emerald-600">
              {usd0(purchaseRecsLive ? totalPurchaseSavings : commitments ? totalCommitSavings : COMMITMENTS.reduce((s, c) => s + c.savingsIfCommitted, 0))}/mo saveable
            </span>
          </div>
          {purchaseRecsLive ? (
            <div className="space-y-3">
              {spUtil?.live && (
                <div className="flex items-center justify-between text-[11px] bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-slate-500">Current Savings Plans utilization</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{spUtil.overall_utilization_pct.toFixed(1)}%</span>
                </div>
              )}
              {spRecList.length === 0 && riRecList.length === 0 ? (
                <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-emerald-50 rounded-lg px-4 py-3">
                  <span className="text-emerald-500">*</span>
                  <span>No Savings Plans or Reserved Instance purchase recommendations — usage is already well-covered, or Cost Explorer needs ~30 days of steady usage to recommend a commitment.</span>
                </div>
              ) : (
                <>
                  {spRecList.length > 0 && (
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1.5">Savings Plans — real Cost Explorer purchase recommendations.</p>
                      <div className="space-y-2">
                        {spRecList.slice(0, 4).map((r, i) => (
                          <div key={`sp-${i}`} className="border border-slate-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-sm font-semibold text-slate-900">{r.savings_plans_type.replace(/_/g, ' ')}</div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">{r.estimated_savings_percentage.toFixed(0)}% off</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                              <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Commit / hr</div><div className="text-slate-700 font-medium tabular-nums mt-0.5">${r.hourly_commitment.toFixed(2)}</div></div>
                              <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Est. savings</div><div className="text-emerald-600 font-semibold tabular-nums mt-0.5">-{usd0(r.estimated_monthly_savings)}/mo</div></div>
                              <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Term</div><div className="text-slate-700 font-medium mt-0.5">{r.term_in_years.replace(/_/g, ' ').toLowerCase()}</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {riRecList.length > 0 && (
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1.5">Reserved Instances — real Cost Explorer purchase recommendations.</p>
                      <div className="space-y-2">
                        {riRecList.slice(0, 3).map((r, i) => (
                          <div key={`ri-${i}`} className="border border-slate-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-sm font-semibold text-slate-900">{r.instance_type} <span className="text-[10px] font-normal text-slate-400">×{r.recommended_quantity} · {r.region}</span></div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">{r.estimated_savings_percentage.toFixed(0)}% off</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                              <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">On-demand / mo</div><div className="text-slate-700 font-medium tabular-nums mt-0.5">{usd0(r.current_monthly_on_demand)}</div></div>
                              <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Est. savings</div><div className="text-emerald-600 font-semibold tabular-nums mt-0.5">-{usd0(r.estimated_monthly_savings)}/mo</div></div>
                              <div><div className="text-slate-400 uppercase tracking-widest text-[9px]">Term</div><div className="text-slate-700 font-medium mt-0.5">{r.term_in_years.replace(/_/g, ' ').toLowerCase()}</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : loading && !commitments ? (
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
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">Optimization Opportunities</div>
              {anomalyOpps
                ? <LiveDataBadge source="Cost Explorer" detail="Highest-impact spend anomalies to investigate or cap" />
                : <MockDataBadge integration="Real Cost Explorer anomalies drive these once data flows" />}
            </div>
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

      {/* Rightsizing — live EC2 recommendations (same feed as the FinOps dashboard) */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">Rightsizing Recommendations</div>
            {rightsizingLive ? <LiveDataBadge source="Cost Explorer" /> : <MockDataBadge integration="Enable AWS Cost Explorer Rightsizing" />}
            <span className="text-[11px] text-slate-400">underutilized EC2 to downsize or terminate</span>
          </div>
          {(rightsizing?.total_estimated_savings ?? 0) > 0 && (
            <span className="text-[11px] font-semibold text-emerald-600">{usd0(rightsizing?.total_estimated_savings ?? 0)}/mo saveable</span>
          )}
        </div>
        {!rightsizingLive ? (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500">*</span>
            <span>{rightsizing?.note ?? 'Connect AWS Cost Explorer with Rightsizing enabled to surface underutilized-instance recommendations.'}</span>
          </div>
        ) : (rightsizing?.recommendations.length ?? 0) === 0 ? (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-emerald-50 rounded-lg px-4 py-3">
            <span className="text-emerald-500">*</span>
            <span>No rightsizing recommendations — your instances are well-sized.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th className="font-medium pb-2 pr-4">Instance</th>
                  <th className="font-medium pb-2">Current Type</th>
                  <th className="font-medium pb-2">Action</th>
                  <th className="font-medium pb-2 text-right">Current Cost</th>
                  <th className="font-medium pb-2 text-right">Savings</th>
                </tr>
              </thead>
              <tbody>
                {(rightsizing?.recommendations ?? []).slice(0, 5).map((r, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-slate-50' : ''}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-900">{r.instance_name || r.instance_id}</div>
                      {r.instance_name && <div className="text-[10px] text-slate-400">{r.instance_id}</div>}
                    </td>
                    <td className="py-2 text-slate-600">{r.instance_type}</td>
                    <td className="py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        r.recommendation_type === 'Terminate' ? 'bg-rose-50 text-rose-700' :
                        r.recommendation_type === 'Downsize' ? 'bg-amber-50 text-amber-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {r.recommendation_type}
                      </span>
                      {r.target && <span className="ml-2 text-slate-500">{'->'} {r.target.instance_type}</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{usd0(r.current_monthly_cost)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-emerald-600">{usd0(r.target?.estimated_monthly_savings ?? r.current_monthly_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(rightsizing?.recommendations.length ?? 0) > 5 && (
              <div className="mt-2 text-[11px] text-slate-400">Showing 5 of {rightsizing?.recommendations.length} recommendations</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
