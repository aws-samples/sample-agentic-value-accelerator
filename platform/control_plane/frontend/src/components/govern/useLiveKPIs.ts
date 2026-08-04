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
  type AwsDiscoveredAgentsResponse,
  type AwsConfigCompliance,
  type AwsRiskPostureResponse,
  type AwsSecurityPostureResponse,
  type AwsGuardrailTelemetryResponse,
  type AwsInvocationSafetyResponse,
  type AwsCostModelBreakdown,
  type AwsModelMetricsResponse,
  type AwsAiCallersResponse,
} from '../../api/client';

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
  externalAgents: 45,  // Multi-cloud + SaaS placeholder
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
        governCostApi.byModel(30),
        governModelsApi.runtimeMetrics(7),
        governTrailApi.aiCallers(168),
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
      result.fleetErrorRatePct = runtime.fleet_error_rate_pct;
      result.avgLatencyMs = runtime.avg_latency_ms;
    }

    // AI callers (shadow AI)
    if (callers?.live) {
      result.unrecognizedCallers = callers.unrecognized;
      result.totalAiCallers = callers.total;
    }

    // Compute governed percentage
    // Agents with policies = agents covered by at least one active guardrail
    // Using guardrailsWithMetrics as proxy for governed agents
    const totalManagedAgents = result.totalAgents + result.externalAgents;
    if (totalManagedAgents > 0 && result.guardrailsWithMetrics > 0) {
      // Assume each guardrail with metrics covers some agents
      // This is a heuristic - real implementation would track agent-guardrail mappings
      result.governedAgents = Math.min(
        result.guardrailsWithMetrics * 3, // Assume ~3 agents per guardrail
        totalManagedAgents,
      );
      result.governedPct = Math.round((result.governedAgents / totalManagedAgents) * 100);
    }

    return result;
  }, [agents, config, security, riskHub, guardrails, invSafety, cost, runtime, callers]);

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
