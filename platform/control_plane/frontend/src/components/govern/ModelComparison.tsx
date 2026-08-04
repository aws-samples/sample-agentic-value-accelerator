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
import { useGovernModels } from './useGovernModels';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialModels?: string[];
}

export default function ModelComparison({ isOpen, onClose, initialModels = [] }: Props) {
  const [selectedModels, setSelectedModels] = useState<string[]>(initialModels.slice(0, 3));

  // Live Bedrock model catalog
  const { catalog, catalogLive, cost } = useGovernModels(7, 3);

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
          tier: mockMatch?.tier ?? 'Tier 3' as const,
          status: mockMatch?.status ?? 'Production' as const,
          evalScore: mockMatch?.evalScore ?? 75,
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
      const detail = MODEL_DETAILS[id] ?? MODEL_DETAILS[MODELS[0]?.id]; // Fallback to first model's details for live models
      if (!model) return null;

      const latestEval = detail.evalHistory[detail.evalHistory.length - 1];
      const mrmCompliance = detail.mrmCompliance || [];
      const avgCompliance = mrmCompliance.length > 0
        ? Math.round(mrmCompliance.reduce((sum, fw) => {
            const pass = fw.controls.filter(c => c.status === 'pass').length;
            const total = fw.controls.filter(c => c.status !== 'not-applicable').length;
            return sum + (total > 0 ? (pass / total) * 100 : 0);
          }, 0) / mrmCompliance.length)
        : 0;

      return {
        id,
        name: model.name,
        provider: model.provider,
        tier: model.tier,
        owner: model.owner,
        status: model.status,
        evalScore: model.evalScore,
        safety: latestEval?.safety || 0,
        quality: latestEval?.quality || 0,
        latency: latestEval?.latency || 0,
        inherentScore: detail.riskProfile?.inherentScore || 0,
        residualScore: detail.riskProfile?.residualScore || 0,
        inherentTier: getRiskTierFromScore(detail.riskProfile?.inherentScore || 0),
        residualTier: getRiskTierFromScore(detail.riskProfile?.residualScore || 0),
        controls: detail.riskProfile?.controls || [],
        monthlyCost: model.monthlyCost,
        useCases: model.useCases,
        costPerUseCase: model.useCases > 0 ? Math.round(model.monthlyCost / model.useCases) : 0,
        avgCompliance,
        contextWindow: detail.contextWindow,
        pricing: detail.pricing,
        revalidationStatus: detail.revalidation?.status || 'unknown',
        nextRevalidation: detail.revalidation?.nextDue || 'N/A',
      };
    }).filter(Boolean);
  }, [selectedModels, unifiedModels]);

  const radarData = useMemo(() => {
    const dimensions = ['Safety', 'Quality', 'Latency', 'Compliance', 'Cost Efficiency'];
    return dimensions.map(dim => {
      const point: Record<string, string | number> = { dimension: dim };
      comparisonData.forEach(model => {
        if (!model) return;
        switch (dim) {
          case 'Safety': point[model.name] = model.safety; break;
          case 'Quality': point[model.name] = model.quality; break;
          case 'Latency': point[model.name] = model.latency; break;
          case 'Compliance': point[model.name] = model.avgCompliance; break;
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
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          model.tier === 'Tier 1' ? 'bg-rose-100 text-rose-700' :
                          model.tier === 'Tier 2' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{model.tier}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          model.status === 'Production' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>{model.status}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-xl font-bold text-slate-900">{model.evalScore}</div>
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
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Multi-Dimension Comparison</h3>
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
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Detailed Comparison</h3>
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
                      { label: 'Inherent Risk', key: 'inherentTier', format: (v: string) => v },
                      { label: 'Residual Risk', key: 'residualTier', format: (v: string) => v },
                      { label: 'Risk Reduction', key: 'reduction', format: (_: unknown, m: typeof comparisonData[0]) => m ? `${Math.round(((m.inherentScore - m.residualScore) / m.inherentScore) * 100)}%` : '-' },
                      { label: 'Avg Compliance', key: 'avgCompliance', format: (v: number) => `${v}%` },
                      { label: 'Monthly Cost', key: 'monthlyCost', format: (v: number) => `$${v.toLocaleString()}` },
                      { label: 'Cost per Use Case', key: 'costPerUseCase', format: (v: number) => `$${v.toLocaleString()}` },
                      { label: 'Context Window', key: 'contextWindow', format: (v: string) => v },
                      { label: 'Input Price', key: 'pricing', format: (_: unknown, m: typeof comparisonData[0]) => m ? `$${m.pricing.input}/1K` : '-' },
                      { label: 'Output Price', key: 'pricing', format: (_: unknown, m: typeof comparisonData[0]) => m ? `$${m.pricing.output}/1K` : '-' },
                      { label: 'Revalidation', key: 'revalidationStatus', format: (v: string) => v === 'current' ? '✓ Current' : v === 'due-soon' ? '! Due Soon' : v === 'overdue' ? '✗ Overdue' : v },
                      { label: 'Active Controls', key: 'controls', format: (_: unknown, m: typeof comparisonData[0]) => m ? `${m.controls.filter(c => c.status === 'active').length}/${m.controls.length}` : '-' },
                    ].map(row => (
                      <tr key={row.label} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-600 font-medium">{row.label}</td>
                        {comparisonData.map((model, i) => {
                          if (!model) return <td key={i} className="text-center px-4 py-2.5">-</td>;
                          const value = row.key === 'reduction' || row.key === 'pricing' || row.key === 'controls'
                            ? row.format(null as never, model)
                            : row.format((model as Record<string, unknown>)[row.key] as never, model);

                          const isRiskTier = row.key === 'inherentTier' || row.key === 'residualTier';
                          const tierColors = isRiskTier ? getRiskTierColors(value as RiskTier) : null;

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
                      const sorted = [...comparisonData].sort((a, b) => {
                        if (!a || !b) return 0;
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
