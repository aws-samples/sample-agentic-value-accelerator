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
  governCostApi, governPostureApi, governModelsApi, governRiskPostureApi, governTrailApi, governEvalsApi, governSecurityApi,
  governInvocationSafetyApi, governAuditApi,
  type AwsCostModelBreakdown, type AwsConfigCompliance, type AwsModelMetricsResponse,
  type AwsRiskPostureResponse, type AwsAiCallersResponse, type AwsEvaluationJobsResponse,
  type AwsSecurityPostureResponse, type AwsInvocationSafetyResponse,
  type AwsBudgetsResponse, type AwsCostAnomalies, type GovernAuditEvent,
} from '../../api/client';
import type { ActivityFeedItem } from './useGovernanceAggregator';
import { useGuardrailMetrics } from './useGuardrailMetrics';
import { useLiveKPIs } from './useLiveKPIs';
import LiveHeader from './LiveHeader';
import { usePollingKey } from './usePollingKey';
import { Icon, type IconName } from './icons';
import { MiniStatCard } from './StatCard';
import ScorecardStrip from './metrics/ScorecardStrip';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import AIQualityMonitor from './AIQualityMonitor';

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
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    governCostApi.byModel(3).then(d => { if (!cancelled) setLiveCost(d); }).catch(() => {});
    governInvocationSafetyApi.telemetry(7).then(d => { if (!cancelled) setLiveInvSafety(d); }).catch(() => {});
    governPostureApi.configCompliance().then(d => { if (!cancelled) setLiveConfig(d); }).catch(() => {});
    governModelsApi.runtimeMetrics(7).then(d => { if (!cancelled) setLiveRuntime(d); }).catch(() => {});
    governRiskPostureApi.securityHub(200).then(d => { if (!cancelled) setLiveRisk(d); }).catch(() => {});
    governTrailApi.aiCallers(168).then(d => { if (!cancelled) setLiveCallers(d); }).catch(() => {});
    governEvalsApi.jobs(100).then(d => { if (!cancelled) setLiveEvals(d); }).catch(() => {});
    governSecurityApi.posture().then(d => { if (!cancelled) setLiveSecurity(d); }).catch(() => {});
    governCostApi.budgets().then(d => { if (!cancelled) setLiveBudgets(d); }).catch(() => {});
    governCostApi.anomalies(60).then(d => { if (!cancelled) setLiveAnomalies(d); }).catch(() => {});
    governAuditApi.list(undefined, 20).then(d => { if (!cancelled) setLiveAuditEvents(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pollKey]);

  const {
    loading: aggLoading,
    error: aggError,
    summary,
    activityFeed,
    complianceFrameworks,
    costByModel,
    buBudgets,
    refresh: refreshAggregator,
  } = useGovernanceAggregator();

  const {
    error: guardrailError,
    activeCount: guardrailsActive,
    draftCount: guardrailsDraft,
    failedCount: guardrailsFailed,
    refresh: refreshGuardrails,
  } = useGuardrailMetrics();

  const loading = aggLoading;

  const refresh = () => {
    refreshAggregator();
    refreshGuardrails();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <div className="text-slate-500">Loading governance data...</div>
        </div>
      </div>
    );
  }

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

  const secLive = liveSecurity?.live ? liveSecurity : null;
  const riskCrit = secLive ? secLive.critical : (liveRisk?.live ? liveRisk.critical : null);
  const riskSub = secLive
    ? `critical · ${secLive.high} high · ${secLive.total_findings} findings (${secLive.sources_live} AWS security services)`
    : (liveRisk?.live ? `critical · ${liveRisk.high} high (Security Hub)` : 'Security Hub unavailable');
  const riskLive = !!secLive || !!liveRisk?.live;
  const runtimeInv = liveRuntime?.live ? liveRuntime.total_invocations : null;
  const runtimeErr = liveRuntime?.live ? liveRuntime.fleet_error_rate_pct : 0;
  const unrecognizedCallers = liveCallers?.live ? liveCallers.unrecognized : null;
  const evalsDone = liveEvals?.live ? liveEvals.completed : null;
  const interventions = liveInvSafety?.live ? liveInvSafety.guardrail_intervened : null;
  const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

  return (
    <div className="space-y-6">
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
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-medium text-slate-700 border border-slate-200 transition-colors"
          >
            ↻ Refresh All
          </button>
        </div>

        {/* Live AWS Tiles */}
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
          <LiveHeader
            live
            label="Live · from your AWS account"
            caption="Security Hub · CloudWatch · CloudTrail · Bedrock evals & guardrails"
            autoRefresh
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

        {/* AI Quality Monitor */}
        <AIQualityMonitor compact />
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
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                    {summary.frameworksNeedingAttention.length} need attention
                  </span>
                )}
              </div>
              <a href="/govern/compliance" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="space-y-2">
              {complianceFrameworks.slice(0, 4).map((fw, i) => {
                const pct = Math.round((fw.covered / fw.total) * 100);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-20 text-[10px] text-slate-700 truncate font-medium">{fw.name}</div>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fw.status === 'on-track' ? '#10b981' : '#f59e0b' }} />
                    </div>
                    <div className="w-8 text-right text-[10px] font-semibold text-slate-600">{pct}%</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{summary.controlsImplemented}/{summary.controlsTotal} controls</span>
              <span className="text-xs font-bold text-slate-800">{compliancePct}%</span>
            </div>
          </div>

          {/* Security Findings */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-semibold text-slate-800">Security Findings</span>
                {riskLive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">LIVE</span>}
              </div>
              <a href="/govern/risk" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center p-2 rounded-lg bg-rose-50 border border-rose-200/60">
                <div className="text-lg font-bold text-rose-700">{secLive?.critical ?? liveRisk?.critical ?? 0}</div>
                <div className="text-[9px] text-slate-600 font-medium">Critical</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-200/60">
                <div className="text-lg font-bold text-amber-700">{secLive?.high ?? liveRisk?.high ?? 0}</div>
                <div className="text-[9px] text-slate-600 font-medium">High</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-blue-50 border border-blue-200/60">
                <div className="text-lg font-bold text-blue-700">{secLive?.medium ?? liveRisk?.medium ?? 0}</div>
                <div className="text-[9px] text-slate-600 font-medium">Medium</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-100 border border-slate-200/60">
                <div className="text-lg font-bold text-slate-700">{secLive?.low ?? liveRisk?.low ?? 0}</div>
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
              <span className="text-slate-800 font-semibold text-sm">{liveKpis.externalAgents}</span>
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
              </div>
              <a href="/govern/agents" className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">View →</a>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="p-2 rounded-lg bg-orange-50 border border-orange-200/60 text-center">
                <div className="text-lg font-bold text-slate-900">{liveFlags.agents ? liveKpis.bedrockAgents : 12}</div>
                <div className="text-[9px] text-orange-700 font-semibold">AWS</div>
              </div>
              <div className="p-2 rounded-lg bg-blue-50 border border-blue-200/60 text-center">
                <div className="text-lg font-bold text-slate-900">8</div>
                <div className="text-[9px] text-blue-700 font-semibold">Azure</div>
              </div>
              <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200/60 text-center">
                <div className="text-lg font-bold text-slate-900">5</div>
                <div className="text-[9px] text-indigo-700 font-semibold">GCP</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200/60 text-center">
                <div className="text-lg font-bold text-slate-900">8</div>
                <div className="text-[9px] text-cyan-700 font-semibold">Salesforce</div>
              </div>
              <div className="p-2 rounded-lg bg-purple-50 border border-purple-200/60 text-center">
                <div className="text-lg font-bold text-slate-900">12</div>
                <div className="text-[9px] text-purple-700 font-semibold">Copilot</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60 text-center">
                <div className="text-lg font-bold text-slate-400">+3</div>
                <div className="text-[9px] text-slate-500 font-semibold">more</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] pt-2 mt-2 border-t border-slate-200/60">
              <span className="text-slate-600">Total: <span className="font-bold">{liveKpis.externalAgents}</span></span>
              <span className="text-emerald-600 font-bold">{liveKpis.governedPct}% governed</span>
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
              // L1 Foundation: % of guardrails active + governed agents (proxy for KB/Tools coverage)
              const totalGuardrails = effectiveGuardrailsActive + effectiveGuardrailsDraft + effectiveGuardrailsFailed;
              const guardrailHealth = totalGuardrails > 0 ? Math.round((effectiveGuardrailsActive / totalGuardrails) * 100) : 0;
              const foundationPct = Math.round((guardrailHealth + liveKpis.governedPct) / 2); // avg of guardrail health + governed %
              // L2 Production: deployed use cases
              const productionPct = summary.totalUseCases > 0 ? Math.round((summary.deployedUseCases / summary.totalUseCases) * 100) : 0;
              // L3 Scale: agents with policies
              const scalePct = summary.totalAgents > 0 ? Math.round((summary.agentsWithPolicies / summary.totalAgents) * 100) : 0;
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
                {liveCost?.live && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">LIVE</span>}
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

          {/* BU Budgets — prefer live AWS Budgets, fallback to mock */}
          <div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="building-office" className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">Budgets</span>
                {liveBudgets?.live && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">LIVE</span>}
              </div>
              <a href="/govern/finops" className="text-[10px] text-blue-600 hover:text-blue-800">FinOps →</a>
            </div>
            <div className="space-y-2">
              {(liveBudgets?.live && liveBudgets.budgets.length > 0
                ? liveBudgets.budgets.slice(0, 4).map(b => ({ name: b.name, pct: b.pct_used }))
                : buBudgets.slice(0, 4).map(bu => ({ name: bu.bu, pct: Math.round((bu.currentSpend / bu.monthlyBudget) * 100) }))
              ).map((b, i) => {
                const color = b.pct > 90 ? '#ef4444' : b.pct > 75 ? '#f59e0b' : '#10b981';
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-700 w-20 truncate font-medium">{b.name}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(b.pct, 100)}%`, background: color }} />
                    </div>
                    <span className="text-[10px] font-semibold w-10 text-right" style={{ color }}>{b.pct}%</span>
                  </div>
                );
              })}
            </div>
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">LIVE</span>
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
