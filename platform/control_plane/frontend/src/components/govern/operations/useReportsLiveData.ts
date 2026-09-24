/**
 * useReportsLiveData - Aggregates live data from all platform sources for Reports
 *
 * Combines data from:
 * - governAgentCoreApi: Discovered agents (Bedrock + AgentCore)
 * - governFleetApi: Fleet summary
 * - governGuardrailsApi: Guardrail intervention telemetry
 * - complianceApi: Compliance posture across frameworks
 * - governSecurityApi: Security findings posture
 * - governRiskPostureApi: Risk posture from Security Hub
 * - deploymentsApi: Live AVA deployments
 *
 * Provides:
 * - useAgentResourceData(): Full agent resource inventory with controls
 * - useFrameworkCompliance(): Live compliance data per framework
 * - useReportsDataSummary(): Aggregate stats for reports dashboard
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  governAgentCoreApi,
  governFleetApi,
  governGuardrailsApi,
  complianceApi,
  governSecurityApi,
  governRiskPostureApi,
  deploymentsApi,
  type AwsDiscoveredAgent,
  type AwsGuardrailSummary,
  type CompliancePosture,
  type FleetSummaryResponse,
  type AwsSecurityPostureResponse,
  type AwsRiskPostureResponse,
} from '../../../api/client';
import type { Deployment } from '../../../types';

// ============================================================================
// Types
// ============================================================================

export type DataSourceStatus = 'live' | 'partial' | 'mock' | 'error';

export interface DataSourceInfo {
  name: string;
  status: DataSourceStatus;
  lastFetched: string | null;
  recordCount: number;
  error?: string;
}

export interface AgentResourceSummary {
  agentId: string;
  agentName: string;
  agentArn?: string;
  status: 'active' | 'inactive' | 'creating' | 'failed';
  riskTier: 'critical' | 'high' | 'medium' | 'low' | 'unassessed';
  provider: 'AWS' | 'Azure' | 'GCP' | 'Custom';
  /** undefined when the region could not be determined for this agent (see the mapper). */
  region?: string;
  framework: string;
  businessUnit?: string;
  owner?: string;
  createdAt?: string;
  lastInvoked?: string;
  isLive: boolean;

  // Resource counts. All optional: undefined means "not retrieved", which must not render as
  // a measured 0. `guardrailCount` became optional because deployment-sourced rows carry no
  // guardrail data at all - the deployment record has no such field - so the 0 they used to
  // report was an assertion that the agent has none, not a count.
  guardrailCount?: number;
  policyCount?: number;
  knowledgeBaseCount?: number;
  actionGroupCount?: number;

  // Metrics. All optional: none of these is measured per agent by the discovery APIs.
  // undefined means "no source", which must not render as a measured zero.
  invocations24h?: number;
  errorRate?: number;
  interventionRate?: number;
  latencyP99?: number;

  // Linked resources
  guardrailIds: string[];
  knowledgeBaseIds: string[];
  actionGroupIds: string[];
}

export interface GuardrailSummary {
  guardrailId: string;
  name: string;
  version: string;
  status: string;
  invocations: number;
  interventions: number;
  interventionRate: number;
  hasMetrics: boolean;
  isLive: boolean;
  linkedAgentCount: number;
}

export interface FrameworkComplianceSummary {
  frameworkId: string;
  frameworkName: string;
  totalControls: number;
  passCount: number;
  inProgressCount: number;
  failCount: number;
  notStartedCount: number;
  coveragePct: number;
  isLive: boolean;
  lastUpdated?: string;
}

export interface ReportsDataSummary {
  totalAgents: number;
  /**
   * Agents whose OWN source response reported `live: true`.
   *
   * This was previously a tautology: every mapper hardcoded `isLive: true`, so
   * `liveAgents === totalAgents` by construction and "36 of 36 live" only ever meant
   * "36 rows arrived". Each mapper now carries the flag from the response that produced the
   * row (discovery for Bedrock agents, the deployments table for deployment rows), so the
   * comparison against `totalAgents` finally carries information.
   *
   * Two things follow. It can now be legitimately less than `totalAgents` - a mixed fleet is
   * an honest state, not a bug to normalize away. And it is still a count of ROWS FROM LIVE
   * SOURCES, not of agents verified individually: provenance is a property of the response,
   * so a live response with a stale or mis-joined row still counts here. That is the same
   * provenance-versus-identity distinction as the wrong-region reads this branch fixed.
   */
  liveAgents: number;
  totalGuardrails: number;
  /** Guardrails from a telemetry response that reported `live: true`. See `liveAgents`. */
  liveGuardrails: number;
  totalFrameworks: number;
  /**
   * Pass rate over ASSESSED controls, not the estate. Meaningless without
   * assessedControls / totalControls, so render all three together.
   */
  avgCompliancePct: number;
  /** Denominator of avgCompliancePct: controls carrying an attestation. */
  assessedControls: number;
  /** Distinct controls across all frameworks. */
  totalControls: number;
  /** How many of assessedControls were set by auto-detection rather than a human. */
  autoDetectedControls: number;
  totalFindings: number;
  criticalFindings: number;
  dataSources: DataSourceInfo[];
  isFullyLive: boolean;
}

export interface UseAgentResourceDataResult {
  loading: boolean;
  error: string | null;
  agents: AgentResourceSummary[];
  guardrails: GuardrailSummary[];
  totalLive: number;
  totalMock: number;
  dataSources: DataSourceInfo[];
  refresh: () => void;
}

export interface UseFrameworkComplianceResult {
  loading: boolean;
  error: string | null;
  frameworks: FrameworkComplianceSummary[];
  posture: CompliancePosture | null;
  isLive: boolean;
  refresh: () => void;
}

export interface UseReportsDataSummaryResult {
  loading: boolean;
  error: string | null;
  summary: ReportsDataSummary;
  refresh: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

// inferRiskTier() was removed here. It classified an agent's governance risk tier by
// substring-matching its name ('trading' -> critical, 'customer' -> high, 'internal' ->
// medium, anything else -> low). A tier guessed from a name is not an assessment, and the
// fall-through handed the most permissive tier to every agent whose name matched nothing.
/**
 * Region from an ARN's 4th colon-separated field (arn:partition:service:REGION:acct:...).
 * Returns undefined for a missing or malformed ARN rather than guessing a default.
 */
function regionFromArn(arn?: string | null): string | undefined {
  const parts = (arn || '').split(':');
  return parts.length > 3 && parts[3] ? parts[3] : undefined;
}

function extractBusinessUnit(agent: AwsDiscoveredAgent): string {
  const name = (agent.name || '').toLowerCase();
  if (name.includes('underwriting') || name.includes('claims')) return 'Insurance';
  if (name.includes('customer') || name.includes('support')) return 'Customer Experience';
  if (name.includes('internal') || name.includes('hr')) return 'Corporate Services';
  if (name.includes('trading') || name.includes('risk')) return 'Trading';
  return 'General';
}

function mapDiscoveredAgentToSummary(
  agent: AwsDiscoveredAgent,
  guardrailTelemetry: AwsGuardrailSummary[],
  sourceLive: boolean,
): AgentResourceSummary {
  const linkedGuardrails = guardrailTelemetry.filter(g =>
    g.name.toLowerCase().includes((agent.name || '').toLowerCase().slice(0, 10))
  );

  const status = (agent.status || '').toLowerCase();

  return {
    agentId: agent.id,
    agentName: agent.name || `Agent ${agent.id}`,
    // The discovered-agent summary carries no ARN; leave undefined.
    agentArn: undefined,
    status: status === 'prepared' ? 'active' :
            status === 'creating' ? 'creating' :
            status === 'failed' ? 'failed' : 'inactive',
    // Not guessed. See the note on RiskTier in AgentResourceInventory.tsx: this used to call
    // inferRiskTier(), which substring-matched the agent's name and defaulted to 'low'.
    riskTier: 'unassessed',
    provider: 'AWS',
    // Parsed from the agent's own ARN rather than assumed. This used to be a hardcoded
    // 'us-east-1' for every agent, which is wrong on any account whose agents live
    // elsewhere - and this platform's control plane and governed resources are in
    // different regions. AgentCore runtimes carry agentRuntimeArn (account id masked
    // server-side, region intact); classic Bedrock Agent summaries carry no ARN, so those
    // stay undefined and render as unknown rather than as the home region.
    region: regionFromArn(agent.arn),
    framework: 'Bedrock AgentCore',
    businessUnit: extractBusinessUnit(agent),
    owner: undefined,
    // No created_at on the summary; updated_at is the only timestamp available.
    createdAt: agent.updated_at || undefined,
    lastInvoked: agent.updated_at || undefined,
    // Carried from the discovery response's own `live` flag, not hardcoded. This used to be
    // a literal `true`, which made `liveAgents === totalAgents` structurally true and turned
    // "36 of 36 live" into a restatement of the row count. It happened to be honest only
    // because this endpoint returns zero rows when it is not live - a property of that
    // endpoint, not of this mapper.
    isLive: sourceLive,

    guardrailCount: linkedGuardrails.length,
    // `policyCount: 1` asserted a "default AgentCore policy" that nothing verified. No
    // discovery call reports policy engines per agent, so this is not retrieved.
    policyCount: undefined,
    // knowledge_bases / action_groups are not exposed on the discovered-agent summary.
    // undefined, not 0: 0 would state the agent has none.
    knowledgeBaseCount: undefined,
    actionGroupCount: undefined,

    // These are GUARDRAIL figures, and only for guardrails linked to this agent. With no
    // linked guardrail there is nothing to report, and the previous 0 read as measured
    // silence (zero traffic, zero interventions) rather than as no source.
    invocations24h: linkedGuardrails.length > 0
      ? linkedGuardrails.reduce((acc, g) => acc + (g.invocations || 0), 0)
      : undefined,
    errorRate: undefined,
    interventionRate: linkedGuardrails.length > 0
      ? linkedGuardrails.reduce((acc, g) => acc + (g.intervention_rate_pct || 0), 0) / linkedGuardrails.length
      : undefined,
    latencyP99: undefined,

    guardrailIds: linkedGuardrails.map(g => g.guardrail_id),
    knowledgeBaseIds: [],
    actionGroupIds: [],
  };
}

function mapDeploymentToSummary(deployment: Deployment, sourceLive: boolean): AgentResourceSummary {
  return {
    agentId: `deploy-${deployment.deployment_id}`,
    agentName: deployment.deployment_name || `Deployment ${deployment.deployment_id}`,
    agentArn: undefined,
    status: deployment.status === 'deployed' ? 'active' :
            deployment.status === 'deploying' ? 'creating' :
            deployment.status === 'failed' ? 'failed' : 'inactive',
    // A deployment record carries no risk assessment either; 'medium' was a placeholder.
    riskTier: 'unassessed',
    provider: 'AWS',
    // undefined, not 'us-east-1', when the record carries no region. A hardcoded default is
    // the exact defect this branch exists to remove: this platform's control plane and its
    // governed fleet are in different regions, so a guessed region is wrong roughly as often
    // as it is right, and it renders identically to a measured one. The sibling mapper above
    // takes the same position for agents with no ARN.
    region: deployment.aws_region || undefined,
    framework: deployment.template_id?.includes('strands') ? 'Strands' :
               deployment.template_id?.includes('langgraph') ? 'LangGraph' : 'Bedrock AgentCore',
    businessUnit: 'AVA Deployments',
    owner: deployment.created_by,
    createdAt: deployment.created_at,
    lastInvoked: deployment.updated_at,
    isLive: sourceLive,

    // undefined, not 0, for every count and rate below. A deployment record describes what was
    // deployed; it carries no guardrail binding, no policy engine, and no telemetry. Reporting
    // 0 asserts a measurement that was never taken - and 0 errors / 0 latency reads as a
    // perfectly healthy agent rather than as an unmonitored one, which is the more dangerous
    // direction to be wrong in. The sibling mapper above already takes this position.
    guardrailCount: undefined,
    policyCount: undefined,
    knowledgeBaseCount: undefined,
    actionGroupCount: undefined,

    invocations24h: undefined,
    errorRate: undefined,
    interventionRate: undefined,
    latencyP99: undefined,

    guardrailIds: [],
    knowledgeBaseIds: [],
    actionGroupIds: [],
  };
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetches and aggregates agent resource data from all live sources
 */
export function useAgentResourceData(): UseAgentResourceDataResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discoveredAgents, setDiscoveredAgents] = useState<AwsDiscoveredAgent[]>([]);
  const [guardrailTelemetry, setGuardrailTelemetry] = useState<AwsGuardrailSummary[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceInfo[]>([]);
  // Each source's own provenance, kept per-source rather than collapsed into one flag: a row
  // is live if and only if the endpoint that produced THAT row said so. Collapsing them is how
  // a seeded row inherits a sibling endpoint's Live badge.
  const [agentsLive, setAgentsLive] = useState(false);
  const [guardrailsLive, setGuardrailsLive] = useState(false);
  const [deploymentsLive, setDeploymentsLive] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sources: DataSourceInfo[] = [];

    try {
      // Fetch discovered agents from AgentCore
      let agentData: AwsDiscoveredAgent[] = [];
      let agentsAreLive = false;
      try {
        const response = await governAgentCoreApi.agents();
        agentData = response.agents || [];
        agentsAreLive = !!response.live;
        sources.push({
          name: 'Bedrock Agents',
          status: response.live ? 'live' : 'mock',
          lastFetched: new Date().toISOString(),
          recordCount: agentData.length,
        });
      } catch (e) {
        agentsAreLive = false;
        sources.push({
          name: 'Bedrock Agents',
          status: 'error',
          lastFetched: null,
          recordCount: 0,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }

      // Fetch guardrail telemetry
      let guardrailData: AwsGuardrailSummary[] = [];
      let guardrailsAreLive = false;
      try {
        const response = await governGuardrailsApi.telemetry(30);
        guardrailData = response.guardrails || [];
        guardrailsAreLive = !!response.live;
        sources.push({
          name: 'Bedrock Guardrails',
          status: response.live ? 'live' : 'mock',
          lastFetched: new Date().toISOString(),
          recordCount: guardrailData.length,
        });
      } catch (e) {
        guardrailsAreLive = false;
        sources.push({
          name: 'Bedrock Guardrails',
          status: 'error',
          lastFetched: null,
          recordCount: 0,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }

      // Fetch AVA deployments
      let deploymentData: Deployment[] = [];
      let deploymentsAreLive = false;
      try {
        const response = await deploymentsApi.list();
        deploymentData = response || [];
        // A successful read of the deployments table is live data even when it returns nothing.
        // This used to be `deploymentData.length > 0 ? 'live' : 'mock'`, which reported an
        // empty-but-reachable store as seeded - the opposite of the truth, and it labelled a
        // real "you have no deployments yet" as demo content. Failures throw and land in the
        // catch below as 'error', so reaching this line at all means the store answered.
        deploymentsAreLive = true;
        sources.push({
          name: 'AVA Deployments',
          status: 'live',
          lastFetched: new Date().toISOString(),
          recordCount: deploymentData.length,
        });
      } catch (e) {
        deploymentsAreLive = false;
        sources.push({
          name: 'AVA Deployments',
          status: 'error',
          lastFetched: null,
          recordCount: 0,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }

      setDiscoveredAgents(agentData);
      setGuardrailTelemetry(guardrailData);
      setDeployments(deploymentData);
      setDataSources(sources);
      setAgentsLive(agentsAreLive);
      setGuardrailsLive(guardrailsAreLive);
      setDeploymentsLive(deploymentsAreLive);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const agents = useMemo(() => {
    const agentSummaries: AgentResourceSummary[] = [];

    // Map discovered agents
    discoveredAgents.forEach(agent => {
      agentSummaries.push(mapDiscoveredAgentToSummary(agent, guardrailTelemetry, agentsLive));
    });

    // Map deployments (filter out duplicates by name)
    const existingNames = new Set(agentSummaries.map(a => a.agentName.toLowerCase()));
    deployments.forEach(deployment => {
      const name = (deployment.deployment_name || '').toLowerCase();
      if (!existingNames.has(name)) {
        agentSummaries.push(mapDeploymentToSummary(deployment, deploymentsLive));
        existingNames.add(name);
      }
    });

    return agentSummaries;
  }, [discoveredAgents, guardrailTelemetry, deployments, agentsLive, deploymentsLive]);

  const guardrails = useMemo((): GuardrailSummary[] => {
    return guardrailTelemetry.map(g => ({
      guardrailId: g.guardrail_id,
      name: g.name,
      version: g.version,
      status: g.status,
      invocations: g.invocations,
      interventions: g.interventions,
      interventionRate: g.intervention_rate_pct,
      hasMetrics: g.has_metrics,
      // The telemetry response's own flag, not a literal. See mapDiscoveredAgentToSummary.
      isLive: guardrailsLive,
      linkedAgentCount: agents.filter(a => a.guardrailIds.includes(g.guardrail_id)).length,
    }));
  }, [guardrailTelemetry, agents, guardrailsLive]);

  const totalLive = agents.filter(a => a.isLive).length;
  const totalMock = agents.length - totalLive;

  return {
    loading,
    error,
    agents,
    guardrails,
    totalLive,
    totalMock,
    dataSources,
    refresh: fetchData,
  };
}

/**
 * Fetches live compliance data across all frameworks
 */
export function useFrameworkCompliance(): UseFrameworkComplianceResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posture, setPosture] = useState<CompliancePosture | null>(null);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await complianceApi.getPosture();
      setPosture(response);
      // Honesty gate: posture alone (every control not_started) is not live
      // compliance data. Only mark live when at least one control carries a
      // real attestation (pass/in-progress/fail).
      const hasAttestedData = response.frameworks.some(
        f => f.pass_count + f.in_progress_count + f.fail_count > 0
      );
      setIsLive(hasAttestedData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch compliance data');
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const frameworks = useMemo((): FrameworkComplianceSummary[] => {
    if (!posture?.frameworks) return [];

    // Deduplicate by framework NAME.
    //
    // The posture endpoint iterates every key of the backend's FRAMEWORK_META, and that dict
    // registers alias ids for three frameworks it already holds - measured against the live
    // endpoint: 'osfi-e-23' + 'osfi-e23' (both "OSFI E-23", 15 controls each),
    // 'naic-model-bulletin' + 'naic-ai' (both "NAIC AI Systems Evaluation Tool", 16), and
    // 'colorado-sb-205' + 'colorado-ai-act' (both "Colorado AI Act (SB 26-189)", 6).
    // Mapping 1:1 made every consumer count those three twice, so the Live-badged cards
    // reported 17 frameworks / 318 controls against a real distinct estate of 14 / 281.
    //
    // Name is the dedup key rather than id precisely because the ids are what diverge. The
    // first occurrence wins, and its id is kept as canonical so existing deep links and the
    // attestation endpoints keep resolving.
    //
    // This makes the backend's two `name` strings for an alias pair a load-bearing invariant,
    // not a cosmetic detail: if `naic-model-bulletin` and `naic-ai` are ever given DIFFERENT
    // display names, they stop colliding here and the double-count silently returns. The two
    // names above were corrected in this change set (they previously named the wrong
    // instruments), and both spellings of each pair were renamed together for that reason -
    // see the invariant note in backend/src/api/routes/govern_compliance.py.
    const seen = new Map<string, FrameworkComplianceSummary>();
    for (const f of posture.frameworks) {
      const key = (f.framework_name || f.framework_id).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        frameworkId: f.framework_id,
        frameworkName: f.framework_name,
        totalControls: f.total_controls,
        passCount: f.pass_count,
        inProgressCount: f.in_progress_count,
        failCount: f.fail_count,
        notStartedCount: f.not_started_count,
        coveragePct: f.coverage_pct,
        isLive,
        lastUpdated: f.last_updated,
      });
    }
    return [...seen.values()];
  }, [posture, isLive]);

  return {
    loading,
    error,
    frameworks,
    posture,
    isLive,
    refresh: fetchData,
  };
}

/**
 * Aggregates all data sources into a summary for the reports dashboard
 */
export function useReportsDataSummary(): UseReportsDataSummaryResult {
  const agentData = useAgentResourceData();
  const complianceData = useFrameworkCompliance();

  const [securityPosture, setSecurityPosture] = useState<AwsSecurityPostureResponse | null>(null);
  const [riskPosture, setRiskPosture] = useState<AwsRiskPostureResponse | null>(null);
  const [fleetSummary, setFleetSummary] = useState<FleetSummaryResponse | null>(null);

  const fetchAdditionalData = useCallback(async () => {
    try {
      const [security, risk, fleet] = await Promise.all([
        governSecurityApi.posture().catch(() => null),
        governRiskPostureApi.securityHub().catch(() => null),
        governFleetApi.summary().catch(() => null),
      ]);

      setSecurityPosture(security);
      setRiskPosture(risk);
      setFleetSummary(fleet);
    } catch (e) {
      // Silently fail - these are supplementary data sources
    }
  }, []);

  useEffect(() => {
    fetchAdditionalData();
  }, [fetchAdditionalData]);

  const summary = useMemo((): ReportsDataSummary => {
    const allDataSources: DataSourceInfo[] = [
      ...agentData.dataSources,
      {
        name: 'Compliance Frameworks',
        status: complianceData.isLive ? 'live' : 'mock',
        lastFetched: new Date().toISOString(),
        recordCount: complianceData.frameworks.length,
      },
      {
        name: 'Security Posture',
        status: securityPosture?.live ? 'live' : 'mock',
        lastFetched: securityPosture ? new Date().toISOString() : null,
        recordCount: securityPosture?.sources_total || 0,
      },
      {
        name: 'Risk Posture',
        status: riskPosture?.live ? 'live' : 'mock',
        lastFetched: riskPosture ? new Date().toISOString() : null,
        recordCount: riskPosture?.total || 0,
      },
      {
        name: 'Fleet Summary',
        status: fleetSummary?.live ? 'live' : 'mock',
        lastFetched: fleetSummary ? new Date().toISOString() : null,
        recordCount: fleetSummary?.summary.total || 0,
      },
    ];

    const liveSourceCount = allDataSources.filter(s => s.status === 'live').length;
    const isFullyLive = liveSourceCount === allDataSources.length;

    const avgCompliancePct = complianceData.posture
      ? Math.round(complianceData.posture.overall_coverage_pct)
      : 0;

    // Derive the denominator from the deduplicated framework list rather than
    // posture.total_controls, so the figure stays correct whether or not the server has
    // already excluded the alias framework ids. "Assessed" matches the server's own
    // definition exactly: pass + in-progress + fail (i.e. everything not not-started).
    const totalControls = complianceData.frameworks.reduce((n, f) => n + f.totalControls, 0);
    const assessedControls = complianceData.frameworks.reduce(
      (n, f) => n + f.passCount + f.inProgressCount + f.failCount,
      0,
    );

    // The invariant behind the paragraph above, now checked instead of assumed.
    //
    // Two independent definitions of "assessed" have to agree: the server's `total_assessed`
    // and the sum recomputed here. They can only diverge if the server starts counting a
    // status this sum does not (or stops registering an alias id, changing what dedup drops).
    // Silent divergence is the failure mode that matters, because the number keeps rendering
    // and simply becomes wrong - so the mismatch is surfaced rather than reconciled. The
    // deduplicated local value is kept deliberately: it is correct whether or not the server
    // has excluded the alias framework ids, and this hook is the only consumer that dedups.
    const serverAssessed = complianceData.posture?.total_assessed;
    if (serverAssessed !== undefined && serverAssessed !== assessedControls) {
      console.warn(
        `[useReportsDataSummary] assessed-control count disagrees with the server: ` +
        `derived ${assessedControls} vs total_assessed ${serverAssessed}. ` +
        `Rendering the derived value (it excludes alias framework ids). ` +
        `One of the two definitions of "assessed" has changed - reconcile before trusting ` +
        `avgCompliancePct, which uses this as its denominator.`
      );
    }

    return {
      totalAgents: agentData.agents.length || fleetSummary?.summary.total || 0,
      liveAgents: agentData.totalLive,
      totalGuardrails: agentData.guardrails.length,
      liveGuardrails: agentData.guardrails.filter(g => g.isLive).length,
      totalFrameworks: complianceData.frameworks.length,
      avgCompliancePct,
      assessedControls,
      totalControls,
      autoDetectedControls: complianceData.posture?.auto_detected_count ?? 0,
      totalFindings: (securityPosture?.total_findings || 0) + (riskPosture?.total || 0),
      criticalFindings: (securityPosture?.critical || 0) + (riskPosture?.critical || 0),
      dataSources: allDataSources,
      isFullyLive,
    };
  }, [agentData, complianceData, securityPosture, riskPosture, fleetSummary]);

  const refresh = useCallback(() => {
    agentData.refresh();
    complianceData.refresh();
    fetchAdditionalData();
  }, [agentData, complianceData, fetchAdditionalData]);

  return {
    loading: agentData.loading || complianceData.loading,
    error: agentData.error || complianceData.error,
    summary,
    refresh,
  };
}
