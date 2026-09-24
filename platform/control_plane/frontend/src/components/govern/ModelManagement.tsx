/**
 * ModelManagement — Comprehensive model governance hub
 *
 * Reorganized with 6 main tabs:
 * - Dashboard: Live data, KPIs, alerts
 * - Registry: Model inventory, risk dashboard
 * - Evaluations: Model evals, RAG evals, deployment gate
 * - Explainability: Attribution, bias & fairness
 * - Compliance: Governance, lifecycle, attestations
 * - Operations: Monitoring, ops, analysis tools
 */

import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MODELS } from './mockData';
import ModelRegistry from './ModelRegistry';
import ModelEvaluations from './ModelEvaluations';
import ModelMonitoring from './ModelMonitoring';
import ModelGovernance from './ModelGovernance';
import ModelLifecycle from './ModelLifecycle';
import ModelOperations from './ModelOperations';
import ModelExplainability from './ModelExplainability';
import BiasFairness from './BiasFairness';
import RagEvaluations from './RagEvaluations';
import DeploymentGate from './DeploymentGate';
import LiveModelInventory from './LiveModelInventory';
import ModelComparison from './ModelComparison';
import RiskScoringCalculator from './RiskScoringCalculator';
import ModelDependencyGraph from './ModelDependencyGraph';
import MRMFrameworkExplorer from './MRMFrameworkExplorer';
import ModelLineageViewer from './ModelLineageViewer';
import HallucinationDetection from './HallucinationDetection';
import AIQualityMonitor from './AIQualityMonitor';
import LlmMonitoringPatterns from './LlmMonitoringPatterns';
import UnifiedGuide, { MODELS_GUIDE } from './UnifiedGuide';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import { RegionCoverageBadge } from './RegionCoverageBadge';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import useGuardrailMetrics from './useGuardrailMetrics';
import useGovernModels from './useGovernModels';
import GovernTabs, { GovernTabPanel, type GovernTab } from './GovernTabs';
import LiveHeader from './LiveHeader';
import {
  governCostApi, governModelsApi, governInvocationSafetyApi, governEvalsApi,
  type AwsCostModelBreakdown, type AwsModelMetricsResponse,
  type AwsInvocationSafetyResponse, type AwsEvaluationJobsResponse,
  type AwsCostAnomalies, type AwsEvaluationJob,
  type AwsInferenceProfilesResponse, type AwsPromptRoutersResponse,
} from '../../api/client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { Icon } from './icons';
import CoreBadge from './CoreBadge';

type Tab = 'dashboard' | 'registry' | 'availability' | 'evaluations' | 'explainability' | 'compliance' | 'operations';
type EvalSubTab = 'model-evals' | 'rag' | 'gate';
type ExplainSubTab = 'explainability' | 'bias';
type ComplianceSubTab = 'governance' | 'lifecycle';
type OpsSubTab = 'monitoring' | 'hallucination' | 'quality' | 'patterns' | 'operations' | 'tools';

const TABS: GovernTab[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Live data, KPIs & alerts' },
  { id: 'registry', label: 'Registry', description: 'Model inventory & risk' },
  { id: 'availability', label: 'Availability & Routing', description: 'Model availability, inference profiles & prompt routers', icon: <Icon name="arrows-right-left" /> },
  { id: 'evaluations', label: 'Evaluations', description: 'Model & RAG evals, deployment gate' },
  { id: 'explainability', label: 'Explainability', description: 'Attribution, bias & fairness' },
  { id: 'compliance', label: 'Compliance', description: 'Governance & lifecycle' },
  { id: 'operations', label: 'Operations', description: 'Monitoring & tools' },
];

const TAB_IDS = TABS.map(t => t.id);
const MODEL_CONTEXT_TABS: Tab[] = ['evaluations', 'explainability'];

export default function ModelManagement() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = searchParams.get('tab');
  const initialTab: Tab = tabFromUrl && TAB_IDS.includes(tabFromUrl as Tab) ? (tabFromUrl as Tab) : 'dashboard';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Sub-tab states
  const [evalSubTab, setEvalSubTab] = useState<EvalSubTab>('model-evals');
  const [explainSubTab, setExplainSubTab] = useState<ExplainSubTab>('explainability');
  const [complianceSubTab, setComplianceSubTab] = useState<ComplianceSubTab>('governance');
  const [opsSubTab, setOpsSubTab] = useState<OpsSubTab>('monitoring');

  // Tool modals
  const [showComparison, setShowComparison] = useState(false);
  const [showRiskCalculator, setShowRiskCalculator] = useState(false);
  const [showDependencyGraph, setShowDependencyGraph] = useState(false);
  const [showFrameworkExplorer, setShowFrameworkExplorer] = useState(false);
  const [showLineageViewer, setShowLineageViewer] = useState(false);

  // Shared model context for eval/explainability tabs
  const modelFromUrl = searchParams.get('model');
  const [selectedModelId, setSelectedModelId] = useState<string>(
    modelFromUrl && MODELS.some(m => m.id === modelFromUrl) ? modelFromUrl : MODELS[0].id
  );

  useEffect(() => {
    if (tabFromUrl && TAB_IDS.includes(tabFromUrl as Tab) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl as Tab);
    }
  }, [tabFromUrl, activeTab]);

  const changeTab = (tabId: string) => {
    if (!TAB_IDS.includes(tabId as Tab)) return;
    setActiveTab(tabId as Tab);
    const next = new URLSearchParams(searchParams);
    if (tabId === 'dashboard') next.delete('tab'); else next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  const changeModel = (modelId: string) => {
    setSelectedModelId(modelId);
    const next = new URLSearchParams(searchParams);
    next.set('model', modelId);
    setSearchParams(next, { replace: true });
  };

  const showModelPill = MODEL_CONTEXT_TABS.includes(activeTab);

  const { loading: avaLoading, useCases, deployments, frontierAgents } = useGovernanceAggregator();
  // Guardrail counts come from the shared hook, which prefers live Bedrock ListGuardrails
  // and falls back to the control-plane template count when Bedrock is unavailable.
  const { totalCount: guardrailTotal, activeCount: guardrailActive } = useGuardrailMetrics();

  const liveInventory = useMemo(() => ({
    deployments: deployments.length,
    activeDeployments: deployments.filter(d => d.status === 'deployed' || d.status === 'delivered').length,
    useCases: useCases.length,
    productionUseCases: useCases.filter(uc => uc.status === 'Production').length,
    agents: frontierAgents.length,
    guardrails: guardrailTotal,
    activeGuardrails: guardrailActive,
  }), [deployments, useCases, guardrailTotal, guardrailActive, frontierAgents]);

  const hasLiveData = !avaLoading && (liveInventory.deployments > 0 || liveInventory.useCases > 0 || liveInventory.agents > 0 || liveInventory.guardrails > 0);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Model Management</h1>
              <CoreBadge pillar="see" />
              <MockDataBadge integration="Bedrock ListFoundationModels + custom metadata DB" />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Govern every model — registry and approvals, live evaluations, monitoring, and explainability across the model lifecycle.
            </p>
          </div>
        </div>

        <UnifiedGuide {...MODELS_GUIDE} />

        {/* Main Tab Navigation */}
        <GovernTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(tabId) => changeTab(tabId as Tab)}
          ariaLabel="Model Management sections"
          enableKeyboardNav
        />

        {/* Model context pill for eval/explainability tabs */}
        {showModelPill && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] text-slate-500">Inspecting model</span>
            <select
              value={selectedModelId}
              onChange={(e) => changeModel(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 bg-white focus:outline-none focus:border-blue-500"
            >
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        {/* Dashboard Tab */}
        <GovernTabPanel id="dashboard" activeTab={activeTab}>
          <DashboardTab
            liveInventory={liveInventory}
            hasLiveData={hasLiveData}
            avaLoading={avaLoading}
            onShowComparison={() => setShowComparison(true)}
            onShowRiskCalculator={() => setShowRiskCalculator(true)}
            onShowDependencyGraph={() => setShowDependencyGraph(true)}
            onShowFrameworkExplorer={() => setShowFrameworkExplorer(true)}
            onShowLineageViewer={() => setShowLineageViewer(true)}
            onNavigateToHallucination={() => { changeTab('operations'); setOpsSubTab('hallucination'); }}
          />
        </GovernTabPanel>

        {/* Registry Tab */}
        <GovernTabPanel id="registry" activeTab={activeTab}>
          <div className="bg-white/60 rounded-xl border border-slate-200/60 p-1">
            <ModelRegistry embedded />
          </div>
        </GovernTabPanel>

        {/* Availability & Routing Tab */}
        <GovernTabPanel id="availability" activeTab={activeTab}>
          <AvailabilityRoutingTab />
        </GovernTabPanel>

        {/* Evaluations Tab */}
        <GovernTabPanel id="evaluations" activeTab={activeTab}>
          <EvaluationsTab
            modelId={selectedModelId}
            subTab={evalSubTab}
            onSubTabChange={setEvalSubTab}
            onNavigateTab={changeTab}
            onSelectModel={changeModel}
          />
        </GovernTabPanel>

        {/* Explainability Tab */}
        <GovernTabPanel id="explainability" activeTab={activeTab}>
          <ExplainabilityTab
            modelId={selectedModelId}
            subTab={explainSubTab}
            onSubTabChange={setExplainSubTab}
            onNavigateTab={changeTab}
          />
        </GovernTabPanel>

        {/* Compliance Tab */}
        <GovernTabPanel id="compliance" activeTab={activeTab}>
          <ComplianceTab
            subTab={complianceSubTab}
            onSubTabChange={setComplianceSubTab}
          />
        </GovernTabPanel>

        {/* Operations Tab */}
        <GovernTabPanel id="operations" activeTab={activeTab}>
          <OperationsTab
            subTab={opsSubTab}
            onSubTabChange={setOpsSubTab}
            onShowComparison={() => setShowComparison(true)}
            onShowRiskCalculator={() => setShowRiskCalculator(true)}
            onShowDependencyGraph={() => setShowDependencyGraph(true)}
            onShowFrameworkExplorer={() => setShowFrameworkExplorer(true)}
            onShowLineageViewer={() => setShowLineageViewer(true)}
          />
        </GovernTabPanel>
      </div>

      {/* Modal tools */}
      {showComparison && <ModelComparison isOpen={showComparison} onClose={() => setShowComparison(false)} />}
      {showRiskCalculator && <RiskScoringCalculator isOpen={showRiskCalculator} onClose={() => setShowRiskCalculator(false)} />}
      {showDependencyGraph && <ModelDependencyGraph isOpen={showDependencyGraph} onClose={() => setShowDependencyGraph(false)} />}
      {showFrameworkExplorer && <MRMFrameworkExplorer isOpen={showFrameworkExplorer} onClose={() => setShowFrameworkExplorer(false)} />}
      {showLineageViewer && <ModelLineageViewer isOpen={showLineageViewer} onClose={() => setShowLineageViewer(false)} />}
    </div>
  );
}

// ─────────────────────────── Sub-Tab Components ───────────────────────────

function SubTabList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 p-1 bg-slate-100/60 rounded-lg w-fit">
      {children}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  children,
  controls,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  controls?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────── Dashboard Tab ───────────────────────────

interface DashboardTabProps {
  liveInventory: {
    deployments: number;
    activeDeployments: number;
    useCases: number;
    productionUseCases: number;
    agents: number;
    guardrails: number;
    activeGuardrails: number;
  };
  hasLiveData: boolean;
  avaLoading: boolean;
  onShowComparison: () => void;
  onShowRiskCalculator: () => void;
  onShowDependencyGraph: () => void;
  onShowFrameworkExplorer: () => void;
  onShowLineageViewer: () => void;
  onNavigateToHallucination: () => void;
}

const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

function DashboardTab({ liveInventory, hasLiveData, avaLoading, onShowComparison, onShowRiskCalculator, onShowDependencyGraph, onShowFrameworkExplorer, onShowLineageViewer, onNavigateToHallucination }: DashboardTabProps) {
  // Live AWS data
  const [liveRuntime, setLiveRuntime] = useState<AwsModelMetricsResponse | null>(null);
  const [liveCost, setLiveCost] = useState<AwsCostModelBreakdown | null>(null);
  const [liveInvSafety, setLiveInvSafety] = useState<AwsInvocationSafetyResponse | null>(null);
  const [liveEvals, setLiveEvals] = useState<AwsEvaluationJobsResponse | null>(null);
  const [liveAnomalies, setLiveAnomalies] = useState<AwsCostAnomalies | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      governModelsApi.runtimeMetrics(7),
      governCostApi.byModel(3),
      governInvocationSafetyApi.telemetry(7),
      governEvalsApi.jobs(50),
      governCostApi.anomalies(30),
    ]).then(([runtime, cost, safety, evals, anomalies]) => {
      if (cancelled) return;
      if (runtime.status === 'fulfilled') setLiveRuntime(runtime.value);
      if (cost.status === 'fulfilled') setLiveCost(cost.value);
      if (safety.status === 'fulfilled') setLiveInvSafety(safety.value);
      if (evals.status === 'fulfilled') setLiveEvals(evals.value);
      if (anomalies.status === 'fulfilled') setLiveAnomalies(anomalies.value);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  // Compute live metrics
  const runtimeInvocations = liveRuntime?.live ? liveRuntime.total_invocations : null;
  const runtimeErrors = liveRuntime?.live ? liveRuntime.fleet_error_rate_pct : null;
  const runtimeLatency = liveRuntime?.live ? liveRuntime.avg_latency_ms : null;
  const totalCost = liveCost?.live ? liveCost.total : null;
  const interventions = liveInvSafety?.live ? liveInvSafety.guardrail_intervened : null;
  const interventionRate = liveInvSafety?.live ? liveInvSafety.intervention_rate_pct : null;
  const evalJobs = liveEvals?.live ? liveEvals.completed : null;
  const evalRunning = liveEvals?.live ? liveEvals.in_progress : null;

  // AwsCostModelBreakdown reports a period window (start/end) rather than a month count — derive it.
  const costWindowMonths = liveCost?.live
    ? Math.max(1, Math.round((new Date(liveCost.period_end).getTime() - new Date(liveCost.period_start).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : null;

  const anyLive = liveRuntime?.live || liveCost?.live || liveInvSafety?.live || liveEvals?.live;

  return (
    <div className="space-y-6">
      {/* Live Deployed Inventory - AVA data (what's running now) */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          {hasLiveData ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold text-slate-900">Deployed Inventory</span>
              <LiveDataBadge detail="Live deployed inventory from the AVA platform" />
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-sm font-semibold text-slate-900">Deployed Inventory</span>
              <span className="text-[10px] text-slate-400">{avaLoading ? 'loading...' : 'no live deployments detected'}</span>
            </>
          )}
          <span className="ml-auto text-[10px] text-slate-400">What's running now from Plan/Build/Secure</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/applications" className="bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-emerald-300 transition-colors">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Deployments</div>
            <div className="text-xl font-semibold text-slate-900">{liveInventory.deployments}</div>
            <div className="text-[10px] text-slate-500">{liveInventory.activeDeployments} active</div>
          </Link>
          <Link to="/aaas/aws-agents" className="bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-emerald-300 transition-colors">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Agents</div>
            <div className="text-xl font-semibold text-slate-900">{liveInventory.agents}</div>
            <div className="text-[10px] text-slate-500">frontier catalog</div>
          </Link>
          <Link to="/use-cases" className="bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-emerald-300 transition-colors">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Use Cases</div>
            <div className="text-xl font-semibold text-slate-900">{liveInventory.useCases}</div>
            <div className="text-[10px] text-slate-500">{liveInventory.productionUseCases} in production</div>
          </Link>
          <Link to="/secure/guardrails" className="bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-emerald-300 transition-colors">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Guardrails</div>
            <div className="text-xl font-semibold text-slate-900">{liveInventory.guardrails}</div>
            <div className="text-[10px] text-slate-500">{liveInventory.activeGuardrails} active</div>
          </Link>
        </div>
      </div>

      {/* Analysis Tools - Quick Access */}
      <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-violet-50 rounded-xl border border-indigo-200/60 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Icon name="chart-bar" className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Analysis Tools</div>
              <div className="text-xs text-slate-500">Compare models, calculate risk, visualize dependencies</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onShowComparison}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm"
            >
              <Icon name="scale" className="w-4 h-4" />
              Compare
            </button>
            <button
              onClick={onShowRiskCalculator}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 hover:border-amber-300 transition-all shadow-sm"
            >
              <Icon name="calculator" className="w-4 h-4" />
              Risk Calc
            </button>
            <button
              onClick={onShowDependencyGraph}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-50 hover:border-violet-300 transition-all shadow-sm"
            >
              <Icon name="link" className="w-4 h-4" />
              Dependencies
            </button>
            <button
              onClick={onShowFrameworkExplorer}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-all shadow-sm"
            >
              <Icon name="document-check" className="w-4 h-4" />
              MRM Frameworks
            </button>
            <button
              onClick={onShowLineageViewer}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-purple-200 rounded-lg text-xs font-medium text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all shadow-sm"
            >
              <Icon name="link" className="w-4 h-4" />
              Model Lineage
            </button>
          </div>
        </div>
      </div>

      {/* Combined Live from AWS - All AWS data in one section */}
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
        <LiveHeader
          live={anyLive || false}
          label="Live · from your AWS account"
          caption="Bedrock catalog · CloudWatch runtime · Cost Explorer · Guardrail telemetry · Evaluations"
          autoRefresh
        />

        {/* Executive KPIs */}
        {loading ? (
          <div className="h-24 flex items-center justify-center text-sm text-slate-400">Loading live metrics...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Invocations</span>
                {liveRuntime?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                {/* On the card, not the section header: the header spans five different
                    sources, so a region badge up there could not say which total it
                    describes. Here it sits on exactly the number it covers. */}
                {liveRuntime?.live && (
                  <RegionCoverageBadge regions={liveRuntime.regions} noun="Invocation totals" />
                )}
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {runtimeInvocations !== null ? compact(runtimeInvocations) : '—'}
              </div>
              <div className="text-[11px] text-slate-400">
                {liveRuntime?.live ? `${liveRuntime.window_days}d · ${liveRuntime.by_model.length} models` : 'CloudWatch unavailable'}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Error Rate</span>
                {liveRuntime?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${runtimeErrors !== null && runtimeErrors > 2 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {runtimeErrors !== null ? `${runtimeErrors}%` : '—'}
              </div>
              <div className="text-[11px] text-slate-400">
                {liveRuntime?.live ? `avg latency ${((runtimeLatency || 0) / 1000).toFixed(1)}s` : 'CloudWatch unavailable'}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Interventions</span>
                {liveInvSafety?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </div>
              <div className={`text-2xl font-bold tabular-nums ${
                interventionRate !== null && interventionRate >= 5 ? 'text-rose-600'
                : interventionRate !== null && interventionRate >= 1 ? 'text-amber-600'
                : 'text-slate-900'
              }`}>
                {interventions !== null ? compact(interventions) : '—'}
              </div>
              <div className="text-[11px] text-slate-400">
                {liveInvSafety?.live ? `${interventionRate}% intervention rate` : 'Guardrail telemetry unavailable'}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Model Cost</span>
                {liveCost?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {totalCost !== null ? usd(totalCost) : '—'}
              </div>
              <div className="text-[11px] text-slate-400">
                {liveCost?.live ? `${costWindowMonths}mo · ${liveCost.by_model.length} models` : 'Cost Explorer unavailable'}
              </div>
            </div>
          </div>
        )}

        {/* Eval Jobs Summary */}
        {liveEvals?.live && (
          <div className="mb-4 px-3 py-2 bg-white/60 rounded-lg flex items-center gap-4 text-xs">
            <span className="text-slate-500">Bedrock Evaluations:</span>
            <span className="font-medium text-emerald-600">{evalJobs} completed</span>
            {evalRunning !== null && evalRunning > 0 && (
              <span className="font-medium text-blue-600">{evalRunning} running</span>
            )}
            {liveEvals.failed > 0 && (
              <span className="font-medium text-rose-600">{liveEvals.failed} failed</span>
            )}
          </div>
        )}

        {/* Live Model Inventory Table - embedded within the AWS section */}
        <LiveModelInventory />

        {/* MRM Indicators Section */}
        <div className="mt-4 pt-4 border-t border-slate-200/60">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-900">Model Risk Indicators</span>
            <span className="text-[10px] text-slate-400">Drift detection, eval results, anomalies, hallucination</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Guardrail intervention trend (plots guardrail_intervened / intervention_rate_pct) */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-700">Intervention Trend</span>
                {liveInvSafety?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </div>
              {liveInvSafety?.trend && liveInvSafety.trend.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={liveInvSafety.trend.slice(-7)} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <defs>
                        <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[0, 'auto']} />
                      <Tooltip
                        contentStyle={{ fontSize: 10, padding: '4px 8px' }}
                        formatter={((v: number) => [`${v} interventions`, '']) as Formatter<ValueType, NameType>}
                        labelFormatter={(d) => new Date(d).toLocaleDateString()}
                      />
                      <Area type="monotone" dataKey="guardrail_intervened" stroke="#f43f5e" fill="url(#errorGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {liveInvSafety.window_days}d trend · {liveInvSafety.intervention_rate_pct}% intervention rate
                  </div>
                </>
              ) : (
                <div className="h-[80px] flex items-center justify-center text-xs text-slate-400">
                  No trend data available
                </div>
              )}
            </div>

            {/* Recent Eval Results */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-700">Recent Evaluations</span>
                {liveEvals?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </div>
              {liveEvals?.jobs && liveEvals.jobs.length > 0 ? (
                <div className="space-y-2">
                  {liveEvals.jobs.slice(0, 4).map((job: AwsEvaluationJob, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 truncate max-w-[140px]" title={job.name}>{job.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        job.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                        job.status === 'InProgress' ? 'bg-blue-100 text-blue-700' :
                        job.status === 'Failed' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {job.status}
                      </span>
                    </div>
                  ))}
                  {liveEvals.jobs.length > 4 && (
                    <div className="text-[10px] text-slate-400">+{liveEvals.jobs.length - 4} more</div>
                  )}
                </div>
              ) : (
                <div className="h-[80px] flex items-center justify-center text-xs text-slate-400">
                  No evaluation jobs found
                </div>
              )}
            </div>

            {/* Cost Anomalies */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-700">Cost Anomalies</span>
                {liveAnomalies?.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </div>
              {liveAnomalies?.anomalies && liveAnomalies.anomalies.length > 0 ? (
                <div className="space-y-2">
                  {liveAnomalies.anomalies.slice(0, 3).map((anomaly, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${anomaly.score > 0.8 ? 'bg-rose-500' : anomaly.score > 0.5 ? 'bg-amber-500' : 'bg-slate-400'}`} />
                        <span className="text-slate-600 truncate max-w-[100px]">{anomaly.service || 'Unknown'}</span>
                      </div>
                      <span className="font-medium text-rose-600">+${Math.round(anomaly.impact).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-slate-500 mt-1">
                    {liveAnomalies.count} anomalies detected (30d)
                  </div>
                </div>
              ) : (
                <div className="h-[80px] flex flex-col items-center justify-center">
                  <span className="text-emerald-600 text-sm font-medium">No anomalies</span>
                  <span className="text-[10px] text-slate-400">Cost patterns normal</span>
                </div>
              )}
            </div>

            {/* Hallucination Detection */}
            <div
              onClick={onNavigateToHallucination}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 cursor-pointer hover:border-amber-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-700">Hallucination Detection</span>
                  <MockDataBadge integration="Hallucination detection: SageMaker Model Monitor / grounding evals" />
                </div>
                <Icon name="arrow-right" className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-slate-700">Grounding Check</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">Active</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Faithfulness eval</span>
                  <span className="text-emerald-600 font-medium">Enabled</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Citation verification</span>
                  <span className="text-emerald-600 font-medium">Enabled</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-2">Click to configure detection & mitigation</div>
            </div>
          </div>

          {/* Model-level drift indicators */}
          {liveRuntime?.by_model && liveRuntime.by_model.length > 0 && (
            <div className="mt-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-700">Model Health Summary</span>
                <span className="text-[10px] text-slate-400">Error rates by model</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {liveRuntime.by_model.slice(0, 6).map((m, i) => {
                  const shortName = m.model_id.replace(/^[a-z]+\./, '').replace(/-v\d.*$/, '').split('-').slice(0, 2).join('-');
                  const isHealthy = m.error_rate_pct < 2;
                  const isWarning = m.error_rate_pct >= 2 && m.error_rate_pct < 5;
                  return (
                    <div key={i} className={`p-2 rounded-lg border ${isHealthy ? 'bg-emerald-50 border-emerald-200' : isWarning ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className="text-[10px] text-slate-600 truncate" title={m.model_id}>{shortName}</div>
                      <div className={`text-sm font-bold ${isHealthy ? 'text-emerald-600' : isWarning ? 'text-amber-600' : 'text-rose-600'}`}>
                        {m.error_rate_pct}%
                      </div>
                      <div className="text-[9px] text-slate-400">{compact(m.invocations)} calls</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Availability & Routing Tab ───────────────────────

function statusTone(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE' || s === 'AVAILABLE') return 'bg-emerald-100 text-emerald-700';
  if (s === 'CREATING' || s === 'UPDATING') return 'bg-blue-100 text-blue-700';
  if (s === 'FAILED' || s === 'DELETING') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function lifecycleTone(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (s === 'LEGACY') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

/**
 * The governed regions whose list call actually returned this row, and a flag when that set
 * is smaller than the set any row came back from.
 *
 * Partial listing is a real constraint, not a rendering quirk: the resource exists in the
 * account, but it is not reachable from every region under governance, so an invoke routed
 * to one of the others fails at call time. That is invisible in a per-account row count.
 *
 * `denom` is derived from the rows themselves (distinct regions across all of them) rather
 * than from the fan-out provenance on purpose. Provenance says which regions ANSWERED; a
 * region can answer and legitimately not offer the resource. Using `queried` as the
 * denominator would flag every row whenever one region was unreachable, which is a coverage
 * problem the RegionCoverageBadge already reports in the header — not a per-row constraint.
 */
function ListedInCell({ regions, denom, subject }: { regions: string[]; denom: number; subject: string }) {
  if (regions.length === 0) return <span className="text-[10px] text-slate-400">—</span>;
  const partial = denom > 1 && regions.length < denom;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {regions.map(r => (
        <span
          key={r}
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
            partial ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          {r}
        </span>
      ))}
      {partial && (
        <span
          className="inline-flex text-amber-600"
          title={`${subject} was returned by ${regions.length} of the ${denom} governed regions that answered, so it cannot be invoked from the rest.`}
        >
          <Icon name="exclamation-triangle" className="w-3 h-3 shrink-0" />
        </span>
      )}
    </div>
  );
}

function AvailabilityRoutingTab() {
  // Foundation-model catalog comes from the shared hook — the same source the rest
  // of the page uses — so we reuse it rather than adding a second catalog fetch.
  const { catalog, catalogLive, loading: catalogLoading } = useGovernModels();

  const [profiles, setProfiles] = useState<AwsInferenceProfilesResponse | null>(null);
  const [routers, setRouters] = useState<AwsPromptRoutersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      governModelsApi.inferenceProfiles(),
      governModelsApi.promptRouters(),
    ]).then(([p, r]) => {
      if (cancelled) return;
      if (p.status === 'fulfilled') setProfiles(p.value);
      if (r.status === 'fulfilled') setRouters(r.value);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const byProvider = useMemo(() => {
    const m = new Map<string, number>();
    (catalog?.models ?? []).forEach(mod => m.set(mod.provider || 'Unknown', (m.get(mod.provider || 'Unknown') || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [catalog]);

  const byModality = useMemo(() => {
    const m = new Map<string, number>();
    (catalog?.models ?? []).forEach(mod => (mod.input_modalities || []).forEach(mo => m.set(mo, (m.get(mo) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [catalog]);

  const byLifecycle = useMemo(() => {
    const m = new Map<string, number>();
    (catalog?.models ?? []).forEach(mod => m.set(mod.lifecycle || 'ACTIVE', (m.get(mod.lifecycle || 'ACTIVE') || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [catalog]);

  // Per-region model counts, derived from each model's own `available_regions`. This is a
  // different question from the RegionCoverageBadge in the header: the badge says which
  // regions answered, this says which regions actually list each model. The headline
  // "Models" tile is the UNION across regions, so it is larger than any single region's
  // catalog — that gap is what this strip exists to make visible.
  const byRegion = useMemo(() => {
    const m = new Map<string, number>();
    (catalog?.models ?? []).forEach(mod => (mod.available_regions ?? []).forEach(r => m.set(r, (m.get(r) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [catalog]);

  // Models listed in only some of the regions that returned a catalog. Calling one of these
  // from a region that does not list it fails at invoke time, which is much later and more
  // expensive than noticing it here.
  const partialModels = useMemo(() => {
    const answered = byRegion.length;
    if (answered < 2) return [];
    return (catalog?.models ?? []).filter(
      mod => (mod.available_regions ?? []).length > 0 && mod.available_regions.length < answered,
    );
  }, [catalog, byRegion]);

  // Denominators for the "Listed In" columns, taken from the rows rather than provenance —
  // see ListedInCell for why. Profiles and routers are separate list calls, so they get
  // separate denominators; borrowing one for the other would mislabel rows as partial.
  const profileRegionDenom = useMemo(
    () => new Set((profiles?.profiles ?? []).flatMap(p => p.available_regions ?? [])).size,
    [profiles],
  );
  const routerRegionDenom = useMemo(
    () => new Set((routers?.routers ?? []).flatMap(r => r.available_regions ?? [])).size,
    [routers],
  );

  return (
    <div className="space-y-6">
      {/* Section A — Foundation Model Availability (reuses the shared catalog) */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="cube" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">Foundation Model Availability</span>
          {catalogLive
            ? <LiveDataBadge source="Bedrock ListFoundationModels" detail="Live foundation-model catalog from your AWS account" />
            : <span className="text-[10px] text-slate-400">{catalogLoading ? 'loading...' : 'catalog unavailable'}</span>}
          {/* Model availability genuinely differs by region, so an unreachable region does not
              just shrink a count — it hides models that only exist there. */}
          {catalogLive && <RegionCoverageBadge regions={catalog?.regions} noun="Model availability" />}
          <span className="ml-auto text-[10px] text-slate-400">What models this account can invoke</span>
        </div>

        {catalogLoading && !catalog ? (
          <div className="h-24 flex items-center justify-center text-sm text-slate-400">Loading model catalog...</div>
        ) : !catalog || catalog.total === 0 ? (
          <div className="h-24 flex flex-col items-center justify-center text-sm text-slate-400">
            <span>No foundation models available</span>
            <span className="text-[11px] text-slate-400 mt-1">{catalog?.note || 'Bedrock catalog not reachable'}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Models</div>
                <div className="text-xl font-semibold text-slate-900 tabular-nums">{catalog.total}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Active</div>
                <div className="text-xl font-semibold text-emerald-600 tabular-nums">{catalog.active}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Providers</div>
                <div className="text-xl font-semibold text-slate-900 tabular-nums">{catalog.providers.length}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Modalities</div>
                <div className="text-xl font-semibold text-slate-900 tabular-nums">{byModality.length}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">By Provider</div>
                <div className="flex flex-wrap gap-1.5">
                  {byProvider.map(([name, count]) => (
                    <span key={name} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {name}<span className="text-slate-400 tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">By Modality (input)</div>
                <div className="flex flex-wrap gap-1.5">
                  {byModality.map(([name, count]) => (
                    <span key={name} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                      {name}<span className="text-violet-400 tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">By Lifecycle</div>
                <div className="flex flex-wrap gap-1.5">
                  {byLifecycle.map(([name, count]) => (
                    <span key={name} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${lifecycleTone(name)}`}>
                      {name}<span className="opacity-60 tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Only worth showing once more than one region returned a catalog — with a single
                region every model is trivially available in "all" of them and the strip would
                just restate the Models tile. */}
            {byRegion.length > 1 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">
                  By Region (models each region lists)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {byRegion.map(([region, count]) => (
                    <span
                      key={region}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 font-mono"
                      title={`${region} lists ${count} of the ${catalog.total} models shown above. The Models tile is the union across regions, so it is larger than what any one region can invoke.`}
                    >
                      {region}<span className="text-sky-400 tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
                {partialModels.length > 0 && (
                  <div
                    className="flex items-start gap-1.5 mt-2 text-[10px] text-amber-700"
                    title={`Not listed in all ${byRegion.length} regions: ${partialModels.slice(0, 12).map(m => `${m.model_id} (${m.available_regions.join(', ')})`).join('; ')}${partialModels.length > 12 ? `; and ${partialModels.length - 12} more` : ''}`}
                  >
                    <Icon name="exclamation-triangle" className="w-3 h-3 shrink-0 mt-px" />
                    <span>
                      <strong className="tabular-nums">{partialModels.length}</strong> of {catalog.total} models are not
                      listed in every region. Routing one to a region that does not list it fails at invoke time, not at
                      deploy time.
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Section B — Inference Profiles */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="globe-alt" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">Inference Profiles</span>
          {profiles?.live
            ? <LiveDataBadge source="Bedrock ListInferenceProfiles" detail="Live inference profiles from your AWS account" />
            : <span className="text-[10px] text-slate-400">{loading ? 'loading...' : 'unavailable'}</span>}
          {/* Three region facts on this card, and they are distinct. This badge: how much of
              the fan-out succeeded. "Routes To": where a profile sends traffic. "Listed In":
              which governed regions returned that profile at all. A profile that routes to
              five regions can still have been listed from one. */}
          {profiles?.live && <RegionCoverageBadge regions={profiles.regions} noun="Profile counts" />}
          {profiles?.live && (
            <span className="ml-auto text-[10px] text-slate-400">
              {profiles.total} total · {profiles.system_defined} system · {profiles.application_defined} application
            </span>
          )}
        </div>

        {loading && !profiles ? (
          <div className="h-24 flex items-center justify-center text-sm text-slate-400">Loading inference profiles...</div>
        ) : !profiles?.profiles || profiles.profiles.length === 0 ? (
          <div className="h-24 flex flex-col items-center justify-center text-sm text-slate-400">
            <span>No inference profiles found</span>
            <span className="text-[11px] text-slate-400 mt-1">{profiles?.note || 'Cross-region and application-defined profiles will appear here'}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200/60">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Models</th>
                  {/* Renamed from the ambiguous "Regions". These two columns answer different
                      questions and used to be indistinguishable in the header. */}
                  <th className="py-2 pr-3 font-medium" title="Regions this profile routes inference traffic TO.">Routes To</th>
                  <th className="py-2 pr-3 font-medium" title="Governed regions whose ListInferenceProfiles call returned this profile. A profile can route to five regions and still be listed from only one.">Listed In</th>
                </tr>
              </thead>
              <tbody>
                {profiles.profiles.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-[280px]" title={p.id}>{p.id}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {p.type === 'SYSTEM_DEFINED' ? 'System' : p.type === 'APPLICATION_DEFINED' ? 'Application' : (p.type || '—')}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusTone(p.status)}`}>{p.status || '—'}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{p.model_count}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {p.regions.length > 0
                          ? p.regions.map(r => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100 font-mono">{r}</span>)
                          : <span className="text-[10px] text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <ListedInCell
                        regions={p.available_regions ?? []}
                        denom={profileRegionDenom}
                        subject={`Profile "${p.name}"`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section C — Prompt Routers */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="arrows-right-left" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">Prompt Routers</span>
          {routers?.live
            ? <LiveDataBadge source="Bedrock ListPromptRouters" detail="Live intelligent prompt routers from your AWS account" />
            : <span className="text-[10px] text-slate-400">{loading ? 'loading...' : 'unavailable'}</span>}
          {routers?.live && <RegionCoverageBadge regions={routers.regions} noun="Router counts" />}
          {routers?.live && <span className="ml-auto text-[10px] text-slate-400">{routers.total} total</span>}
        </div>

        {loading && !routers ? (
          <div className="h-24 flex items-center justify-center text-sm text-slate-400">Loading prompt routers...</div>
        ) : !routers?.routers || routers.routers.length === 0 ? (
          <div className="h-24 flex flex-col items-center justify-center text-sm text-slate-400">
            <span>No prompt routers found</span>
            <span className="text-[11px] text-slate-400 mt-1">{routers?.note || 'Intelligent routers that select a model per request will appear here'}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200/60">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Models</th>
                  <th className="py-2 pr-3 font-medium">Fallback Model</th>
                  {/* AWS default routers carry the same name in every region, so the backend
                      dedupes by name. A router listed in fewer regions than its peers is
                      therefore a genuine per-region gap, not a duplicate-collapse artifact. */}
                  <th className="py-2 pr-3 font-medium" title="Governed regions whose ListPromptRouters call returned this router.">Listed In</th>
                </tr>
              </thead>
              <tbody>
                {routers.routers.map((r) => (
                  <tr key={r.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      {r.description && <div className="text-[10px] text-slate-400 truncate max-w-[280px]" title={r.description}>{r.description}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusTone(r.status)}`}>{r.status || '—'}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{r.model_count}</td>
                    <td className="py-2 pr-3">
                      {r.fallback_model
                        ? <span className="text-[11px] font-mono text-slate-600 truncate max-w-[260px] inline-block align-bottom" title={r.fallback_model}>{r.fallback_model}</span>
                        : <span className="text-[10px] text-slate-400">—</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <ListedInCell
                        regions={r.available_regions ?? []}
                        denom={routerRegionDenom}
                        subject={`Router "${r.name}"`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Evaluations Tab ───────────────────────────

interface EvaluationsTabProps {
  modelId: string;
  subTab: EvalSubTab;
  onSubTabChange: (tab: EvalSubTab) => void;
  onNavigateTab: (tab: string) => void;
  onSelectModel: (modelId: string) => void;
}

function EvaluationsTab({ modelId, subTab, onSubTabChange, onNavigateTab, onSelectModel }: EvaluationsTabProps) {
  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <SubTabList label="Evaluation types">
        <SubTabButton active={subTab === 'model-evals'} onClick={() => onSubTabChange('model-evals')} controls="panel-model-evals">
          Model Evaluations
        </SubTabButton>
        <SubTabButton active={subTab === 'rag'} onClick={() => onSubTabChange('rag')} controls="panel-rag">
          RAG Evaluation
        </SubTabButton>
        <SubTabButton active={subTab === 'gate'} onClick={() => onSubTabChange('gate')} controls="panel-gate">
          Deployment Gate
        </SubTabButton>
      </SubTabList>

      {/* Sub-tab content */}
      {subTab === 'model-evals' && <div id="panel-model-evals" role="tabpanel"><ModelEvaluations modelId={modelId} /></div>}
      {subTab === 'rag' && <div id="panel-rag" role="tabpanel"><RagEvaluations modelId={modelId} onNavigateTab={onNavigateTab} /></div>}
      {subTab === 'gate' && <div id="panel-gate" role="tabpanel"><DeploymentGate modelId={modelId} onSelectModel={onSelectModel} onNavigateTab={onNavigateTab} /></div>}
    </div>
  );
}

// ─────────────────────────── Explainability Tab ───────────────────────────

interface ExplainabilityTabProps {
  modelId: string;
  subTab: ExplainSubTab;
  onSubTabChange: (tab: ExplainSubTab) => void;
  onNavigateTab: (tab: string) => void;
}

function ExplainabilityTab({ modelId, subTab, onSubTabChange, onNavigateTab }: ExplainabilityTabProps) {
  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <SubTabList label="Explainability sections">
        <SubTabButton active={subTab === 'explainability'} onClick={() => onSubTabChange('explainability')} controls="panel-explainability">
          Explainability
        </SubTabButton>
        <SubTabButton active={subTab === 'bias'} onClick={() => onSubTabChange('bias')} controls="panel-bias">
          Bias & Fairness
        </SubTabButton>
      </SubTabList>

      {/* Sub-tab content */}
      {subTab === 'explainability' && <div id="panel-explainability" role="tabpanel"><ModelExplainability modelId={modelId} onNavigateTab={onNavigateTab} /></div>}
      {subTab === 'bias' && <div id="panel-bias" role="tabpanel"><BiasFairness modelId={modelId} /></div>}
    </div>
  );
}

// ─────────────────────────── Compliance Tab ───────────────────────────

interface ComplianceTabProps {
  subTab: ComplianceSubTab;
  onSubTabChange: (tab: ComplianceSubTab) => void;
}

function ComplianceTab({ subTab, onSubTabChange }: ComplianceTabProps) {
  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <SubTabList label="Compliance sections">
        <SubTabButton active={subTab === 'governance'} onClick={() => onSubTabChange('governance')} controls="panel-governance">
          Governance
        </SubTabButton>
        <SubTabButton active={subTab === 'lifecycle'} onClick={() => onSubTabChange('lifecycle')} controls="panel-lifecycle">
          Lifecycle
        </SubTabButton>
      </SubTabList>

      {/* Sub-tab content */}
      {subTab === 'governance' && <div id="panel-governance" role="tabpanel"><ModelGovernance /></div>}
      {subTab === 'lifecycle' && <div id="panel-lifecycle" role="tabpanel"><ModelLifecycle /></div>}
    </div>
  );
}

// ─────────────────────────── Operations Tab ───────────────────────────

interface OperationsTabProps {
  subTab: OpsSubTab;
  onSubTabChange: (tab: OpsSubTab) => void;
  onShowComparison: () => void;
  onShowRiskCalculator: () => void;
  onShowDependencyGraph: () => void;
  onShowFrameworkExplorer: () => void;
  onShowLineageViewer: () => void;
}

function OperationsTab({
  subTab,
  onSubTabChange,
  onShowComparison,
  onShowRiskCalculator,
  onShowDependencyGraph,
  onShowFrameworkExplorer,
  onShowLineageViewer,
}: OperationsTabProps) {
  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <SubTabList label="Operations sections">
        <SubTabButton active={subTab === 'monitoring'} onClick={() => onSubTabChange('monitoring')} controls="panel-monitoring">
          Monitoring
        </SubTabButton>
        <SubTabButton active={subTab === 'hallucination'} onClick={() => onSubTabChange('hallucination')} controls="panel-hallucination">
          Hallucination
        </SubTabButton>
        <SubTabButton active={subTab === 'quality'} onClick={() => onSubTabChange('quality')} controls="panel-quality">
          Quality
        </SubTabButton>
        <SubTabButton active={subTab === 'patterns'} onClick={() => onSubTabChange('patterns')} controls="panel-patterns">
          LLM Patterns
        </SubTabButton>
        <SubTabButton active={subTab === 'operations'} onClick={() => onSubTabChange('operations')} controls="panel-operations">
          Operations
        </SubTabButton>
        <SubTabButton active={subTab === 'tools'} onClick={() => onSubTabChange('tools')} controls="panel-tools">
          Analysis Tools
        </SubTabButton>
      </SubTabList>

      {/* Sub-tab content */}
      {subTab === 'monitoring' && <div id="panel-monitoring" role="tabpanel"><ModelMonitoring /></div>}
      {subTab === 'hallucination' && <div id="panel-hallucination" role="tabpanel"><HallucinationDetection /></div>}
      {subTab === 'quality' && <div id="panel-quality" role="tabpanel"><AIQualityMonitor /></div>}
      {subTab === 'patterns' && <div id="panel-patterns" role="tabpanel"><LlmMonitoringPatterns /></div>}
      {subTab === 'operations' && <div id="panel-operations" role="tabpanel"><ModelOperations embedded /></div>}
      {subTab === 'tools' && (
        <div id="panel-tools" role="tabpanel">
          <ToolsPanel
            onShowComparison={onShowComparison}
            onShowRiskCalculator={onShowRiskCalculator}
            onShowDependencyGraph={onShowDependencyGraph}
            onShowFrameworkExplorer={onShowFrameworkExplorer}
            onShowLineageViewer={onShowLineageViewer}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Tools Panel ───────────────────────────

interface ToolsPanelProps {
  onShowComparison: () => void;
  onShowRiskCalculator: () => void;
  onShowDependencyGraph: () => void;
  onShowFrameworkExplorer: () => void;
  onShowLineageViewer: () => void;
}

function ToolsPanel({ onShowComparison, onShowRiskCalculator, onShowDependencyGraph, onShowFrameworkExplorer, onShowLineageViewer }: ToolsPanelProps) {
  const tools = [
    {
      id: 'compare',
      label: 'Compare Models',
      description: 'Side-by-side analysis of model capabilities, risk, and cost',
      color: 'indigo',
      onClick: onShowComparison,
    },
    {
      id: 'risk',
      label: 'Risk Calculator',
      description: 'Score new models against your risk framework',
      color: 'amber',
      onClick: onShowRiskCalculator,
    },
    {
      id: 'dependency',
      label: 'Dependency Graph',
      description: 'Visualize model relationships and downstream impact',
      color: 'violet',
      onClick: onShowDependencyGraph,
    },
    {
      id: 'frameworks',
      label: 'MRM Frameworks',
      description: 'Explore regulatory frameworks and control mappings',
      color: 'emerald',
      onClick: onShowFrameworkExplorer,
    },
    {
      id: 'lineage',
      label: 'Model Lineage',
      description: 'Visualize model provenance and supply chain for governance',
      color: 'purple',
      onClick: onShowLineageViewer,
    },
  ];

  const colorClasses: Record<string, { bg: string; border: string; text: string; hover: string }> = {
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', hover: 'hover:bg-indigo-100' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', hover: 'hover:bg-amber-100' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', hover: 'hover:bg-violet-100' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', hover: 'hover:bg-emerald-100' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', hover: 'hover:bg-purple-100' },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tools.map(tool => {
        const colors = colorClasses[tool.color];
        return (
          <button
            key={tool.id}
            onClick={tool.onClick}
            className={`${colors.bg} ${colors.border} border rounded-xl p-5 text-left ${colors.hover} transition-colors`}
          >
            <div className={`text-sm font-semibold ${colors.text} mb-1`}>{tool.label}</div>
            <div className="text-xs text-slate-600">{tool.description}</div>
          </button>
        );
      })}
    </div>
  );
}
