/**
 * ConcentrationRiskCard - Third-Party Concentration Risk Analysis
 *
 * Measures vendor concentration on two axes that are kept STRICTLY SEPARATE
 * because their denominators are incommensurable:
 *
 *   1. Model axis - share of the live AWS Bedrock foundation-model catalog.
 *   2. Agent axis - share of the agent inventory (currently a demo registry).
 *
 * The two are never averaged, max()'d, or summed into a single "dependency %".
 * A vendor's model share says nothing about its agent share and vice versa.
 *
 * Capability concentration is attributed PER MODEL from that model's own real
 * `output_modalities` array, so each model is counted once per capability it
 * actually provides. Agents carry no modality data and are excluded from the
 * capability axis entirely.
 *
 * Severity is assigned only when the population is large enough to support the
 * claim (MIN_POPULATION_FOR_SEVERITY) and the underlying inventory is live.
 * A vendor that is 1-of-1 in a demo inventory is reported as "not scored",
 * never as "100% critical".
 *
 * Data sources:
 * - governModelsApi.catalog()  LIVE Bedrock ListFoundationModels -> model + capability axes
 * - deploymentsApi.list()      live deployment inventory -> agent axis
 * - AGENT_REGISTRY (mockData)  demo agent inventory -> agent axis (demo, unscored)
 * - EXIT_STRATEGY_RECORDS      demo; no governance system of record is connected
 */

import { useState, useEffect, useMemo } from 'react';
import { deploymentsApi, governModelsApi } from '../../../api/client';
import type { Deployment } from '../../../types';
import type { AwsFoundationModelCatalog } from '../../../api/client';
import { AGENT_PROVIDER_CONFIG, AGENT_REGISTRY } from '../mockData';
import { Icon } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { RegionCoverageBadge } from '../RegionCoverageBadge';

type ConcentrationLevel = 'low' | 'medium' | 'high' | 'critical';
type ExitStrategyStatus = 'documented' | 'planned' | 'none' | 'unknown';
type CapabilityType = 'llm' | 'embeddings' | 'image' | 'video' | 'speech';
type AxisKind = 'models' | 'agents';
type UnscoredReason = 'no-inventory' | 'population-too-small' | 'demo-inventory';

/**
 * A population smaller than this cannot support a concentration claim.
 * Without this guard a vendor that is 1-of-1 (or 2-of-2) reads "100% critical",
 * which is a denominator artifact rather than a governance finding.
 */
const MIN_POPULATION_FOR_SEVERITY = 10;

/** One vendor's share of ONE axis. Never combined with another axis. */
interface ShareMetric {
  count: number;
  total: number;
  /** Unrounded share. Used for bar widths and threshold tests. null when total === 0. */
  exactPct: number | null;
  /** Rounded share, for display only. null when total === 0. */
  pct: number | null;
  /** null when the share exists but cannot honestly be scored. */
  level: ConcentrationLevel | null;
  unscoredReason: UnscoredReason | null;
}

interface ProviderConcentration {
  provider: string;
  color: string;
  axis: AxisKind;
  share: ShareMetric;
  /** Real capabilities derived from model output modalities. Empty on the agent axis. */
  capabilities: CapabilityType[];
  exitStrategy: ExitStrategyStatus;
}

interface CapabilityProviderShare {
  name: string;
  count: number;
  exactPct: number;
  pct: number;
  color: string;
}

interface CapabilityConcentration {
  capability: CapabilityType;
  label: string;
  /** Number of models that actually emit this output modality. */
  population: number;
  providers: CapabilityProviderShare[];
  top: { name: string; count: number; pct: number } | null;
  level: ConcentrationLevel | null;
  unscoredReason: UnscoredReason | null;
}

interface RiskAlert {
  level: ConcentrationLevel;
  message: string;
  provenance: 'live-models' | 'demo';
}

/**
 * Exit-strategy records. Demo data - there is no connected governance system of
 * record. Keys are normalized provider names (lowercased, whitespace-collapsed)
 * so that the real Bedrock provider strings ("Mistral AI", "Stability AI",
 * "AI21 Labs") resolve instead of silently falling through.
 * A provider absent from this table is 'unknown' (no record), NOT 'none'.
 */
const EXIT_STRATEGY_RECORDS: Record<string, ExitStrategyStatus> = {
  'anthropic': 'documented',
  'amazon': 'documented',
  'aws': 'documented',
  'openai': 'planned',
  'cohere': 'planned',
  'meta': 'none',
  'mistral ai': 'none',
  'ai21 labs': 'none',
  'stability ai': 'none',
};

function normalizeProviderName(provider: string): string {
  return provider.trim().toLowerCase().replace(/\s+/g, ' ');
}

function lookupExitStrategy(provider: string): ExitStrategyStatus {
  return EXIT_STRATEGY_RECORDS[normalizeProviderName(provider)] ?? 'unknown';
}

/**
 * Real Bedrock output modalities -> capability buckets. Nothing is inferred from
 * the provider name; this is read off each model's own `output_modalities`.
 */
const MODALITY_CAPABILITY: Record<string, CapabilityType> = {
  TEXT: 'llm',
  EMBEDDING: 'embeddings',
  IMAGE: 'image',
  VIDEO: 'video',
  SPEECH: 'speech',
  AUDIO: 'speech',
};

const CAPABILITY_ORDER: CapabilityType[] = ['llm', 'embeddings', 'image', 'video', 'speech'];

const capabilityLabels: Record<CapabilityType, string> = {
  llm: 'Text generation (LLM)',
  embeddings: 'Embeddings',
  image: 'Image generation',
  video: 'Video generation',
  speech: 'Speech / audio',
};

const capabilityIcons = {
  llm: 'sparkles',
  embeddings: 'cube',
  image: 'viewfinder-circle',
  video: 'play-circle',
  speech: 'megaphone',
} as const;

/** Stable per-provider colors so a vendor keeps one color across every panel. */
const PROVIDER_PALETTE = [
  '#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6',
  '#10b981', '#f97316', '#06b6d4', '#a855f7', '#84cc16', '#ef4444',
];

function providerColor(provider: string): string {
  const normalized = normalizeProviderName(provider);
  // Exact label match only. A substring match would map "Amazon" onto "AWS".
  const agentConfig = Object.values(AGENT_PROVIDER_CONFIG).find(
    config => normalizeProviderName(config.label) === normalized
  );
  if (agentConfig) return agentConfig.color;
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 100000;
  }
  return PROVIDER_PALETTE[hash % PROVIDER_PALETTE.length];
}

function getConcentrationLevel(percentage: number): ConcentrationLevel {
  if (percentage >= 70) return 'critical';
  if (percentage >= 50) return 'high';
  if (percentage >= 30) return 'medium';
  return 'low';
}

/**
 * Builds a share metric with every division guarded. A zero population yields an
 * explicit "no inventory" state rather than a fabricated denominator of 1.
 */
function buildShare(count: number, total: number, inventoryIsLive: boolean): ShareMetric {
  if (total <= 0) {
    return { count, total, exactPct: null, pct: null, level: null, unscoredReason: 'no-inventory' };
  }
  const exactPct = (count / total) * 100;
  let unscoredReason: UnscoredReason | null = null;
  if (!inventoryIsLive) unscoredReason = 'demo-inventory';
  else if (total < MIN_POPULATION_FOR_SEVERITY) unscoredReason = 'population-too-small';
  return {
    count,
    total,
    exactPct,
    pct: Math.round(exactPct),
    level: unscoredReason ? null : getConcentrationLevel(exactPct),
    unscoredReason,
  };
}

/** Honest rounding: a non-zero count never renders as a flat "0%". */
function formatShare(share: ShareMetric): string {
  if (share.exactPct === null) return '—';
  if (share.count > 0 && share.pct === 0) return '<1%';
  return `${share.pct}%`;
}

function formatCapabilityShare(provider: CapabilityProviderShare): string {
  if (provider.count > 0 && provider.pct === 0) return '<1%';
  return `${provider.pct}%`;
}

const concentrationColors: Record<ConcentrationLevel, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

/** Neutral styling for "we did not score this" - never alarm-colored. */
const unscoredColors = { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };

const unscoredReasonLabels: Record<UnscoredReason, string> = {
  'no-inventory': 'no inventory to measure',
  'population-too-small': `population under ${MIN_POPULATION_FOR_SEVERITY}`,
  'demo-inventory': 'demo inventory',
};

const exitStrategyColors: Record<ExitStrategyStatus, { bg: string; text: string; label: string; help: string }> = {
  documented: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Documented', help: 'Migration path documented' },
  planned: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Planned', help: 'Migration path planned, not documented' },
  none: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'None', help: 'Reviewed: no exit strategy exists' },
  // Absence of a record is not a finding of absence.
  unknown: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'No record', help: 'Not tracked in any connected system of record' },
};

const severityRank: Record<ConcentrationLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function ShareChip({ share }: { share: ShareMetric }) {
  if (share.level) {
    const colors = concentrationColors[share.level];
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
        {formatShare(share)} · {share.level}
      </span>
    );
  }
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-medium ${unscoredColors.bg} ${unscoredColors.text}`}
      title={`Not scored: ${share.unscoredReason ? unscoredReasonLabels[share.unscoredReason] : 'unknown reason'}`}
    >
      {formatShare(share)} · not scored
    </span>
  );
}

interface ConcentrationRiskCardProps {
  className?: string;
}

export default function ConcentrationRiskCard({ className = '' }: ConcentrationRiskCardProps) {
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [modelCatalog, setModelCatalog] = useState<AwsFoundationModelCatalog | null>(null);
  const [liveDataAvailable, setLiveDataAvailable] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [exitStrategyExpanded, setExitStrategyExpanded] = useState(false);

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
          // Governs the MODEL-side panels only. Never implies a live agent axis.
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

  const {
    modelConcentrations,
    agentConcentrations,
    capabilityConcentrations,
    alerts,
    totalModels,
    totalAgents,
    demoAgentCount,
    liveAgentCount,
    agentInventoryIsLive,
    modelsWithNoMappedCapability,
    catalogLive,
  } = useMemo(() => {
    const models = modelCatalog?.models ?? [];
    const isCatalogLive = modelCatalog?.live === true;

    // ─── Model axis + capability axis (both from the live catalog) ───
    const modelsByProvider: Record<string, number> = {};
    const capabilityCounts: Record<CapabilityType, Record<string, number>> = {
      llm: {}, embeddings: {}, image: {}, video: {}, speech: {},
    };
    const capabilityPopulation: Record<CapabilityType, number> = {
      llm: 0, embeddings: 0, image: 0, video: 0, speech: 0,
    };
    const providerCapabilities: Record<string, Set<CapabilityType>> = {};
    let unmappedModels = 0;

    models.forEach(model => {
      const provider = (model.provider ?? '').trim() || 'Unknown';
      modelsByProvider[provider] = (modelsByProvider[provider] ?? 0) + 1;

      // Attribute from THIS model's own real output modalities. One model is
      // counted once per capability it genuinely provides - never the provider's
      // whole footprint smeared across every capability it touches.
      const caps = new Set<CapabilityType>();
      (model.output_modalities ?? []).forEach(modality => {
        const cap = MODALITY_CAPABILITY[String(modality).trim().toUpperCase()];
        if (cap) caps.add(cap);
      });
      if (caps.size === 0) {
        unmappedModels += 1;
        return;
      }
      caps.forEach(cap => {
        capabilityCounts[cap][provider] = (capabilityCounts[cap][provider] ?? 0) + 1;
        capabilityPopulation[cap] += 1;
        (providerCapabilities[provider] ??= new Set<CapabilityType>()).add(cap);
      });
    });

    const modelTotal = models.length;

    // ─── Agent axis (demo registry + any live deployments) ───
    const agentsByProvider: Record<string, number> = {};
    let demoAgents = 0;
    AGENT_REGISTRY.forEach(agent => {
      const label = AGENT_PROVIDER_CONFIG[agent.provider ?? 'aws']?.label ?? 'Unknown';
      agentsByProvider[label] = (agentsByProvider[label] ?? 0) + 1;
      demoAgents += 1;
    });

    let liveAgents = 0;
    deployments.forEach(d => {
      const templateId = d.template_id?.toLowerCase() ?? '';
      let provider = 'AWS';
      if (templateId.includes('claude') || templateId.includes('anthropic')) {
        provider = 'Anthropic';
      } else if (templateId.includes('openai') || templateId.includes('gpt')) {
        provider = 'OpenAI';
      }
      agentsByProvider[provider] = (agentsByProvider[provider] ?? 0) + 1;
      liveAgents += 1;
    });

    const agentTotal = demoAgents + liveAgents;
    // An agent share can only be scored when NO part of the denominator is
    // fabricated. While the demo registry contributes, the axis stays unscored.
    const isAgentInventoryLive = demoAgents === 0 && liveAgents > 0;

    // ─── Per-axis provider rows. No union of the two disjoint provider sets. ───
    const modelRows: ProviderConcentration[] = Object.entries(modelsByProvider)
      .map(([provider, count]) => ({
        provider,
        color: providerColor(provider),
        axis: 'models' as AxisKind,
        share: buildShare(count, modelTotal, isCatalogLive),
        capabilities: CAPABILITY_ORDER.filter(cap => providerCapabilities[provider]?.has(cap)),
        exitStrategy: lookupExitStrategy(provider),
      }))
      .sort((a, b) => b.share.count - a.share.count || a.provider.localeCompare(b.provider));

    const agentRows: ProviderConcentration[] = Object.entries(agentsByProvider)
      .map(([provider, count]) => ({
        provider,
        color: providerColor(provider),
        axis: 'agents' as AxisKind,
        share: buildShare(count, agentTotal, isAgentInventoryLive),
        capabilities: [], // agents expose no modality data
        exitStrategy: lookupExitStrategy(provider),
      }))
      .sort((a, b) => b.share.count - a.share.count || a.provider.localeCompare(b.provider));

    // ─── Capability axis: model-only, real modalities, accumulated ───
    const capRows: CapabilityConcentration[] = CAPABILITY_ORDER.map(capability => {
      const population = capabilityPopulation[capability];
      const providers: CapabilityProviderShare[] = Object.entries(capabilityCounts[capability])
        .map(([name, count]) => ({
          name,
          count,
          exactPct: population > 0 ? (count / population) * 100 : 0,
          pct: population > 0 ? Math.round((count / population) * 100) : 0,
          color: providerColor(name),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

      let unscoredReason: UnscoredReason | null = null;
      if (population === 0) unscoredReason = 'no-inventory';
      else if (!isCatalogLive) unscoredReason = 'demo-inventory';
      else if (population < MIN_POPULATION_FOR_SEVERITY) unscoredReason = 'population-too-small';

      const leader = providers[0];
      return {
        capability,
        label: capabilityLabels[capability],
        population,
        providers,
        top: leader ? { name: leader.name, count: leader.count, pct: leader.pct } : null,
        level: !unscoredReason && leader ? getConcentrationLevel(leader.exactPct) : null,
        unscoredReason,
      };
    });

    // ─── Alerts. Only from scored (live, sufficiently populated) axes. ───
    const riskAlerts: RiskAlert[] = [];

    modelRows.forEach(row => {
      if (row.share.level === 'critical') {
        riskAlerts.push({
          level: 'critical',
          message: `${row.provider} supplies ${formatShare(row.share)} of the ${modelTotal}-model catalog (${row.share.count} models) — single-vendor dependency risk`,
          provenance: 'live-models',
        });
      } else if (row.share.level === 'high') {
        riskAlerts.push({
          level: 'high',
          message: `${row.provider} supplies ${formatShare(row.share)} of the ${modelTotal}-model catalog (${row.share.count} models) — consider diversification`,
          provenance: 'live-models',
        });
      }
    });

    capRows.forEach(cap => {
      if (!cap.top || (cap.level !== 'critical' && cap.level !== 'high')) return;
      riskAlerts.push({
        level: cap.level,
        message: `${cap.top.name} supplies ${cap.top.pct}% of ${cap.label.toLowerCase()} models (${cap.top.count} of ${cap.population}) — capability single-sourced`,
        provenance: 'live-models',
      });
    });

    // Exit-strategy gaps are scored against the LIVE model share only, and only
    // for vendors reviewed as having no exit strategy (not vendors with no record).
    modelRows.forEach(row => {
      if (
        row.exitStrategy === 'none' &&
        row.share.level !== null &&
        row.share.exactPct !== null &&
        row.share.exactPct >= 30
      ) {
        riskAlerts.push({
          level: 'high',
          message: `No exit strategy on file for ${row.provider} (${formatShare(row.share)} of model catalog)`,
          provenance: 'demo',
        });
      }
    });

    riskAlerts.sort((a, b) => severityRank[a.level] - severityRank[b.level]);

    return {
      modelConcentrations: modelRows,
      agentConcentrations: agentRows,
      capabilityConcentrations: capRows,
      alerts: riskAlerts,
      totalModels: modelTotal,
      totalAgents: agentTotal,
      demoAgentCount: demoAgents,
      liveAgentCount: liveAgents,
      agentInventoryIsLive: isAgentInventoryLive,
      modelsWithNoMappedCapability: unmappedModels,
      catalogLive: isCatalogLive,
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
  const hasDemoSourcedAlert = alerts.some(a => a.provenance === 'demo');
  const scoredCapabilities = capabilityConcentrations.filter(c => c.level !== null).length;

  // Vendors appearing in the exit-strategy register, with each axis kept separate.
  const exitRegister = Array.from(
    new Map(
      [...modelConcentrations, ...agentConcentrations].map(row => [row.provider, row])
    ).keys()
  ).map(provider => {
    const modelRow = modelConcentrations.find(r => r.provider === provider) ?? null;
    const agentRow = agentConcentrations.find(r => r.provider === provider) ?? null;
    return {
      provider,
      color: (modelRow ?? agentRow)?.color ?? '#6366f1',
      modelShare: modelRow?.share ?? null,
      agentShare: agentRow?.share ?? null,
      exitStrategy: lookupExitStrategy(provider),
    };
  });

  const renderProviderRow = (row: ProviderConcentration) => {
    const rowKey = `${row.axis}:${row.provider}`;
    const isExpanded = expandedProvider === rowKey;
    const unitLabel = row.axis === 'models' ? 'models' : 'agents';

    return (
      <div key={rowKey}>
        <button
          onClick={() => setExpandedProvider(isExpanded ? null : rowKey)}
          className="w-full px-4 py-3 hover:bg-slate-50/50 transition-colors text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: row.color }} />
              <div>
                <div className="text-xs font-medium text-slate-900">{row.provider}</div>
                <div className="text-[10px] text-slate-500">
                  {row.share.count} of {row.share.total} {unitLabel}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShareChip share={row.share} />
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                className="w-3.5 h-3.5 text-slate-400"
              />
            </div>
          </div>

          {/* Single-axis bar. Width uses the unrounded share. */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] text-slate-400 w-12 capitalize">{unitLabel}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, row.share.exactPct ?? 0))}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>
            <span className="text-[9px] text-slate-500 w-10 text-right">{formatShare(row.share)}</span>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-3 bg-slate-50/30">
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <div className="text-slate-500 mb-1">
                  Capabilities {row.axis === 'models' ? '(from model output modalities)' : ''}
                </div>
                {row.capabilities.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.capabilities.map(cap => (
                      <span key={cap} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {capabilityLabels[cap]}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400">
                    {row.axis === 'agents'
                      ? 'Not applicable — agents carry no modality data'
                      : 'No output modality reported'}
                  </span>
                )}
              </div>
              <div>
                <div className="text-slate-500 mb-1">Exit Strategy</div>
                <span
                  className={`px-2 py-0.5 rounded ${exitStrategyColors[row.exitStrategy].bg} ${exitStrategyColors[row.exitStrategy].text}`}
                  title={exitStrategyColors[row.exitStrategy].help}
                >
                  {exitStrategyColors[row.exitStrategy].label}
                </span>
              </div>
            </div>
            {row.share.unscoredReason && (
              <p className="text-[10px] text-slate-500 mt-2">
                Share shown but not scored: {unscoredReasonLabels[row.share.unscoredReason]}.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

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
            <p className="text-[10px] text-slate-500">
              Model share and agent share are measured separately and never combined
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {liveDataAvailable ? (
            <LiveDataBadge source="Bedrock" detail="Model catalog from AWS Bedrock ListFoundationModels (model axis only)" />
          ) : (
            <MockDataBadge integration="Enable AWS Bedrock integration" />
          )}
          {/* Concentration is a share, so a missing region distorts it in both directions at
              once: the denominator shrinks, and a provider present only in that region drops
              out entirely. A share is more misleading under partial coverage than a count. */}
          {liveDataAvailable && (
            <RegionCoverageBadge regions={modelCatalog?.regions} noun="The model-share denominator" />
          )}
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 ? (
        <div className={`rounded-lg border p-3 ${highRiskCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-2">
            <Icon
              name={highRiskCount > 0 ? 'exclamation-triangle' : 'bell-alert'}
              className={`w-4 h-4 mt-0.5 ${highRiskCount > 0 ? 'text-rose-600' : 'text-amber-600'}`}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`text-xs font-semibold ${highRiskCount > 0 ? 'text-rose-800' : 'text-amber-800'}`}>
                  {highRiskCount} High-Risk Concentration{highRiskCount !== 1 ? 's' : ''} Detected
                </div>
                <MockDataBadge integration="Some inputs (agent counts, exit strategies) are demo data" />
                {catalogLive && (
                  <LiveDataBadge source="Bedrock" detail="Model and capability shares computed from the live Bedrock catalog" />
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {alerts.slice(0, 3).map((alert, i) => (
                  <li key={i} className={`text-[10px] ${alert.level === 'critical' ? 'text-rose-700' : 'text-amber-700'}`}>
                    {alert.message}
                    <span className="text-slate-500 ml-1">
                      [{alert.provenance === 'live-models' ? 'live model catalog' : 'demo input'}]
                    </span>
                  </li>
                ))}
                {alerts.length > 3 && (
                  <li className="text-[10px] text-slate-500">+{alerts.length - 3} more alerts</li>
                )}
              </ul>
              {!hasDemoSourcedAlert && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Every alert above is derived from the live model catalog. The demo agent inventory
                  is excluded from alerting.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-start gap-2">
            <Icon name="check-circle" className="w-4 h-4 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-emerald-800">No scored concentration alerts</div>
              <p className="text-[10px] text-emerald-700 mt-0.5">
                {catalogLive
                  ? `No vendor exceeds 50% of the ${totalModels}-model catalog, and ${scoredCapabilities} of ${capabilityConcentrations.length} capability buckets were large enough to score.`
                  : 'The live model catalog is unavailable, so no model share could be scored.'}
                {' '}The agent inventory is demo data and is excluded from alerting.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vendor Dependency - two separate axes, never merged */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-800">Vendor Dependency Breakdown</h4>
              <MockDataBadge integration="Agent counts from demo registry — connect deployment inventory" />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Two separate denominators. Model share is out of {totalModels} catalog models; agent share is
              out of {totalAgents} inventory agents. The two are never combined into one dependency number.
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* Model axis */}
            <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                Model providers · share of {totalModels} models
              </span>
              {catalogLive ? (
                <LiveDataBadge source="Bedrock" detail="ListFoundationModels" />
              ) : (
                <MockDataBadge integration="Enable AWS Bedrock integration" />
              )}
            </div>
            {modelConcentrations.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {modelConcentrations.map(renderProviderRow)}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <Icon name="exclamation-circle" className="w-5 h-5 text-slate-300 mx-auto" />
                <p className="text-[10px] text-slate-500 mt-1">
                  Model catalog unavailable — no model share can be computed.
                </p>
              </div>
            )}

            {/* Agent axis */}
            <div className="px-4 py-2 bg-slate-50/70 border-y border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                Agent providers · share of {totalAgents} agents
              </span>
              <MockDataBadge integration="Agent inventory is demo data — connect deployment inventory" />
            </div>
            {agentConcentrations.length > 0 ? (
              <>
                {!agentInventoryIsLive && (
                  <p className="px-4 pt-2 text-[10px] text-slate-500">
                    {demoAgentCount} demo agent{demoAgentCount !== 1 ? 's' : ''} and {liveAgentCount} live
                    deployment{liveAgentCount !== 1 ? 's' : ''}. Shares are shown for transparency but are
                    not scored while any part of the denominator is demo data.
                  </p>
                )}
                <div className="divide-y divide-slate-100">
                  {agentConcentrations.map(renderProviderRow)}
                </div>
              </>
            ) : (
              <div className="px-4 py-6 text-center">
                <Icon name="exclamation-circle" className="w-5 h-5 text-slate-300 mx-auto" />
                <p className="text-[10px] text-slate-500 mt-1">
                  No agent inventory — no agent share can be computed.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Concentration by Capability - model-only */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-800">Concentration by Capability</h4>
              {catalogLive ? (
                <LiveDataBadge source="Bedrock" detail="Capability shares derived from each model's output_modalities" />
              ) : (
                <MockDataBadge integration="Enable AWS Bedrock integration" />
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Model-only — attributed per model from its real output modalities. Agents are excluded
              because they report no modality data.
              {modelsWithNoMappedCapability > 0 && (
                <> {modelsWithNoMappedCapability} model{modelsWithNoMappedCapability !== 1 ? 's' : ''} reported
                no recognized output modality and {modelsWithNoMappedCapability !== 1 ? 'are' : 'is'} excluded.</>
              )}
            </p>
          </div>
          <div className="p-4 space-y-4">
            {capabilityConcentrations.map(cap => {
              const colors = cap.level ? concentrationColors[cap.level] : unscoredColors;
              return (
                <div key={cap.capability}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2">
                      <Icon name={capabilityIcons[cap.capability]} className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-medium text-slate-700">{cap.label}</span>
                      <span className="text-[10px] text-slate-400">{cap.population} models</span>
                    </div>
                    {cap.top ? (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}
                        title={
                          cap.unscoredReason
                            ? `Not scored: ${unscoredReasonLabels[cap.unscoredReason]}`
                            : `${cap.top.name} leads this capability`
                        }
                      >
                        {cap.top.name}: {cap.top.pct}% ({cap.top.count}/{cap.population})
                        {cap.unscoredReason ? ' · not scored' : ''}
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${unscoredColors.bg} ${unscoredColors.text}`}>
                        No models
                      </span>
                    )}
                  </div>

                  {cap.population > 0 ? (
                    <>
                      {/* Stacked bar - widths use unrounded shares so they sum to 100% */}
                      <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                        {cap.providers.map(p => (
                          <div
                            key={p.name}
                            className="h-full transition-all relative"
                            style={{ width: `${p.exactPct}%`, backgroundColor: p.color }}
                            title={`${p.name}: ${p.count} of ${cap.population} models (${formatCapabilityShare(p)})`}
                          >
                            {p.pct >= 15 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-medium">
                                {p.pct}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {cap.providers.slice(0, 4).map(p => (
                          <div key={p.name} className="flex items-center gap-1 text-[9px] text-slate-500">
                            <div className="w-2 h-2 rounded" style={{ backgroundColor: p.color }} />
                            {p.name} {p.count}/{cap.population}
                          </div>
                        ))}
                        {cap.providers.length > 4 && (
                          <span className="text-[9px] text-slate-400">
                            +{cap.providers.length - 4} more
                          </span>
                        )}
                      </div>
                      {cap.unscoredReason && (
                        <p className="text-[9px] text-slate-400 mt-1">
                          Not scored: {unscoredReasonLabels[cap.unscoredReason]}.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      {totalModels === 0
                        ? 'Model catalog unavailable — capability shares cannot be computed.'
                        : 'No models in the catalog emit this output modality.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Exit Strategy Summary - Collapsible */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setExitStrategyExpanded(!exitStrategyExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-slate-50/50 hover:bg-slate-100 transition-colors"
        >
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-800 text-left">Exit Strategy Status</h4>
              <MockDataBadge integration="Exit-strategy status from a governance system of record (not connected)" />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 text-left">
              Vendor migration readiness. "No record" means untracked, not that no exit strategy exists.
            </p>
          </div>
          <Icon name={exitStrategyExpanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400" />
        </button>
        {exitStrategyExpanded && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30">
                  <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Vendor</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">
                    Model share
                    <span className="block text-[9px] font-normal text-slate-400">of {totalModels} models</span>
                  </th>
                  <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">
                    Agent share
                    <span className="block text-[9px] font-normal text-slate-400">of {totalAgents} demo agents</span>
                  </th>
                  <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Exit Strategy</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Model-share Risk</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Recommended Action</th>
                </tr>
              </thead>
              <tbody>
                {exitRegister.map(entry => {
                  const exitColors = exitStrategyColors[entry.exitStrategy];
                  const modelLevel = entry.modelShare?.level ?? null;
                  const riskColors = modelLevel ? concentrationColors[modelLevel] : unscoredColors;
                  const modelPct = entry.modelShare?.exactPct ?? null;

                  let recommendation = 'Monitor';
                  if (entry.exitStrategy === 'unknown') {
                    recommendation = 'Establish exit-strategy record';
                  } else if (entry.exitStrategy === 'none' && modelPct !== null && modelPct >= 30) {
                    recommendation = 'Document exit strategy';
                  } else if (modelPct !== null && modelPct >= 70) {
                    recommendation = 'Diversify dependencies';
                  } else if (modelPct !== null && modelPct >= 50) {
                    recommendation = 'Evaluate alternatives';
                  } else if (entry.exitStrategy !== 'documented') {
                    recommendation = 'Document migration path';
                  }

                  return (
                    <tr key={entry.provider} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: entry.color }} />
                          <span className="font-medium text-slate-900">{entry.provider}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.modelShare ? (
                          <>
                            <span className="text-slate-600">{formatShare(entry.modelShare)}</span>
                            <span className="text-slate-400 ml-1">
                              ({entry.modelShare.count} model{entry.modelShare.count !== 1 ? 's' : ''})
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400" title="No presence on the model axis">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.agentShare ? (
                          <>
                            <span className="text-slate-600">{formatShare(entry.agentShare)}</span>
                            <span className="text-slate-400 ml-1">
                              ({entry.agentShare.count} demo agent{entry.agentShare.count !== 1 ? 's' : ''})
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400" title="No presence on the agent axis">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${exitColors.bg} ${exitColors.text}`}
                          title={exitColors.help}
                        >
                          {exitColors.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${riskColors.bg} ${riskColors.text}`}
                          title={
                            modelLevel
                              ? `Scored from ${formatShare(entry.modelShare!)} of the live model catalog`
                              : 'Not scored — no live model share available'
                          }
                        >
                          {modelLevel ?? 'not scored'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{recommendation}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
