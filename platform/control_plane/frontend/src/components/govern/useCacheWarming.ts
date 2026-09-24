/**
 * useCacheWarming - Pre-fetches common Govern data on app load to reduce
 * perceived latency when navigating between pages.
 *
 * This hook fires immediately on mount and pre-warms the backend cache
 * for frequently-used endpoints. Also updates DataSourceContext status
 * based on which APIs return successfully.
 */
import { useEffect, useRef } from 'react';
import {
  governCostApi,
  governPostureApi,
  governModelsApi,
  governGuardrailsApi,
  governAgentCoreApi,
  governRiskPostureApi,
  governEvalsApi,
  governTrailApi,
  governDataSourcesApi,
  governSecurityApi,
  deploymentsApi,
} from '../../api/client';
import { useDataSources } from './DataSourceContext';

const WARM_CACHE_KEY = 'govern_cache_warmed';
const WARM_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export function useCacheWarming() {
  const warmedRef = useRef(false);
  const { updateSource } = useDataSources();

  useEffect(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;

    // Check if we recently warmed the cache (avoid re-warming on every route change)
    const lastWarmed = sessionStorage.getItem(WARM_CACHE_KEY);
    if (lastWarmed && Date.now() - parseInt(lastWarmed, 10) < WARM_CACHE_TTL) {
      return;
    }

    // Fire all pre-fetch calls immediately in parallel
    const warmCache = async () => {
      const now = Date.now();
      try {
        const [
          dataSourcesRes,
          costRes,
          _costByModelRes,
          _budgetsRes,
          configRes,
          securityRes,
          securityPostureRes,
          catalogRes,
          metricsRes,
          guardrailsRes,
          agentMetricsRes,
          agentsRes,
          evalsRes,
          trailRes,
          _deploymentsRes,
        ] = await Promise.allSettled([
          // Data sources status - critical for showing connection state
          governDataSourcesApi.status(),

          // Cost data - commonly needed across Dashboard, FinOps
          governCostApi.summary(6, false),
          governCostApi.byModel(3),
          governCostApi.budgets(),

          // Posture/Compliance - Dashboard, Risk
          governPostureApi.configCompliance(),
          governRiskPostureApi.securityHub(50),
          governSecurityApi.posture(),

          // Models - Model Management, Fleet
          governModelsApi.catalog(),
          governModelsApi.runtimeMetrics(7),

          // Guardrails - commonly referenced
          governGuardrailsApi.telemetry(),

          // Agents/Fleet - Registry, Fleet Overview
          governAgentCoreApi.agentMetrics(7),
          governAgentCoreApi.agents(),

          // Evals and Audit
          governEvalsApi.jobs(50),
          governTrailApi.aiCallers(),

          // Deployments
          deploymentsApi.list(),
        ]);

        // Update data source statuses based on results
        if (dataSourcesRes.status === 'fulfilled' && dataSourcesRes.value?.summary) {
          const sources = dataSourcesRes.value.sources;
          Object.entries(sources).forEach(([key, info]) => {
            if ((info as { live?: boolean }).live) {
              const sourceMap: Record<string, string> = {
                bedrock_models: 'aws-bedrock',
                bedrock_agents: 'aws-bedrock',
                cost_explorer: 'aws-cost-explorer',
                aws_config: 'aws-config',
                cloudwatch_metrics: 'aws-cloudwatch',
                agentcore_posture: 'aws-agentcore',
                security_services: 'aws-security-hub',
                cloudtrail: 'aws-cloudtrail',
              };
              const sourceId = sourceMap[key];
              if (sourceId) {
                updateSource(sourceId, { status: 'live', lastFetch: now });
              }
            }
          });
        }

        // Fallback updates from individual API responses
        if (costRes.status === 'fulfilled' && costRes.value?.live) {
          updateSource('aws-cost-explorer', { status: 'live', lastFetch: now });
        }
        if (configRes.status === 'fulfilled' && configRes.value?.live) {
          updateSource('aws-config', { status: 'live', lastFetch: now });
        }
        if (securityRes.status === 'fulfilled' && securityRes.value?.live) {
          updateSource('aws-security-hub', { status: 'live', lastFetch: now });
        }
        if (securityPostureRes.status === 'fulfilled' && securityPostureRes.value?.live) {
          updateSource('aws-security-hub', { status: 'live', lastFetch: now });
        }
        if (catalogRes.status === 'fulfilled' && catalogRes.value?.live) {
          updateSource('aws-bedrock', { status: 'live', lastFetch: now });
        }
        if (metricsRes.status === 'fulfilled' && metricsRes.value?.live) {
          updateSource('aws-cloudwatch', { status: 'live', lastFetch: now });
        }
        if (guardrailsRes.status === 'fulfilled' && guardrailsRes.value?.live) {
          updateSource('aws-bedrock', { status: 'live', lastFetch: now });
        }
        if (agentMetricsRes.status === 'fulfilled' && agentMetricsRes.value?.live) {
          updateSource('aws-agentcore', { status: 'live', lastFetch: now });
        }
        if (agentsRes.status === 'fulfilled' && agentsRes.value?.live) {
          updateSource('aws-agentcore', { status: 'live', lastFetch: now });
        }
        if (evalsRes.status === 'fulfilled' && evalsRes.value?.live) {
          updateSource('aws-bedrock', { status: 'live', lastFetch: now });
        }
        if (trailRes.status === 'fulfilled' && trailRes.value?.live) {
          updateSource('aws-cloudtrail', { status: 'live', lastFetch: now });
        }

        sessionStorage.setItem(WARM_CACHE_KEY, Date.now().toString());
      } catch {
        // Ignore errors - this is opportunistic caching
      }
    };

    // Run immediately - no delay
    warmCache();
  }, [updateSource]);
}

export default useCacheWarming;
