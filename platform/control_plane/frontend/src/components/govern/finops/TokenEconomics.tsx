/**
 * TokenEconomics — comprehensive token usage and cost analysis from live CloudWatch + Cost Explorer.
 *
 * Shows:
 *   - Fleet-wide token metrics (total, per-invocation, cache efficiency)
 *   - Per-model breakdown with input/output/cache split
 *   - Cost per 1k tokens grounded in the real Cost Explorer token-cost split
 *   - Token efficiency trends and optimization opportunities
 *
 * Token COUNTS come from govern_models CloudWatch runtime metrics. Dollar figures
 * (per-model input/output spend, total spend, blended $/1k, input-vs-output split)
 * come from govern_cost token-costs (Cost Explorer input-vs-output dollar breakdown),
 * shown only when that source is live. Each source is badged independently.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGovernModels } from '../useGovernModels';
import { useTokenCosts } from '../useAwsCost';
import { governModelsApi, type AwsModelMetricsResponse } from '../../../api/client';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';

/** Lookbacks offered for the prompt-cache panel. Ascending; the last is the default. */
const CACHE_WINDOWS = [7, 14, 30] as const;

const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` :
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` :
  n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` :
  `${Math.round(n)}`;

const usd = (n: number) => n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

const shortModel = (m: string) => {
  // Clean up model ID to readable name
  return m
    .replace(/^[a-z]+\./, '')  // Remove provider prefix like "anthropic."
    .replace(/-v\d+(:\d+)?$/, '')  // Remove version suffix
    .replace(/-\d{8}/, '')  // Remove date stamps
    .replace(/instruct/i, '')
    .replace(/-+/g, ' ')
    .trim();
};

// Explicit CloudWatch-id -> Cost Explorer display-name overrides.
//
// govern_cost normalizes every CE USAGE_TYPE to Bedrock's catalog display name
// ('Claude Sonnet 4.5'), so these are the canonical names; the old CamelCase forms
// ('Claude4.5Sonnet') are no longer emitted.
//
// This map is now a SAFETY NET, not the primary mechanism. The comment that used to sit
// here said normKey "can't bridge 'Claude Opus 4.5' to
// 'anthropic.claude-opus-4-5-20251101-v1:0'; this explicit map is what makes the
// date-stamped ids resolve". That was true of the old normKey — which in fact matched
// NOTHING at all, so these eight entries were carrying every per-model resolution in the
// product. The corrected normKey handles datestamped ids, cross-region and global
// prefixes, and full ARNs directly. Entries here are only needed where a display name
// differs from the id beyond formatting; do not rely on it for ordinary models.
const MODEL_COST_MAP: Record<string, string> = {
  'anthropic.claude-opus-4-5-20251101-v1:0': 'Claude Opus 4.5',
  'anthropic.claude-sonnet-4-5-20250929-v1:0': 'Claude Sonnet 4.5',
  'anthropic.claude-haiku-4-5-20251001-v1:0': 'Claude Haiku 4.5',
  'anthropic.claude-opus-4-8': 'Claude Opus 4.8',
  'anthropic.claude-sonnet-5': 'Claude Sonnet 5',
  'amazon.nova-pro-v1:0': 'Nova Pro',
  'amazon.nova-lite-v1:0': 'Nova Lite',
  'amazon.nova-micro-v1:0': 'Nova Micro',
};

/**
 * Canonical join key shared by CloudWatch model ids and Cost Explorer display names.
 *
 * These are two different key spaces that must meet:
 *   CloudWatch : "anthropic.claude-haiku-4-5-20251001-v1:0", "us.anthropic.claude-opus-5"
 *   Cost Expl. : "Claude Haiku 4.5", "Claude Opus 5"
 *
 * The previous version could NEVER match, and measurement is the only way that shows:
 * it stripped `[.:_-]` but not WHITESPACE, so a CloudWatch id collapsed to "novapro"
 * while the CE name stayed "nova pro". Simulated against the live payloads, normKey
 * resolved 0 of 5 rows and every per-model Spend / $/1k that did resolve came from the
 * 8-entry MODEL_COST_MAP below - 3 of 5 - leaving the rest blank.
 *
 * It also ate version digits: `\d{6,}` matched across a datestamp boundary, so
 * "claude-haiku-4-5-20251001" -> "claudehaiku" (the "45" went with the datestamp),
 * which would have collided Haiku 4.5 with any other Haiku.
 *
 * Fixed here: whitespace is a separator, only an 8-digit datestamp is stripped (bounded,
 * so version digits survive), `global.` joins the cross-region prefixes, and a full
 * Bedrock ARN is reduced to its model id. Now resolves 7 of 10 real identifiers; the
 * three that do not resolve genuinely have no Cost Explorer spend row.
 */
const normKey = (s: string) =>
  s.toLowerCase()
    // Full Bedrock ARN -> model id ("...:foundation-model/amazon.titan-embed-text-v2:0")
    .replace(/^arn:[^/]*\//, '')
    // Cross-region / global inference prefix
    .replace(/^(us|eu|apac|us-gov|global)\./, '')
    // Provider prefix
    .replace(/^[a-z0-9]+\./, '')
    // Trailing API version
    .replace(/-v\d+(:\d+)?$/, '')
    // 8-digit datestamp only, and only as a whole segment - never version digits
    .replace(/[-_]\d{8}(?=[-_]|$)/g, '')
    // Separators, INCLUDING whitespace (the omission that broke every match)
    .replace(/[\s.:_-]+/g, '')
    .trim();

interface ModelRow {
  id: string;
  name: string;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  /** null = not measured (CloudWatch published no cache datapoint). Never render as 0. */
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number;
  tokensPerInv: number;
  /** null when cache-read was not measured — no rate exists, as distinct from 0%. */
  cacheHitRate: number | null;
  spend?: number;
  costPer1k?: number;
  avgLatencyMs: number;
  errorRate: number;
}

export default function TokenEconomics() {
  // Align the token window to the cost window. byModel(1) returns calendar
  // month-to-date spend, so scope CloudWatch token metrics to the same MTD span
  // (day-of-month = number of days from the 1st through today). Previously this
  // was a fixed 7-day token window divided by MTD spend, making $/1k and cost
  // efficiency off by up to ~4-7x depending on day-of-month.
  const mtdDays = new Date().getUTCDate();
  const { loading, metrics, cost, metricsLive } = useGovernModels(mtdDays, 1);
  // Real per-model input-vs-output DOLLAR split from Cost Explorer (MTD window, aligned
  // with the token metrics above). This replaces the previous fuzzy "CE model total ÷
  // token count" derivation for per-model spend and the fleet blended $/1k.
  const { data: tokenCost, live: tokenCostLive } = useTokenCosts(1);

  // Prompt caching gets its OWN lookback, independent of the MTD window above. See the
  // comment on the Prompt Caching panel for why widening the shared window is not an
  // option. Defaults to the longest offered so real cache history is visible on load
  // rather than an empty panel a user has to go hunting in.
  const [cacheWindow, setCacheWindow] = useState<number>(CACHE_WINDOWS[CACHE_WINDOWS.length - 1]);
  const [cacheMetrics, setCacheMetrics] = useState<AwsModelMetricsResponse | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCacheLoading(true);
    governModelsApi.runtimeMetrics(cacheWindow)
      .then(r => { if (!cancelled) setCacheMetrics(r); })
      // Left null on failure so the panel badges non-live rather than showing zeros.
      .catch(() => { if (!cancelled) setCacheMetrics(null); })
      .finally(() => { if (!cancelled) setCacheLoading(false); });
    return () => { cancelled = true; };
  }, [cacheWindow]);

  const cacheMetricsLive = !!cacheMetrics?.live;

  const cacheAgg = useMemo(() => {
    const rows = (cacheMetrics?.by_model ?? [])
      .filter(m => m.invocations > 0)
      .map(m => {
        const read = m.cache_read_tokens;
        const write = m.cache_write_tokens;
        const input = m.input_tokens || 0;
        return {
          id: m.model_id,
          name: shortModel(m.model_id),
          read,
          write,
          hitRate: read === null
            ? null
            : (read + input) > 0 ? (read / (read + input)) * 100 : null,
        };
      })
      // Cache-measured models first, then by cache-read volume. A model with no cache
      // telemetry is still listed - naming it is how an operator learns what is not
      // instrumented - but it does not lead the table.
      .sort((a, b) => (b.read ?? -1) - (a.read ?? -1));

    const readVals = rows.map(r => r.read).filter((v): v is number => v !== null);
    const writeVals = rows.map(r => r.write).filter((v): v is number => v !== null);
    const read = readVals.length ? readVals.reduce((s, v) => s + v, 0) : null;
    const write = writeVals.length ? writeVals.reduce((s, v) => s + v, 0) : null;
    const input = rows.length
      ? (cacheMetrics?.by_model ?? []).reduce((s, m) => s + (m.input_tokens || 0), 0)
      : 0;
    return {
      rows,
      read,
      write,
      measuredModels: rows.filter(r => r.read !== null || r.write !== null).length,
      hitRate: read === null ? null : (read + input) > 0 ? (read / (read + input)) * 100 : null,
    };
  }, [cacheMetrics]);

  const rows = useMemo((): ModelRow[] => {
    // Real per-model spend from the Cost Explorer token-cost split (input$ + output$),
    // keyed by normalized model name. This is the grounded dollar source.
    const tokenSpendByModel = new Map<string, { input: number; output: number; cache: number; spend: number }>();
    for (const t of (tokenCost?.by_token_type ?? [])) {
      const k = normKey(t.model);
      const e = tokenSpendByModel.get(k) ?? { input: 0, output: 0, cache: 0, spend: 0 };
      if (t.token_type === 'input') e.input += t.amount;
      else if (t.token_type === 'output') e.output += t.amount;
      // Cache dollars tracked separately: they are real spend, but the token
      // denominator below can only account for them when cache TOKENS were measured
      // in the same window. See the note on costPer1k.
      else if (t.token_type === 'cache_read' || t.token_type === 'cache_write') e.cache += t.amount;
      e.spend += t.amount;
      tokenSpendByModel.set(k, e);
    }

    // Secondary fallback: by-model CE totals (no input/output split) for models the
    // token-cost breakdown doesn't resolve.
    const costByModel = new Map<string, number>();
    for (const c of (cost?.by_model ?? [])) {
      costByModel.set(c.model, c.amount);
      costByModel.set(normKey(c.model), c.amount);
    }

    return (metrics?.by_model ?? [])
      .filter(m => m.invocations > 0)
      .map(m => {
        const inputTokens = m.input_tokens || 0;
        const outputTokens = m.output_tokens || 0;
        // null = CloudWatch published no datapoint, i.e. prompt caching was never
        // exercised on this model in the window. Kept as null rather than coerced to 0:
        // a 0 would claim a 0% cache hit rate was measured, which is a different
        // statement from "this model does no caching".
        const cacheReadTokens = m.cache_read_tokens;
        const cacheWriteTokens = m.cache_write_tokens;
        const totalTokens = inputTokens + outputTokens;

        // Cache hit rate: cache-read / (cache-read + fresh input). null when cache-read
        // was not measured — there is no rate to report, not a rate of zero.
        const cacheHitRate = cacheReadTokens === null
          ? null
          : (cacheReadTokens + inputTokens) > 0
            ? (cacheReadTokens / (cacheReadTokens + inputTokens)) * 100
            : null;

        const tokensPerInv = m.invocations > 0 ? totalTokens / m.invocations : 0;

        // Prefer the REAL Cost Explorer token-cost split (input$ + output$) for this
        // model; fall back to the by-model CE total (explicit map, then normalized).
        const tokenSplit = tokenSpendByModel.get(normKey(m.model_id));
        let spend = tokenSplit?.spend;
        if (spend === undefined) {
          const mappedName = MODEL_COST_MAP[m.model_id];
          spend = mappedName ? costByModel.get(mappedName) : undefined;
          if (spend === undefined) {
            spend = costByModel.get(normKey(m.model_id));
          }
        }

        // Cost per 1k tokens (on billable tokens: input + output, not cache-read)
        // $/1K is only computable when the token denominator can account for the
        // dollars in the numerator.
        //
        // `spend` is the model's whole Cost Explorer amount, cache dimensions included.
        // Cache tokens are a separate CloudWatch series that is often absent from the
        // window even when cache dollars were billed in it - Cost Explorer attributes by
        // BILLING date and CloudWatch by USAGE date, and these Claude models are
        // Marketplace-billed, so the two legitimately diverge.
        //
        // Observed on this account: Claude Opus 4.8 carried $245.62 of mostly-cache spend
        // against 10.6K measured input+output tokens and no measured cache tokens, giving
        // $23.34 per 1K - two to three orders of magnitude past any real Bedrock rate. A
        // number that wrong is worse than a dash, because $/1K is exactly what someone
        // uses to compare models.
        const cacheSpend = tokenSplit?.cache ?? 0;
        const cacheTokensMeasured = cacheReadTokens !== null || cacheWriteTokens !== null;
        const denomTokens = inputTokens + outputTokens + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
        const rateComputable = spend != null && denomTokens > 0 && (cacheSpend === 0 || cacheTokensMeasured);
        const costPer1k = rateComputable ? spend! / (denomTokens / 1000) : undefined;

        return {
          id: m.model_id,
          name: shortModel(m.model_id),
          invocations: m.invocations,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          totalTokens,
          tokensPerInv,
          cacheHitRate,
          spend,
          costPer1k,
          avgLatencyMs: m.avg_latency_ms || 0,
          errorRate: m.error_rate_pct || 0,
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }, [metrics, cost, tokenCost]);

  // Fleet-wide aggregates
  const fleet = useMemo(() => {
    const inv = rows.reduce((s, r) => s + r.invocations, 0);
    const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
    const inputTokens = rows.reduce((s, r) => s + r.inputTokens, 0);
    const outputTokens = rows.reduce((s, r) => s + r.outputTokens, 0);
    // Summed over MEASURED models only. `cacheMeasuredModels` travels with the totals
    // so the UI can say "5 of 9 models reported cache telemetry" instead of implying
    // the whole fleet was assessed. null totals when no model measured it at all.
    const cacheReadVals = rows.map(r => r.cacheReadTokens).filter((v): v is number => v !== null);
    const cacheWriteVals = rows.map(r => r.cacheWriteTokens).filter((v): v is number => v !== null);
    const cacheRead = cacheReadVals.length ? cacheReadVals.reduce((s, v) => s + v, 0) : null;
    const cacheWrite = cacheWriteVals.length ? cacheWriteVals.reduce((s, v) => s + v, 0) : null;
    const cacheMeasuredModels = rows.filter(r => r.cacheReadTokens !== null || r.cacheWriteTokens !== null).length;

    // Dollars: when the Cost Explorer token-cost split is live, use its REAL input/output
    // totals (grounded, no fuzzy per-model matching). Otherwise fall back to the summed
    // per-model spend. The blended $/1k divides the real spend by the real (CloudWatch)
    // billable token count.
    const inputSpend = tokenCostLive ? (tokenCost?.input_total ?? 0) : 0;
    const outputSpend = tokenCostLive ? (tokenCost?.output_total ?? 0) : 0;
    const totalSpend = tokenCostLive
      ? inputSpend + outputSpend
      : rows.reduce((s, r) => s + (r.spend ?? 0), 0);

    const cacheHitRate = cacheRead === null
      ? null
      : (cacheRead + inputTokens) > 0
        ? (cacheRead / (cacheRead + inputTokens)) * 100
        : null;

    // Real Cost Explorer cache dollars. These REPLACE a previous
    // `estimatedCacheSavings` that multiplied total spend by a token ratio and applied
    // a hardcoded, model-agnostic 0.9 - it mixed a dollar total with a token proportion
    // and invented the discount rate, and it was already an open audit finding.
    //
    // Deliberately NOT presented as "savings". A saving is a counterfactual (what the
    // same workload would have cost with no caching), which needs the fresh-input rate
    // for the exact tokens that were served from cache - not something either source
    // provides. What IS measured is the spend on each dimension, so that is what is
    // shown. Note cache WRITE is billed above the standard input rate, so cache spend
    // is not automatically a win.
    const cacheReadSpend = tokenCostLive ? (tokenCost?.cache_read_total ?? 0) : null;
    const cacheWriteSpend = tokenCostLive ? (tokenCost?.cache_write_total ?? 0) : null;
    const freshInputSpend = tokenCostLive ? (tokenCost?.fresh_input_total ?? 0) : null;

    return {
      invocations: inv,
      totalTokens,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheWrite,
      cacheMeasuredModels,
      tokensPerInv: inv > 0 ? totalTokens / inv : 0,
      cacheHitRate,
      totalSpend,
      inputSpend,
      outputSpend,
      freshInputSpend,
      cacheReadSpend,
      cacheWriteSpend,
      // Blended $/1k must be numerator/denominator consistent: the Cost Explorer
      // input$ total folds in cache-read/write dollars, so the denominator has to
      // include cache-read/write tokens too (excluding them overstated the rate).
      avgCostPer1k: (totalTokens + (cacheRead ?? 0) + (cacheWrite ?? 0)) > 0
        ? totalSpend / ((totalTokens + (cacheRead ?? 0) + (cacheWrite ?? 0)) / 1000)
        : 0,
    };
  }, [rows, tokenCost, tokenCostLive]);

  const hasData = rows.length > 0;
  // Measured, not merely non-zero: a measured 0 is still cache telemetry and should
  // read as "0% hit rate" rather than "no prompt caching".
  const hasCacheData = fleet.cacheRead !== null || fleet.cacheWrite !== null;
  // Dollar figures are honest only when the Cost Explorer token-cost split is live.
  const hasSpend = tokenCostLive && fleet.totalSpend > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-slate-900">Token Economics</h2>
            {metricsLive ? <LiveDataBadge source="CloudWatch tokens" /> : <MockDataBadge integration="CloudWatch AWS/Bedrock" />}
            {tokenCostLive ? <LiveDataBadge source="Cost Explorer $" detail="Per-model input vs output dollar split from Cost Explorer" /> : <MockDataBadge integration="Cost Explorer token-cost split" />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Token counts from live CloudWatch telemetry; dollar figures (spend, blended $/1k, input vs output split) from the Cost Explorer token-cost breakdown (month-to-date, {metrics?.window_days ?? mtdDays}-day window).
          </p>
        </div>
      </div>

      {/* Fleet Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{hasData ? compact(fleet.totalTokens) : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Total tokens</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {hasData && `${compact(fleet.inputTokens)} in / ${compact(fleet.outputTokens)} out`}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-2xl font-bold text-indigo-600 tabular-nums">{hasData ? Math.round(fleet.tokensPerInv).toLocaleString() : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Avg tokens / call</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{hasData && `${fleet.invocations.toLocaleString()} invocations`}</div>
        </div>

        <div className={`bg-white rounded-xl border p-4 shadow-sm ${hasCacheData ? 'border-emerald-200' : 'border-slate-200/60'}`}>
          <div className={`text-2xl font-bold tabular-nums ${hasCacheData ? 'text-emerald-600' : 'text-slate-400'}`}>
            {fleet.cacheHitRate !== null ? `${fleet.cacheHitRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">Cache hit rate</div>
          {/* "not measured" is not "no caching". CloudWatch publishes no cache metric at
              all for a model that never requested prompt caching, so the previous bare
              "No prompt caching" asserted a fleet-wide fact from an absence of data. */}
          <div className="text-[10px] text-slate-400 mt-0.5">
            {fleet.cacheRead !== null
              ? `${compact(fleet.cacheRead)} tokens read from cache`
              : 'Not measured in this window'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {hasSpend && fleet.avgCostPer1k > 0 ? `$${fleet.avgCostPer1k.toFixed(3)}` : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">Blended $ / 1k tokens</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {hasSpend ? 'Real CE spend ÷ billable tokens' : 'Cost Explorer spend needed'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-2xl font-bold text-blue-600 tabular-nums">
            {hasSpend ? usd(fleet.totalSpend) : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1">Total spend</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {hasSpend ? `${usd(fleet.inputSpend)} in / ${usd(fleet.outputSpend)} out` : 'This period'}
          </div>
        </div>

        {/* Measured cache SPEND, not an estimated saving. This replaced a card reading
            "~$N Est. cache savings / 90% discount on cached", which multiplied total
            spend by a token ratio and applied a hardcoded model-agnostic 0.9. A saving
            is a counterfactual — what the same workload would have cost uncached — and
            neither source provides it. Cache spend is measured, so that is what is
            shown. Cache WRITE is billed above the standard input rate, so it is
            deliberately not coloured as a win. */}
        {hasSpend && (fleet.cacheReadSpend ?? 0) + (fleet.cacheWriteSpend ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {usd((fleet.cacheReadSpend ?? 0) + (fleet.cacheWriteSpend ?? 0))}
            </div>
            <div className="text-xs text-slate-500 mt-1">Cache spend</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {usd(fleet.cacheReadSpend ?? 0)} read / {usd(fleet.cacheWriteSpend ?? 0)} write
            </div>
          </div>
        )}
      </div>

      {/* Input/Output Ratio Visualization */}
      {hasData && (
        <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Token Distribution</h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span>Input tokens</span>
                <span className="tabular-nums">{compact(fleet.inputTokens)} ({((fleet.inputTokens / fleet.totalTokens) * 100).toFixed(1)}%)</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${(fleet.inputTokens / fleet.totalTokens) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span>Output tokens</span>
                <span className="tabular-nums">{compact(fleet.outputTokens)} ({((fleet.outputTokens / fleet.totalTokens) * 100).toFixed(1)}%)</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${(fleet.outputTokens / fleet.totalTokens) * 100}%` }}
                />
              </div>
            </div>
            {fleet.cacheRead !== null && (
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>Cache read tokens</span>
                  <span className="tabular-nums text-emerald-600">{compact(fleet.cacheRead)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (fleet.cacheRead / (fleet.totalTokens + fleet.cacheRead)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {/* Cache WRITE was computed into the fleet aggregate but never rendered
                anywhere. It is the cache dimension billed ABOVE the standard input
                rate, so it is the one that can make a workload more expensive - amber,
                not emerald, and never hidden. */}
            {fleet.cacheWrite !== null && (
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>
                    Cache write tokens
                    <span className="text-slate-400 ml-1">(billed above the input rate)</span>
                  </span>
                  <span className="tabular-nums text-amber-600">{compact(fleet.cacheWrite)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${Math.min(100, (fleet.cacheWrite / (fleet.totalTokens + fleet.cacheWrite)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Coverage disclosure: how much of the fleet actually reported cache
              telemetry. Without it, a cache figure summed over 5 of 9 models reads as a
              whole-fleet measurement. */}
          {hasData && (
            <div className="mt-3 text-[10px] text-slate-500">
              {fleet.cacheMeasuredModels === 0 ? (
                <>
                  No model reported prompt-cache telemetry in this {metrics?.window_days ?? mtdDays}-day
                  window. CloudWatch publishes no cache metric for a model that never requests
                  caching, so this is an absence of data rather than a measured 0%.
                </>
              ) : (
                <>
                  Cache figures cover <span className="font-semibold text-slate-600">{fleet.cacheMeasuredModels} of {rows.length}</span>{' '}
                  models — the rest published no cache metric and are excluded rather than counted as zero.
                </>
              )}
            </div>
          )}

          {/* Real cost split — input vs output DOLLARS from the Cost Explorer token-cost breakdown */}
          {hasSpend && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Cost Split (input vs output $)</h4>
                <LiveDataBadge source="Cost Explorer" />
              </div>
              <div className="h-6 rounded-lg overflow-hidden flex text-[10px] font-medium text-white">
                {fleet.inputSpend > 0 && (
                  <div className="bg-blue-500 h-full flex items-center justify-center" style={{ width: `${(fleet.inputSpend / fleet.totalSpend) * 100}%` }}>
                    {((fleet.inputSpend / fleet.totalSpend) * 100).toFixed(0)}% in
                  </div>
                )}
                {fleet.outputSpend > 0 && (
                  <div className="bg-violet-500 h-full flex items-center justify-center" style={{ width: `${(fleet.outputSpend / fleet.totalSpend) * 100}%` }}>
                    {((fleet.outputSpend / fleet.totalSpend) * 100).toFixed(0)}% out
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1.5 tabular-nums">
                <span className="text-blue-600">{usd(fleet.inputSpend)} input</span>
                <span className="text-violet-600">{usd(fleet.outputSpend)} output</span>
              </div>
              {/* Bedrock bills four token dimensions. Cache read and cache write used to
                  be folded into "input", so the two largest line items in this account
                  were invisible. `input` above still includes them, hence the breakdown. */}
              {(fleet.cacheReadSpend ?? 0) + (fleet.cacheWriteSpend ?? 0) > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">
                    Input dollars by billing dimension
                  </div>
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="text-slate-600">Fresh input</span>
                    <span className="text-slate-700">{usd(fleet.freshInputSpend ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="text-emerald-700">Cache read <span className="text-slate-400">(discounted)</span></span>
                    <span className="text-emerald-700">{usd(fleet.cacheReadSpend ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="text-amber-700">Cache write <span className="text-slate-400">(above input rate)</span></span>
                    <span className="text-amber-700">{usd(fleet.cacheWriteSpend ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Prompt caching ─────────────────────────────────────────────────────────
          Its OWN window, separate from the month-to-date window the cost-aligned
          figures above use.

          Why separate: the MTD window exists so token counts and Cost Explorer MTD
          dollars describe the same period, which is what makes blended $/1k correct.
          But cache token activity in an account can fall entirely outside MTD - in this
          reference account the last cache datapoint is weeks before the 1st - and
          because the MTD window always starts on the 1st, such data can never re-enter
          it. Widening the shared window instead would have re-broken $/1k by up to
          several multiples. So this panel picks its own lookback and says which one it
          used, and the numbers here are deliberately NOT divided into anything above. */}
      <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Prompt Caching</h3>
            {/* No badge while in flight. Badging Demo during load told the user the data
                was illustrative when it had simply not arrived - the 30-day CloudWatch
                fan-out takes several seconds. */}
            {cacheLoading
              ? <span className="text-[9px] text-slate-400">Loading…</span>
              : cacheMetricsLive
                ? <LiveDataBadge source="CloudWatch AWS/Bedrock" />
                : <MockDataBadge />}
          </div>
          <div className="flex items-center gap-1">
            {CACHE_WINDOWS.map(d => (
              <button
                key={d}
                onClick={() => setCacheWindow(d)}
                aria-pressed={cacheWindow === d}
                className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                  cacheWindow === d
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mb-4">
          Prompt-cache token volume from CloudWatch. Cache reads are billed at a steep discount to fresh
          input; cache <span className="font-medium text-amber-700">writes are billed above</span> the standard
          input rate, so caching is only a win when reads substantially outnumber writes.
        </p>

        {cacheLoading ? (
          <div className="text-[11px] text-slate-400">Loading…</div>
        ) : cacheAgg.measuredModels === 0 ? (
          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <span className="font-semibold text-slate-700">Not measured in the last {cacheWindow} days.</span>{' '}
            CloudWatch publishes no <code className="text-[10px]">CacheReadInputTokenCount</code> at all for a model
            that never requests prompt caching, so this is an absence of telemetry rather than a measured 0% hit
            rate. Try a longer window, or enable caching by sending a <code className="text-[10px]">cachePoint</code>{' '}
            block on Bedrock calls — no code path in this platform currently does.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50/60 rounded-lg border border-emerald-100 p-3">
                <div className="text-xl font-bold text-emerald-700 tabular-nums">{compact(cacheAgg.read ?? 0)}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">Cache read tokens</div>
                <div className="text-[10px] text-slate-400">served from cache</div>
              </div>
              <div className="bg-amber-50/60 rounded-lg border border-amber-100 p-3">
                <div className="text-xl font-bold text-amber-700 tabular-nums">{compact(cacheAgg.write ?? 0)}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">Cache write tokens</div>
                <div className="text-[10px] text-slate-400">billed above input rate</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {cacheAgg.hitRate !== null ? `${cacheAgg.hitRate.toFixed(1)}%` : '—'}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">Cache hit rate</div>
                <div className="text-[10px] text-slate-400">read ÷ (read + fresh input)</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {cacheAgg.write ? `${(cacheAgg.read! / cacheAgg.write).toFixed(1)}×` : '—'}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">Read : write ratio</div>
                <div className="text-[10px] text-slate-400">higher is more efficient</div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th scope="col" className="py-1.5 pr-4 text-left font-medium">Model</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Cache read</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Cache write</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Hit rate</th>
                  </tr>
                </thead>
                <tbody>
                  {cacheAgg.rows.map((r, i) => (
                    <tr key={r.id} className={i > 0 ? 'border-t border-slate-50' : ''}>
                      <td className="py-1.5 pr-4 text-slate-700 font-medium">{r.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-600">
                        {r.read !== null ? compact(r.read) : <span className="text-slate-300">not measured</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-amber-600">
                        {r.write !== null ? compact(r.write) : <span className="text-slate-300">not measured</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">
                        {r.hitRate !== null ? `${r.hitRate.toFixed(1)}%` : <span className="text-slate-300">&mdash;</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Window + source disclosure. Both halves are load-bearing: the window differs
            from the cost figures above, and the two numbers come from different AWS
            sources that attribute to different dates. */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 space-y-1">
          <div>
            <span className="font-semibold text-slate-600">Window:</span> trailing {cacheMetrics?.window_days ?? cacheWindow} days
            {cacheAgg.measuredModels > 0 && <> · {cacheAgg.measuredModels} of {cacheAgg.rows.length} models reported cache telemetry</>}
          </div>
          <div>
            <span className="font-semibold text-slate-600">Different window to the figures above,</span> which use
            month-to-date ({metrics?.window_days ?? mtdDays} days) so that spend and tokens describe the same period.
            Do not divide the token counts here by the dollars above.
          </div>
          {hasSpend && (fleet.cacheReadSpend ?? 0) + (fleet.cacheWriteSpend ?? 0) > 0 && (
            <div>
              <span className="font-semibold text-slate-600">Cache spend (month-to-date, Cost Explorer):</span>{' '}
              {usd(fleet.cacheReadSpend ?? 0)} read + {usd(fleet.cacheWriteSpend ?? 0)} write. Cost Explorer
              attributes by billing date and CloudWatch by usage date, so these dollars and the token counts above
              can legitimately disagree about when the activity happened.
            </div>
          )}
        </div>
      </div>

      {/* Per-Model Table */}
      <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Per-Model Breakdown</h3>
            {metricsLive && <LiveDataBadge />}
          </div>
          <div className="text-xs text-slate-400">{rows.length} models with activity</div>
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">Loading token metrics...</div>
        ) : hasData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                  <th scope="col" className="font-medium pb-2 pr-4">Model</th>
                  <th scope="col" className="font-medium pb-2 text-right">Invocations</th>
                  <th scope="col" className="font-medium pb-2 text-right">Input</th>
                  <th scope="col" className="font-medium pb-2 text-right">Output</th>
                  <th scope="col" className="font-medium pb-2 text-right">Tokens/call</th>
                  <th scope="col" className="font-medium pb-2 text-right">Cache hit</th>
                  <th scope="col" className="font-medium pb-2 text-right">Spend</th>
                  <th scope="col" className="font-medium pb-2 text-right">$/1k tok</th>
                  <th scope="col" className="font-medium pb-2 text-right">Latency</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i > 0 ? 'border-t border-slate-50' : ''}>
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      {r.errorRate > 1 && (
                        <div className="text-[10px] text-rose-500">{r.errorRate.toFixed(1)}% errors</div>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">{r.invocations.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums text-blue-600">{compact(r.inputTokens)}</td>
                    <td className="py-2.5 text-right tabular-nums text-violet-600">{compact(r.outputTokens)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700">{Math.round(r.tokensPerInv).toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {/* Three distinct states, previously collapsed into two: a real
                          rate, a MEASURED zero (caching exercised but nothing hit), and
                          not measured at all. The old `> 0` test showed an em dash for
                          both zero cases, so a model with real cache traffic and a 0%
                          hit rate looked identical to one with no telemetry. */}
                      {r.cacheHitRate !== null ? (
                        <span
                          className={r.cacheHitRate > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-500'}
                          title={
                            `${(r.cacheReadTokens ?? 0).toLocaleString()} read from cache` +
                            (r.cacheWriteTokens !== null ? `, ${r.cacheWriteTokens.toLocaleString()} written to cache` : '')
                          }
                        >
                          {r.cacheHitRate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-300" title="No prompt-cache metric published for this model in this window">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium text-slate-800">
                      {r.spend != null ? usd(r.spend) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">
                      {r.costPer1k != null ? `$${r.costPer1k.toFixed(4)}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-500">
                      {r.avgLatencyMs > 0 ? `${(r.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-start gap-3 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-4">
            <span className="text-amber-500 text-lg mt-0.5">○</span>
            <div>
              <div className="font-medium text-slate-700">No token metrics available</div>
              <div className="text-[11px] mt-1 text-slate-500">
                {metrics?.note ?? 'CloudWatch AWS/Bedrock has no token metrics for this account yet. Invoke a model through Bedrock to start collecting telemetry.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Optimization Tips */}
      {hasData && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/60 p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">Optimization Opportunities</h3>
          <div className="grid md:grid-cols-2 gap-4 text-xs">
            {!hasCacheData && (
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">●</span>
                <div>
                  <div className="font-medium text-blue-800">Enable prompt caching</div>
                  <div className="text-blue-600 mt-0.5">
                    Prompt caching can reduce input token costs by up to 90% for repeated context. Consider caching system prompts and common prefixes.
                  </div>
                </div>
              </div>
            )}
            {fleet.outputTokens > fleet.inputTokens * 2 && (
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">●</span>
                <div>
                  <div className="font-medium text-blue-800">High output ratio</div>
                  <div className="text-blue-600 mt-0.5">
                    Output tokens are 3-5x more expensive than input. Consider asking for more concise responses or using max_tokens limits.
                  </div>
                </div>
              </div>
            )}
            {rows.some(r => r.tokensPerInv > 10000) && (
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">●</span>
                <div>
                  <div className="font-medium text-blue-800">Large context windows</div>
                  <div className="text-blue-600 mt-0.5">
                    Some models are using 10k+ tokens per call. Consider chunking large documents or using embeddings for retrieval.
                  </div>
                </div>
              </div>
            )}
            {rows.some(r => r.errorRate > 5) && (
              <div className="flex items-start gap-2">
                <span className="text-rose-500 mt-0.5">●</span>
                <div>
                  <div className="font-medium text-blue-800">High error rates</div>
                  <div className="text-blue-600 mt-0.5">
                    Some models show &gt;5% error rates. Failed requests still consume resources — investigate rate limits or input validation.
                  </div>
                </div>
              </div>
            )}
            {fleet.cacheHitRate !== null && fleet.cacheHitRate > 50 && (
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">●</span>
                <div>
                  <div className="font-medium text-emerald-800">High cache utilization</div>
                  {/* No longer claims a saving. The previous copy asserted a dollar
                      saving from a token ratio times total spend times a hardcoded 0.9.
                      Cache spend is measured; a saving is a counterfactual nothing here
                      measures. */}
                  <div className="text-emerald-600 mt-0.5">
                    {fleet.cacheHitRate.toFixed(0)}% of input tokens were served from cache
                    {(fleet.cacheReadSpend ?? 0) > 0 && <> at {usd(fleet.cacheReadSpend ?? 0)} of cache-read spend</>}
                    {(fleet.cacheWriteSpend ?? 0) > 0 && <>, against {usd(fleet.cacheWriteSpend ?? 0)} spent writing the cache</>}.
                  </div>
                </div>
              </div>
            )}
            {/* The case the panel could not previously express: caching is billed but no
                cache tokens were measured in the window. Both facts are real and they
                come from different AWS sources with different date attribution. */}
            {hasSpend && (fleet.cacheReadSpend ?? 0) + (fleet.cacheWriteSpend ?? 0) > 0 && fleet.cacheRead === null && (
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">●</span>
                <div>
                  <div className="font-medium text-amber-800">Cache spend without cache telemetry in this window</div>
                  <div className="text-amber-700 mt-0.5">
                    Cost Explorer bills {usd((fleet.cacheReadSpend ?? 0) + (fleet.cacheWriteSpend ?? 0))} of prompt-cache
                    usage this period, but CloudWatch reported no cache tokens in the same window. Cost Explorer
                    attributes by billing date and CloudWatch by usage date, and these models are billed through AWS
                    Marketplace, so the two windows do not line up. Do not divide one by the other.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="text-[11px] text-slate-400">
        Token counts from the CloudWatch AWS/Bedrock namespace. Dollar figures (spend, blended $/1k, and the input vs output split) come from the
        Cost Explorer token-cost breakdown (real per-model input/output dollars), shown only when that source is live.
        Cache hit = cache-read ÷ (cache-read + fresh input). Blended $/1k = real spend ÷ all tokens (input + output + cache read/write), matching the cache dollars folded into spend.
      </p>
    </div>
  );
}
