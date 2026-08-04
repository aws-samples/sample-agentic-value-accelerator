/**
 * ConcentrationRiskCard - Third-Party Concentration Risk Analysis
 *
 * Analyzes vendor dependency to identify concentration risk:
 * - Vendor dependency breakdown (% of agents/models per provider)
 * - Single-vendor exposure alerts (>70% = High, >50% = Medium)
 * - Concentration by capability (LLM, embeddings, tools)
 * - Exit strategy status per vendor
 *
 * Data sources:
 * - deploymentsApi.list() for deployments
 * - governModelsApi.catalog() for model providers
 * - AGENT_PROVIDER_CONFIG from mockData for provider info
 */

import { useState, useEffect, useMemo } from 'react';
import { deploymentsApi, governModelsApi } from '../../../api/client';
import type { Deployment } from '../../../types';
import type { AwsFoundationModelCatalog } from '../../../api/client';
import { AGENT_PROVIDER_CONFIG, AGENT_REGISTRY, type AgentProvider } from '../mockData';
import { Icon } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

type ConcentrationLevel = 'low' | 'medium' | 'high' | 'critical';
type ExitStrategyStatus = 'documented' | 'planned' | 'none';
type CapabilityType = 'llm' | 'embeddings' | 'tools' | 'infrastructure';

interface ProviderConcentration {
  provider: string;
  label: string;
  color: string;
  agentCount: number;
  agentPercentage: number;
  modelCount: number;
  modelPercentage: number;
  capabilities: CapabilityType[];
  exitStrategy: ExitStrategyStatus;
  concentrationLevel: ConcentrationLevel;
}

interface CapabilityConcentration {
  capability: CapabilityType;
  label: string;
  providers: { name: string; percentage: number }[];
  topProvider: string;
  topProviderPct: number;
  concentrationLevel: ConcentrationLevel;
}

// Exit strategy status for known vendors (mock data - would come from a governance DB)
const EXIT_STRATEGIES: Record<string, ExitStrategyStatus> = {
  'Anthropic': 'documented',
  'Amazon': 'documented',
  'AWS': 'documented',
  'OpenAI': 'planned',
  'Cohere': 'planned',
  'Meta': 'none',
  'Mistral': 'none',
  'AI21': 'none',
  'Stability': 'none',
};

// Map provider IDs to capability types
const PROVIDER_CAPABILITIES: Record<string, CapabilityType[]> = {
  'anthropic': ['llm'],
  'amazon': ['llm', 'embeddings', 'infrastructure'],
  'aws': ['llm', 'embeddings', 'infrastructure'],
  'openai': ['llm', 'embeddings'],
  'cohere': ['embeddings', 'llm'],
  'meta': ['llm'],
  'mistral': ['llm'],
  'ai21': ['llm'],
  'stability': ['llm'],
};

function getConcentrationLevel(percentage: number): ConcentrationLevel {
  if (percentage >= 70) return 'critical';
  if (percentage >= 50) return 'high';
  if (percentage >= 30) return 'medium';
  return 'low';
}

const concentrationColors: Record<ConcentrationLevel, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const exitStrategyColors: Record<ExitStrategyStatus, { bg: string; text: string; label: string }> = {
  documented: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Documented' },
  planned: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Planned' },
  none: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'None' },
};

const capabilityLabels: Record<CapabilityType, string> = {
  llm: 'Large Language Models',
  embeddings: 'Embeddings',
  tools: 'Tool Providers',
  infrastructure: 'Infrastructure',
};

interface ConcentrationRiskCardProps {
  className?: string;
}

export default function ConcentrationRiskCard({ className = '' }: ConcentrationRiskCardProps) {
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [modelCatalog, setModelCatalog] = useState<AwsFoundationModelCatalog | null>(null);
  const [liveDataAvailable, setLiveDataAvailable] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [deploymentsRes, modelsRes] = await Promise.allSettled([
          deploymentsApi.list(),
          governModelsApi.catalog(),
        ]);

        if (deploymentsRes.status === 'fulfilled') {
          setDeployments(deploymentsRes.value);
        }
        if (modelsRes.status === 'fulfilled') {
          setModelCatalog(modelsRes.value);
          setLiveDataAvailable(modelsRes.value.live === true);
        }
      } catch (err) {
        console.error('Failed to load concentration risk data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const { providerConcentrations, capabilityConcentrations, alerts } = useMemo(() => {
    // Count models by provider from live catalog or mock data
    const modelsByProvider: Record<string, number> = {};
    const providerLabels: Record<string, string> = {};

    if (modelCatalog?.models) {
      modelCatalog.models.forEach(model => {
        const provider = model.provider || 'Unknown';
        modelsByProvider[provider] = (modelsByProvider[provider] || 0) + 1;
        providerLabels[provider] = provider;
      });
    } else {
      // Fallback to mock data structure
      modelsByProvider['Anthropic'] = 3;
      modelsByProvider['Amazon'] = 2;
      providerLabels['Anthropic'] = 'Anthropic (Bedrock)';
      providerLabels['Amazon'] = 'Amazon (Bedrock)';
    }

    // Count agents by provider from registry and deployments
    const agentsByProvider: Record<string, number> = {};

    // From mock agent registry
    AGENT_REGISTRY.forEach(agent => {
      const provider = agent.provider || 'aws';
      const providerKey = AGENT_PROVIDER_CONFIG[provider]?.label || provider;
      agentsByProvider[providerKey] = (agentsByProvider[providerKey] || 0) + 1;
    });

    // From live deployments (add to the count)
    deployments.forEach(d => {
      // Infer provider from template
      const templateId = d.template_id?.toLowerCase() || '';
      let provider = 'AWS';
      if (templateId.includes('claude') || templateId.includes('anthropic')) {
        provider = 'Anthropic';
      } else if (templateId.includes('openai') || templateId.includes('gpt')) {
        provider = 'OpenAI';
      }
      agentsByProvider[provider] = (agentsByProvider[provider] || 0) + 1;
    });

    // Calculate totals
    const totalModels = Object.values(modelsByProvider).reduce((a, b) => a + b, 0) || 1;
    const totalAgents = Object.values(agentsByProvider).reduce((a, b) => a + b, 0) || 1;

    // Build provider concentration list
    const allProviders = new Set([...Object.keys(modelsByProvider), ...Object.keys(agentsByProvider)]);
    const concentrations: ProviderConcentration[] = Array.from(allProviders).map(provider => {
      const agentCount = agentsByProvider[provider] || 0;
      const modelCount = modelsByProvider[provider] || 0;
      const agentPercentage = Math.round((agentCount / totalAgents) * 100);
      const modelPercentage = Math.round((modelCount / totalModels) * 100);
      const maxPercentage = Math.max(agentPercentage, modelPercentage);

      // Map provider name to config
      const providerKey = Object.entries(AGENT_PROVIDER_CONFIG).find(
        ([, config]) => config.label.toLowerCase().includes(provider.toLowerCase())
      )?.[0] as AgentProvider | undefined;

      const config = providerKey ? AGENT_PROVIDER_CONFIG[providerKey] : null;

      return {
        provider,
        label: providerLabels[provider] || provider,
        color: config?.color || '#6366f1',
        agentCount,
        agentPercentage,
        modelCount,
        modelPercentage,
        capabilities: PROVIDER_CAPABILITIES[provider.toLowerCase()] || ['llm'],
        exitStrategy: EXIT_STRATEGIES[provider] || 'none',
        concentrationLevel: getConcentrationLevel(maxPercentage),
      };
    });

    // Sort by combined percentage (highest concentration first)
    concentrations.sort((a, b) =>
      Math.max(b.agentPercentage, b.modelPercentage) - Math.max(a.agentPercentage, a.modelPercentage)
    );

    // Build capability concentration analysis
    const capabilityProviders: Record<CapabilityType, Record<string, number>> = {
      llm: {},
      embeddings: {},
      tools: {},
      infrastructure: {},
    };

    concentrations.forEach(c => {
      c.capabilities.forEach(cap => {
        capabilityProviders[cap][c.provider] = c.modelCount + c.agentCount;
      });
    });

    const capConcentrations: CapabilityConcentration[] = (['llm', 'embeddings', 'infrastructure'] as CapabilityType[])
      .map(capability => {
        const providers = capabilityProviders[capability];
        const total = Object.values(providers).reduce((a, b) => a + b, 0) || 1;
        const sorted = Object.entries(providers)
          .map(([name, count]) => ({ name, percentage: Math.round((count / total) * 100) }))
          .sort((a, b) => b.percentage - a.percentage);

        const topProvider = sorted[0]?.name || 'N/A';
        const topProviderPct = sorted[0]?.percentage || 0;

        return {
          capability,
          label: capabilityLabels[capability],
          providers: sorted,
          topProvider,
          topProviderPct,
          concentrationLevel: getConcentrationLevel(topProviderPct),
        };
      });

    // Generate alerts
    const riskAlerts: { level: ConcentrationLevel; message: string; provider: string }[] = [];

    concentrations.forEach(c => {
      const maxPct = Math.max(c.agentPercentage, c.modelPercentage);
      if (maxPct >= 70) {
        riskAlerts.push({
          level: 'critical',
          message: `${c.provider} concentration at ${maxPct}% - single-vendor dependency risk`,
          provider: c.provider,
        });
      } else if (maxPct >= 50) {
        riskAlerts.push({
          level: 'high',
          message: `${c.provider} dependency at ${maxPct}% - consider diversification`,
          provider: c.provider,
        });
      }

      if (c.exitStrategy === 'none' && maxPct >= 30) {
        riskAlerts.push({
          level: 'high',
          message: `No exit strategy documented for ${c.provider} (${maxPct}% dependency)`,
          provider: c.provider,
        });
      }
    });

    return {
      providerConcentrations: concentrations,
      capabilityConcentrations: capConcentrations,
      alerts: riskAlerts,
    };
  }, [deployments, modelCatalog]);

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 rounded w-48" />
          <div className="h-32 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  const highRiskCount = alerts.filter(a => a.level === 'critical' || a.level === 'high').length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center">
            <Icon name="chart-bar" className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Concentration Risk Analysis</h3>
            <p className="text-[10px] text-slate-500">Vendor dependency and single-point-of-failure assessment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {liveDataAvailable ? (
            <LiveDataBadge source="Bedrock" detail="Model catalog from AWS Bedrock ListFoundationModels" />
          ) : (
            <MockDataBadge integration="Enable AWS Bedrock integration" />
          )}
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <div className={`rounded-lg border p-3 ${highRiskCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-2">
            <Icon
              name={highRiskCount > 0 ? 'exclamation-triangle' : 'bell-alert'}
              className={`w-4 h-4 mt-0.5 ${highRiskCount > 0 ? 'text-rose-600' : 'text-amber-600'}`}
            />
            <div className="flex-1">
              <div className={`text-xs font-semibold ${highRiskCount > 0 ? 'text-rose-800' : 'text-amber-800'}`}>
                {highRiskCount} High-Risk Concentration{highRiskCount !== 1 ? 's' : ''} Detected
              </div>
              <ul className="mt-1 space-y-0.5">
                {alerts.slice(0, 3).map((alert, i) => (
                  <li key={i} className={`text-[10px] ${alert.level === 'critical' ? 'text-rose-700' : 'text-amber-700'}`}>
                    {alert.message}
                  </li>
                ))}
                {alerts.length > 3 && (
                  <li className="text-[10px] text-slate-500">+{alerts.length - 3} more alerts</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Provider Dependency Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h4 className="text-xs font-semibold text-slate-800">Vendor Dependency Breakdown</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">% of agents and models per provider</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {providerConcentrations.map(provider => {
              const maxPct = Math.max(provider.agentPercentage, provider.modelPercentage);
              const isExpanded = expandedProvider === provider.provider;
              const colors = concentrationColors[provider.concentrationLevel];

              return (
                <div key={provider.provider}>
                  <button
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.provider)}
                    className="w-full px-4 py-3 hover:bg-slate-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: provider.color }}
                        />
                        <div>
                          <div className="text-xs font-medium text-slate-900">{provider.provider}</div>
                          <div className="text-[10px] text-slate-500">
                            {provider.agentCount} agents / {provider.modelCount} models
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                          {maxPct}%
                        </span>
                        <Icon
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          className="w-3.5 h-3.5 text-slate-400"
                        />
                      </div>
                    </div>

                    {/* Progress bars */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-400 w-12">Agents</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${provider.agentPercentage}%`,
                              backgroundColor: provider.color,
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500 w-8 text-right">{provider.agentPercentage}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-400 w-12">Models</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${provider.modelPercentage}%`,
                              backgroundColor: provider.color,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500 w-8 text-right">{provider.modelPercentage}%</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 bg-slate-50/30">
                      <div className="grid grid-cols-2 gap-3 text-[10px]">
                        <div>
                          <div className="text-slate-500 mb-1">Capabilities</div>
                          <div className="flex flex-wrap gap-1">
                            {provider.capabilities.map(cap => (
                              <span key={cap} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {capabilityLabels[cap]}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1">Exit Strategy</div>
                          <span className={`px-2 py-0.5 rounded ${exitStrategyColors[provider.exitStrategy].bg} ${exitStrategyColors[provider.exitStrategy].text}`}>
                            {exitStrategyColors[provider.exitStrategy].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Concentration by Capability */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h4 className="text-xs font-semibold text-slate-800">Concentration by Capability</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Single-vendor exposure per capability type</p>
          </div>
          <div className="p-4 space-y-4">
            {capabilityConcentrations.map(cap => {
              const colors = concentrationColors[cap.concentrationLevel];
              return (
                <div key={cap.capability}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon
                        name={cap.capability === 'llm' ? 'sparkles' : cap.capability === 'embeddings' ? 'cube' : 'server-stack'}
                        className="w-3.5 h-3.5 text-slate-400"
                      />
                      <span className="text-xs font-medium text-slate-700">{cap.label}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                      {cap.topProvider}: {cap.topProviderPct}%
                    </span>
                  </div>

                  {/* Stacked bar */}
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                    {cap.providers.map((p, i) => {
                      const providerData = providerConcentrations.find(pc => pc.provider === p.name);
                      return (
                        <div
                          key={p.name}
                          className="h-full transition-all relative group"
                          style={{
                            width: `${p.percentage}%`,
                            backgroundColor: providerData?.color || `hsl(${i * 60}, 60%, 50%)`,
                            opacity: 1 - i * 0.15,
                          }}
                          title={`${p.name}: ${p.percentage}%`}
                        >
                          {p.percentage >= 15 && (
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-medium">
                              {p.percentage}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {cap.providers.slice(0, 4).map(p => {
                      const providerData = providerConcentrations.find(pc => pc.provider === p.name);
                      return (
                        <div key={p.name} className="flex items-center gap-1 text-[9px] text-slate-500">
                          <div
                            className="w-2 h-2 rounded"
                            style={{ backgroundColor: providerData?.color || '#6366f1' }}
                          />
                          {p.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Exit Strategy Summary */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h4 className="text-xs font-semibold text-slate-800">Exit Strategy Status</h4>
          <p className="text-[10px] text-slate-500 mt-0.5">Vendor migration readiness and documented alternatives</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Vendor</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Dependency</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Exit Strategy</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Risk Level</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {providerConcentrations.filter(p => p.agentCount > 0 || p.modelCount > 0).map(provider => {
                const maxPct = Math.max(provider.agentPercentage, provider.modelPercentage);
                const colors = concentrationColors[provider.concentrationLevel];
                const exitColors = exitStrategyColors[provider.exitStrategy];

                let recommendation = 'Monitor';
                if (provider.exitStrategy === 'none' && maxPct >= 30) {
                  recommendation = 'Document exit strategy';
                } else if (maxPct >= 70) {
                  recommendation = 'Diversify dependencies';
                } else if (maxPct >= 50) {
                  recommendation = 'Evaluate alternatives';
                } else if (provider.exitStrategy !== 'documented') {
                  recommendation = 'Document migration path';
                }

                return (
                  <tr key={provider.provider} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: provider.color }} />
                        <span className="font-medium text-slate-900">{provider.provider}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-slate-600">{maxPct}%</span>
                      <span className="text-slate-400 ml-1">
                        ({provider.agentCount}A / {provider.modelCount}M)
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${exitColors.bg} ${exitColors.text}`}>
                        {exitColors.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${colors.bg} ${colors.text}`}>
                        {provider.concentrationLevel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{recommendation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
