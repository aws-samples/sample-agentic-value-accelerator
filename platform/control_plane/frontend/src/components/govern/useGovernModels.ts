/**
 * useGovernModels — live Bedrock model catalog + CloudWatch runtime metrics +
 * per-model Bedrock cost, from the govern_models / govern_cost slices.
 *
 * Degrades gracefully (each dataset independently): on any backend/API failure
 * the dataset is left null / non-live so surfaces can badge the source honestly,
 * mirroring useAwsCost / useGovernanceAggregator.
 */
import { useEffect, useState } from 'react';
import {
  governModelsApi, governCostApi,
  type AwsFoundationModelCatalog,
  type AwsModelMetricsResponse,
  type AwsCostModelBreakdown,
} from '../../api/client';
import { usePollingKey } from './usePollingKey';
import { useDataSources } from './DataSourceContext';

export interface UseGovernModelsResult {
  loading: boolean;
  catalog: AwsFoundationModelCatalog | null;
  metrics: AwsModelMetricsResponse | null;
  cost: AwsCostModelBreakdown | null;
  /** True when the Bedrock catalog came back live. */
  catalogLive: boolean;
  /** True when CloudWatch runtime metrics came back live. */
  metricsLive: boolean;
}

/**
 * All three model-related live datasets, fetched in parallel and each
 * independently graceful. `days` scopes the CloudWatch runtime window;
 * `costMonths` scopes the Bedrock by-model cost window.
 */
export function useGovernModels(days = 7, costMonths = 3): UseGovernModelsResult {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<AwsFoundationModelCatalog | null>(null);
  const [metrics, setMetrics] = useState<AwsModelMetricsResponse | null>(null);
  const [cost, setCost] = useState<AwsCostModelBreakdown | null>(null);
  const pollKey = usePollingKey(60_000);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    // Only show the spinner on the first load; poll-driven refetches are silent
    // (pollKey>0) so the runtime strip updates in place.
    if (pollKey === 0) setLoading(true);
    Promise.allSettled([
      governModelsApi.catalog(),
      governModelsApi.runtimeMetrics(days),
      governCostApi.byModel(costMonths),
    ]).then(([c, m, k]) => {
      if (cancelled) return;
      const catalogData = c.status === 'fulfilled' ? c.value : null;
      const metricsData = m.status === 'fulfilled' ? m.value : null;
      const costData = k.status === 'fulfilled' ? k.value : null;

      setCatalog(catalogData);
      setMetrics(metricsData);
      setCost(costData);

      // Update data source statuses
      if (catalogData?.live) {
        updateSource('aws-bedrock', { status: 'live', lastFetch: Date.now() });
      }
      if (metricsData?.live) {
        updateSource('aws-cloudwatch', { status: 'live', lastFetch: Date.now() });
      }
      if (costData?.live) {
        updateSource('aws-cost-explorer', { status: 'live', lastFetch: Date.now() });
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, costMonths, pollKey, updateSource]);

  return {
    loading, catalog, metrics, cost,
    catalogLive: !!catalog?.live,
    metricsLive: !!metrics?.live,
  };
}

export default useGovernModels;
