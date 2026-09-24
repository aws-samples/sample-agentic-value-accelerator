/**
 * ModelComparison — Side-by-side model comparison view
 *
 * Compare 2-3 models on:
 * - Eval scores (safety, quality, latency)
 * - Risk profiles (inherent vs residual)
 * - Cost metrics
 * - Compliance status
 * - Use case fit
 */

import { useState, useMemo, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { MODELS, MODEL_DETAILS, tooltipStyle } from './mockData';
import { getRiskTierFromScore, getRiskTierColors } from './riskScoring';
import type { RiskTier } from './riskScoring';
import { Icon } from './icons';
import { useGovernModels } from './useGovernModels';
import type { AwsModelMetricsResponse, AwsModelRuntimeMetrics } from '../../api/client';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialModels?: string[];
}

// Model-family tokens for tolerant matching between a catalog/mock model and a
// CloudWatch by_model row (whose model_id may be a full ARN or inference id).
const FAMILY_RE = /haiku|sonnet|opus|nova|pro|lite|titan|llama|mistral|command|jamba/g;

// Find the live CloudWatch runtime row for a given model, tolerating ARN/id and
// short-id mismatches. Returns undefined when metrics are absent or non-live.
function findLiveMetric(
  modelId: string,
  modelName: string,
  metrics: AwsModelMetricsResponse | null,
): AwsModelRuntimeMetrics | undefined {
  if (!metrics?.live) return undefined;
  const rows = metrics.by_model;
  const idNorm = modelId.toLowerCase();
  let hit = rows.find(r => {
    const rid = r.model_id.toLowerCase();
    return rid === idNorm || rid.endsWith(idNorm) || rid.includes(idNorm) || idNorm.includes(rid);
  });
  if (hit) return hit;
  const toks = modelName.toLowerCase().match(FAMILY_RE) ?? [];
  if (toks.length > 0) {
    hit = rows.find(r => {
      const rid = r.model_id.toLowerCase();
      return toks.every(t => rid.includes(t));
    });
  }
  return hit;
}

// Map an average latency (ms) to a 0-100 "latency score" for the radar, where
// lower latency scores higher. Illustrative eval latency uses the same 0-100 axis.
const latencyMsToScore = (ms: number) => Math.max(0, Math.min(100, Math.round(100 - ms / 50)));

export default function ModelComparison({ isOpen, onClose, initialModels = [] }: Props) {
  const [selectedModels, setSelectedModels] = useState<string[]>(initialModels.slice(0, 3));

  // Live Bedrock model catalog + CloudWatch AWS/Bedrock runtime metrics.
  const { catalog, catalogLive, cost, metrics, metricsLive } = useGovernModels(7, 3);

  // Build unified model list: live catalog when available, mock fallback
  const unifiedModels = useMemo(() => {
    if (catalog?.live && catalog.models.length > 0) {
      const mockById = new Map(MODELS.map(m => [m.id, m]));
      const mockByNameNorm = new Map(MODELS.map(m => [m.name.toLowerCase().replace(/[^a-z0-9]/g, ''), m]));
      const costByModel = new Map((cost?.by_model ?? []).map(c => [c.model.toLowerCase(), c.amount]));

      return catalog.models.slice(0, 30).map((liveModel) => {
        const normName = liveModel.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const mockMatch = mockById.get(liveModel.model_id) ?? mockByNameNorm.get(normName);
        const modelCost = costByModel.get(liveModel.model_id.toLowerCase());
        return {
          id: liveModel.model_id,
          name: liveModel.name,
          provider: liveModel.provider,
          owner: mockMatch?.owner ?? 'Unassigned',
          // See ModelRegistry: Tier 3 is the most permissive tier in the scheme, so
          // defaulting to it silently classified every unreviewed catalog model as low risk.
          tier: mockMatch?.tier ?? null,
          // ModelRegistry derives this from real invocation counts; here it was a bare
          // 'Production', which asserts a lifecycle state for a model that has only ever
          // been listed in the catalog. 'Pending Review' is the conservative value of the
          // two the type allows - being in the catalog is not being in production.
          status: mockMatch?.status ?? 'Pending Review' as const,
          // See ModelRegistry: an eval score is the output of an evaluation, and 75 also fell
          // in the amber band so it read as a real middling result.
          evalScore: mockMatch?.evalScore ?? null,
          useCases: mockMatch?.useCases ?? 0,
          monthlyCost: modelCost ?? mockMatch?.monthlyCost ?? 0,
          lastValidated: mockMatch?.lastValidated ?? 'N/A',
          isLive: true,
        };
      });
    }
    return MODELS.map(m => ({ ...m, isLive: false }));
  }, [catalog, cost]);

  const showingLiveData = catalogLive && unifiedModels.some(m => m.isLive);

  const comparisonData = useMemo(() => {
    return selectedModels.map(id => {
      // Check both unified models (which may include live) and mock MODELS
      const unifiedModel = unifiedModels.find(m => m.id === id);
      const mockModel = MODELS.find(m => m.id === id);
      const model = unifiedModel ?? mockModel;
      // No fallback. This used to read `MODEL_DETAILS[id] ?? MODEL_DETAILS[MODELS[0]?.id]`
      // with the comment "Fallback to first model's details for live models" — so every live
      // model lacking its own governance record displayed the FIRST seeded model's record as
      // its own: risk profile, inherent/residual scores and tiers, controls, MRM compliance,
      // eval history, context window, pricing and revalidation status. Two consequences beyond
      // the display: several live models showed identical risk figures, and the Recommendation
      // below weights residualScore at 30% and avgCompliance at 20%, so a borrowed record
      // helped decide which model this screen recommends.
      const detail = MODEL_DETAILS[id];
      if (!model) return null;

      // Live CloudWatch AWS/Bedrock runtime signals for this model, when present.
      const liveRow = findLiveMetric(id, model.name, metrics);

      const latestEval = detail?.evalHistory?.[detail.evalHistory.length - 1];
      const mrmCompliance = detail?.mrmCompliance ?? [];
      // null, not 0: a model with no MRM record has no compliance rate, and 0 reads as
      // total non-compliance.
      const avgCompliance = mrmCompliance.length > 0
        ? Math.round(mrmCompliance.reduce((sum, fw) => {
            const pass = fw.controls.filter(c => c.status === 'pass').length;
            const total = fw.controls.filter(c => c.status !== 'not-applicable').length;
            return sum + (total > 0 ? (pass / total) * 100 : 0);
          }, 0) / mrmCompliance.length)
        : null;

      return {
        id,
        name: model.name,
        provider: model.provider,
        tier: model.tier,
        owner: model.owner,
        status: model.status,
        evalScore: model.evalScore,
        safety: latestEval?.safety ?? null,
        quality: latestEval?.quality ?? null,
        latency: latestEval?.latency ?? null,
        inherentScore: detail?.riskProfile?.inherentScore ?? null,
        residualScore: detail?.riskProfile?.residualScore ?? null,
        inherentTier: detail?.riskProfile?.inherentScore != null
          ? getRiskTierFromScore(detail.riskProfile.inherentScore)
          : null,
        residualTier: detail?.riskProfile?.residualScore != null
          ? getRiskTierFromScore(detail.riskProfile.residualScore)
          : null,
        controls: detail?.riskProfile?.controls ?? [],
        /** False when this model has no governance record at all — see the note above. */
        hasGovernanceRecord: !!detail,
        monthlyCost: model.monthlyCost,
        useCases: model.useCases,
        costPerUseCase: model.useCases > 0 ? Math.round(model.monthlyCost / model.useCases) : 0,
        avgCompliance,
        contextWindow: detail?.contextWindow ?? null,
        pricing: detail?.pricing ?? null,
        revalidationStatus: detail?.revalidation?.status ?? 'unknown',
        nextRevalidation: detail?.revalidation?.nextDue ?? 'N/A',
        // Live runtime signals (CloudWatch AWS/Bedrock); undefined when no live row.
        liveLatencyMs: liveRow?.avg_latency_ms,
        liveErrorRate: liveRow?.error_rate_pct,
        liveInvocations: liveRow?.invocations,
        hasLiveMetrics: !!liveRow,
      };
    }).filter(Boolean);
  }, [selectedModels, unifiedModels, metrics]);

  // Live runtime data present for at least one compared model.
  const anyRuntimeLive = metricsLive && comparisonData.some(m => m?.hasLiveMetrics);

  const radarData = useMemo(() => {
    const dimensions = ['Safety', 'Quality', 'Latency', 'Compliance', 'Cost Efficiency'];
    return dimensions.map(dim => {
      const point: Record<string, string | number> = { dimension: dim };
      comparisonData.forEach(model => {
        if (!model) return;
        // Only plot a dimension that was actually measured. Assigning 0 would draw the
        // model's radar hull collapsed to the centre on that axis, which reads as a measured
        // worst-case score rather than as absent data; omitting the key leaves a gap.
        switch (dim) {
          case 'Safety': if (model.safety != null) point[model.name] = model.safety; break;
          case 'Quality': if (model.quality != null) point[model.name] = model.quality; break;
          case 'Latency': {
            const v = model.liveLatencyMs != null ? latencyMsToScore(model.liveLatencyMs) : model.latency;
            if (v != null) point[model.name] = v;
            break;
          }
          case 'Compliance': if (model.avgCompliance != null) point[model.name] = model.avgCompliance; break;
          case 'Cost Efficiency': point[model.name] = Math.max(0, 100 - (model.monthlyCost / 500)); break;
        }
      });
      return point;
    });
  }, [comparisonData]);

  const riskComparisonData = useMemo(() => {
    return comparisonData.map(model => ({
      name: model?.name.split(' ')[0] || '',
      inherent: model?.inherentScore || 0,
      residual: model?.residualScore || 0,
    }));
  }, [comparisonData]);

  const colors = ['#3b82f6', '#10b981', '#f59e0b'];

  // Esc-to-close, matching the shared Drawer convention.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-blue-50">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Model Comparison</h2>
            <p className="text-sm text-slate-500">Compare up to 3 models side-by-side</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
            <Icon name="x-mark" className="w-5 h-5 text-slate-500" strokeWidth={2} />
          </button>
        </div>

        {/* Model Selector */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Select models:</span>
            {showingLiveData ? (
              <LiveDataBadge source="Bedrock" detail="Live model catalog from AWS Bedrock" />
            ) : (
              <MockDataBadge integration="Connect to AWS Bedrock for live model catalog" />
            )}
            <div className="flex gap-2 flex-wrap">
              {unifiedModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (selectedModels.includes(m.id)) {
                      setSelectedModels(prev => prev.filter(id => id !== m.id));
                    } else if (selectedModels.length < 3) {
                      setSelectedModels(prev => [...prev, m.id]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedModels.includes(m.id)
                      ? 'bg-blue-600 text-white'
                      : selectedModels.length >= 3
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                  }`}
                  disabled={!selectedModels.includes(m.id) && selectedModels.length >= 3}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Comparison Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {comparisonData.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              Select at least one model to compare
            </div>
          ) : (
            <div className="space-y-6">
              {/* Model Cards Row */}
              <div className={`grid gap-4 ${comparisonData.length === 1 ? 'grid-cols-1' : comparisonData.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {comparisonData.map((model, i) => model && (
                  <div key={model.id} className="bg-white rounded-xl border-2 p-4" style={{ borderColor: colors[i] }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{model.name}</div>
                        <div className="text-xs text-slate-500">{model.provider} · {model.owner}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {/* An untiered model used to fall through to the emerald Tier 3 style
                            and render an empty chip once `tier` became null. Neutral slate
                            and an explicit label: no tier is not the lowest tier. */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            model.tier === 'Tier 1' ? 'bg-rose-100 text-rose-700' :
                            model.tier === 'Tier 2' ? 'bg-amber-100 text-amber-700' :
                            model.tier === 'Tier 3' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-400'
                          }`}
                          title={model.tier ? undefined : 'No governance tier assigned. Tiering is a review decision recorded against the model.'}
                        >
                          {model.tier ?? 'Untiered'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          model.status === 'Production' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>{model.status}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div
                          className={`text-xl font-bold ${model.evalScore === null ? 'text-slate-400' : 'text-slate-900'}`}
                          title={model.evalScore === null ? 'Not evaluated — no evaluation has been run against this model.' : undefined}
                        >
                          {model.evalScore ?? '—'}
                        </div>
                        <div className="text-[9px] text-slate-500">Eval Score</div>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-xl font-bold text-emerald-600">${model.monthlyCost.toLocaleString()}</div>
                        <div className="text-[9px] text-slate-500">Monthly</div>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-xl font-bold text-blue-600">{model.useCases}</div>
                        <div className="text-[9px] text-slate-500">Use Cases</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-2 gap-6">
                {/* Radar Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">Multi-Dimension Comparison</h3>
                    {anyRuntimeLive && <LiveDataBadge source="CloudWatch" detail="Latency axis from live AWS/Bedrock metrics" />}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                      {comparisonData.map((model, i) => model && (
                        <Radar
                          key={model.id}
                          name={model.name}
                          dataKey={model.name}
                          stroke={colors[i]}
                          fill={colors[i]}
                          fillOpacity={0.2}
                        />
                      ))}
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Risk Comparison */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Risk Profile Comparison</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={riskComparisonData} layout="vertical" margin={{ left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="inherent" name="Inherent Risk" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="residual" name="Residual Risk" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detailed Comparison Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Detailed Comparison</h3>
                  {anyRuntimeLive ? (
                    <LiveDataBadge source="CloudWatch" detail="Latency, error rate & invocations from AWS/Bedrock metrics" />
                  ) : (
                    <MockDataBadge integration="CloudWatch AWS/Bedrock runtime metrics for live latency/error/invocations" />
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th scope="col" className="text-left px-4 py-3 text-slate-500 font-medium">Metric</th>
                      {comparisonData.map((model, i) => model && (
                        <th scope="col" key={model.id} className="text-center px-4 py-3 font-medium" style={{ color: colors[i] }}>
                          {model.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { label: 'Safety Score', key: 'safety', format: (v: number) => `${v}/100` },
                      { label: 'Quality Score', key: 'quality', format: (v: number) => `${v}/100` },
                      { label: 'Latency Score', key: 'latency', format: (v: number) => `${v}/100` },
                      { label: 'Avg Latency (live)', key: 'liveLatency', format: (_: unknown, m: typeof comparisonData[0]) => (m?.liveLatencyMs != null ? `${(m.liveLatencyMs / 1000).toFixed(2)}s` : '—') },
                      { label: 'Error Rate (live)', key: 'liveError', format: (_: unknown, m: typeof comparisonData[0]) => (m?.liveErrorRate != null ? `${m.liveErrorRate}%` : '—') },
                      { label: 'Invocations (live)', key: 'liveInvocations', format: (_: unknown, m: typeof comparisonData[0]) => (m?.liveInvocations != null ? m.liveInvocations.toLocaleString() : '—') },
                      { label: 'Inherent Risk', key: 'inherentTier', format: (v: string) => v },
                      { label: 'Residual Risk', key: 'residualTier', format: (v: string) => v },
                      { label: 'Risk Reduction', key: 'reduction', format: (_: unknown, m: typeof comparisonData[0]) => m ? `${Math.round(((m.inherentScore - m.residualScore) / m.inherentScore) * 100)}%` : '-' },
                      { label: 'Avg Compliance', key: 'avgCompliance', format: (v: number) => `${v}%` },
                      { label: 'Monthly Cost', key: 'monthlyCost', format: (v: number) => `$${v.toLocaleString()}` },
                      { label: 'Cost per Use Case', key: 'costPerUseCase', format: (v: number) => `$${v.toLocaleString()}` },
                      { label: 'Context Window', key: 'contextWindow', format: (v: string) => v },
                      { label: 'Input Price', key: 'pricing', format: (_: unknown, m: typeof comparisonData[0]) => m ? `$${m.pricing.input}/1K` : '-' },
                      { label: 'Output Price', key: 'pricing', format: (_: unknown, m: typeof comparisonData[0]) => m ? `$${m.pricing.output}/1K` : '-' },
                      { label: 'Revalidation', key: 'revalidationStatus', format: (v: string) => v === 'current' ? <><Icon name="check" className="w-3.5 h-3.5 inline-block align-middle mr-0.5" />Current</> : v === 'due-soon' ? '! Due Soon' : v === 'overdue' ? <><Icon name="x-mark" className="w-3.5 h-3.5 inline-block align-middle mr-0.5" />Overdue</> : v },
                      { label: 'Active Controls', key: 'controls', format: (_: unknown, m: typeof comparisonData[0]) => m ? `${m.controls.filter(c => c.status === 'active').length}/${m.controls.length}` : '-' },
                    ].map(row => (
                      <tr key={row.label} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-600 font-medium">{row.label}</td>
                        {comparisonData.map((model, i) => {
                          if (!model) return <td key={i} className="text-center px-4 py-2.5">-</td>;
                          const modelKeyedRows = ['reduction', 'pricing', 'controls', 'liveLatency', 'liveError', 'liveInvocations'];
                          const value = modelKeyedRows.includes(row.key)
                            ? row.format(null as never, model)
                            : row.format((model as Record<string, unknown>)[row.key] as never, model);

                          const isRiskTier = row.key === 'inherentTier' || row.key === 'residualTier';
                          const tierColors = isRiskTier ? getRiskTierColors((model as Record<string, unknown>)[row.key] as RiskTier) : null;

                          return (
                            <td key={model.id} className="text-center px-4 py-2.5">
                              {isRiskTier ? (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tierColors?.bg} ${tierColors?.text}`}>
                                  {value}
                                </span>
                              ) : (
                                <span className="text-slate-900">{value}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recommendation */}
              {comparisonData.length >= 2 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Recommendation</h3>
                  <div className="text-sm text-blue-800">
                    {(() => {
                      // Eval quality carries the heaviest weight in this ranking, so a model
                      // with no evaluation on record cannot be ranked - substituting a
                      // constant for it (this used to default to 75) meant the recommendation
                      // was driven by a placeholder for 40% of its weight. Rank only the
                      // models that have a real score, and say so when that is not enough.
                      const scorable = comparisonData.filter(
                        // Every weighted input must be real. residualScore carries 30% and
                        // avgCompliance 20%, and both come from the model's governance record
                        // — which live models without a MODEL_DETAILS entry do not have.
                        // Ranking on a missing record is what the removed
                        // `?? MODEL_DETAILS[MODELS[0].id]` fallback used to hide.
                        (m): m is typeof m & { evalScore: number; residualScore: number; avgCompliance: number } =>
                          !!m && m.evalScore !== null && m.residualScore !== null && m.avgCompliance !== null,
                      );
                      const skipped = comparisonData.filter(
                        m => m && (m.evalScore === null || m.residualScore === null || m.avgCompliance === null),
                      ).length;

                      if (scorable.length < 2) {
                        return (
                          <>
                            Not enough evaluated models to make a recommendation.
                            {skipped > 0 && ` ${skipped} of the ${comparisonData.length} models being compared are missing an evaluation score, a residual-risk score or a compliance record — together 90% of the weight in this ranking.`}
                            {' '}Add a governance record and run an evaluation to compare them.
                          </>
                        );
                      }

                      const sorted = [...scorable].sort((a, b) => {
                        const scoreA = a.evalScore * 0.4 + (100 - a.residualScore) * 0.3 + a.avgCompliance * 0.2 + (100 - a.monthlyCost / 500) * 0.1;
                        const scoreB = b.evalScore * 0.4 + (100 - b.residualScore) * 0.3 + b.avgCompliance * 0.2 + (100 - b.monthlyCost / 500) * 0.1;
                        return scoreB - scoreA;
                      });
                      const best = sorted[0];
                      if (!best) return null;
                      return (
                        <>
                          <strong>{best.name}</strong> scores highest when weighting eval quality (40%), risk reduction (30%), compliance (20%), and cost efficiency (10%).
                          {best.residualTier === 'Low' && ' It has achieved Low residual risk through effective controls.'}
                          {best.avgCompliance >= 90 && ' Strong compliance posture across all frameworks.'}
                          {/* skipped is now "missing any weighted input", not just eval score. */}
                          {skipped > 0 && (
                            <span className="block mt-1 text-[11px] text-blue-700/80">
                              Ranked {scorable.length} of {comparisonData.length} models. {skipped} excluded for
                              missing an evaluation score, a residual-risk score or a compliance record — they are
                              not ranked below the others, they are unranked.
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
