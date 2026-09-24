/**
 * GovernanceCommandCenter — Executive AI GRC Dashboard
 *
 * Organized into Executive Zones (top-down priority):
 * 1. HEALTH ZONE: Live AWS tiles + AI Quality Monitor ("is everything okay?")
 * 2. RISK ZONE: Security posture, Compliance frameworks, Vendor governance
 * 3. OPERATIONS ZONE: Fleet/Agents, Guardrails, Deployments
 * 4. COST ZONE: FinOps, BU Budgets, Cost by Model
 * 5. ACTIVITY ZONE: Recent activity, Quick actions, Platform map (collapsible)
 */

import { useState, useEffect } from 'react';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import {
  governCommandCenterApi, governAuditApi, multicloudApi,
  governCostApi, governPostureApi, governModelsApi, governRiskPostureApi, governTrailApi, governEvalsApi, governSecurityApi,
  governInvocationSafetyApi, governDeveloperAiApi, governAgentCoreApi, complianceApi,
  type CompliancePosture,
  type AwsCostModelBreakdown, type AwsConfigCompliance, type AwsModelMetricsResponse,
  type AwsRiskPostureResponse, type AwsAiCallersResponse, type AwsEvaluationJobsResponse,
  type AwsSecurityPostureResponse, type AwsInvocationSafetyResponse,
  type AwsBudgetsResponse, type AwsCostAnomalies, type GovernAuditEvent,
  type PolicyEvaluationResult, type AwsAgentRuntimeMetricsResponse,
  type MultiCloudAllAgents, type MultiCloudAgentInventory,
} from '../../api/client';
import type { ActivityFeedItem } from './useGovernanceAggregator';
import { useGuardrailMetrics } from './useGuardrailMetrics';
import { useLiveKPIs } from './useLiveKPIs';
import { computeLayerReadiness } from './TrustStack3Layer';
import LiveHeader from './LiveHeader';
import { usePollingKey } from './usePollingKey';
import { Icon, type IconName } from './icons';
import { MiniStatCard } from './StatCard';
import ScorecardStrip from './metrics/ScorecardStrip';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import { RegionCoverageBadge, FloorCountBadge } from './RegionCoverageBadge';
import AIQualityMonitor from './AIQualityMonitor';
import { useDataSources } from './DataSourceContext';

// ─────────────────────────── Platform Integration Data ───────────────────────────
interface PlatformModule {
  name: string;
  route: string;
  layer: 1 | 2 | 3;
  governance: string;
}

interface PlatformPhase {
  phase: string;
  color: string;
  icon: IconName;
  modules: PlatformModule[];
}

const PLATFORM_INTEGRATION: PlatformPhase[] = [
  {
    phase: 'Plan',
    color: '#6366f1',
    icon: 'clipboard-list',
    modules: [
      { name: 'Maturity Assessment', route: '/maturity-assessment', layer: 1, governance: 'Baseline readiness scoring, gap identification' },
      { name: 'Operating Model', route: '/operating-model', layer: 2, governance: '3 Lines of Defense roles, RACI matrix' },
      { name: 'Use Cases', route: '/use-cases', layer: 2, governance: 'Risk tiering, stage gate requirements' },
      { name: 'Business Cases', route: '/business-cases', layer: 2, governance: 'ROI validation, compliance cost estimation' },
    ],
  },
  {
    phase: 'Build',
    color: '#10b981',
    icon: 'wrench-screwdriver',
    modules: [
      { name: 'FSI Foundry', route: '/applications/fsi-foundry', layer: 2, governance: 'Pre-validated patterns, compliance templates' },
      { name: 'Reference Implementations', route: '/applications/reference-implementations', layer: 2, governance: 'Production-grade patterns, validated architectures' },
      { name: 'Templates Catalog', route: '/applications/templates', layer: 2, governance: 'Reusable agent templates, version control' },
      { name: 'App Factory', route: '/applications/app-factory', layer: 3, governance: 'Prototyping pattern, experimental builds' },
      { name: 'Custom Agents', route: '/aaas/custom', layer: 3, governance: 'Agent registration, tool authorization' },
      { name: 'AWS Frontier Agents', route: '/aaas/aws-agents', layer: 3, governance: 'DevOps/Security agent fleet governance' },
      { name: 'Tools Factory', route: '/capabilities/tools', layer: 1, governance: 'MCP tool registration, permission boundaries' },
      { name: 'Knowledge Bases', route: '/capabilities/knowledge', layer: 1, governance: 'Data classification, source attestation' },
      { name: 'Prompts', route: '/capabilities/prompts', layer: 1, governance: 'Prompt library, versioning, evaluations' },
    ],
  },
  {
    phase: 'Secure',
    color: '#f59e0b',
    icon: 'shield-check',
    modules: [
      { name: 'Guardrails', route: '/secure/guardrails', layer: 1, governance: 'Content filters, PII detection, topic denial' },
      { name: 'Policy Management', route: '/secure/policy', layer: 1, governance: 'Cedar policies, deny-by-default rules' },
    ],
  },
  {
    phase: 'Operate & Govern',
    color: '#3b82f6',
    icon: 'chart-bar',
    modules: [
      { name: 'Deployments', route: '/deployments', layer: 2, governance: 'Deployment tracking, version control' },
      { name: 'Observability', route: '/observability', layer: 3, governance: 'Langfuse traces, performance monitoring' },
      { name: 'Model Registry', route: '/govern/models', layer: 2, governance: 'Inventory, lifecycle status, attestation' },
      { name: 'FinOps', route: '/govern/finops', layer: 3, governance: 'Cost allocation, budget alerts, showback' },
      { name: 'Audit Trail', route: '/govern/audit', layer: 3, governance: 'CloudTrail events, incident tracking' },
    ],
  },
];


// ─────────────────────────── Helper Components ───────────────────────────

function ZoneHeader({ icon, title, description, color }: { icon: IconName; title: string; description: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
        <Icon name={icon} className="w-4 h-4 text-white" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-[10px] text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'low' | 'medium' | 'high' | 'critical' }) {
  const colors = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${colors[severity]}`}>
      {severity}
    </span>
  );
}

function ModuleBadge({ module }: { module: ActivityFeedItem['module'] }) {
  const colors = {
    plan: 'bg-indigo-100 text-indigo-700',
    build: 'bg-emerald-100 text-emerald-700',
    secure: 'bg-amber-100 text-amber-700',
    operate: 'bg-blue-100 text-blue-700',
    govern: 'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium uppercase ${colors[module]}`}>
      {module}
    </span>
  );
}

function PulseDot({ color, size = 'sm' }: { color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' };
  return (
    <span className="relative flex">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${sizes[size]}`}
        style={{ backgroundColor: color }}
      />
      <span
        className={`relative inline-flex rounded-full ${sizes[size]}`}
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

export default function GovernanceCommandCenter() {
  const [platformExpanded, setPlatformExpanded] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(true);

  const {
    kpis: liveKpis,
    liveFlags,
  } = useLiveKPIs(60_000);

  const [liveCost, setLiveCost] = useState<AwsCostModelBreakdown | null>(null);
  const [liveConfig, setLiveConfig] = useState<AwsConfigCompliance | null>(null);
  const [liveRuntime, setLiveRuntime] = useState<AwsModelMetricsResponse | null>(null);
  const [liveRisk, setLiveRisk] = useState<AwsRiskPostureResponse | null>(null);
  const [liveCallers, setLiveCallers] = useState<AwsAiCallersResponse | null>(null);
  const [liveEvals, setLiveEvals] = useState<AwsEvaluationJobsResponse | null>(null);
  const [liveSecurity, setLiveSecurity] = useState<AwsSecurityPostureResponse | null>(null);
  const [liveInvSafety, setLiveInvSafety] = useState<AwsInvocationSafetyResponse | null>(null);
  const [liveBudgets, setLiveBudgets] = useState<AwsBudgetsResponse | null>(null);
  const [liveAnomalies, setLiveAnomalies] = useState<AwsCostAnomalies | null>(null);
  const [liveAuditEvents, setLiveAuditEvents] = useState<GovernAuditEvent[] | null>(null);
  const [liveMcAgents, setLiveMcAgents] = useState<MultiCloudAllAgents | null>(null);
  const [livePolicyEval, setLivePolicyEval] = useState<PolicyEvaluationResult | null>(null);
  const [liveObservability, setLiveObservability] = useState<AwsAgentRuntimeMetricsResponse | null>(null);
  const [livePosture, setLivePosture] = useState<CompliancePosture | null>(null);
  const pollKey = usePollingKey(60_000);
  const { updateSource } = useDataSources();

  // Single aggregator call replaces 15 separate API calls
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();

    governCommandCenterApi.getData()
      .then(data => {
        if (cancelled) return;

        // Distribute aggregated data to state
        if (data.security_posture) {
          setLiveSecurity(data.security_posture as AwsSecurityPostureResponse);
          if (data.security_posture.live) updateSource('aws-security-hub', { status: 'live', lastFetch: now });
        }
        if (data.runtime_metrics) {
          setLiveRuntime(data.runtime_metrics as AwsModelMetricsResponse);
          if (data.runtime_metrics.live) updateSource('aws-cloudwatch', { status: 'live', lastFetch: now });
        }
        if (data.config_compliance) {
          setLiveConfig(data.config_compliance as AwsConfigCompliance);
          if (data.config_compliance.live) updateSource('aws-config', { status: 'live', lastFetch: now });
        }
        if (data.risk_posture) {
          setLiveRisk(data.risk_posture as AwsRiskPostureResponse);
        }
        if (data.ai_callers) {
          setLiveCallers(data.ai_callers as AwsAiCallersResponse);
          if (data.ai_callers.live) updateSource('aws-cloudtrail', { status: 'live', lastFetch: now });
        }
        if (data.eval_jobs) {
          setLiveEvals(data.eval_jobs as AwsEvaluationJobsResponse);
          if (data.eval_jobs.live) updateSource('aws-bedrock', { status: 'live', lastFetch: now });
        }
        if (data.invocation_safety) {
          setLiveInvSafety(data.invocation_safety as AwsInvocationSafetyResponse);
        }
        if (data.cost_by_model) {
          setLiveCost(data.cost_by_model as AwsCostModelBreakdown);
          if (data.cost_by_model.live) updateSource('aws-cost-explorer', { status: 'live', lastFetch: now });
        }
        if (data.budgets) {
          setLiveBudgets(data.budgets as AwsBudgetsResponse);
        }
        if (data.anomalies) {
          setLiveAnomalies(data.anomalies as AwsCostAnomalies);
        }
        if (data.agent_metrics) {
          setLiveObservability(data.agent_metrics as AwsAgentRuntimeMetricsResponse);
        }
        if (data.policy_eval) {
          setLivePolicyEval(data.policy_eval as PolicyEvaluationResult);
        }
      })
      .catch(() => {
        // Fallback: if aggregator fails, use individual calls with staggered loading
        console.warn('Command center aggregator unavailable, falling back to individual calls');

        governSecurityApi.posture().then(d => {
          if (!cancelled) { setLiveSecurity(d); if (d?.live) updateSource('aws-security-hub', { status: 'live', lastFetch: now }); }
        }).catch(() => {});
        governDeveloperAiApi.evaluatePolicy('default', 7).then(d => { if (!cancelled) setLivePolicyEval(d); }).catch(() => {});
        governModelsApi.runtimeMetrics(7).then(d => {
          if (!cancelled) { setLiveRuntime(d); if (d?.live) updateSource('aws-cloudwatch', { status: 'live', lastFetch: now }); }
        }).catch(() => {});
        governInvocationSafetyApi.telemetry(7).then(d => { if (!cancelled) setLiveInvSafety(d); }).catch(() => {});

        setTimeout(() => {
          if (cancelled) return;
          governRiskPostureApi.securityHub(200).then(d => { if (!cancelled) setLiveRisk(d); }).catch(() => {});
          governTrailApi.aiCallers(168).then(d => { if (!cancelled) setLiveCallers(d); }).catch(() => {});
          governEvalsApi.jobs(100).then(d => { if (!cancelled) setLiveEvals(d); }).catch(() => {});
          governPostureApi.configCompliance().then(d => { if (!cancelled) setLiveConfig(d); }).catch(() => {});
        }, 250);

        setTimeout(() => {
          if (cancelled) return;
          governCostApi.byModel(3).then(d => { if (!cancelled) setLiveCost(d); }).catch(() => {});
          governCostApi.budgets().then(d => { if (!cancelled) setLiveBudgets(d); }).catch(() => {});
          governCostApi.anomalies(60).then(d => { if (!cancelled) setLiveAnomalies(d); }).catch(() => {});
          governAgentCoreApi.agentMetrics(7).then(d => { if (!cancelled) setLiveObservability(d); }).catch(() => {});
        }, 500);
      });

    return () => { cancelled = true; };
  }, [pollKey, updateSource]);

  // Recent Activity feed + External Agents inventory — live from their own APIs.
  // Each degrades independently: a failure leaves the mock fallback in place.
  useEffect(() => {
    let cancelled = false;
    governAuditApi.list()
      .then(events => { if (!cancelled) setLiveAuditEvents(events); })
      .catch(() => { /* keep mock activityFeed */ });
    multicloudApi.allAgents()
      .then(data => { if (!cancelled) setLiveMcAgents(data); })
      .catch(() => { /* keep mock external-agent literals */ });
    // LIVE compliance posture — per-framework coverage for the Compliance card bars.
    complianceApi.getPosture()
      .then(p => { if (!cancelled) setLivePosture(p); })
      .catch(() => { /* keep mock COMPLIANCE_FRAMEWORKS bars */ });
    return () => { cancelled = true; };
  }, [pollKey]);

  const aggResult = useGovernanceAggregator();
  const {
    error: aggError,
    summary: rawSummary,
    activityFeed,
    complianceFrameworks,
    complianceAssurance,
    costByModel,
    refresh: refreshAggregator,
  } = aggResult;

  // Default summary for progressive loading (avoids null checks everywhere)
  const summary = rawSummary ?? {
    controlsImplemented: 0,
    controlsTotal: 1,
    frameworksNeedingAttention: [],
    totalUseCases: 0,
    totalAgents: 0,
    deploymentsActive: 0,
    deploymentsPending: 0,
    deploymentsFailed: 0,
    deployedUseCases: 0,
    agentsWithPolicies: 0,
    monthlySpend: 0,
    costAnomalies: 0,
    criticalIncidents: 0,
  };

  const {
    error: guardrailError,
    activeCount: guardrailsActive,
    draftCount: guardrailsDraft,
    failedCount: guardrailsFailed,
    refresh: refreshGuardrails,
  } = useGuardrailMetrics();

  const refresh = () => {
    refreshAggregator();
    refreshGuardrails();
  };

  // No blocking spinner - show skeleton tiles immediately, data fills in progressively

  if (aggError) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
        {aggError}
      </div>
    );
  }

  const effectiveGuardrailsActive = guardrailError ? 0 : guardrailsActive;
  const effectiveGuardrailsDraft = guardrailError ? 0 : guardrailsDraft;
  const effectiveGuardrailsFailed = guardrailError ? 0 : guardrailsFailed;
  const compliancePct = Math.round((summary.controlsImplemented / summary.controlsTotal) * 100);

  // Compliance card bars — LIVE from complianceApi.getPosture(), mock
  // COMPLIANCE_FRAMEWORKS fallback. A successful posture with at least one framework is
  // treated as live (mirrors the aggregator's rule); the 80% threshold matches the mock's
  // 'on-track' cut.
  //
  // The bar renders ASSESSED COVERAGE (assessed_pct), not coverage_pct. coverage_pct is a
  // pass rate over assessed controls ONLY, so SR 26-2 reports 100 there off 2 of its 16
  // controls — a full green bar labelled "SR 26-2" on the executive dashboard for a
  // framework that has barely been looked at. client.ts states the contract on the field:
  // "Never render this without assessed_count beside it; for true coverage use
  // assessed_pct." The pass rate moves into the row tooltip where it keeps its denominator.
  const complianceLive = !!livePosture && livePosture.frameworks.length > 0;
  const frameworkBars: { name: string; pct: number; status: 'on-track' | 'attention'; title?: string }[] = complianceLive
    ? livePosture!.frameworks.map(f => {
        const assessed = f.assessed_count ?? 0;
        const pct = Math.round(f.assessed_pct ?? (f.total_controls > 0 ? (assessed / f.total_controls) * 100 : 0));
        return {
          name: f.framework_name,
          pct,
          status: (pct >= 80 ? 'on-track' : 'attention') as 'on-track' | 'attention',
          title: assessed > 0
            ? `${assessed} of ${f.total_controls} controls assessed (${pct}%). ${Math.round(f.coverage_pct)}% of those assessed pass. The other ${f.total_controls - assessed} were never looked at, which is not the same as failing.`
            : `0 of ${f.total_controls} controls assessed. Nothing has been attested for this framework — not assessed is not the same as failing.`,
        };
      })
    : complianceFrameworks.map(f => ({
        name: f.name,
        pct: Math.round((f.covered / f.total) * 100),
        status: f.status,
      }));

  const secLive = liveSecurity?.live ? liveSecurity : null;
  const riskCrit = secLive ? secLive.critical : (liveRisk?.live ? liveRisk.critical : null);
  // Same nullable shape as riskCrit, and it exists so the Security Findings grid below can
  // render Critical and High the way Medium and Low already did. Those four tiles sit in one
  // grid-cols-4 and disagreed about what an unmeasured severity looks like: Medium/Low went
  // through riskBySeverity() -> null -> a grey "—", while Critical/High re-derived the count
  // inline as `secLive?.critical ?? liveRisk?.critical ?? 0` and printed a bold coloured 0.
  // So an account with no Security Hub access read "0 Critical · 0 High · — Medium · — Low",
  // where the two dashes actively imply the two zeros WERE measured. Worse than a plain
  // fabricated number, and on the executive view. riskCrit was already correct and already
  // rendered as "—" by the KPI tile at the top of this same component - the grid simply did
  // not use it.
  const riskHigh = secLive ? secLive.high : (liveRisk?.live ? liveRisk.high : null);
  const riskSub = secLive
    ? `critical · ${secLive.high} high · ${secLive.total_findings} findings (${secLive.sources_live} AWS security services)`
    : (liveRisk?.live ? `critical · ${liveRisk.high} high (Security Hub)` : 'Security Hub unavailable');
  const riskLive = !!secLive || !!liveRisk?.live;
  // Security Hub risk posture reports a full severity breakdown (CRITICAL..LOW);
  // read MEDIUM/LOW from it when live, else leave the "—" placeholder.
  const riskBySeverity = (sev: string): number | null =>
    liveRisk?.live ? (liveRisk.by_severity.find(s => s.severity === sev)?.count ?? 0) : null;
  const mediumFindings = riskBySeverity('MEDIUM');
  const lowFindings = riskBySeverity('LOW');
  // External Agents: the card badge is Live when ANY multi-cloud/SaaS connector
  // reports live. Under a Live card each provider tile must show its own real
  // total, or "—" when that connector is not live — never a fabricated literal.
  // Only when the whole card is Mock-badged (no connector live) do the
  // illustrative literals show, disclosed by the MockDataBadge.
  const mcInventories = liveMcAgents
    ? [liveMcAgents.azure, liveMcAgents.gcp, liveMcAgents.salesforce, liveMcAgents.copilot_studio, liveMcAgents.servicenow]
    : [];
  const multicloudAgentsLive = mcInventories.some(p => p.live);
  // Real external-agent total: sum of the connectors that actually reported live.
  // `useLiveKPIs.externalAgents` has no multi-cloud source of its own, so it must not be
  // rendered here — it would print an unsourced constant under a Live badge.
  const mcLiveConnectors = mcInventories.filter(p => p.live);
  const externalAgentsTotal = mcLiveConnectors.reduce((sum, p) => sum + p.total, 0);
  const mcAgentCell = (inv: MultiCloudAgentInventory | undefined, illustrative: number): number | '—' =>
    multicloudAgentsLive ? (inv?.live ? inv.total : '—') : illustrative;
  const awsAgentCell: number | '—' = multicloudAgentsLive ? (liveFlags.agents ? liveKpis.bedrockAgents : '—') : 12;
  const azureAgentsCell = mcAgentCell(liveMcAgents?.azure, 8);
  const gcpAgentsCell = mcAgentCell(liveMcAgents?.gcp, 5);
  const salesforceAgentsCell = mcAgentCell(liveMcAgents?.salesforce, 8);
  const copilotAgentsCell = mcAgentCell(liveMcAgents?.copilot_studio, 12);
  // ServiceNow is the fifth connector in MultiCloudAllAgents and the only one not broken
  // out into its own tile. That tile used to render a literal "+3 / more", implying three
  // further providers that do not exist in the payload at all — a fabricated count on the
  // Live path AND the Mock path. There is no illustrative literal for ServiceNow anywhere
  // in the codebase and one is deliberately NOT invented here: this cell shows the real
  // total when the connector is live and "—" otherwise, in every state. Do not "complete
  // the set" by giving it a number.
  const servicenowAgentsCell: number | '—' = liveMcAgents?.servicenow.live ? liveMcAgents.servicenow.total : '—';
  const runtimeInv = liveRuntime?.live ? liveRuntime.total_invocations : null;
  const runtimeErr = liveRuntime?.live ? liveRuntime.fleet_error_rate_pct : 0;
  const unrecognizedCallers = liveCallers?.live ? liveCallers.unrecognized : null;
  const evalsDone = liveEvals?.live ? liveEvals.completed : null;
  const interventions = liveInvSafety?.live ? liveInvSafety.guardrail_intervened : null;
  const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
  const usdCompact = (n: number) => `$${compact(Math.round(n))}`;

  // Budgets card — LIVE AWS Budgets (DescribeBudgets) only. Renders real budget rows
  // when connected, otherwise an honest degraded state. No mock BU-budget fallback.
  const budgetsLive = !!liveBudgets?.live && liveBudgets.budgets.length > 0;

  // Policy violation counts — gated on livePolicyEval.live, NOT on the payload merely
  // existing. The policy-evaluate endpoint answers with live=false and zeroed counts when
  // it cannot read the events it evaluates, so `livePolicyEval?.blocked_count ?? 0` and
  // `livePolicyEval ? total : '—'` rendered "0 violations · 0 blocked · 0 review" — a
  // clean bill of health — for an estate that was never examined, and rendered it beside
  // the Live banner. Verified against the running backend: setting policy_eval.live=false
  // still produced a green 0 with no live dot. A degraded engine now renders "—" like
  // every other tile in this row, and cannot raise the alert banner above.
  const policyLive = !!livePolicyEval?.live;
  const policyBlocked = policyLive ? livePolicyEval!.blocked_count : 0;
  const policyReview = policyLive ? livePolicyEval!.review_count : 0;
  const policyViolationTotal = policyLive ? (livePolicyEval!.violations?.length ?? 0) : null;
  const hasPolicyAlerts = policyBlocked > 0 || policyReview > 0;

  // Health banner asserts "Live" only when at least one of its five tiles actually has
  // live data; otherwise it degrades to an honest, non-Live state.
  //
  // The caption is derived from the SAME five flags rather than naming a fixed source
  // list. It used to read "Security Hub · CloudWatch · CloudTrail · Bedrock evals &
  // guardrails" unconditionally, which named four sources beside a "Live" label while
  // three of them could be dark — the caption asserted connectivity the tiles below were
  // simultaneously denying with "—". Only sources whose own tile is live are listed, so
  // the caption can never name a source that is not answering.
  const healthSources: string[] = [];
  if (policyLive) healthSources.push('Policy engine');
  if (riskLive) healthSources.push('Security Hub');
  if (liveRuntime?.live) healthSources.push('CloudWatch');
  if (liveCallers?.live) healthSources.push('CloudTrail');
  if (liveInvSafety?.live) healthSources.push('Bedrock invocation logs & guardrails');
  const healthLive = healthSources.length > 0;
  const healthCaption = healthLive
    ? `${healthSources.join(' · ')} · ${healthSources.length} of 5 sources answering`
    : 'No source answered — connect Security Hub, CloudWatch, CloudTrail, or Bedrock invocation logging';

  return (
    <div className="space-y-6">
      {/* Policy Violation Alert Banner */}
      {hasPolicyAlerts && (
        <a
          href="/govern/dev-tools?tab=policies"
          className={`flex items-center justify-between px-4 py-2 rounded-lg border transition-colors ${
            policyBlocked > 0
              ? 'bg-rose-50 border-rose-200 hover:bg-rose-100'
              : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon
              name="exclamation-triangle"
              className={`w-4 h-4 ${policyBlocked > 0 ? 'text-rose-600' : 'text-amber-600'}`}
            />
            <span className={`text-sm font-medium ${policyBlocked > 0 ? 'text-rose-800' : 'text-amber-800'}`}>
              {policyBlocked > 0 && <span>{policyBlocked} blocked event{policyBlocked !== 1 ? 's' : ''}</span>}
              {policyBlocked > 0 && policyReview > 0 && <span>, </span>}
              {policyReview > 0 && <span>{policyReview} requiring review</span>}
            </span>
          </div>
          <span className={`text-xs font-medium ${policyBlocked > 0 ? 'text-rose-600' : 'text-amber-600'}`}>
            View details
          </span>
        </a>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════════
          ZONE 1: HEALTH — "Is everything okay?"
          Live AWS metrics + AI Quality Monitor
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <ZoneHeader
            icon="check-circle"
            title="Health"
            description="Real-time system health and quality metrics"
            color="bg-emerald-500"
          />
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-medium text-slate-700 border border-slate-200 transition-colors"
          >
            <Icon name="arrow-path" className="w-3 h-3" strokeWidth={2} />
            Refresh All
          </button>
        </div>

        {/* Live AWS Tiles */}
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
          <LiveHeader
            live={healthLive}
            label={healthLive ? 'Live · from your AWS account' : 'AWS account not connected'}
            caption={healthCaption}
            autoRefresh
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <a href="/govern/dev-tools?tab=policies" className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Policy Violations</span>
                {policyLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${policyViolationTotal === null ? 'text-slate-400' : policyViolationTotal > 0 ? (policyBlocked > 0 ? 'text-rose-600' : 'text-amber-600') : 'text-emerald-600'}`}>
                {policyViolationTotal === null ? '—' : String(policyViolationTotal)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {policyLive
                  ? `${policyBlocked} blocked · ${policyReview} review`
                  : 'Policy engine unavailable'}
              </div>
            </a>
            <a href="/govern/risk?tab=monitoring" className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Security Posture</span>
                {riskLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${riskCrit === null ? 'text-slate-400' : riskCrit > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {riskCrit === null ? '—' : String(riskCrit)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{riskSub}</div>
            </a>
            <a href="/govern/models?tab=operations" className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Fleet Runtime</span>
                {liveRuntime?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${runtimeErr > 2 ? 'text-rose-600' : 'text-slate-900'}`}>
                {runtimeInv === null ? '—' : compact(runtimeInv)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {liveRuntime?.live ? `invocations/7d · ${runtimeErr}% errors` : 'CloudWatch unavailable'}
              </div>
            </a>
            <a href="/govern/shadow-ai" className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Shadow AI</span>
                {liveCallers?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${unrecognizedCallers && unrecognizedCallers > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {unrecognizedCallers === null ? '—' : String(unrecognizedCallers)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {liveCallers?.live ? 'unrecognized AI callers' : 'CloudTrail unavailable'}
              </div>
            </a>
            <a href="/govern/safety/evals" className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Guardrail Blocks</span>
                {liveInvSafety?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${interventions && interventions > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                {interventions === null ? '—' : compact(interventions)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {liveInvSafety?.live
                  ? `${liveInvSafety.intervention_rate_pct}% intervention rate · ${evalsDone ?? 0} evals`
                  : 'Invocation logs unavailable'}
              </div>
            </a>
          </div>
        </div>

      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════
          ZONE 1b: AI QUALITY — model quality, drift, latency & evaluation signals
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeader
          icon="sparkles"
          title="AI Quality"
          description="Model quality, drift, latency, and evaluation signals"
          color="bg-violet-500"
        />
        <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <AIQualityMonitor compact />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════
          ZONE 2: RISK — Security posture, Compliance, Vendor governance
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeader
          icon="shield-exclamation"
          title="Risk"
          description="Security posture, compliance status, and third-party risk"
          color="bg-rose-500"
        />

        <div className="grid grid-cols-3 gap-4">
          {/* Compliance Frameworks */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="document-check" className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-slate-800">Compliance</span>
                {summary.frameworksNeedingAttention.length > 0 && (
                  /* This badge and the bars below it now measure the same quantity —
                     assessed coverage under 80% — so the count always matches the number of
                     amber bars. The aggregator previously selected on coverage_pct (pass
                     rate over ASSESSED controls), which meant a framework could sit at 13%
                     on its bar and still not be counted here because the two controls it
                     had assessed both passed. */
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium"
                    title={complianceAssurance
                      ? 'Frameworks where fewer than 80% of the controls have been assessed at all — the same measure the bars below show. A framework whose few assessed controls all pass still needs attention: the rest were never looked at.'
                      : undefined}
                  >
                    {summary.frameworksNeedingAttention.length} need attention
                  </span>
                )}
                {complianceLive
                  ? <LiveDataBadge source="Compliance posture" detail="Live per-framework coverage from complianceApi.getPosture()" />
                  : <MockDataBadge integration="Compliance framework control mapping (GRC / Audit Manager)" />}
              </div>
              <a href="/govern/compliance" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="space-y-2">
              {frameworkBars.slice(0, 4).map((fw, i) => (
                <div key={i} className="flex items-center gap-2" title={fw.title}>
                  <div className="w-20 text-[10px] text-slate-700 truncate font-medium">{fw.name}</div>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${fw.pct}%`, background: fw.status === 'on-track' ? '#10b981' : '#f59e0b' }} />
                  </div>
                  <div className="w-8 text-right text-[10px] font-semibold text-slate-600">{fw.pct}%</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{summary.controlsImplemented}/{summary.controlsTotal} controls</span>
              <span
                className="text-xs font-bold text-slate-800"
                title={`Controls with a passing attestation as a share of all ${summary.controlsTotal} controls across every mapped framework.`}
              >
                {compliancePct}%
              </span>
            </div>
            {/* The one disclosure this card owes an executive: those passing controls were
                FOUND, not TESTED. Every assessed control is an automated existence probe —
                the probe asks whether the AWS resource a control depends on is present and
                then marks the control pass. Without this line, "24/281 controls · 9%" under
                a Live badge reads as 24 controls verified working, and the four framework
                bars above read as measured programme coverage. Numbers come from the same
                getPosture() payload as the counts they qualify (aggregator
                complianceAssurance), so they can never drift apart; the block is absent
                entirely on the mock path, because the mock has no notion of "assessed". */}
            {complianceAssurance && (
              <div
                className="mt-2 flex items-start gap-1.5"
                title={
                  `An existence probe asks whether the AWS resource a control depends on is present, then marks the control pass. ` +
                  `Two CloudTrail trails existing is enough to pass NIST AI RMF MANAGE 3.1 — nothing checks what those trails cover, ` +
                  `whether they are retained, or whether anyone reads them. Read a passing control as "the prerequisite exists", never as ` +
                  `"this control was tested and works". ${complianceAssurance.autoDetectedControls} of the ${complianceAssurance.assessedControls} assessed controls were set this way rather than by human attestation. ` +
                  `The other ${complianceAssurance.notAssessedControls} of ${complianceAssurance.totalControls} controls are not assessed, which is not the same as failing.`
                }
              >
                <Icon name="information-circle" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-px" />
                <span className="text-[10px] text-slate-500 leading-snug">
                  {complianceAssurance.assessedControls} of {complianceAssurance.totalControls} controls assessed
                  {' '}({complianceAssurance.assessedPct}%) · {complianceAssurance.autoDetectedControls} set by automated
                  {' '}existence probes, not efficacy tests
                </span>
              </div>
            )}
          </div>

          {/* Security Findings */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-semibold text-slate-800">Security Findings</span>
                {riskLive && <LiveDataBadge source="AWS Security Hub" detail="Live risk posture from AWS security services" />}
                {/* When the Security Hub scan hit its limit, every severity tile below is
                    a floor. That matters most here: "0 Critical" out of a truncated scan
                    is not "no critical findings", and this is the executive view. */}
                <FloorCountBadge truncated={liveRisk?.truncated} scanned={liveRisk?.scanned} noun="findings" />
                <RegionCoverageBadge regions={liveRisk?.regions} noun="Finding counts" />
              </div>
              <a href="/govern/risk" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center p-2 rounded-lg bg-rose-50 border border-rose-200/60" title={riskCrit != null ? 'Critical-severity findings (AWS security services)' : 'Security Hub risk posture unavailable'}>
                <div className={`text-lg font-bold ${riskCrit != null ? 'text-rose-700' : 'text-slate-300'}`}>{riskCrit != null ? riskCrit : '—'}</div>
                <div className="text-[9px] text-slate-600 font-medium">Critical</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-200/60" title={riskHigh != null ? 'High-severity findings (AWS security services)' : 'Security Hub risk posture unavailable'}>
                <div className={`text-lg font-bold ${riskHigh != null ? 'text-amber-700' : 'text-slate-300'}`}>{riskHigh != null ? riskHigh : '—'}</div>
                <div className="text-[9px] text-slate-600 font-medium">High</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-blue-50 border border-blue-200/60" title={mediumFindings != null ? 'Medium-severity findings (AWS Security Hub)' : 'Security Hub risk posture unavailable'}>
                <div className={`text-lg font-bold ${mediumFindings != null ? 'text-blue-700' : 'text-slate-300'}`}>{mediumFindings != null ? mediumFindings : '—'}</div>
                <div className="text-[9px] text-slate-600 font-medium">Medium</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-100 border border-slate-200/60" title={lowFindings != null ? 'Low-severity findings (AWS Security Hub)' : 'Security Hub risk posture unavailable'}>
                <div className={`text-lg font-bold ${lowFindings != null ? 'text-slate-700' : 'text-slate-300'}`}>{lowFindings != null ? lowFindings : '—'}</div>
                <div className="text-[9px] text-slate-600 font-medium">Low</div>
              </div>
            </div>
            {liveConfig?.live && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-slate-600">AWS Config: {liveConfig.pct_compliant}% rules passing</span>
              </div>
            )}
          </div>

          {/* Vendor Governance */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="building-office" className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-slate-800">Vendors</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">TPRM</span>
                <MockDataBadge integration="Third-party risk management (TPRM) feed" />
              </div>
              <a href="/govern/risk?tab=third-party" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center p-2 rounded-lg bg-rose-50 border border-rose-200/60">
                <div className="text-lg font-bold text-rose-700">2</div>
                <div className="text-[9px] text-slate-600 font-medium">Critical</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-200/60">
                <div className="text-lg font-bold text-amber-700">5</div>
                <div className="text-[9px] text-slate-600 font-medium">High</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-blue-50 border border-blue-200/60">
                <div className="text-lg font-bold text-blue-700">8</div>
                <div className="text-[9px] text-slate-600 font-medium">Medium</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-100 border border-slate-200/60">
                <div className="text-lg font-bold text-slate-700">12</div>
                <div className="text-[9px] text-slate-600 font-medium">Low</div>
              </div>
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-200/60">
              <div className="flex items-center justify-between p-1 rounded bg-amber-50 border border-amber-200/60">
                <span className="text-[10px] text-amber-800">3 contracts expiring &lt;90d</span>
                <span className="text-[9px] text-amber-600 font-semibold">Review</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════
          ZONE 3: OPERATIONS — Fleet, Agents, Guardrails, Deployments
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeader
          icon="cpu-chip"
          title="Operations"
          description="Fleet inventory, guardrails, and deployment status"
          color="bg-blue-500"
        />

        {/* Compact Activity Bar */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200/60">
            <a href="/use-cases" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200">
              <Icon name="clipboard-list" className="w-4 h-4 text-indigo-500" />
              <span className="text-slate-800 font-semibold text-sm">{summary.totalUseCases}</span>
              <span className="text-slate-500 text-[10px]">Use Cases</span>
            </a>
            <div className="w-px h-5 bg-slate-200" />
            <a href="/aaas" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200">
              <Icon name="cpu-chip" className="w-4 h-4 text-sky-500" />
              <span className="text-slate-800 font-semibold text-sm">{summary.totalAgents}</span>
              <span className="text-slate-500 text-[10px]">AVA Agents</span>
            </a>
            <div className="w-px h-5 bg-slate-200" />
            <a href="/govern/agents" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200">
              <Icon name="globe-alt" className="w-4 h-4 text-cyan-500" />
              {/* Honesty gate: only the summed live connector inventories are shown; otherwise a Mock badge. */}
              {multicloudAgentsLive
                ? <span className="text-slate-800 font-semibold text-sm">{externalAgentsTotal}</span>
                : <MockDataBadge integration="Multi-cloud/SaaS agent inventory" />}
              <span className="text-slate-500 text-[10px]">External</span>
            </a>
            <div className="w-px h-5 bg-slate-200" />
            <a href="/secure/guardrails" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200">
              <Icon name="shield-check" className="w-4 h-4 text-emerald-500" />
              <span className="text-slate-800 font-semibold text-sm">{effectiveGuardrailsActive}</span>
              <span className="text-slate-500 text-[10px]">Guardrails</span>
            </a>
            <div className="w-px h-5 bg-slate-200" />
            <a href="/deployments" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200">
              <Icon name="rocket-launch" className="w-4 h-4 text-blue-500" />
              <span className="text-slate-800 font-semibold text-sm">{summary.deploymentsActive}</span>
              <span className="text-slate-500 text-[10px]">Deployments</span>
            </a>
            {summary.criticalIncidents > 0 && (
              <>
                <div className="w-px h-5 bg-slate-200" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-md">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-500" />
                  <span className="text-rose-700 font-semibold text-sm">{summary.criticalIncidents}</span>
                  <span className="text-rose-500 text-[10px]">Critical</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Guardrails & Deployments */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="shield-check" className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-800">Guardrails</span>
              </div>
              <a href="/secure/guardrails" className="text-[10px] text-blue-600 hover:text-blue-800">View →</a>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStatCard label="Active" value={effectiveGuardrailsActive} variant="success" />
              <MiniStatCard label="Draft" value={effectiveGuardrailsDraft} variant="warning" />
              <MiniStatCard label="Failed" value={effectiveGuardrailsFailed} variant="danger" />
            </div>
            <div className="pt-2 border-t border-slate-200/60">
              <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-2 font-medium">Deployments</div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStatCard label="Active" value={summary.deploymentsActive} variant="info" />
                <MiniStatCard label="Pending" value={summary.deploymentsPending} variant="muted" />
                <MiniStatCard label="Failed" value={summary.deploymentsFailed} variant="danger" />
              </div>
            </div>
          </div>

          {/* External Agents */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="globe-alt" className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">External Agents</span>
                {multicloudAgentsLive
                  ? <LiveDataBadge source="Multi-cloud connectors" detail="Live agent inventory from configured cloud/SaaS connectors" />
                  : <MockDataBadge integration="Multi-cloud/SaaS agent inventory" />}
              </div>
              <a href="/govern/agents" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="p-2 rounded-lg bg-orange-50 border border-orange-200/60 text-center">
                <div className={`text-lg font-bold ${awsAgentCell === '—' ? 'text-slate-300' : 'text-slate-900'}`}>{awsAgentCell}</div>
                <div className="text-[9px] text-orange-700 font-semibold">AWS</div>
              </div>
              <div className="p-2 rounded-lg bg-blue-50 border border-blue-200/60 text-center">
                <div className={`text-lg font-bold ${azureAgentsCell === '—' ? 'text-slate-300' : 'text-slate-900'}`}>{azureAgentsCell}</div>
                <div className="text-[9px] text-blue-700 font-semibold">Azure</div>
              </div>
              <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200/60 text-center">
                <div className={`text-lg font-bold ${gcpAgentsCell === '—' ? 'text-slate-300' : 'text-slate-900'}`}>{gcpAgentsCell}</div>
                <div className="text-[9px] text-indigo-700 font-semibold">GCP</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200/60 text-center">
                <div className={`text-lg font-bold ${salesforceAgentsCell === '—' ? 'text-slate-300' : 'text-slate-900'}`}>{salesforceAgentsCell}</div>
                <div className="text-[9px] text-cyan-700 font-semibold">Salesforce</div>
              </div>
              <div className="p-2 rounded-lg bg-purple-50 border border-purple-200/60 text-center">
                <div className={`text-lg font-bold ${copilotAgentsCell === '—' ? 'text-slate-300' : 'text-slate-900'}`}>{copilotAgentsCell}</div>
                <div className="text-[9px] text-purple-700 font-semibold">Copilot</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60 text-center" title={servicenowAgentsCell === '—' ? (liveMcAgents?.servicenow.note ?? 'ServiceNow connector not connected') : 'Live ServiceNow AI Agent Studio inventory'}>
                <div className={`text-lg font-bold ${servicenowAgentsCell === '—' ? 'text-slate-300' : 'text-slate-900'}`}>{servicenowAgentsCell}</div>
                <div className="text-[9px] text-slate-500 font-semibold">ServiceNow</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] pt-2 mt-2 border-t border-slate-200/60">
              {/* Total = sum of live connector inventories. The old "% governed" here rendered
                  `liveKpis.governedPct`, which measures AWS resource-tag coverage and says nothing
                  about external agents — replaced with the connector count, which is real. */}
              <span className="text-slate-600">Total: <span className="font-bold">{multicloudAgentsLive ? externalAgentsTotal : '—'}</span></span>
              <span className="text-slate-600">{multicloudAgentsLive ? `${mcLiveConnectors.length} of ${mcInventories.length} connectors live` : 'No connector live'}</span>
            </div>
          </div>

          {/* Trust Stack */}
          <div className="bg-gradient-to-r from-violet-50/80 via-emerald-50/50 to-blue-50/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="squares-2x2" className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-slate-800">Trust Stack</span>
                <div className="flex gap-0.5">
                  {[{ l: 'L1', c: '#8b5cf6' }, { l: 'L2', c: '#10b981' }, { l: 'L3', c: '#3b82f6' }].map((x) => (
                    <span key={x.l} className="text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: `${x.c}15`, color: x.c }}>{x.l}</span>
                  ))}
                </div>
              </div>
              <a href="/govern/trust-stack" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            {(() => {
              // Single source of truth: grade the 3 Trust Stack layers with the SAME
              // computeLayerReadiness() the dedicated /govern/trust-stack page uses, so
              // Foundation/Production/Scale % no longer diverge between the two surfaces.
              const readiness = computeLayerReadiness(aggResult);
              const foundationPct = readiness[1].score;
              const productionPct = readiness[2].score;
              const scalePct = readiness[3].score;
              return (
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-white/60 rounded-lg">
                    <div className="text-xl font-bold text-violet-700">{foundationPct}%</div>
                    <div className="text-[9px] text-slate-600 font-medium">Foundation</div>
                    <div className="h-1 bg-violet-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${foundationPct}%` }} /></div>
                  </div>
                  <div className="text-center p-2 bg-white/60 rounded-lg">
                    <div className="text-xl font-bold text-emerald-700">{productionPct}%</div>
                    <div className="text-[9px] text-slate-600 font-medium">Production</div>
                    <div className="h-1 bg-emerald-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${productionPct}%` }} /></div>
                  </div>
                  <div className="text-center p-2 bg-white/60 rounded-lg">
                    <div className="text-xl font-bold text-blue-700">{scalePct}%</div>
                    <div className="text-[9px] text-slate-600 font-medium">Scale</div>
                    <div className="h-1 bg-blue-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${scalePct}%` }} /></div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Runtime Observability - Compact widget for Command Center */}
        {liveObservability && liveObservability.by_agent.length > 0 && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="chart-bar" className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-slate-800">Runtime Observability</span>
                {liveObservability.live && <LiveDataBadge source="CloudWatch" detail="Live AgentCore runtime metrics from CloudWatch" />}
              </div>
              <a href="/govern/fleet/observability" className="text-[10px] text-blue-600 hover:text-blue-800">Full Dashboard →</a>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <MiniStatCard
                label="Invocations"
                value={liveObservability.by_agent.reduce((sum, a) => sum + a.invocations, 0).toLocaleString()}
                variant="info"
              />
              <MiniStatCard
                label="Active Agents"
                value={liveObservability.by_agent.filter(a => a.invocations > 0).length}
                variant="success"
              />
              <MiniStatCard
                label="Avg Latency"
                value={`${Math.round(liveObservability.by_agent.reduce((sum, a) => sum + a.avg_latency_ms, 0) / Math.max(liveObservability.by_agent.length, 1))}ms`}
                variant="warning"
              />
              <MiniStatCard
                label="Errors (7d)"
                value={liveObservability.by_agent.reduce((sum, a) => sum + a.errors, 0)}
                variant={liveObservability.by_agent.reduce((sum, a) => sum + a.errors, 0) > 0 ? 'danger' : 'muted'}
              />
              <MiniStatCard
                label="Sessions"
                value={liveObservability.by_agent.reduce((sum, a) => sum + a.sessions, 0)}
                variant="muted"
              />
            </div>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════
          ZONE 4: COST — FinOps, BU Budgets, Cost by Model
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <ZoneHeader
          icon="currency-dollar"
          title="Cost"
          description="AI spend, budget tracking, and cost allocation"
          color="bg-amber-500"
        />

        <div className="grid grid-cols-3 gap-4">
          {/* Cost by Model */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="currency-dollar" className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-800">Cost by Model</span>
                {liveCost?.live && liveCost.by_model.length > 0
                  ? <LiveDataBadge source="Cost Explorer" detail="Live cost by model from AWS Cost Explorer (GetCostAndUsage)" />
                  : <MockDataBadge integration="Cost Explorer (GetCostAndUsage grouped by model)" />}
              </div>
              <a href="/govern/finops" className="text-[10px] text-blue-600 hover:text-blue-800">FinOps →</a>
            </div>
            <div className="space-y-2">
              {(() => {
                const palette = ['#6366f1', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];
                const live = liveCost?.live && liveCost.by_model.length > 0;
                const items = live
                  ? liveCost!.by_model.slice(0, 5).map((m, i) => ({ model: m.model.replace(/^[a-z]+\./, ''), cost: m.amount, color: palette[i % palette.length] }))
                  : costByModel.slice(0, 5).map(m => ({ model: m.model, cost: m.cost, color: m.color }));
                const maxCost = Math.max(...items.map(c => c.cost), 1);
                return items.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                    <span className="text-[10px] text-slate-700 w-20 truncate font-medium">{m.model}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(m.cost / maxCost) * 100}%`, background: m.color }} />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-700 w-14 text-right">${Math.round(m.cost).toLocaleString()}</span>
                  </div>
                ));
              })()}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Total</span>
              <span className="text-sm font-bold text-slate-800">
                ${liveCost?.live ? (liveCost.total / 1000).toFixed(1) : (summary.monthlySpend / 1000).toFixed(0)}k
              </span>
            </div>
          </div>

          {/* Budgets — LIVE AWS Budgets (DescribeBudgets); honest degraded state when not connected */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="building-office" className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">Budgets</span>
                {budgetsLive
                  ? <LiveDataBadge source="AWS Budgets" detail="Live budget utilization from AWS Budgets (DescribeBudgets)" />
                  : <MockDataBadge integration="AWS Budgets (DescribeBudgets)" />}
              </div>
              <a href="/govern/finops" className="text-[10px] text-blue-600 hover:text-blue-800">FinOps →</a>
            </div>
            {budgetsLive ? (
              <>
                <div className="space-y-2">
                  {liveBudgets!.budgets.slice(0, 4).map((b) => {
                    const pct = Math.round(b.pct_used);
                    const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#10b981';
                    return (
                      <div
                        key={b.name}
                        className="flex items-center gap-2"
                        title={`${b.name}: ${usdCompact(b.actual)} of ${usdCompact(b.limit)} · forecast ${usdCompact(b.forecast)} · ${b.time_unit.toLowerCase()}`}
                      >
                        <span className="text-[10px] text-slate-700 w-20 truncate font-medium">{b.name}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                        </div>
                        <span className="text-[10px] font-semibold w-12 text-right tabular-nums" style={{ color }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Total actual / limit</span>
                  <span className="text-xs font-bold text-slate-800 tabular-nums">{usdCompact(liveBudgets!.total_actual)} / {usdCompact(liveBudgets!.total_limit)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-slate-600">Budgets unavailable</div>
                  <div className="text-[10px] mt-0.5">{liveBudgets?.note ?? 'Create AWS Budgets in the Billing console to track budget-vs-actual here.'}</div>
                </div>
              </div>
            )}
            {(liveAnomalies?.live ? liveAnomalies.anomalies.length : summary.costAnomalies) > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center gap-2">
                <PulseDot color="#f59e0b" size="sm" />
                <span className="text-[10px] text-amber-600 font-medium">
                  {liveAnomalies?.live ? liveAnomalies.anomalies.length : summary.costAnomalies} anomalies detected
                  {liveAnomalies?.live && <span className="ml-1 text-emerald-600">(live)</span>}
                </span>
              </div>
            )}
          </div>

          {/* Value Scorecard */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="chart-bar" className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-slate-800">Value Metrics</span>
              </div>
              <a href="/govern/finops" className="text-[10px] text-blue-600 hover:text-blue-800">Details →</a>
            </div>
            <ScorecardStrip compact />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════
          ZONE 5: ACTIVITY — Recent activity, Quick actions, Platform map
          ═══════════════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <ZoneHeader
            icon="bell"
            title="Activity"
            description="Recent events, quick actions, and platform navigation"
            color="bg-slate-500"
          />
          <button
            onClick={() => setActivityExpanded(!activityExpanded)}
            className="text-[10px] text-slate-500 hover:text-slate-700"
          >
            {activityExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {activityExpanded && (
          <>
            <div className="grid grid-cols-3 gap-4">
              {/* Recent Activity — prefer live audit events, fallback to mock */}
              <div className="col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Recent Activity</span>
                    <PulseDot color="#10b981" size="sm" />
                    {liveAuditEvents && liveAuditEvents.length > 0 && (
                      <LiveDataBadge source="Audit Log" detail="Live audit events" />
                    )}
                  </div>
                  <a href="/govern/audit" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
                    Audit Log →
                  </a>
                </div>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                  {(liveAuditEvents && liveAuditEvents.length > 0
                    ? liveAuditEvents.slice(0, 5).map(e => ({
                        id: e.id,
                        ts: e.ts,
                        module: (e.category === 'guardrail' ? 'secure' : e.category === 'deployment' ? 'operate' : 'govern') as ActivityFeedItem['module'],
                        severity: e.severity,
                        title: e.summary,
                        description: e.action,
                      }))
                    : activityFeed.slice(0, 5)
                  ).map((item) => (
                    <div key={item.id} className="flex items-start gap-2 p-1.5 rounded-lg bg-slate-50/80 border border-slate-200/40 hover:border-slate-300 transition-colors">
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        <ModuleBadge module={item.module} />
                        <SeverityBadge severity={item.severity} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-slate-800 font-medium truncate">{item.title}</div>
                        <div className="text-[9px] text-slate-500 truncate">{item.description}</div>
                      </div>
                      <span className="text-[8px] text-slate-400 flex-shrink-0">{item.ts}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                <a href="/govern/audit" className="block p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white shadow-sm mb-2">
                    <Icon name="clipboard-list" className="w-3.5 h-3.5" strokeWidth={2} />
                  </div>
                  <div className="text-[10px] font-semibold text-blue-800">Audit Log</div>
                </a>
                <a href="/govern/risk" className="block p-3 rounded-xl bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-200/60 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center text-white shadow-sm mb-2">
                    <Icon name="exclamation-triangle" className="w-3.5 h-3.5" strokeWidth={2} />
                  </div>
                  <div className="text-[10px] font-semibold text-rose-800">Risk Register</div>
                </a>
                <a href="/govern/fleet" className="block p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-200/60 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-sm mb-2">
                    <Icon name="cpu-chip" className="w-3.5 h-3.5" strokeWidth={2} />
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-800">Fleet</div>
                </a>
                <a href="/govern/agents" className="block p-3 rounded-xl bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-200/60 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center text-white shadow-sm mb-2">
                    <Icon name="rectangle-stack" className="w-3.5 h-3.5" strokeWidth={2} />
                  </div>
                  <div className="text-[10px] font-semibold text-cyan-800">Registry</div>
                </a>
              </div>
            </div>

            {/* Platform Integration (Collapsible) */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <button
                onClick={() => setPlatformExpanded(!platformExpanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon name={platformExpanded ? 'chevron-down' : 'chevron-right'} className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Governance Across AVA Platform</span>
                  <span className="text-[9px] text-slate-400">{PLATFORM_INTEGRATION.reduce((n, p) => n + p.modules.length, 0)} modules</span>
                </div>
                <div className="flex gap-1">
                  {[{ label: 'L1', color: '#8b5cf6' }, { label: 'L2', color: '#10b981' }, { label: 'L3', color: '#3b82f6' }].map((l) => (
                    <span key={l.label} className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${l.color}15`, color: l.color }}>{l.label}</span>
                  ))}
                </div>
              </button>
              {platformExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100">
                  <div className="grid grid-cols-4 gap-3 pt-3">
                    {PLATFORM_INTEGRATION.map((phase, pi) => (
                      <div key={pi} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 pb-1.5 border-b-2" style={{ borderColor: phase.color }}>
                          <span style={{ color: phase.color }} className="flex items-center"><Icon name={phase.icon} className="w-3.5 h-3.5" strokeWidth={2} /></span>
                          <span className="text-xs font-bold" style={{ color: phase.color }}>{phase.phase}</span>
                          <span className="text-[9px] text-slate-400 ml-auto">{phase.modules.length}</span>
                        </div>
                        {phase.modules.map((mod, mi) => (
                          <a key={mi} href={mod.route} className="block p-1.5 rounded-lg bg-slate-50/80 border border-slate-200/60 hover:border-slate-300 hover:bg-white transition-all">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-semibold text-slate-700">{mod.name}</span>
                              <span className="text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: mod.layer === 1 ? '#8b5cf615' : mod.layer === 2 ? '#10b98115' : '#3b82f615', color: mod.layer === 1 ? '#8b5cf6' : mod.layer === 2 ? '#10b981' : '#3b82f6' }}>L{mod.layer}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

    </div>
  );
}
