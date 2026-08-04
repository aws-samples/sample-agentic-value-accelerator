/**
 * useAwsCost — fetches real AWS spend from the govern_cost backend slice
 * (Cost Explorer). Degrades gracefully: on any network/backend failure each
 * dataset is left null / non-live so the FinOps surface can badge the source
 * honestly instead of breaking. Mirrors the useGovernanceAggregator pattern.
 */
import { useEffect, useState } from 'react';
import {
  governCostApi,
  type AwsCostSummary,
  type AwsCostTrend,
  type AwsCostForecast,
  type AwsCostAnomalies,
  type AwsCostModelBreakdown,
  type AwsUseCaseSpendResponse,
} from '../../api/client';

export interface UseAwsCostResult {
  loading: boolean;
  data: AwsCostSummary | null;
  /** True when the summary came back live from Cost Explorer. */
  live: boolean;
}

/** Just the by-service/by-month summary (used by the AWS Spend section). */
export function useAwsCost(months = 6, aiOnly = false): UseAwsCostResult {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsCostSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governCostApi
      .summary(months, aiOnly)
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, aiOnly]);

  return { loading, data, live: !!data?.live };
}

export interface UseAwsCostDetailResult {
  loading: boolean;
  trend: AwsCostTrend | null;
  forecast: AwsCostForecast | null;
  anomalies: AwsCostAnomalies | null;
  byModel: AwsCostModelBreakdown | null;
}

/** Trend + forecast + anomalies + by-model together, fetched in parallel, each independently graceful. */
export function useAwsCostDetail(trendDays = 30, forecastMonths = 3, anomalyDays = 60, modelMonths = 6): UseAwsCostDetailResult {
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<AwsCostTrend | null>(null);
  const [forecast, setForecast] = useState<AwsCostForecast | null>(null);
  const [anomalies, setAnomalies] = useState<AwsCostAnomalies | null>(null);
  const [byModel, setByModel] = useState<AwsCostModelBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      governCostApi.trend(trendDays),
      governCostApi.forecast(forecastMonths),
      governCostApi.anomalies(anomalyDays),
      governCostApi.byModel(modelMonths),
    ]).then(([t, f, a, m]) => {
      if (cancelled) return;
      setTrend(t.status === 'fulfilled' ? t.value : null);
      setForecast(f.status === 'fulfilled' ? f.value : null);
      setAnomalies(a.status === 'fulfilled' ? a.value : null);
      setByModel(m.status === 'fulfilled' ? m.value : null);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trendDays, forecastMonths, anomalyDays, modelMonths]);

  return { loading, trend, forecast, anomalies, byModel };
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

export default useAwsCost;
