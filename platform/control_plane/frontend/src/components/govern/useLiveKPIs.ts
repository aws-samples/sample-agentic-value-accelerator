/**
 * useLiveKPIs — Centralized hook for Command Center KPIs from live AWS APIs.
 *
 * Aggregates data from multiple govern APIs to compute executive-level KPIs:
 * - Total agents (from governAgentCoreApi)
 * - Compliance % (from governPostureApi configCompliance)
 * - Risk score (from governRiskPostureApi securityHub + governSecurityApi)
 * - Guardrail block rate (from governGuardrailsApi telemetry)
 * - Cost metrics (from governCostApi)
 * - Invocation safety (from governInvocationSafetyApi)
 *
 * Returns live values where available, with fallback to mock/default values.
 * All fetches are independent and gracefully handle failures.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  governAgentCoreApi,
  governPostureApi,
  governRiskPostureApi,
  governSecurityApi,
  governGuardrailsApi,
  governInvocationSafetyApi,
  governCostApi,
  governModelsApi,
  governTrailApi,
  governResourceTagsApi,
  type AwsDiscoveredAgentsResponse,
  type AwsConfigCompliance,
  type AwsRiskPostureResponse,
  type AwsSecurityPostureResponse,
  type AwsGuardrailTelemetryResponse,
  type AwsInvocationSafetyResponse,
  type AwsCostModelBreakdown,
  type AwsModelMetricsResponse,
  type AwsAiCallersResponse,
  type AwsGovernanceResourceTagsResponse,
} from '../../api/client';
import { useDataSources } from './DataSourceContext';

// ─────────────────────────── Types ───────────────────────────

export interface LiveKPIs {
  // Agent counts
  totalAgents: number;
  bedrockAgents: number;
  agentcoreRuntimes: number;
  externalAgents: number;  // Multi-cloud + SaaS
  governedAgents: number;
  governedPct: number;

  // Compliance
  configCompliancePct: number;
  configCompliant: number;
  configNonCompliant: number;
  configTotalRules: number;

  // Security / Risk
  criticalFindings: number;
  highFindings: number;
  totalFindings: number;
  securitySourcesLive: number;

  // Guardrails
  totalGuardrails: number;
  guardrailInvocations: number;
  guardrailInterventions: number;
  interventionRatePct: number;
  guardrailsWithMetrics: number;

  // Invocation Safety
  guardrailBlocked: number;
  invocationWindowDays: number;
  invocationInterventionPct: number;

  // Cost
  totalCost: number;
  costWindowDays: number;
  costByModel: { model: string; amount: number }[];

  // Runtime
  totalInvocations: number;
  /**
   * Trailing window the CloudWatch invocation count covers, in days.
   *
   * Load-bearing: `totalCost` comes from governCostApi.byModel(12) - TWELVE MONTHS -
   * while `totalInvocations` comes from governModelsApi.runtimeMetrics(7) - SEVEN DAYS.
   * Dividing one by the other without normalising overstated cost per invocation by
   * roughly the ratio of the windows. Any consumer combining the two must reduce both
   * to a daily rate first.
   */
  runtimeWindowDays: number;
  fleetErrorRatePct: number;
  avgLatencyMs: number;

  // Shadow AI
  unrecognizedCallers: number;
  totalAiCallers: number;
}

export interface LiveKPIsResult {
  loading: boolean;
  error: string | null;
  kpis: LiveKPIs;
  liveFlags: {
    agents: boolean;
    config: boolean;
    security: boolean;
    guardrails: boolean;
    invocationSafety: boolean;
    cost: boolean;
    runtime: boolean;
    callers: boolean;
  };
  liveSources: string[];
  refresh: () => void;
}

// ─────────────────────────── Default/Fallback Values ───────────────────────────

const DEFAULT_KPIS: LiveKPIs = {
  // Agent counts - fallback to illustrative values
  totalAgents: 0,
  bedrockAgents: 0,
  agentcoreRuntimes: 0,
  // This hook has NO multi-cloud/SaaS source, so it cannot produce a real external-agent count.
  // It stays 0 rather than carrying a fabricated constant that leaked into the governed
  // denominator below and into the command center's External KPI. Consumers that need this
  // figure must sum the live connector inventories themselves (see GovernanceCommandCenter).
  externalAgents: 0,
  governedAgents: 0,
  governedPct: 0,

  // Compliance
  configCompliancePct: 0,
  configCompliant: 0,
  configNonCompliant: 0,
  configTotalRules: 0,

  // Security / Risk
  criticalFindings: 0,
  highFindings: 0,
  totalFindings: 0,
  securitySourcesLive: 0,

  // Guardrails
  totalGuardrails: 0,
  guardrailInvocations: 0,
  guardrailInterventions: 0,
  interventionRatePct: 0,
  guardrailsWithMetrics: 0,

  // Invocation Safety
  guardrailBlocked: 0,
  invocationWindowDays: 7,
  invocationInterventionPct: 0,

  // Cost
  totalCost: 0,
  costWindowDays: 30,
  costByModel: [],

  // Runtime
  totalInvocations: 0,
  runtimeWindowDays: 7,
  fleetErrorRatePct: 0,
  avgLatencyMs: 0,

  // Shadow AI
  unrecognizedCallers: 0,
  totalAiCallers: 0,
};

// ─────────────────────────── Hook ───────────────────────────

export function useLiveKPIs(pollIntervalMs = 60_000): LiveKPIsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Data source context for health reporting
  const { updateSource } = useDataSources();

  // Live data slices
  const [agents, setAgents] = useState<AwsDiscoveredAgentsResponse | null>(null);
  const [config, setConfig] = useState<AwsConfigCompliance | null>(null);
  const [riskHub, setRiskHub] = useState<AwsRiskPostureResponse | null>(null);
  const [security, setSecurity] = useState<AwsSecurityPostureResponse | null>(null);
  const [guardrails, setGuardrails] = useState<AwsGuardrailTelemetryResponse | null>(null);
  const [invSafety, setInvSafety] = useState<AwsInvocationSafetyResponse | null>(null);
  const [cost, setCost] = useState<AwsCostModelBreakdown | null>(null);
  const [runtime, setRuntime] = useState<AwsModelMetricsResponse | null>(null);
  const [callers, setCallers] = useState<AwsAiCallersResponse | null>(null);
  const [resourceTags, setResourceTags] = useState<AwsGovernanceResourceTagsResponse | null>(null);

  // Polling effect
  useEffect(() => {
    const fetchAll = async () => {
      // Don't set loading on refresh to avoid flash
      if (refreshKey === 0) setLoading(true);

      const results = await Promise.allSettled([
        governAgentCoreApi.agents(),
        governPostureApi.configCompliance(),
        governRiskPostureApi.securityHub(200),
        governSecurityApi.posture(),
        governGuardrailsApi.telemetry(30),
        governInvocationSafetyApi.telemetry(7),
        governCostApi.byModel(12),
        governModelsApi.runtimeMetrics(7),
        governTrailApi.aiCallers(168),
        governResourceTagsApi.coverage(),
      ]);

      // Process each result independently - failures don't block others
      const [
        agentsRes,
        configRes,
        riskRes,
        securityRes,
        guardrailsRes,
        invSafetyRes,
        costRes,
        runtimeRes,
        callersRes,
        resourceTagsRes,
      ] = results;

      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value);
      if (configRes.status === 'fulfilled') setConfig(configRes.value);
      if (riskRes.status === 'fulfilled') setRiskHub(riskRes.value);
      if (securityRes.status === 'fulfilled') setSecurity(securityRes.value);
      if (guardrailsRes.status === 'fulfilled') setGuardrails(guardrailsRes.value);
      if (invSafetyRes.status === 'fulfilled') setInvSafety(invSafetyRes.value);
      if (costRes.status === 'fulfilled') setCost(costRes.value);
      if (runtimeRes.status === 'fulfilled') setRuntime(runtimeRes.value);
      if (callersRes.status === 'fulfilled') setCallers(callersRes.value);
      if (resourceTagsRes.status === 'fulfilled') setResourceTags(resourceTagsRes.value);

      // Update data source health based on fetch results
      const now = Date.now();
      // Bedrock (agents, guardrails)
      if (agentsRes.status === 'fulfilled' && agentsRes.value?.live) {
        updateSource('aws-bedrock', { status: 'live', lastFetch: now });
      } else if (agentsRes.status === 'rejected') {
        updateSource('aws-bedrock', { status: 'error', error: 'API unavailable' });
      }
      // Config
      if (configRes.status === 'fulfilled' && configRes.value?.live) {
        updateSource('aws-config', { status: 'live', lastFetch: now });
      } else if (configRes.status === 'rejected') {
        updateSource('aws-config', { status: 'error', error: 'API unavailable' });
      }
      // Security Hub
      if ((riskRes.status === 'fulfilled' && riskRes.value?.live) ||
          (securityRes.status === 'fulfilled' && securityRes.value?.live)) {
        updateSource('aws-security-hub', { status: 'live', lastFetch: now });
      }
      // CloudWatch (runtime metrics)
      if (runtimeRes.status === 'fulfilled' && runtimeRes.value?.live) {
        updateSource('aws-cloudwatch', { status: 'live', lastFetch: now });
      }
      // Cost Explorer
      if (costRes.status === 'fulfilled' && costRes.value?.live) {
        updateSource('aws-cost-explorer', { status: 'live', lastFetch: now });
      }
      // CloudTrail (callers)
      if (callersRes.status === 'fulfilled' && callersRes.value?.live) {
        updateSource('aws-cloudtrail', { status: 'live', lastFetch: now });
      }

      // Check if all critical fetches failed
      const anySuccess = results.some(r => r.status === 'fulfilled');
      if (!anySuccess) {
        setError('Unable to fetch live data - showing fallback values');
      } else {
        setError(null);
      }

      setLoading(false);
    };

    fetchAll();

    // Set up polling interval
    const intervalId = setInterval(fetchAll, pollIntervalMs);
    return () => clearInterval(intervalId);
  }, [refreshKey, pollIntervalMs]);

  // Compute live flags
  const liveFlags = useMemo(() => ({
    agents: !!agents?.live,
    config: !!config?.live,
    security: !!security?.live || !!riskHub?.live,
    guardrails: !!guardrails?.live,
    invocationSafety: !!invSafety?.live,
    cost: !!cost?.live,
    runtime: !!runtime?.live,
    callers: !!callers?.live,
  }), [agents, config, security, riskHub, guardrails, invSafety, cost, runtime, callers]);

  // Compute live sources list
  const liveSources = useMemo(() => {
    const sources: string[] = [];
    if (liveFlags.agents) sources.push('Bedrock Agents');
    if (liveFlags.config) sources.push('AWS Config');
    if (liveFlags.security) sources.push('Security Hub');
    if (liveFlags.guardrails) sources.push('Bedrock Guardrails');
    if (liveFlags.invocationSafety) sources.push('Invocation Logs');
    if (liveFlags.cost) sources.push('Cost Explorer');
    if (liveFlags.runtime) sources.push('CloudWatch');
    if (liveFlags.callers) sources.push('CloudTrail');
    return sources;
  }, [liveFlags]);

  // Compute aggregated KPIs
  const kpis = useMemo<LiveKPIs>(() => {
    // Start with defaults
    const result = { ...DEFAULT_KPIS };

    // Agents
    if (agents?.live) {
      result.totalAgents = agents.total;
      result.bedrockAgents = agents.bedrock_agents;
      result.agentcoreRuntimes = agents.agentcore_runtimes;
    }

    // Config compliance
    if (config?.live) {
      result.configCompliancePct = config.pct_compliant;
      result.configCompliant = config.compliant;
      result.configNonCompliant = config.non_compliant;
      result.configTotalRules = config.total_rules;
    }

    // Security posture - prefer multi-service posture over Security Hub alone
    if (security?.live) {
      result.criticalFindings = security.critical;
      result.highFindings = security.high;
      result.totalFindings = security.total_findings;
      result.securitySourcesLive = security.sources_live;
    } else if (riskHub?.live) {
      result.criticalFindings = riskHub.critical;
      result.highFindings = riskHub.high;
      result.totalFindings = riskHub.total;
      result.securitySourcesLive = 1;
    }

    // Guardrails telemetry
    if (guardrails?.live) {
      result.totalGuardrails = guardrails.total_guardrails;
      result.guardrailInvocations = guardrails.total_invocations;
      result.guardrailInterventions = guardrails.total_interventions;
      result.interventionRatePct = guardrails.intervention_rate_pct;
      result.guardrailsWithMetrics = guardrails.guardrails_with_metrics;
    }

    // Invocation safety
    if (invSafety?.live) {
      result.guardrailBlocked = invSafety.guardrail_intervened;
      result.invocationWindowDays = invSafety.window_days;
      result.invocationInterventionPct = invSafety.intervention_rate_pct;
    }

    // Cost
    if (cost?.live) {
      result.totalCost = cost.total;
      // Compute window days from period_start/period_end if available
      if (cost.period_start && cost.period_end) {
        const start = new Date(cost.period_start);
        const end = new Date(cost.period_end);
        result.costWindowDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }
      result.costByModel = cost.by_model.map(m => ({
        model: m.model,
        amount: m.amount,
      }));
    }

    // Runtime metrics
    if (runtime?.live) {
      result.totalInvocations = runtime.total_invocations;
      result.runtimeWindowDays = runtime.window_days ?? 7;
      result.fleetErrorRatePct = runtime.fleet_error_rate_pct;
      result.avgLatencyMs = runtime.avg_latency_ms;
    }

    // AI callers (shadow AI)
    if (callers?.live) {
      result.unrecognizedCallers = callers.unrecognized;
      result.totalAiCallers = callers.total_callers;
    }

    // Compute governed percentage.
    // Prefer the REAL governed denominator from Resource Groups Tagging (AI resources carrying
    // owner/project governance tags) over the old guardrails*3 heuristic; fall back to the
    // heuristic only when the tag source is not live.
    const totalManagedAgents = result.totalAgents + result.externalAgents;
    if (resourceTags?.live && resourceTags.total_ai_resources > 0) {
      result.governedAgents = resourceTags.governed_denominator;
      result.governedPct = resourceTags.governed_pct;
    } else if (totalManagedAgents > 0 && result.guardrailsWithMetrics > 0) {
      // Fallback heuristic (tag source unavailable): ~3 agents per guardrail-with-metrics.
      result.governedAgents = Math.min(
        result.guardrailsWithMetrics * 3,
        totalManagedAgents,
      );
      result.governedPct = Math.round((result.governedAgents / totalManagedAgents) * 100);
    }

    return result;
  }, [agents, config, security, riskHub, guardrails, invSafety, cost, runtime, callers, resourceTags]);

  const refresh = () => setRefreshKey(k => k + 1);

  return {
    loading,
    error,
    kpis,
    liveFlags,
    liveSources,
    refresh,
  };
}

export default useLiveKPIs;
