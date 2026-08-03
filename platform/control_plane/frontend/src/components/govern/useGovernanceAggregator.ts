/**
 * useGovernanceAggregator — Centralizes governance data from across AVA platform
 *
 * "Centralize governance, federate innovation"
 * Teams deploy freely via Build/Operate; Govern has real-time visibility into everything.
 *
 * REAL DATA SOURCES (from AVA APIs):
 * - guardrailsApi: Guardrail templates created in Secure
 * - deploymentsApi: Deployments from Build (FSI Foundry, Frontier Agents)
 * - prioritizationApi: Use cases from Plan
 * - maturityApi: Maturity assessments from Plan
 * - businessCasesApi: Business cases from Plan
 * - frontierAgentsApi: AWS Frontier Agents catalog
 *
 * MOCK DATA (still needed for demo):
 * - Compliance frameworks (would come from custom DB)
 * - Cost data (would come from Cost Explorer API)
 * - Audit events (would come from CloudTrail)
 */

import { useState, useEffect, useMemo } from 'react';
import {
  guardrailsApi,
  guardrailValidationApi,
  deploymentsApi,
  prioritizationApi,
  maturityApi,
  frontierAgentsApi,
  businessCasesApi,
  operatingModelApi,
  serviceApprovalApi,
  policiesApi,
  governAgentCoreApi,
  type AwsDiscoveredAgentsResponse,
} from '../../api/client';
import type { UseCase, BusinessCase, OperatingModel, FrontierAgentCatalogEntry, PolicyRecord } from '../../api/client';
import type { GuardrailTemplate, Deployment, ServiceApprovalRun, GuardrailMetrics, GuardrailValidationSummary } from '../../types';
import {
  COMPLIANCE_FRAMEWORKS,
  COST_BY_MODEL,
  BU_BUDGETS,
  ANOMALY_ALERTS,
  INCIDENT_SUMMARY,
} from './mockData';
import { costInputStore, computeExpectedCost, isPricedModelId, PRICED_MODEL_LABELS } from './finops/expectedCost';

// Real risk categories from AVA's prioritization scoring framework
export const USE_CASE_RISK_CATEGORIES = [
  'Regulatory',
  'Data Privacy',
  'Ethical/Bias',
  'Model Reliability',
  'Autonomy Risk',
] as const;

export type UseCaseRiskCategory = typeof USE_CASE_RISK_CATEGORIES[number];

// ─────────────────────────── Types ───────────────────────────

export interface GovernanceSummary {
  // Risk posture
  trustScore: number;
  trustTrend: 'improving' | 'declining' | 'stable';
  openIncidents: number;
  criticalIncidents: number;
  guardrailEvents24h: number;
  policyViolations: number;

  // Inventory (REAL DATA)
  totalUseCases: number;
  deployedUseCases: number;
  catalogUseCases: number;
  totalModels: number;
  modelsInProduction: number;
  modelsPendingReview: number;
  totalAgents: number;
  bedrockAgents: number;
  agentcoreRuntimes: number;
  agentsWithPolicies: number;

  // Guardrails (REAL DATA)
  guardrailsActive: number;
  guardrailsDraft: number;
  guardrailsFailed: number;

  // Deployments (REAL DATA)
  deploymentsActive: number;
  deploymentsPending: number;
  deploymentsFailed: number;

  // Compliance (mock for now)
  frameworksCovered: number;
  frameworksTotal: number;
  controlsImplemented: number;
  controlsTotal: number;
  frameworksNeedingAttention: string[];

  // Cost (mock for now)
  monthlySpend: number;
  budgetUtilization: number;
  costAnomalies: number;
  savingsRealized: number;
  savingsTarget: number;

  // Activity (last 24h)
  recentDeployments: number;
  recentApprovals: number;
  recentGuardrailBlocks: number;

  // Guardrail Validation (test results)
  validationPassRate: number;
  validationFailedTests: number;
  validationCriticalFailures: number;
  validationLastRun?: string;
}

export interface PipelineHealth {
  stages: {
    name: string;
    count: number;
    color: string;
  }[];
  blockedItems: {
    id: string;
    name: string;
    stage: string;
    blockedReason: string;
    owner: string;
    daysBlocked: number;
  }[];
  avgTimeToProduction: number;
}

export interface ActivityFeedItem {
  id: string;
  ts: string;
  type: 'deployment' | 'guardrail' | 'incident' | 'approval' | 'cost' | 'config';
  severity: 'low' | 'medium' | 'high' | 'critical';
  module: 'plan' | 'build' | 'secure' | 'operate' | 'govern';
  title: string;
  description: string;
  actor?: string;
  link?: string;
}

export interface GuardrailSummary {
  template_id: string;
  name: string;
  status: string;
  features: string[];
  guardrail_id?: string;
  created_at: string;
  metrics?: GuardrailMetrics;
}

export interface FrontierAgentSummary {
  id: string;
  name: string;
  description: string;
  status: string;
}

export interface PolicySummary {
  policy_id: string;
  name: string;
  description: string | null;
  resource_type: 'agent' | 'gateway' | 'tool';
  resource_id: string | null;
  status: 'draft' | 'active' | 'disabled';
  rules_count: number;
  blocking_rules: number;
  triggered_count: number;
  last_triggered: string | null;
  created_at: string;
}

export interface DeploymentSummary {
  deployment_id: string;
  deployment_name: string;
  status: string;
  template_name?: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceAggregatorResult {
  loading: boolean;
  error: string | null;
  summary: GovernanceSummary;
  pipeline: PipelineHealth;
  activityFeed: ActivityFeedItem[];

  // Real data from APIs
  guardrails: GuardrailSummary[];
  policies: PolicySummary[];
  deployments: DeploymentSummary[];
  useCases: UseCase[];
  businessCases: BusinessCase[];
  operatingModels: OperatingModel[];
  serviceApprovalRuns: ServiceApprovalRun[];
  frontierAgents: FrontierAgentSummary[];
  guardrailMetricsTotal: {
    totalInvocations: number;
    blockedCount: number;
    allowedCount: number;
    anonymizedCount: number;
    blockRate: number;
  };
  policyMetricsTotal: {
    totalPolicies: number;
    activePolicies: number;
    draftPolicies: number;
    disabledPolicies: number;
    totalRules: number;
    blockingRules: number;
    totalTriggers: number;
  };

  // Real risk data from use cases
  useCaseRiskHeatmap: UseCaseRiskHeatmapRow[];
  useCaseRiskCategories: readonly string[];
  topRiskyUseCases: TopRiskyUseCase[];

  // Trend data (computed from real metrics where available)
  trendData30d: TrendDataPoint[];

  // Governance Control Checklist (real data)
  controlChecklist: GovernanceControl[];
  controlStats: {
    implemented: number;
    total: number;
    percentage: number;
  };

  // Guardrail Validation data
  guardrailValidation: GuardrailValidationSummary | null;

  // Mock data (still needed for some views)
  complianceFrameworks: typeof COMPLIANCE_FRAMEWORKS;
  costByModel: typeof COST_BY_MODEL;
  buBudgets: typeof BU_BUDGETS;

  // Expected-cost roll-up across use cases that have a cost model (real Plan→FinOps join).
  expectedCost: {
    totalMonthly: number;
    totalAnnual: number;
    useCasesWithEstimate: number;
    byModel: { modelId: string; modelName: string; monthly: number; useCases: number }[];
  };

  refresh: () => void;
}

export interface GovernanceControl {
  id: string;
  name: string;
  description: string;
  category: 'technical' | 'process' | 'governance' | 'security';
  implemented: boolean;
  details?: string;
  action?: string;
  link?: string;
}

export interface TrendDataPoint {
  day: number;
  date: string;
  trustScore: number;
  guardrailHits: number;
  violations: number;
}

export interface UseCaseRiskHeatmapRow {
  useCaseId: string;
  name: string;
  status: string;
  goNoGo: string;
  scores: number[];  // Maps to USE_CASE_RISK_CATEGORIES order
  compositeRisk: number;
}

export interface TopRiskyUseCase {
  useCaseId: string;
  name: string;
  riskScore: number;
  status: string;
  goNoGo: string;
  businessDomain: string;
}

// ─────────────────────────── Helper ───────────────────────────

// Deterministic [0,1) pseudo-noise from an integer seed — keeps simulated
// trend history stable across renders (no Math.random).
function trendNoise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function featureSummary(t: GuardrailTemplate): string[] {
  const features: string[] = [];
  if (t.content_filters?.length > 0) features.push('Content');
  if (t.pii_entities?.length > 0) features.push('PII');
  if (t.denied_topics?.length > 0) features.push('Topics');
  if (t.word_filter?.enable_profanity || (t.word_filter?.blocked_words?.length ?? 0) > 0) features.push('Words');
  if (t.contextual_grounding?.enabled) features.push('Grounding');
  return features;
}

// ─────────────────────────── Hook ───────────────────────────

export function useGovernanceAggregator(): GovernanceAggregatorResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Real data from APIs
  const [guardrailTemplates, setGuardrailTemplates] = useState<GuardrailTemplate[]>([]);
  const [guardrailMetrics, setGuardrailMetrics] = useState<Map<string, GuardrailMetrics>>(new Map());
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [frontierAgentsList, setFrontierAgentsList] = useState<FrontierAgentCatalogEntry[]>([]);
  const [businessCases, setBusinessCases] = useState<BusinessCase[]>([]);
  const [operatingModels, setOperatingModels] = useState<OperatingModel[]>([]);
  const [serviceApprovalRuns, setServiceApprovalRuns] = useState<ServiceApprovalRun[]>([]);
  const [guardrailValidation, setGuardrailValidation] = useState<GuardrailValidationSummary | null>(null);
  const [policyRecords, setPolicyRecords] = useState<PolicyRecord[]>([]);
  const [awsAgents, setAwsAgents] = useState<AwsDiscoveredAgentsResponse | null>(null);

  // Load all data from AVA APIs
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch all data in parallel
        const [
          guardrailsRes,
          deploymentsRes,
          useCasesRes,
          , // maturityRes - available for future use
          frontierRes,
          businessCasesRes,
          operatingModelsRes,
          serviceApprovalRes,
          validationRes,
          policiesRes,
          awsAgentsRes,
        ] = await Promise.allSettled([
          guardrailsApi.list(),
          deploymentsApi.list(),
          prioritizationApi.list(),
          maturityApi.list(),
          frontierAgentsApi.listCatalog(),
          businessCasesApi.list(),
          operatingModelApi.list(),
          serviceApprovalApi.list(),
          guardrailValidationApi.getSummary(),
          policiesApi.list(),
          governAgentCoreApi.agents(),
        ]);

        // Process results (handle failures gracefully)
        let activeGuardrails: GuardrailTemplate[] = [];
        if (guardrailsRes.status === 'fulfilled') {
          activeGuardrails = guardrailsRes.value.filter(t => t.status !== 'deleted');
          setGuardrailTemplates(activeGuardrails);
        }
        if (deploymentsRes.status === 'fulfilled') {
          setDeployments(deploymentsRes.value);
        }
        if (useCasesRes.status === 'fulfilled') {
          setUseCases(useCasesRes.value);
        }
        if (frontierRes.status === 'fulfilled') {
          setFrontierAgentsList(frontierRes.value);
        }
        if (businessCasesRes.status === 'fulfilled') {
          setBusinessCases(businessCasesRes.value);
        }
        if (operatingModelsRes.status === 'fulfilled') {
          setOperatingModels(operatingModelsRes.value);
        }
        if (serviceApprovalRes.status === 'fulfilled') {
          setServiceApprovalRuns(serviceApprovalRes.value);
        }
        if (validationRes.status === 'fulfilled') {
          setGuardrailValidation(validationRes.value);
        }
        if (policiesRes.status === 'fulfilled') {
          setPolicyRecords(policiesRes.value);
        }
        if (awsAgentsRes.status === 'fulfilled') {
          setAwsAgents(awsAgentsRes.value);
        }

        // Fetch metrics for active guardrails (in parallel, non-blocking)
        const guardrailsWithIds = activeGuardrails.filter(g => g.guardrail_id && g.status === 'active');
        if (guardrailsWithIds.length > 0) {
          const metricsPromises = guardrailsWithIds.map(g =>
            guardrailsApi.getMetrics(g.template_id, 24).catch(() => null)
          );
          const metricsResults = await Promise.all(metricsPromises);
          const metricsMap = new Map<string, GuardrailMetrics>();
          metricsResults.forEach((m, i) => {
            if (m) metricsMap.set(guardrailsWithIds[i].template_id, m);
          });
          setGuardrailMetrics(metricsMap);
        }

      } catch (err) {
        console.error('Failed to load governance data:', err);
        setError('Some data sources unavailable — showing partial data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refreshKey]);

  // Transform guardrails for display (with metrics)
  const guardrails = useMemo<GuardrailSummary[]>(() => {
    return guardrailTemplates.map(t => ({
      template_id: t.template_id,
      name: t.name,
      status: t.status,
      features: featureSummary(t),
      guardrail_id: t.guardrail_id,
      created_at: t.created_at,
      metrics: guardrailMetrics.get(t.template_id),
    }));
  }, [guardrailTemplates, guardrailMetrics]);

  // Aggregate guardrail metrics
  const guardrailMetricsTotal = useMemo(() => {
    let totalInvocations = 0;
    let blockedCount = 0;
    let allowedCount = 0;
    let anonymizedCount = 0;
    guardrailMetrics.forEach(m => {
      totalInvocations += m.total_invocations;
      blockedCount += m.blocked_count;
      allowedCount += m.allowed_count;
      anonymizedCount += m.anonymized_count;
    });
    return {
      totalInvocations,
      blockedCount,
      allowedCount,
      anonymizedCount,
      blockRate: totalInvocations > 0 ? (blockedCount / totalInvocations) * 100 : 0,
    };
  }, [guardrailMetrics]);

  // Transform policies for display
  const policies = useMemo<PolicySummary[]>(() => {
    return policyRecords.map(p => ({
      policy_id: p.policy_id,
      name: p.name,
      description: p.description,
      resource_type: p.resource_type,
      resource_id: p.resource_id,
      status: p.status,
      rules_count: p.rules_count,
      blocking_rules: p.blocking_rules,
      triggered_count: p.triggered_count,
      last_triggered: p.last_triggered,
      created_at: p.created_at,
    }));
  }, [policyRecords]);

  // Aggregate policy metrics
  const policyMetricsTotal = useMemo(() => {
    const activePolicies = policyRecords.filter(p => p.status === 'active').length;
    const draftPolicies = policyRecords.filter(p => p.status === 'draft').length;
    const disabledPolicies = policyRecords.filter(p => p.status === 'disabled').length;
    const totalRules = policyRecords.reduce((sum, p) => sum + p.rules_count, 0);
    const blockingRules = policyRecords.reduce((sum, p) => sum + p.blocking_rules, 0);
    const totalTriggers = policyRecords.reduce((sum, p) => sum + p.triggered_count, 0);
    return {
      totalPolicies: policyRecords.length,
      activePolicies,
      draftPolicies,
      disabledPolicies,
      totalRules,
      blockingRules,
      totalTriggers,
    };
  }, [policyRecords]);

  // Transform frontier agents for display
  const frontierAgents = useMemo<FrontierAgentSummary[]>(() => {
    return frontierAgentsList.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
    }));
  }, [frontierAgentsList]);

  // Transform deployments for display
  const deploymentSummaries = useMemo<DeploymentSummary[]>(() => {
    return deployments.map(d => ({
      deployment_id: d.deployment_id,
      deployment_name: d.deployment_name,
      status: d.status,
      template_name: d.template_id,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
  }, [deployments]);

  // Compute governance summary from real + mock data
  const summary = useMemo<GovernanceSummary>(() => {
    // Guardrail stats (REAL)
    const guardrailsActive = guardrailTemplates.filter(g => g.status === 'active').length;
    const guardrailsDraft = guardrailTemplates.filter(g => g.status === 'draft').length;
    const guardrailsFailed = guardrailTemplates.filter(g => g.status === 'failed').length;

    // Deployment stats (REAL)
    const deploymentsActive = deployments.filter(d => d.status === 'deployed' || d.status === 'delivered').length;
    const deploymentsPending = deployments.filter(d => d.status === 'pending' || d.status === 'deploying' || d.status === 'validating' || d.status === 'packaging').length;
    const deploymentsFailed = deployments.filter(d => d.status === 'failed' || d.status === 'rolled_back').length;

    // Use case stats (REAL)
    const productionUseCases = useCases.filter(uc => uc.status === 'Production').length;

    // Compliance aggregation (MOCK)
    const totalControls = COMPLIANCE_FRAMEWORKS.reduce((sum, f) => sum + f.total, 0);
    const coveredControls = COMPLIANCE_FRAMEWORKS.reduce((sum, f) => sum + f.covered, 0);
    const needsAttention = COMPLIANCE_FRAMEWORKS
      .filter(f => f.status === 'attention')
      .map(f => f.name);

    // Cost aggregation (MOCK)
    const totalBudget = BU_BUDGETS.reduce((sum, b) => sum + b.monthlyBudget, 0);
    const totalSpend = BU_BUDGETS.reduce((sum, b) => sum + b.currentSpend, 0);

    // Compute trust score based on real data
    const guardrailScore = guardrailTemplates.length > 0
      ? Math.round((guardrailsActive / guardrailTemplates.length) * 100)
      : 50;
    const deploymentScore = deployments.length > 0
      ? Math.round((deploymentsActive / deployments.length) * 100)
      : 50;
    const trustScore = Math.round((guardrailScore + deploymentScore + 78) / 3); // 78 is baseline compliance

    return {
      // Risk posture
      trustScore,
      trustTrend: 'improving',
      openIncidents: INCIDENT_SUMMARY.open,
      criticalIncidents: INCIDENT_SUMMARY.critical,
      guardrailEvents24h: guardrailMetricsTotal.totalInvocations || 0, // REAL from guardrail metrics
      policyViolations: guardrailMetricsTotal.blockedCount || 0, // REAL - blocked = policy violations

      // Inventory (MIX of real and mock)
      totalUseCases: useCases.length,
      deployedUseCases: productionUseCases,
      catalogUseCases: useCases.filter(uc => uc.status === 'Concept').length,
      totalModels: 5, // Mock - would come from Bedrock ListFoundationModels
      modelsInProduction: 4,
      modelsPendingReview: 1,
      totalAgents: (awsAgents?.total ?? 0) + frontierAgentsList.length + deployments.filter(d => d.template_id?.toLowerCase().includes('agent')).length,
      bedrockAgents: awsAgents?.bedrock_agents ?? 0,
      agentcoreRuntimes: awsAgents?.agentcore_runtimes ?? 0,
      agentsWithPolicies: guardrailsActive,

      // Guardrails (REAL)
      guardrailsActive,
      guardrailsDraft,
      guardrailsFailed,

      // Deployments (REAL)
      deploymentsActive,
      deploymentsPending,
      deploymentsFailed,

      // Compliance (MOCK)
      frameworksCovered: COMPLIANCE_FRAMEWORKS.filter(f => f.status === 'on-track').length,
      frameworksTotal: COMPLIANCE_FRAMEWORKS.length,
      controlsImplemented: coveredControls,
      controlsTotal: totalControls,
      frameworksNeedingAttention: needsAttention,

      // Cost (MOCK)
      monthlySpend: totalSpend,
      budgetUtilization: Math.round((totalSpend / totalBudget) * 100),
      costAnomalies: ANOMALY_ALERTS.length,
      savingsRealized: 4810,
      savingsTarget: 7500,

      // Activity
      recentDeployments: deployments.filter(d => {
        const created = new Date(d.created_at);
        const now = new Date();
        return (now.getTime() - created.getTime()) < 24 * 60 * 60 * 1000;
      }).length,
      recentApprovals: businessCases.filter(bc => bc.status === 'Approved').length + serviceApprovalRuns.filter(sa => sa.status === 'completed').length,
      recentGuardrailBlocks: guardrailMetricsTotal.blockedCount || 0, // REAL from metrics

      // Guardrail Validation
      validationPassRate: guardrailValidation?.passRate24h ?? 0,
      validationFailedTests: guardrailValidation?.failedTests24h ?? 0,
      validationCriticalFailures: guardrailValidation?.criticalFailures24h ?? 0,
      validationLastRun: guardrailValidation?.lastRunTimestamp,
    };
  }, [guardrailTemplates, deployments, useCases, frontierAgentsList, businessCases, serviceApprovalRuns, guardrailMetricsTotal, guardrailValidation, awsAgents]);

  // Pipeline health from real use case data
  const pipeline = useMemo<PipelineHealth>(() => {
    const stages = [
      { name: 'Concept', count: useCases.filter(uc => uc.status === 'Concept').length, color: '#6366f1' },
      { name: 'Active', count: useCases.filter(uc => uc.status === 'Active').length, color: '#f59e0b' },
      { name: 'Pilot', count: useCases.filter(uc => uc.status === 'Pilot').length, color: '#3b82f6' },
      { name: 'Production', count: useCases.filter(uc => uc.status === 'Production').length, color: '#10b981' },
    ];

    // Find blocked items (use cases stuck in non-production status)
    const blockedItems = useCases
      .filter(uc => uc.status === 'Paused')
      .map(uc => ({
        id: uc.use_case_id,
        name: uc.name,
        stage: uc.status,
        blockedReason: 'Paused - awaiting review',
        owner: uc.business_owner || 'Unassigned',
        daysBlocked: Math.floor((Date.now() - new Date(uc.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      }));

    return {
      stages,
      blockedItems,
      avgTimeToProduction: 18,
    };
  }, [useCases]);

  // Activity feed from real deployments + guardrails
  const activityFeed = useMemo<ActivityFeedItem[]>(() => {
    const items: ActivityFeedItem[] = [];

    // Add recent deployments
    deployments.slice(0, 5).forEach(d => {
      items.push({
        id: `deploy-${d.deployment_id}`,
        ts: d.updated_at || d.created_at,
        type: 'deployment',
        severity: d.status === 'failed' ? 'high' : 'low',
        module: 'build',
        title: `${d.deployment_name} ${d.status}`,
        description: d.template_id || 'Deployment',
        actor: d.created_by,
      });
    });

    // Add guardrail changes
    guardrailTemplates.slice(0, 5).forEach(g => {
      items.push({
        id: `guardrail-${g.template_id}`,
        ts: g.created_at,
        type: 'guardrail',
        severity: g.status === 'active' ? 'low' : g.status === 'failed' ? 'high' : 'medium',
        module: 'secure',
        title: `Guardrail "${g.name}" ${g.status}`,
        description: `Features: ${featureSummary(g).join(', ') || 'None configured'}`,
        actor: g.created_by,
      });
    });

    // Add business case approvals
    businessCases.slice(0, 5).forEach(bc => {
      const roi = bc.computed?.financials?.roi || 0;
      const npv = bc.computed?.financials?.npv || 0;
      items.push({
        id: `bc-${bc.business_case_id}`,
        ts: bc.updated_at || bc.created_at,
        type: 'approval',
        severity: bc.status === 'Approved' ? 'low' : bc.status === 'Rejected' ? 'high' : 'medium',
        module: 'plan',
        title: `Business Case "${bc.name}" ${bc.status}`,
        description: `ROI: ${(roi * 100).toFixed(0)}% | NPV: $${(npv / 1000).toFixed(0)}k`,
        actor: bc.created_by || undefined,
      });
    });

    // Add operating model changes
    operatingModels.slice(0, 3).forEach(om => {
      const maturityLevel = om.computed?.maturity_level || 0;
      items.push({
        id: `om-${om.operating_model_id}`,
        ts: om.updated_at || om.created_at,
        type: 'config',
        severity: 'low',
        module: 'plan',
        title: `Operating Model "${om.name}" updated`,
        description: `Pattern: ${om.pattern || 'Hub-and-Spoke'} | Maturity: L${maturityLevel}`,
        actor: om.created_by || undefined,
      });
    });

    // Add service approval runs
    serviceApprovalRuns.slice(0, 5).forEach(sa => {
      const completedPhases = sa.phases?.filter(p => p.status === 'complete').length || 0;
      const totalPhases = sa.phases?.length || 8;
      items.push({
        id: `sa-${sa.slug}`,
        ts: sa.updated_at || sa.created_at,
        type: 'approval',
        severity: sa.status === 'failed' ? 'high' : sa.status === 'completed' ? 'low' : 'medium',
        module: 'secure',
        title: `Service Approval: ${sa.service} ${sa.status}`,
        description: `Framework: ${sa.framework?.toUpperCase() || 'CCMv4'} | Progress: ${completedPhases}/${totalPhases} phases`,
        actor: sa.created_by || undefined,
      });
    });

    // Add cost anomalies (mock)
    ANOMALY_ALERTS.forEach((a, i) => {
      items.push({
        id: `cost-${i}`,
        ts: a.time,
        type: 'cost',
        severity: a.severity === 'warning' ? 'medium' : 'low',
        module: 'operate',
        title: a.desc,
        description: `${a.type} alert in ${a.bu}`,
      });
    });

    // Add guardrail validation test runs
    if (guardrailValidation?.recentRuns) {
      guardrailValidation.recentRuns.forEach(run => {
        items.push({
          id: `validation-${run.id}`,
          ts: run.timestamp,
          type: 'guardrail',
          severity: run.status === 'success' ? 'low' : run.status === 'partial' ? 'medium' : 'high',
          module: 'secure',
          title: `Validation: ${run.suiteName} ${run.status}`,
          description: `${run.passed}/${run.totalTests} tests passed • ${run.guardrailName}`,
          link: '/secure/guardrails/observability',
        });
      });
    }

    // Sort by timestamp (most recent first)
    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [deployments, guardrailTemplates, businessCases, operatingModels, serviceApprovalRuns, guardrailValidation]);

  // Compute real risk heatmap from use case data
  const useCaseRiskHeatmap = useMemo<UseCaseRiskHeatmapRow[]>(() => {
    return useCases
      .filter(uc => uc.scores?.risk_governance) // Only include use cases with risk scores
      .map(uc => {
        const rg = uc.scores.risk_governance;
        // Convert 1-5 scores to 0-100 risk scale (higher = riskier)
        // Original scores: 1=high risk, 5=low risk, so we invert: (5 - score) * 25
        const scores = [
          Math.round((5 - rg.regulatory_compliance) * 25),
          Math.round((5 - rg.data_privacy_security) * 25),
          Math.round((5 - rg.ethical_bias_risk) * 25),
          Math.round((5 - rg.model_reliability) * 25),
          Math.round((5 - rg.autonomous_decision_risk) * 25),
        ];
        const compositeRisk = uc.computed?.risk_score ?? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        return {
          useCaseId: uc.use_case_id,
          name: uc.name,
          status: uc.status,
          goNoGo: uc.computed?.go_no_go ?? 'N/A',
          scores,
          compositeRisk,
        };
      })
      .sort((a, b) => b.compositeRisk - a.compositeRisk); // Sort by risk, highest first
  }, [useCases]);

  // Top risky use cases for bar chart
  const topRiskyUseCases = useMemo<TopRiskyUseCase[]>(() => {
    return useCases
      .filter(uc => uc.computed?.risk_score != null)
      .map(uc => ({
        useCaseId: uc.use_case_id,
        name: uc.name,
        riskScore: uc.computed?.risk_score ?? 0,
        status: uc.status,
        goNoGo: uc.computed?.go_no_go ?? 'N/A',
        businessDomain: uc.business_domain,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8); // Top 8 riskiest
  }, [useCases]);

  // Compute 30-day trend data (using real metrics where available, simulated history otherwise)
  const trendData30d = useMemo<TrendDataPoint[]>(() => {
    const today = new Date();
    const baselineTrust = summary.trustScore || 75;
    const dailyInvocations = guardrailMetricsTotal.totalInvocations / 1; // 24h data
    const dailyBlocks = guardrailMetricsTotal.blockedCount / 1;

    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (29 - i));

      // If we have real data for today (day 30), use it. Otherwise, simulate based on baseline
      const isToday = i === 29;
      const dayVariance = Math.sin(i / 3) * 3;
      const trendImprovement = i * 0.15; // Slight improvement trend

      return {
        day: i + 1,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        trustScore: isToday
          ? baselineTrust
          : Math.round(Math.max(50, Math.min(100, baselineTrust - 5 + dayVariance + trendImprovement))),
        guardrailHits: isToday
          ? dailyInvocations
          : Math.round(Math.max(0, dailyInvocations * (0.7 + trendNoise(i * 2 + 1) * 0.6))),
        violations: isToday
          ? dailyBlocks
          : Math.round(Math.max(0, dailyBlocks * (0.5 + trendNoise(i * 2 + 2) * 1.0))),
      };
    });
  }, [summary.trustScore, guardrailMetricsTotal]);

  // Compute Governance Control Checklist from real AVA data
  const controlChecklist = useMemo<GovernanceControl[]>(() => {
    const hasPII = guardrailTemplates.some(g => g.status === 'active' && g.pii_entities && g.pii_entities.length > 0);
    const hasContent = guardrailTemplates.some(g => g.status === 'active' && g.content_filters && g.content_filters.length > 0);
    const hasTopics = guardrailTemplates.some(g => g.status === 'active' && g.denied_topics && g.denied_topics.length > 0);
    const hasGrounding = guardrailTemplates.some(g => g.status === 'active' && g.contextual_grounding?.enabled);
    const hasWordFilter = guardrailTemplates.some(g => g.status === 'active' && (g.word_filter?.enable_profanity || (g.word_filter?.blocked_words?.length ?? 0) > 0));

    const activeGuardrails = guardrailTemplates.filter(g => g.status === 'active').length;
    const totalDeployments = deployments.length;
    const useCasesWithRisk = useCases.filter(uc => uc.computed?.risk_score != null).length;
    const productionUseCases = useCases.filter(uc => uc.status === 'Production').length;
    const approvedBusinessCases = businessCases.filter(bc => bc.status === 'Approved').length;
    const hasValidationTests = guardrailValidation && guardrailValidation.totalSuites > 0;
    const validationPassing = guardrailValidation && guardrailValidation.passRate24h >= 95;

    return [
      {
        id: 'pii-protection',
        name: 'PII Protection',
        description: 'Detect and redact personally identifiable information',
        category: 'technical',
        implemented: hasPII,
        details: hasPII ? `${guardrailTemplates.filter(g => g.pii_entities?.length).length} guardrail(s) with PII detection` : undefined,
        action: hasPII ? undefined : 'Add PII entities to a guardrail in Secure',
        link: '/secure/guardrails',
      },
      {
        id: 'content-filtering',
        name: 'Content Filtering',
        description: 'Filter harmful or inappropriate content',
        category: 'technical',
        implemented: hasContent,
        details: hasContent ? `Content filters active on ${guardrailTemplates.filter(g => g.content_filters?.length).length} guardrail(s)` : undefined,
        action: hasContent ? undefined : 'Enable content filters on a guardrail',
        link: '/secure/guardrails',
      },
      {
        id: 'topic-blocking',
        name: 'Topic Blocking',
        description: 'Block sensitive or off-limits topics',
        category: 'technical',
        implemented: hasTopics,
        details: hasTopics ? `${guardrailTemplates.filter(g => g.denied_topics?.length).length} guardrail(s) with denied topics` : undefined,
        action: hasTopics ? undefined : 'Configure denied topics in a guardrail',
        link: '/secure/guardrails',
      },
      {
        id: 'grounding',
        name: 'Contextual Grounding',
        description: 'Reduce hallucinations with source grounding',
        category: 'technical',
        implemented: hasGrounding,
        details: hasGrounding ? 'Grounding enabled with threshold checks' : undefined,
        action: hasGrounding ? undefined : 'Enable contextual grounding in a guardrail',
        link: '/secure/guardrails',
      },
      {
        id: 'word-filter',
        name: 'Word & Profanity Filter',
        description: 'Block specific words and profanity',
        category: 'technical',
        implemented: hasWordFilter,
        details: hasWordFilter ? 'Word filtering active' : undefined,
        action: hasWordFilter ? undefined : 'Enable profanity filter or add blocked words',
        link: '/secure/guardrails',
      },
      {
        id: 'guardrail-deployed',
        name: 'Guardrails Deployed',
        description: 'At least one active guardrail protecting workloads',
        category: 'security',
        implemented: activeGuardrails > 0,
        details: activeGuardrails > 0 ? `${activeGuardrails} active guardrail(s)` : undefined,
        action: activeGuardrails > 0 ? undefined : 'Create and publish a guardrail in Secure',
        link: '/secure/guardrails',
      },
      {
        id: 'risk-assessment',
        name: 'Risk Assessment Complete',
        description: 'Use cases have been risk-scored',
        category: 'governance',
        implemented: useCasesWithRisk > 0,
        details: useCasesWithRisk > 0 ? `${useCasesWithRisk}/${useCases.length} use cases scored` : undefined,
        action: useCasesWithRisk > 0 ? undefined : 'Score use cases in Plan → Prioritization',
        link: '/use-cases',
      },
      {
        id: 'business-case',
        name: 'Business Case Approved',
        description: 'Financial justification reviewed and approved',
        category: 'governance',
        implemented: approvedBusinessCases > 0,
        details: approvedBusinessCases > 0 ? `${approvedBusinessCases} business case(s) approved` : undefined,
        action: approvedBusinessCases > 0 ? undefined : 'Create and approve a business case in Plan',
        link: '/business-cases',
      },
      {
        id: 'production-deployment',
        name: 'Production Deployment',
        description: 'Use cases deployed to production',
        category: 'process',
        implemented: productionUseCases > 0 || totalDeployments > 0,
        details: productionUseCases > 0 || totalDeployments > 0
          ? `${productionUseCases} use case(s) in production, ${totalDeployments} deployment(s)`
          : undefined,
        action: productionUseCases > 0 || totalDeployments > 0 ? undefined : 'Deploy an agent or application in Build',
        link: '/deployments',
      },
      {
        id: 'validation-testing',
        name: 'Guardrail Validation Testing',
        description: 'Automated tests verify guardrails block/pass as expected',
        category: 'technical',
        implemented: hasValidationTests ?? false,
        details: hasValidationTests
          ? `${guardrailValidation?.totalSuites} test suite(s), ${guardrailValidation?.passRate24h}% pass rate`
          : undefined,
        action: hasValidationTests ? undefined : 'Create test suites in Guardrails → Validation',
        link: '/secure/guardrails/observability',
      },
      {
        id: 'validation-passing',
        name: 'Validation Tests Passing',
        description: 'All guardrail validation tests passing (≥95%)',
        category: 'security',
        implemented: validationPassing ?? false,
        details: validationPassing
          ? `${guardrailValidation?.passRate24h}% pass rate, ${guardrailValidation?.failedTests24h} failed in 24h`
          : guardrailValidation ? `${guardrailValidation.passRate24h}% pass rate - below 95% threshold` : undefined,
        action: validationPassing ? undefined : 'Review failing tests in Guardrails → Validation',
        link: '/secure/guardrails/observability',
      },
    ];
  }, [guardrailTemplates, deployments, useCases, businessCases, guardrailValidation]);

  const controlStats = useMemo(() => {
    const implemented = controlChecklist.filter(c => c.implemented).length;
    const total = controlChecklist.length;
    return {
      implemented,
      total,
      percentage: total > 0 ? Math.round((implemented / total) * 100) : 0,
    };
  }, [controlChecklist]);

  // Expected-cost roll-up: join use cases to their client-side cost models and
  // price them via the shared MODEL_PRICING. AVA's first real use-case→cost join.
  const expectedCost = useMemo(() => {
    const byModel = new Map<string, { modelId: string; modelName: string; monthly: number; useCases: number }>();
    let totalMonthly = 0;
    let useCasesWithEstimate = 0;
    for (const uc of useCases) {
      const cm = costInputStore.get(uc.use_case_id);
      if (!cm || !isPricedModelId(cm.model_id)) continue;
      const monthly = computeExpectedCost(cm).monthlyCost;
      totalMonthly += monthly;
      useCasesWithEstimate++;
      const existing = byModel.get(cm.model_id);
      if (existing) { existing.monthly += monthly; existing.useCases++; }
      else byModel.set(cm.model_id, { modelId: cm.model_id, modelName: PRICED_MODEL_LABELS[cm.model_id], monthly, useCases: 1 });
    }
    return {
      totalMonthly,
      totalAnnual: totalMonthly * 12,
      useCasesWithEstimate,
      byModel: Array.from(byModel.values()).sort((a, b) => b.monthly - a.monthly),
    };
  }, [useCases]);

  const refresh = () => setRefreshKey(k => k + 1);

  return {
    loading,
    error,
    summary,
    pipeline,
    activityFeed,

    // Real data
    guardrails,
    policies,
    deployments: deploymentSummaries,
    useCases,
    businessCases,
    operatingModels,
    serviceApprovalRuns,
    frontierAgents,
    guardrailMetricsTotal,
    policyMetricsTotal,

    // Real risk data from use cases
    useCaseRiskHeatmap,
    useCaseRiskCategories: USE_CASE_RISK_CATEGORIES,
    topRiskyUseCases,

    // Trend data
    trendData30d,

    // Governance Control Checklist
    controlChecklist,
    controlStats,

    // Guardrail Validation data
    guardrailValidation,

    // Mock data (still needed for some views)
    complianceFrameworks: COMPLIANCE_FRAMEWORKS,
    costByModel: COST_BY_MODEL,
    buBudgets: BU_BUDGETS,

    // Expected-cost roll-up across use cases (Plan → FinOps join)
    expectedCost,

    refresh,
  };
}

export default useGovernanceAggregator;
