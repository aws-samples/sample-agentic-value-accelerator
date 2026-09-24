/**
 * useAssessmentAutoPopulate - Auto-populates governance assessment based on live AVA data
 *
 * Pulls data from Plan, Build, Secure, and Operate modules to pre-fill assessment
 * questions with detected capabilities and compliance status.
 *
 * Data Sources:
 * - Plan: Organization Design, Operating Model, Business Cases
 * - Build: Deployments, Models, Agents
 * - Secure: Guardrails, Security Findings, Config Compliance
 * - Operate: Cost, Incidents, Audit Trail
 */

import { useState, useCallback } from 'react';
import {
  organizationDesignApi,
  operatingModelApi,
  businessCasesApi,
  deploymentsApi,
  governModelsApi,
  governAgentCoreApi,
  governGuardrailsApi,
  governPostureApi,
  governSecurityApi,
  governCostApi,
  governTrailApi,
  governFleetApi,
  governAuditApi,
  governEvalsApi,
  governInvocationSafetyApi,
} from '../../../api/client';
import type { AssessmentResponse, PlanModuleContext, FrameworkId } from './governanceAssessmentFramework';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export interface AutoPopulateSignal {
  questionId: string;
  suggestedValue: number | boolean | string[];
  confidence: 'high' | 'medium' | 'low';
  source: string;
  evidence: string;
  reasoning: string;
}

export interface ModuleStatus {
  module: string;
  connected: boolean;
  dataPoints: number;
  lastUpdated?: string;
}

export interface AutoPopulateResult {
  signals: AutoPopulateSignal[];
  planContext: PlanModuleContext;
  moduleStatuses: ModuleStatus[];
  applicableFrameworks: FrameworkId[];
  overallReadiness: number;
}

export function useAssessmentAutoPopulate() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoPopulateResult | null>(null);

  const fetchAutoPopulateData = useCallback(async (): Promise<AutoPopulateResult> => {
    const signals: AutoPopulateSignal[] = [];
    const moduleStatuses: ModuleStatus[] = [];
    let planContext: PlanModuleContext = {};

    // ═══════════════════════════════════════════════════════════════════════════
    // PLAN MODULE - Organization Design, Operating Model, Business Cases
    // ═══════════════════════════════════════════════════════════════════════════

    try {
      const [orgDesigns, opModels, businessCases] = await Promise.allSettled([
        withTimeout(organizationDesignApi.list(), 5000),
        withTimeout(operatingModelApi.list(), 5000),
        withTimeout(businessCasesApi.list(), 5000),
      ]);

      let planDataPoints = 0;

      // Organization Design
      if (orgDesigns.status === 'fulfilled' && orgDesigns.value.length > 0) {
        const latestOrg = orgDesigns.value[0];
        planContext.organizationDesignId = latestOrg.organization_design_id;
        planContext.organizationProfile = {
          companyName: latestOrg.profile.company_name || '',
          companySize: latestOrg.profile.company_size || 0,
          industry: latestOrg.profile.industry || '',
          // OrganizationDesign stores a single geographic-presence string; wrap it as
          // the region list the assessment framework expects.
          regions: latestOrg.profile.geographic_presence ? [latestOrg.profile.geographic_presence] : [],
        };
        planDataPoints += 1;

        // Check if AI governance org structure is defined
        if (latestOrg.status === 'Complete') {
          signals.push({
            questionId: 'rsk-6',
            suggestedValue: true,
            confidence: 'high',
            source: 'Plan > Organization Design',
            evidence: `Organization design "${latestOrg.profile.company_name}" completed with AI governance structure`,
            reasoning: 'Completed organization design indicates board-level AI oversight structure is defined',
          });
        }
      }

      // Operating Model
      if (opModels.status === 'fulfilled' && opModels.value.length > 0) {
        const latestOp = opModels.value[0];
        planContext.operatingModel = {
          id: latestOp.operating_model_id,
          pattern: latestOp.pattern || 'Not Set',
          maturityLevel: latestOp.computed?.maturity_level || 1,
        };
        planDataPoints += 1;

        const maturityLevel = latestOp.computed?.maturity_level || 1;

        // Map operating model maturity to governance maturity
        signals.push({
          questionId: 'rsk-4',
          suggestedValue: Math.min(maturityLevel + 1, 5),
          confidence: maturityLevel >= 3 ? 'high' : 'medium',
          source: 'Plan > Operating Model',
          evidence: `Operating model at maturity level ${maturityLevel} with ${latestOp.pattern} pattern`,
          reasoning: 'Operating model maturity indicates ERM integration level',
        });

        // If governance dimension is scored high, suggest risk framework exists
        const governanceAvg = latestOp.computed?.dimensions?.governance?.average;
        if (governanceAvg !== undefined && governanceAvg >= 3) {
          signals.push({
            questionId: 'rsk-1',
            suggestedValue: Math.round(governanceAvg),
            confidence: 'high',
            source: 'Plan > Operating Model',
            evidence: `Governance dimension scored ${governanceAvg.toFixed(1)}/5`,
            reasoning: 'High governance score indicates formal AI risk framework',
          });
        }
      }

      // Business Cases
      if (businessCases.status === 'fulfilled') {
        const cases = businessCases.value;
        const approved = cases.filter(c => c.status === 'Approved');
        const totalInvestment = cases.reduce((sum, c) => sum + (c.computed?.financials.total_costs || 0), 0);

        planContext.useCases = {
          total: cases.length,
          byRiskTier: {},
          inProduction: approved.length,
        };
        planContext.businessCases = {
          total: cases.length,
          approved: approved.length,
          totalInvestment,
        };
        planDataPoints += cases.length;

        // If business cases exist, ROI tracking is likely
        if (cases.length > 0) {
          signals.push({
            questionId: 'fc-2',
            suggestedValue: true,
            confidence: cases.length >= 3 ? 'high' : 'medium',
            source: 'Plan > Business Cases',
            evidence: `${cases.length} AI business cases tracked, ${approved.length} approved`,
            reasoning: 'Active business case tracking indicates budget monitoring',
          });
        }
      }

      moduleStatuses.push({
        module: 'Plan',
        connected: planDataPoints > 0,
        dataPoints: planDataPoints,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      moduleStatuses.push({ module: 'Plan', connected: false, dataPoints: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD MODULE - Deployments, Models, Agents
    // ═══════════════════════════════════════════════════════════════════════════

    try {
      const [deployments, models, agents] = await Promise.allSettled([
        withTimeout(deploymentsApi.list(), 5000),
        withTimeout(governModelsApi.catalog(), 5000),
        withTimeout(governAgentCoreApi.agents(), 5000),
      ]);

      let buildDataPoints = 0;

      // Deployments
      if (deployments.status === 'fulfilled') {
        const deploys = deployments.value;
        buildDataPoints += deploys.length;

        if (deploys.length > 0) {
          signals.push({
            questionId: 'inv-7',
            suggestedValue: true,
            confidence: 'high',
            source: 'Build > Deployments',
            evidence: `${deploys.length} deployments tracked in registry`,
            reasoning: 'Active deployment tracking indicates registration process exists',
          });
        }
      }

      // Models Catalog
      if (models.status === 'fulfilled' && models.value.live) {
        const modelCount = models.value.models?.length || 0;
        buildDataPoints += modelCount;

        if (modelCount > 0) {
          // Model inventory exists
          signals.push({
            questionId: 'inv-1',
            suggestedValue: 3, // At least "Centralized registry"
            confidence: 'high',
            source: 'Build > Model Catalog',
            evidence: `${modelCount} models in centralized catalog`,
            reasoning: 'Live model catalog indicates centralized inventory',
          });

          signals.push({
            questionId: 'mdl-2',
            suggestedValue: models.value.live ? 3 : 2,
            confidence: 'high',
            source: 'Build > Model Catalog',
            evidence: 'Live model metrics collection enabled',
            reasoning: 'Live API indicates automated metrics collection',
          });
        }
      }

      // Agents
      if (agents.status === 'fulfilled' && agents.value.live) {
        const agentCount = agents.value.total || 0;
        buildDataPoints += agentCount;

        if (agentCount > 0) {
          signals.push({
            questionId: 'aa-1',
            suggestedValue: agentCount >= 5 ? 3 : 2,
            confidence: 'medium',
            source: 'Build > Agent Registry',
            evidence: `${agentCount} agents discovered (${agents.value.bedrock_agents} Bedrock, ${agents.value.agentcore_runtimes} AgentCore)`,
            reasoning: 'Agent discovery indicates some autonomy classification exists',
          });
        }
      }

      moduleStatuses.push({
        module: 'Build',
        connected: buildDataPoints > 0,
        dataPoints: buildDataPoints,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      moduleStatuses.push({ module: 'Build', connected: false, dataPoints: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECURE MODULE - Guardrails, Security, Config Compliance
    // ═══════════════════════════════════════════════════════════════════════════

    try {
      const [guardrails, configCompliance, securityPosture, invocationSafety] = await Promise.allSettled([
        withTimeout(governGuardrailsApi.telemetry(), 5000),
        withTimeout(governPostureApi.configCompliance(), 5000),
        withTimeout(governSecurityApi.posture(), 5000),
        withTimeout(governInvocationSafetyApi.telemetry(), 5000),
      ]);

      let secureDataPoints = 0;

      // Guardrails
      if (guardrails.status === 'fulfilled' && guardrails.value.live) {
        const gr = guardrails.value;
        secureDataPoints += gr.guardrails?.length || 1;

        if (gr.guardrails && gr.guardrails.length > 0) {
          signals.push({
            questionId: 'ss-3',
            suggestedValue: true,
            confidence: 'high',
            source: 'Secure > Guardrails',
            evidence: `${gr.guardrails.length} guardrails deployed with ${gr.total_interventions || 0} interventions`,
            reasoning: 'Active guardrails indicate harmful output prevention',
          });

          signals.push({
            questionId: 'ss-4',
            suggestedValue: true,
            confidence: 'high',
            source: 'Secure > Guardrails',
            evidence: 'Guardrail telemetry shows content filtering active',
            reasoning: 'Content filters include prompt injection protection',
          });
        }
      }

      // Config Compliance
      if (configCompliance.status === 'fulfilled' && configCompliance.value.live) {
        const cc = configCompliance.value;
        secureDataPoints += cc.total_rules || 0;

        const compliancePct = cc.pct_compliant || 0;
        signals.push({
          questionId: 'ca-1',
          suggestedValue: compliancePct >= 90 ? 4 : compliancePct >= 70 ? 3 : 2,
          confidence: 'high',
          source: 'Secure > AWS Config',
          evidence: `${cc.compliant}/${cc.total_rules} rules compliant (${compliancePct}%)`,
          reasoning: 'AWS Config compliance indicates governance control maturity',
        });
      }

      // Security Posture
      if (securityPosture.status === 'fulfilled' && securityPosture.value.live) {
        const sp = securityPosture.value;
        secureDataPoints += sp.total_findings || 0;

        const criticalHigh = (sp.critical || 0) + (sp.high || 0);
        signals.push({
          questionId: 'ss-1',
          suggestedValue: criticalHigh === 0 ? 4 : criticalHigh < 10 ? 3 : 2,
          confidence: 'high',
          source: 'Secure > Security Hub',
          evidence: `${sp.total_findings} findings (${sp.critical} critical, ${sp.high} high)`,
          reasoning: 'Security Hub findings indicate security control maturity',
        });
      }

      // Invocation Safety
      if (invocationSafety.status === 'fulfilled' && invocationSafety.value.live) {
        const is = invocationSafety.value;
        secureDataPoints += is.total_calls || 0;

        if (is.logging_enabled) {
          signals.push({
            questionId: 'ca-2',
            suggestedValue: true,
            confidence: 'high',
            source: 'Secure > Invocation Logs',
            evidence: `${is.total_calls} invocations logged over ${is.window_days} days`,
            reasoning: 'Invocation logging provides decision audit trails',
          });
        }
      }

      moduleStatuses.push({
        module: 'Secure',
        connected: secureDataPoints > 0,
        dataPoints: secureDataPoints,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      moduleStatuses.push({ module: 'Secure', connected: false, dataPoints: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATE MODULE - Cost, Trail, Audit, Fleet
    // ═══════════════════════════════════════════════════════════════════════════

    try {
      const [costSummary, budgets, trail, auditEvents, evals] = await Promise.allSettled([
        withTimeout(governCostApi.summary(), 5000),
        withTimeout(governCostApi.budgets(), 5000),
        withTimeout(governTrailApi.aiCallers(), 5000),
        withTimeout(governAuditApi.list(undefined, 50), 5000),
        withTimeout(governEvalsApi.jobs(), 5000),
      ]);

      let operateDataPoints = 0;

      // Cost Summary
      if (costSummary.status === 'fulfilled' && costSummary.value.live) {
        const cs = costSummary.value;
        operateDataPoints += 1;

        signals.push({
          questionId: 'fc-1',
          suggestedValue: cs.by_service ? 4 : 3,
          confidence: 'high',
          source: 'Operate > Cost Explorer',
          evidence: `$${(cs.total || 0).toLocaleString()} tracked across ${Object.keys(cs.by_service || {}).length} services`,
          reasoning: 'Cost Explorer integration indicates cost visibility',
        });
      }

      // Budgets
      if (budgets.status === 'fulfilled' && budgets.value.live) {
        const b = budgets.value;
        operateDataPoints += b.budgets?.length || 0;

        if (b.budgets && b.budgets.length > 0) {
          signals.push({
            questionId: 'fc-2',
            suggestedValue: true,
            confidence: 'high',
            source: 'Operate > AWS Budgets',
            evidence: `${b.budgets.length} AI budgets configured`,
            reasoning: 'AWS Budgets indicate budget monitoring in place',
          });
        }
      }

      // CloudTrail AI Callers (Shadow AI detection)
      if (trail.status === 'fulfilled' && trail.value.live) {
        const t = trail.value;
        operateDataPoints += t.total_callers || 0;

        const unrecognizedPct = t.total_callers > 0
          ? Math.round((t.unrecognized / t.total_callers) * 100)
          : 0;

        signals.push({
          questionId: 'sha-1',
          suggestedValue: t.live ? (unrecognizedPct < 20 ? 4 : 3) : 2,
          confidence: 'high',
          source: 'Operate > CloudTrail',
          evidence: `${t.total_callers} AI callers detected, ${t.unrecognized} unrecognized (${unrecognizedPct}%)`,
          reasoning: 'CloudTrail AI caller analysis enables Shadow AI detection',
        });
      }

      // Audit Events
      if (auditEvents.status === 'fulfilled' && auditEvents.value.length > 0) {
        operateDataPoints += auditEvents.value.length;

        signals.push({
          questionId: 'ca-2',
          suggestedValue: true,
          confidence: 'high',
          source: 'Operate > Audit Log',
          evidence: `${auditEvents.value.length} governance events logged`,
          reasoning: 'Active audit logging indicates decision trail maintenance',
        });
      }

      // Evaluations
      if (evals.status === 'fulfilled' && evals.value.live) {
        const e = evals.value;
        operateDataPoints += e.jobs?.length || 0;

        if (e.jobs && e.jobs.length > 0) {
          signals.push({
            questionId: 'fb-1',
            suggestedValue: 3,
            confidence: 'medium',
            source: 'Operate > Evaluations',
            evidence: `${e.jobs.length} model evaluation jobs`,
            reasoning: 'Model evaluations indicate bias assessment capability',
          });

          signals.push({
            questionId: 'mdl-1',
            suggestedValue: 3,
            confidence: 'medium',
            source: 'Operate > Evaluations',
            evidence: 'Model evaluation framework in place',
            reasoning: 'Evaluations indicate model validation process',
          });
        }
      }

      moduleStatuses.push({
        module: 'Operate',
        connected: operateDataPoints > 0,
        dataPoints: operateDataPoints,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      moduleStatuses.push({ module: 'Operate', connected: false, dataPoints: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GOVERN MODULE - Controls, Fleet, Policies
    // ═══════════════════════════════════════════════════════════════════════════

    try {
      const [fleetSummary] = await Promise.allSettled([
        withTimeout(governFleetApi.summary(), 5000),
      ]);

      let governDataPoints = 0;

      // Fleet Summary - use summary endpoint which has agent counts
      if (fleetSummary.status === 'fulfilled') {
        const summary = fleetSummary.value.summary;
        const totalAgents = summary?.total || 0;
        governDataPoints += totalAgents;

        if (totalAgents > 0) {
          signals.push({
            questionId: 'inv-1',
            suggestedValue: 4,
            confidence: 'high',
            source: 'Govern > Fleet',
            evidence: `${totalAgents} agents in fleet registry`,
            reasoning: 'Fleet registry indicates automated discovery and classification',
          });

          // Check compliance rate as proxy for governance maturity
          const pctCompliant = summary?.pct_compliant || 0;
          signals.push({
            questionId: 'ca-1',
            suggestedValue: pctCompliant >= 80 ? 4 : pctCompliant >= 60 ? 3 : 2,
            confidence: 'high',
            source: 'Govern > Fleet',
            evidence: `${pctCompliant}% of agents compliant (${summary?.governance?.compliant || 0}/${totalAgents})`,
            reasoning: 'Fleet compliance rate indicates governance control maturity',
          });

          // Check if there are agents needing attention (proxy for autonomy governance)
          const needsAttention = summary?.needs_attention || 0;
          if (needsAttention === 0) {
            signals.push({
              questionId: 'aa-1',
              suggestedValue: 4,
              confidence: 'medium',
              source: 'Govern > Fleet',
              evidence: `All ${totalAgents} agents are in good standing`,
              reasoning: 'No agents needing attention indicates autonomy governance in place',
            });
          }
        }
      }

      moduleStatuses.push({
        module: 'Govern',
        connected: governDataPoints > 0,
        dataPoints: governDataPoints,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      moduleStatuses.push({ module: 'Govern', connected: false, dataPoints: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Calculate applicable frameworks based on organization profile
    // ═══════════════════════════════════════════════════════════════════════════

    const applicableFrameworks: FrameworkId[] = ['NIST_AI_RMF', 'ISO_42001'];
    const regions = planContext.organizationProfile?.regions || [];
    const industry = planContext.organizationProfile?.industry || '';

    if (regions.some(r => ['EU', 'EEA', 'UK', 'Germany', 'France', 'Italy', 'Spain'].includes(r))) {
      applicableFrameworks.push('EU_AI_ACT');
    }
    if (regions.includes('US') || regions.includes('North America')) {
      if (['Banking', 'Financial Services', 'Insurance'].includes(industry)) {
        applicableFrameworks.push('SR_26_2', 'SR_11_7', 'CRI_FS_AI_RMF');
      }
      if (industry === 'Insurance') {
        applicableFrameworks.push('NAIC_AI_BULLETIN');
      }
    }
    if (regions.includes('Canada')) {
      if (['Banking', 'Insurance', 'Financial Services'].includes(industry)) {
        applicableFrameworks.push('OSFI_E23');
      }
    }
    if (regions.includes('Singapore') || regions.includes('APAC')) {
      applicableFrameworks.push('SG_AI_FRAMEWORK');
      if (['Banking', 'Financial Services', 'Insurance'].includes(industry)) {
        applicableFrameworks.push('MAS_FEAT');
      }
    }
    if (regions.includes('Australia')) {
      if (['Banking', 'Insurance', 'Financial Services'].includes(industry)) {
        applicableFrameworks.push('APRA_CPG235');
      }
    }

    // Calculate overall readiness
    const connectedModules = moduleStatuses.filter(m => m.connected).length;
    const totalDataPoints = moduleStatuses.reduce((sum, m) => sum + m.dataPoints, 0);
    const highConfidenceSignals = signals.filter(s => s.confidence === 'high').length;
    const overallReadiness = Math.min(
      100,
      Math.round(
        (connectedModules / moduleStatuses.length) * 40 +
        Math.min(totalDataPoints / 50, 1) * 30 +
        Math.min(highConfidenceSignals / 20, 1) * 30
      )
    );

    return {
      signals,
      planContext,
      moduleStatuses,
      applicableFrameworks: [...new Set(applicableFrameworks)] as FrameworkId[],
      overallReadiness,
    };
  }, []);

  const runAutoPopulate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAutoPopulateData();
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to auto-populate assessment';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchAutoPopulateData]);

  const applySignalsToResponses = useCallback(
    (
      signals: AutoPopulateSignal[],
      existingResponses: Record<string, AssessmentResponse>
    ): Record<string, AssessmentResponse> => {
      const updated = { ...existingResponses };

      // Multiple signals can target the same questionId (e.g. fc-2, ca-2, inv-1).
      // Apply the highest-confidence signal first so it wins, matching the intent
      // below; the !updated guard still protects an existing user response.
      const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const orderedSignals = [...signals].sort(
        (a, b) => (confidenceRank[b.confidence] ?? 0) - (confidenceRank[a.confidence] ?? 0),
      );

      for (const signal of orderedSignals) {
        // Only apply if no existing response (highest-confidence signal wins for dupes)
        if (!updated[signal.questionId]) {
          updated[signal.questionId] = {
            questionId: signal.questionId,
            value: signal.suggestedValue,
            notes: `[Auto-populated from ${signal.source}] ${signal.reasoning}`,
            evidence: [signal.evidence],
            assessedAt: new Date().toISOString(),
            assessedBy: 'ava-auto-populate',
          };
        }
      }

      return updated;
    },
    []
  );

  return {
    isLoading,
    error,
    result,
    runAutoPopulate,
    applySignalsToResponses,
  };
}

export default useAssessmentAutoPopulate;
