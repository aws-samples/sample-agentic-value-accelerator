/**
 * useAwsCost — fetches real AWS spend from the govern_cost backend slice
 * (Cost Explorer). Degrades gracefully: on any network/backend failure each
 * dataset is left null / non-live so the FinOps surface can badge the source
 * honestly instead of breaking. Mirrors the useGovernanceAggregator pattern.
 */
import { useEffect, useRef, useState } from 'react';
import {
  governCostApi,
  type AwsCostSummary,
  type AwsCostTrend,
  type AwsCostForecast,
  type AwsCostAnomalies,
  type AwsCostModelBreakdown,
  type AwsUseCaseSpendResponse,
  type AwsCostRegionBreakdown,
  type AwsCostOperationBreakdown,
  type AwsTokenCostBreakdown,
  type AwsAgentCostResponse,
  type AwsAgentForecastResponse,
  type AwsCommitmentCoverage,
  type AwsCostComparisonResponse,
  type AwsRightsizingResponse,
  type AwsFinOpsDashboardSummary,
  type AwsServiceQuotasResponse,
} from '../../api/client';
import { useDataSources } from './DataSourceContext';

/**
 * Stale-while-revalidate phase for the window-driven cost hooks.
 *
 * `loading` used to go true on EVERY fetch, so changing the spend period blanked every
 * panel and swapped in a skeleton before the new numbers arrived — the whole area
 * flashed. Split in two: `loading` now means "nothing to display yet", so a panel keeps
 * the previous period's figures on screen while the next request is in flight, and
 * `refreshing` says a fetch is in progress over already-rendered data.
 *
 * A panel showing stale figures MUST indicate it. A previous period's number sitting
 * silently under a new period label is precisely the mislabelling this module keeps
 * removing, so `refreshing` is not optional decoration — it is what makes the smoother
 * transition honest.
 */
function useFetchPhase() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);
  const begin = () => {
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
  };
  const end = () => {
    loadedOnce.current = true;
    setLoading(false);
    setRefreshing(false);
  };
  return { loading, refreshing, begin, end };
}

export interface UseAwsCostResult {
  /** True only when there is nothing to display yet — not on a window change. */
  loading: boolean;
  /** True while a new window is in flight and the previous figures are still shown. */
  refreshing: boolean;
  data: AwsCostSummary | null;
  /** True when the summary came back live from Cost Explorer. */
  live: boolean;
}

/** Just the by-service/by-month summary (used by the AWS Spend section). */
/** `monthsOffset` shifts the window back whole calendar months; 1 with months=1 is
 *  the last COMPLETE month. It is part of the effect deps, so changing it refetches. */
export function useAwsCost(months = 6, aiOnly = false, monthsOffset = 0): UseAwsCostResult {
  const { loading, refreshing, begin, end } = useFetchPhase();
  const [data, setData] = useState<AwsCostSummary | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    begin();
    governCostApi
      .summary(months, aiOnly, monthsOffset)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          updateSource('aws-cost-explorer', { status: 'error', error: 'Cost Explorer API unavailable' });
        }
      })
      .finally(() => { if (!cancelled) end(); });
    return () => { cancelled = true; };
  // monthsOffset MUST be here: month-to-date and last month are both months=1, so
  // without it switching between them would not refetch and the panel would keep
  // showing the previous period under the new label.
  }, [months, monthsOffset, aiOnly, updateSource]);

  return { loading, refreshing, data, live: !!data?.live };
}

export interface UseAwsCostDetailResult {
  loading: boolean;
  /** True while a new window is in flight and previous figures are still shown. */
  refreshing: boolean;
  trend: AwsCostTrend | null;
  forecast: AwsCostForecast | null;
  anomalies: AwsCostAnomalies | null;
  byModel: AwsCostModelBreakdown | null;
}

/** Trend + forecast + anomalies + by-model together, fetched in parallel, each independently graceful. */
/**
 * Note the mixed windows, which is deliberate and must stay visible to callers:
 * `trend` and `anomalies` take DAYS and are capped at 90 by their routes, while
 * `byModel` takes calendar MONTHS and follows the page selector. A caller selecting
 * "1 year" gets a year of by-model data and 90 days of trend - so the trend panel has
 * to label its own window rather than inherit the page heading.
 */
export function useAwsCostDetail(trendDays = 30, forecastMonths = 3, anomalyDays = 60, modelMonths = 6, modelMonthsOffset = 0): UseAwsCostDetailResult {
  const { loading, refreshing, begin, end } = useFetchPhase();
  const [trend, setTrend] = useState<AwsCostTrend | null>(null);
  const [forecast, setForecast] = useState<AwsCostForecast | null>(null);
  const [anomalies, setAnomalies] = useState<AwsCostAnomalies | null>(null);
  const [byModel, setByModel] = useState<AwsCostModelBreakdown | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    begin();
    Promise.allSettled([
      governCostApi.trend(trendDays),
      governCostApi.forecast(forecastMonths),
      governCostApi.anomalies(anomalyDays),
      governCostApi.byModel(modelMonths, modelMonthsOffset),
    ]).then(([t, f, a, m]) => {
      if (cancelled) return;
      const trendData = t.status === 'fulfilled' ? t.value : null;
      const forecastData = f.status === 'fulfilled' ? f.value : null;
      const anomaliesData = a.status === 'fulfilled' ? a.value : null;
      const byModelData = m.status === 'fulfilled' ? m.value : null;

      setTrend(trendData);
      setForecast(forecastData);
      setAnomalies(anomaliesData);
      setByModel(byModelData);

      // Update data source status if any of the cost data is live
      if (trendData?.live || forecastData?.live || anomaliesData?.live || byModelData?.live) {
        updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
      }
    }).finally(() => { if (!cancelled) end(); });
    return () => { cancelled = true; };
  }, [trendDays, forecastMonths, anomalyDays, modelMonths, modelMonthsOffset, updateSource]);

  return { loading, refreshing, trend, forecast, anomalies, byModel };
}

export interface UseAwsUseCaseSpendResult {
  loading: boolean;
  data: AwsUseCaseSpendResponse | null;
  /** True when real per-use-case spend rows came back from the spend store. */
  live: boolean;
}

/**
 * Per-deployed-use-case LLM spend (the Build→FinOps loop). Reads the FinOps
 * spend store the aggregator writes; when it isn't provisioned the backend
 * returns an honest not-configured payload (live=false) rather than erroring.
 */
export function useAwsUseCaseSpend(days = 30): UseAwsUseCaseSpendResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsUseCaseSpendResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .byUseCase(days)
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return { loading, data, live: !!data?.live };
}

export interface UseAwsForecastResult {
  loading: boolean;
  data: AwsCostForecast | null;
  live: boolean;
}

export function useAwsForecast(months = 12): UseAwsForecastResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsCostForecast | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .forecast(months)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, updateSource]);

  return { loading, data, live: !!data?.live };
}

export interface UseAwsCostEnhancedResult {
  loading: boolean;
  /** True while a new window is in flight and previous figures are still shown. */
  refreshing: boolean;
  byRegion: AwsCostRegionBreakdown | null;
  byOperation: AwsCostOperationBreakdown | null;
  tokenCosts: AwsTokenCostBreakdown | null;
  agentCosts: AwsAgentCostResponse | null;
  commitmentCoverage: AwsCommitmentCoverage | null;
}

export function useAwsCostEnhanced(months = 6, monthsOffset = 0): UseAwsCostEnhancedResult {
  const { loading, refreshing, begin, end } = useFetchPhase();
  const [byRegion, setByRegion] = useState<AwsCostRegionBreakdown | null>(null);
  const [byOperation, setByOperation] = useState<AwsCostOperationBreakdown | null>(null);
  const [tokenCosts, setTokenCosts] = useState<AwsTokenCostBreakdown | null>(null);
  const [agentCosts, setAgentCosts] = useState<AwsAgentCostResponse | null>(null);
  const [commitmentCoverage, setCommitmentCoverage] = useState<AwsCommitmentCoverage | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    begin();
    Promise.allSettled([
      governCostApi.byRegion(months, monthsOffset),
      governCostApi.byOperation(months, monthsOffset),
      governCostApi.tokenCosts(months, monthsOffset),
      governCostApi.agentCosts(months, monthsOffset),
      governCostApi.commitmentCoverage(),
    ]).then(([r, o, t, a, c]) => {
      if (cancelled) return;
      const regionData = r.status === 'fulfilled' ? r.value : null;
      const operationData = o.status === 'fulfilled' ? o.value : null;
      const tokenData = t.status === 'fulfilled' ? t.value : null;
      const agentData = a.status === 'fulfilled' ? a.value : null;
      const commitmentData = c.status === 'fulfilled' ? c.value : null;

      setByRegion(regionData);
      setByOperation(operationData);
      setTokenCosts(tokenData);
      setAgentCosts(agentData);
      setCommitmentCoverage(commitmentData);

      if (regionData?.live || operationData?.live || tokenData?.live || agentData?.live || commitmentData?.live) {
        updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
      }
    }).finally(() => { if (!cancelled) end(); });
    return () => { cancelled = true; };
  // monthsOffset MUST be here: month-to-date and last month are both months=1, so
  // without it switching between them would not refetch and the panel would keep
  // showing the previous period under the new label.
  }, [months, monthsOffset, updateSource]);

  return { loading, refreshing, byRegion, byOperation, tokenCosts, agentCosts, commitmentCoverage };
}

export interface UseAgentCoreCostsResult {
  loading: boolean;
  data: AwsAgentCostResponse | null;
  live: boolean;
}

/**
 * Per-agent cost attribution from CloudWatch AgentCore metrics + Cost Explorer.
 * Uses the activated cost allocation tags (agentcore:project-name, finopsmanaged).
 */
export function useAgentCoreCosts(days = 30): UseAgentCoreCostsResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsAgentCostResponse | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .agentcoreCosts(days)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cloudwatch', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, updateSource]);

  return { loading, data, live: !!data?.live };
}

export interface UseAgentForecastResult {
  loading: boolean;
  data: AwsAgentForecastResponse | null;
  live: boolean;
}

/**
 * Per-agent cost forecast using historical CloudWatch metrics + linear regression.
 */
export function useAgentForecast(lookbackDays = 30, forecastMonths = 3): UseAgentForecastResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsAgentForecastResponse | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .agentForecast(lookbackDays, forecastMonths)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cloudwatch', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lookbackDays, forecastMonths, updateSource]);

  return { loading, data, live: !!data?.live };
}

export interface UseCostComparisonResult {
  loading: boolean;
  data: AwsCostComparisonResponse | null;
  live: boolean;
}

/**
 * Cost comparison drivers - explains why costs changed month-over-month.
 */
export function useCostComparison(baseMonthsAgo = 1): UseCostComparisonResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsCostComparisonResponse | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .costComparison(baseMonthsAgo)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [baseMonthsAgo, updateSource]);

  return { loading, data, live: !!data?.live };
}

export interface UseRightsizingResult {
  loading: boolean;
  data: AwsRightsizingResponse | null;
  live: boolean;
}

/**
 * Rightsizing recommendations - find underutilized instances to save costs.
 */
export function useRightsizing(service = "AmazonEC2", lookback = "FOURTEEN_DAYS"): UseRightsizingResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsRightsizingResponse | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .rightsizing(service, lookback)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [service, lookback, updateSource]);

  return { loading, data, live: !!data?.live };
}

// ─── Dashboard Summary ─── fast-load hero card for FinOps dashboard
export interface UseDashboardSummaryResult {
  loading: boolean;
  data: AwsFinOpsDashboardSummary | null;
  live: boolean;
}

/**
 * Dashboard summary - MTD spend, MoM change, budget health, anomaly count.
 * Designed to load quickly as the first card on the FinOps dashboard.
 */
export function useDashboardSummary(): UseDashboardSummaryResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsFinOpsDashboardSummary | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .dashboardSummary()
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [updateSource]);

  return { loading, data, live: !!data?.live };
}

// ─── Service Quotas Lite ─── fast-load quotas for dashboard
export interface UseServiceQuotasLiteResult {
  loading: boolean;
  data: AwsServiceQuotasResponse | null;
  live: boolean;
}

/**
 * Service quotas (lite) - key Bedrock quotas for the dashboard.
 * Uses a faster endpoint that returns only the most important quotas.
 */
export function useServiceQuotasLite(serviceCode = "bedrock"): UseServiceQuotasLiteResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsServiceQuotasResponse | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .serviceQuotasLite(serviceCode)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-service-quotas', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [serviceCode, updateSource]);

  return { loading, data, live: !!data?.live };
}

// ─── Enhanced Token Costs ─── with estimated token counts
export interface UseTokenCostsResult {
  loading: boolean;
  /** True while a new window is in flight and previous figures are still shown. */
  refreshing: boolean;
  data: AwsTokenCostBreakdown | null;
  live: boolean;
}

/**
 * Token costs with estimated token counts from Cost Explorer usage types.
 */
export function useTokenCosts(months = 6, monthsOffset = 0): UseTokenCostsResult {
  const { loading, refreshing, begin, end } = useFetchPhase();
  const [data, setData] = useState<AwsTokenCostBreakdown | null>(null);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    begin();
    governCostApi
      .tokenCosts(months, monthsOffset)
      .then(res => {
        if (!cancelled) {
          setData(res);
          if (res?.live) {
            updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) end(); });
    return () => { cancelled = true; };
  // monthsOffset MUST be here: month-to-date and last month are both months=1, so
  // without it switching between them would not refetch and the panel would keep
  // showing the previous period under the new label.
  }, [months, monthsOffset, updateSource]);

  return { loading, refreshing, data, live: !!data?.live };
}

export default useAwsCost;
