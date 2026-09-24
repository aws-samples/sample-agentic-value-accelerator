/**
 * LiveModelInventory — the LIVE-from-AWS hero for the Model surfaces.
 *
 * Joins three real datasets (govern_models catalog + CloudWatch runtime metrics
 * + Bedrock by-model cost) into one honest table: what models the account can
 * actually invoke, which ones are actually being used (invocations/latency/
 * errors/tokens from CloudWatch), and what they cost (Cost Explorer). Everything
 * carries a live badge; graceful empty states when a source is unavailable.
 *
 * This is the AWS-grounded complement to the illustrative governance registry
 * below it (attestations, MRM compliance, tiers — legitimately internal state).
 */
import { useMemo } from 'react';
import { useGovernModels } from './useGovernModels';
import { LiveDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;
const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

// Model lifecycle upgrade recommendations for LEGACY models
const UPGRADE_RECOMMENDATIONS: Record<string, string> = {
  'claude-3-opus': 'Claude Opus 4',
  'claude-3-sonnet': 'Claude Sonnet 4',
  'claude-3-haiku': 'Claude 3.5 Haiku',
  'claude-3.5-sonnet': 'Claude Sonnet 4',
  'titan-text-lite': 'Nova Lite',
  'titan-text-express': 'Nova Lite',
  'titan-text-premier': 'Nova Pro',
  'titan-embed-text-v1': 'Titan Text Embeddings V2',
  'titan-image-generator-v1': 'Titan Image Generator V2',
  'llama3-1-405b': 'Llama 3.2 90B',
  'llama3-1-70b': 'Llama 3.2 90B',
  'llama3-1-8b': 'Llama 3.2 11B',
  'command-r': 'Command R+',
  'stable-diffusion-xl': 'Stable Diffusion 3',
};

// Find upgrade recommendation for a model by checking if model name/id contains a known legacy key
const getUpgradeRecommendation = (modelId: string, modelName: string): string | null => {
  const normalizedId = modelId.toLowerCase();
  const normalizedName = modelName.toLowerCase();
  for (const [legacyKey, upgrade] of Object.entries(UPGRADE_RECOMMENDATIONS)) {
    if (normalizedId.includes(legacyKey) || normalizedName.includes(legacyKey)) {
      return upgrade;
    }
  }
  return null;
};

// Strip ARN form + cross-region/provider prefixes + version suffixes so a
// CloudWatch/CE model id lines up with a catalog modelName, e.g.
// 'arn:aws:bedrock:us-east-1::foundation-model/global.anthropic.claude-opus-4-8'
// and 'us.anthropic.claude-opus-4-8' both -> 'claude opus 4 8'.
const normalizeKey = (s: string) =>
  s.toLowerCase()
    .replace(/^arn:[^/]*\//, '')                    // ARN -> bare id (foundation-model/…, inference-profile/…)
    .replace(/^(us|eu|apac|us-gov|global)\./, '')   // cross-region inference prefix (incl. global.)
    .replace(/^[a-z]+\./, '')                        // provider prefix (anthropic., amazon., …)
    .replace(/-v\d+(:\d+)?$/, '')
    .replace(/[.:_-]+/g, ' ')
    .replace(/\d{6,}/g, '')
    .trim();

// Convert raw model IDs to friendly display names when catalog lookup fails
const MODEL_FRIENDLY_NAMES: Record<string, string> = {
  'amazon.titan-embed-text-v1': 'Titan Text Embeddings V1',
  'amazon.titan-embed-text-v2:0': 'Titan Text Embeddings V2',
  'amazon.titan-embed-image-v1': 'Titan Multimodal Embeddings',
  'amazon.titan-text-express-v1': 'Titan Text Express',
  'amazon.titan-text-lite-v1': 'Titan Text Lite',
  'amazon.titan-text-premier-v1:0': 'Titan Text Premier',
  'amazon.titan-image-generator-v1': 'Titan Image Generator V1',
  'amazon.titan-image-generator-v2:0': 'Titan Image Generator V2',
  'amazon.nova-pro-v1:0': 'Amazon Nova Pro',
  'amazon.nova-lite-v1:0': 'Amazon Nova Lite',
  'amazon.nova-micro-v1:0': 'Amazon Nova Micro',
  'anthropic.claude-3-5-sonnet-20241022-v2:0': 'Claude 3.5 Sonnet',
  'anthropic.claude-3-5-haiku-20241022-v1:0': 'Claude 3.5 Haiku',
  'anthropic.claude-3-opus-20240229-v1:0': 'Claude 3 Opus',
  'anthropic.claude-3-sonnet-20240229-v1:0': 'Claude 3 Sonnet',
  'anthropic.claude-3-haiku-20240307-v1:0': 'Claude 3 Haiku',
  'anthropic.claude-opus-4-20250514-v1:0': 'Claude Opus 4',
  'anthropic.claude-sonnet-4-20250514-v1:0': 'Claude Sonnet 4',
  'meta.llama3-2-90b-instruct-v1:0': 'Llama 3.2 90B',
  'meta.llama3-2-11b-instruct-v1:0': 'Llama 3.2 11B',
  'meta.llama3-2-3b-instruct-v1:0': 'Llama 3.2 3B',
  'meta.llama3-2-1b-instruct-v1:0': 'Llama 3.2 1B',
  'meta.llama3-1-405b-instruct-v1:0': 'Llama 3.1 405B',
  'meta.llama3-1-70b-instruct-v1:0': 'Llama 3.1 70B',
  'meta.llama3-1-8b-instruct-v1:0': 'Llama 3.1 8B',
  'cohere.command-r-plus-v1:0': 'Command R+',
  'cohere.command-r-v1:0': 'Command R',
  'cohere.embed-english-v3': 'Cohere Embed English V3',
  'cohere.embed-multilingual-v3': 'Cohere Embed Multilingual V3',
  'mistral.mistral-large-2407-v1:0': 'Mistral Large',
  'mistral.mistral-small-2409-v1:0': 'Mistral Small',
  'ai21.jamba-1-5-large-v1:0': 'Jamba 1.5 Large',
  'ai21.jamba-1-5-mini-v1:0': 'Jamba 1.5 Mini',
  'stability.stable-diffusion-xl-v1': 'Stable Diffusion XL',
  'stability.sd3-large-v1:0': 'Stable Diffusion 3',
};

// Extract short model ID from ARN or model ID string
// e.g. "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0" -> "amazon.titan-embed-text-v2:0"
const extractModelId = (modelId: string): string => {
  // Handle ARN format: arn:aws:bedrock:region::foundation-model/model-id
  if (modelId.toLowerCase().startsWith('arn:')) {
    const match = modelId.match(/foundation-model\/(.+)$/i);
    if (match) return match[1];
  }
  return modelId;
};

// Extract provider from model ID (e.g. "amazon.titan-embed-text-v2:0" -> "Amazon")
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  amazon: 'Amazon',
  anthropic: 'Anthropic',
  meta: 'Meta',
  cohere: 'Cohere',
  mistral: 'Mistral AI',
  ai21: 'AI21 Labs',
  stability: 'Stability AI',
};

const extractProvider = (rawModelId: string): string => {
  const modelId = extractModelId(rawModelId);
  const providerMatch = modelId.match(/^([a-z0-9]+)\./i);
  if (providerMatch) {
    const provider = providerMatch[1].toLowerCase();
    return PROVIDER_DISPLAY_NAMES[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  }
  return '—';
};

// Fallback: convert model ID to a readable name if not in the lookup table
const friendlyModelName = (rawModelId: string): string => {
  const modelId = extractModelId(rawModelId);

  // Check exact match first
  if (MODEL_FRIENDLY_NAMES[modelId]) return MODEL_FRIENDLY_NAMES[modelId];

  // Check lowercase match
  const lowerModelId = modelId.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_FRIENDLY_NAMES)) {
    if (key.toLowerCase() === lowerModelId) return value;
  }

  // Fallback: clean up the model ID for display
  return modelId
    .replace(/^[a-z]+\./, '')           // remove provider prefix (amazon., anthropic., etc.)
    .replace(/[-_]/g, ' ')              // dashes/underscores to spaces
    .replace(/:[\d.]+$/, '')            // remove version suffix like :0 or :1.0
    .replace(/\s+v\d+$/, '')            // remove trailing v1, v2, etc.
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function LiveModelInventory() {
  const { loading, catalog, metrics, cost, catalogLive, metricsLive } = useGovernModels(7, 3);

  // Join runtime metrics (the models actually being used) to catalog names + cost.
  const rows = useMemo(() => {
    const catByKey = new Map((catalog?.models ?? []).map(m => [normalizeKey(m.name), m]));
    const catById = new Map((catalog?.models ?? []).map(m => [normalizeKey(m.model_id), m]));
    const costByKey = new Map((cost?.by_model ?? []).map(c => [normalizeKey(c.model), c.amount]));

    return (metrics?.by_model ?? []).map(m => {
      const key = normalizeKey(m.model_id);
      const cat = catById.get(key) ?? catByKey.get(key);
      // Cost rows carry the CANONICAL Bedrock catalog display name (govern_cost
      // normalizes every CE USAGE_TYPE format to '<Family> <Tier> <Version>'), so
      // `normalizeKey` alone bridges them to the model id — 'Claude Sonnet 4.5'
      // and 'anthropic.claude-sonnet-4-5-20250929-v1:0' both give
      // 'claude sonnet 4 5'. No extra CE-name normalizer is needed here. The
      // catalog-name fallback still covers SKUs whose id drops the family word
      // (e.g. cost 'DeepSeek-R1' vs id 'deepseek.r1-v1:0').
      const monthlyCost = costByKey.get(key) ?? (cat ? costByKey.get(normalizeKey(cat.name)) : undefined);
      const modelName = cat?.name ?? friendlyModelName(m.model_id);
      const lifecycle = cat?.lifecycle ?? 'ACTIVE';
      return {
        id: m.model_id,
        name: modelName,
        provider: cat?.provider ?? extractProvider(m.model_id),
        invocations: m.invocations,
        latencyMs: m.avg_latency_ms,
        errorPct: m.error_rate_pct,
        inTokens: m.input_tokens,
        outTokens: m.output_tokens,
        cost: monthlyCost,
        lifecycle,
        upgradeRecommendation: lifecycle === 'LEGACY' ? getUpgradeRecommendation(m.model_id, modelName) : null,
      };
    });
  }, [catalog, metrics, cost]);

  // Count legacy models that are actually in use (have runtime metrics)
  const legacyModelsInUse = useMemo(() => rows.filter(r => r.lifecycle === 'LEGACY'), [rows]);

  const anyLive = catalogLive || metricsLive || !!cost?.live;

  return (
    <div className="mb-8 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={anyLive}
        label="Live · from your AWS account"
        caption="Bedrock catalog + CloudWatch runtime + Cost Explorer"
        autoRefresh
      />

      {/* Legacy models warning banner */}
      {legacyModelsInUse.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-800">
              {legacyModelsInUse.length} legacy model{legacyModelsInUse.length > 1 ? 's' : ''} in active use
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Legacy models may be deprecated soon. Review the models below and plan migrations to recommended alternatives to avoid service disruption.
            </div>
          </div>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="flex items-center gap-1.5">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{catalog?.total ?? '—'}</div>
            {catalogLive && <LiveDataBadge />}
          </div>
          <div className="text-xs text-slate-500">Bedrock models available{catalog ? ` · ${catalog.active} active` : ''}</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-indigo-600 tabular-nums">{metrics ? compact(metrics.total_invocations) : '—'}</div>
          <div className="text-xs text-slate-500">Invocations · {metrics?.window_days ?? 7}d</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{metrics ? `${(metrics.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</div>
          <div className="text-xs text-slate-500">Avg latency (fleet)</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className={`text-2xl font-bold tabular-nums ${(metrics?.fleet_error_rate_pct ?? 0) > 2 ? 'text-rose-600' : 'text-emerald-600'}`}>{metrics ? `${metrics.fleet_error_rate_pct}%` : '—'}</div>
          <div className="text-xs text-slate-500">Error rate (fleet)</div>
        </div>
      </div>

      {/* Per-model live table — models actually being invoked */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Models In Use</h3>
          {metricsLive && <LiveDataBadge />}
          <span className="text-[11px] text-slate-400">real invocations from CloudWatch AWS/Bedrock, joined to catalog &amp; spend</span>
        </div>
        {loading ? (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                  <th scope="col" className="font-medium pb-2">Model</th>
                  <th scope="col" className="font-medium pb-2">Status</th>
                  <th scope="col" className="font-medium pb-2 text-right">Invocations</th>
                  <th scope="col" className="font-medium pb-2 text-right">Avg latency</th>
                  <th scope="col" className="font-medium pb-2 text-right">Error rate</th>
                  <th scope="col" className="font-medium pb-2 text-right">Tokens (in/out)</th>
                  <th scope="col" className="font-medium pb-2 text-right">Cost (3mo)</th>
                  {legacyModelsInUse.length > 0 && <th scope="col" className="font-medium pb-2">Recommended Upgrade</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    <td className="py-2 pr-2 font-medium text-slate-800">
                      {r.name}
                      {r.provider !== '—' && <span className="text-[10px] text-slate-400 ml-1.5">{r.provider}</span>}
                    </td>
                    <td className="py-2 pr-2">
                      {r.lifecycle === 'LEGACY' ? (
                        <span className="group relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                          Legacy
                          <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-normal text-white bg-slate-800 rounded shadow-lg whitespace-nowrap z-10">
                            This model is deprecated and may be removed soon. Plan migration to avoid disruption.
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{r.invocations.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{(r.latencyMs / 1000).toFixed(1)}s</td>
                    <td className={`py-2 text-right tabular-nums ${r.errorPct > 2 ? 'text-rose-600' : 'text-slate-500'}`}>{r.errorPct}%</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{compact(r.inTokens)}/{compact(r.outTokens)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{r.cost != null ? usd0(r.cost) : '—'}</td>
                    {legacyModelsInUse.length > 0 && (
                      <td className="py-2 pl-2 text-[11px]">
                        {r.upgradeRecommendation ? (
                          <span className="text-indigo-600 font-medium">{r.upgradeRecommendation}</span>
                        ) : r.lifecycle === 'LEGACY' ? (
                          <span className="text-slate-400 italic">Check provider docs</span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500 mt-0.5">●</span>
            <div>
              <div className="font-medium text-slate-600">No model runtime metrics yet</div>
              <div className="text-[11px] mt-0.5">{metrics?.note ?? 'CloudWatch AWS/Bedrock has no invocation metrics for this account yet — invoke a model to populate this.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
