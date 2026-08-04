/**
 * useLiveMetrics — Wires live AWS data into the scorecard metrics.
 *
 * The metric contract (metricContract.ts) defines the SHAPE of metrics.
 * The per-module files (modelMetrics.ts, finopsMetrics.ts, etc.) define the
 * EXPECTED values and structure. This hook REPLACES the hardcoded actuals
 * with live data from governXxxApi calls.
 *
 * Strategy: fetch live data once, then patch the hardcoded actuals with real
 * values where available. Metrics without live data sources retain their
 * illustrative values (marked appropriately).
 */
import { useState, useEffect, useMemo } from 'react';
import {
  governModelsApi,
  governGuardrailsApi,
  governRiskPostureApi,
  governEvalsApi,
  governCostApi,
  governTrailApi,
  governPostureApi,
  businessCasesApi,
  governAuditApi,
  type BusinessCase,
  type GovernAuditEvent,
} from '../../../api/client';
import { modelMetricRows, type ModelMetricRow } from './modelMetrics';
import { finopsRows } from './finopsMetrics';
import { auditMetricRows } from './auditMetrics';
import { dataQualityRows, dataQualityComposite } from './dataMetrics';
import { riskMetricRows, aggregateRiskMetric, residualPostureMetric } from './riskMetrics';
import {
  type ComputedMetric,
  type MetricContribution,
  computeVariance,
  ragForVariance,
} from './metricContract';

interface LiveMetricsState {
  loading: boolean;
  error: string | null;
  contributions: MetricContribution[];
  liveDataSources: string[];
}

interface LiveData {
  modelRuntime?: { invocations: number; errors: number; latencyP50: number };
  guardrails?: { total: number; interventions: number; groundingFailures: number };
  securityHub?: { critical: number; high: number; total: number };
  configCompliance?: { passing: number; failing: number; pct: number };
  evalJobs?: { completed: number; total: number };
  cost?: { total: number; byModel: Record<string, number> };
  aiCallers?: { recognized: number; unrecognized: number };
  businessCases?: {
    count: number;
    approved: number;
    totalNpv: number;
    totalBenefits: number;
    totalCosts: number;
    portfolioRoi: number;
    portfolioBcr: number;
  };
  auditEvents?: GovernAuditEvent[];
}

export function useLiveMetrics(): LiveMetricsState {
  const [liveData, setLiveData] = useState<LiveData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      governModelsApi.runtimeMetrics(7),
      governGuardrailsApi.telemetry(30),
      governRiskPostureApi.securityHub(200),
      governPostureApi.configCompliance(),
      governEvalsApi.jobs(100),
      governCostApi.byModel(30),
      governTrailApi.aiCallers(168),
      businessCasesApi.list(),
      governAuditApi.list(),
    ]).then(results => {
      if (cancelled) return;

      const data: LiveData = {};

      // Model runtime metrics
      const [runtimeResult] = results;
      if (runtimeResult.status === 'fulfilled' && runtimeResult.value.live) {
        const r = runtimeResult.value;
        data.modelRuntime = {
          invocations: r.total_invocations,
          errors: r.total_errors,
          latencyP50: r.avg_latency_ms,
        };
      }

      // Guardrails telemetry
      const [, guardrailsResult] = results;
      if (guardrailsResult.status === 'fulfilled' && guardrailsResult.value.live) {
        const g = guardrailsResult.value;
        data.guardrails = {
          total: g.total,
          interventions: g.total_interventions,
          groundingFailures: g.grounding_failures,
        };
      }

      // Security Hub findings
      const [,, securityResult] = results;
      if (securityResult.status === 'fulfilled' && securityResult.value.live) {
        const s = securityResult.value;
        data.securityHub = {
          critical: s.critical,
          high: s.high,
          total: s.total,
        };
      }

      // Config compliance
      const [,,, configResult] = results;
      if (configResult.status === 'fulfilled' && configResult.value.live) {
        const c = configResult.value;
        data.configCompliance = {
          passing: c.compliant,
          failing: c.non_compliant,
          pct: c.pct,
        };
      }

      // Eval jobs
      const [,,,, evalsResult] = results;
      if (evalsResult.status === 'fulfilled' && evalsResult.value.live) {
        const e = evalsResult.value;
        data.evalJobs = {
          completed: e.jobs.filter((j: { status: string }) => j.status === 'Completed').length,
          total: e.jobs.length,
        };
      }

      // Cost by model
      const [,,,,, costResult] = results;
      if (costResult.status === 'fulfilled' && costResult.value.live) {
        const c = costResult.value;
        data.cost = {
          total: c.models.reduce((s: number, m: { cost: number }) => s + m.cost, 0),
          byModel: Object.fromEntries(c.models.map((m: { model: string; cost: number }) => [m.model, m.cost])),
        };
      }

      // AI callers (shadow AI signal)
      const [,,,,,, callersResult] = results;
      if (callersResult.status === 'fulfilled' && callersResult.value.live) {
        const a = callersResult.value;
        data.aiCallers = {
          recognized: a.callers.filter((c: { recognized?: boolean }) => c.recognized).length,
          unrecognized: a.callers.filter((c: { recognized?: boolean }) => !c.recognized).length,
        };
      }

      // Business cases from Plan (ROI/NPV/BCR - the financial metrics)
      const [,,,,,,, bcResult] = results;
      if (bcResult.status === 'fulfilled') {
        const cases = bcResult.value as BusinessCase[];
        const withFin = cases.filter(bc => bc.computed?.financials);
        if (withFin.length > 0) {
          const totalNpv = withFin.reduce((s, bc) => s + (bc.computed!.financials.npv || 0), 0);
          const totalBenefits = withFin.reduce((s, bc) => s + (bc.computed!.financials.total_benefits || 0), 0);
          const totalCosts = withFin.reduce((s, bc) => s + (bc.computed!.financials.total_costs || 0), 0);
          const approved = cases.filter(bc => bc.status === 'Approved').length;
          data.businessCases = {
            count: withFin.length,
            approved,
            totalNpv,
            totalBenefits,
            totalCosts,
            portfolioRoi: totalCosts > 0 ? (totalBenefits - totalCosts) / totalCosts : 0,
            portfolioBcr: totalCosts > 0 ? totalBenefits / totalCosts : 0,
          };
        }
      }

      // Audit events from Govern audit API
      const [,,,,,,,, auditResult] = results;
      if (auditResult.status === 'fulfilled') {
        const events = auditResult.value as GovernAuditEvent[];
        if (events.length > 0) {
          data.auditEvents = events;
        }
      }

      setLiveData(data);
      setLoading(false);
    }).catch(e => {
      if (!cancelled) {
        setError(e?.message || 'Failed to load live metrics');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  const contributions = useMemo(() => {
    const now = new Date().toISOString();
    const sources: string[] = [];

    // Model metrics — patch with live data
    const modelRows = modelMetricRows().map(m => {
      if (m.id === 'model.grounding' && liveData.guardrails) {
        const { total, groundingFailures } = liveData.guardrails;
        const actual = total > 0 ? (total - groundingFailures) / total : null;
        if (actual !== null) {
          sources.push('Bedrock Guardrails');
          const { variance, variancePct } = computeVariance(m.expected, actual);
          return {
            ...m,
            actual,
            variance,
            variancePct,
            rag: ragForVariance(variancePct, m.polarity),
            source: `${m.source} [LIVE]`,
          };
        }
      }
      if (m.id === 'model.hallucination' && liveData.guardrails) {
        const { total, groundingFailures } = liveData.guardrails;
        const actual = total > 0 ? groundingFailures / total : null;
        if (actual !== null) {
          const { variance, variancePct } = computeVariance(m.expected, actual);
          return {
            ...m,
            actual,
            variance,
            variancePct,
            rag: ragForVariance(variancePct, m.polarity),
            source: `${m.source} [LIVE]`,
          };
        }
      }
      return m;
    });

    // FinOps metrics — patch with live AWS cost AND Plan business case financials
    const finRows = finopsRows().map(m => {
      // Cost-per-task from AWS Cost Explorer + CloudWatch
      if (m.id === 'finops.cost-per-task' && liveData.modelRuntime && liveData.cost) {
        const invocations = liveData.modelRuntime.invocations;
        const totalCost = liveData.cost.total;
        if (invocations > 0 && totalCost > 0) {
          const actual = totalCost / invocations;
          sources.push('Cost Explorer + CloudWatch');
          const { variance, variancePct } = computeVariance(m.expected, actual);
          return {
            ...m,
            actual,
            variance,
            variancePct,
            rag: ragForVariance(variancePct, m.polarity),
            source: `${m.source} [LIVE]`,
          };
        }
      }
      // AI ROI from Plan business cases (portfolio ROI = (benefits-costs)/costs)
      if (m.id === 'finops.ai-roi' && liveData.businessCases) {
        const { portfolioRoi } = liveData.businessCases;
        if (portfolioRoi > 0) {
          sources.push('Plan Business Cases');
          const { variance, variancePct } = computeVariance(m.expected, portfolioRoi);
          return {
            ...m,
            actual: Math.round(portfolioRoi * 100) / 100,
            variance,
            variancePct,
            rag: ragForVariance(variancePct, m.polarity),
            source: `Plan · Business Cases portfolio ROI [LIVE]`,
          };
        }
      }
      return m;
    });

    // Audit metrics — use live audit events when available
    // The GovernAuditEvent shape matches AuditEvent (auditMetrics handles the mapping)
    const auditRows = auditMetricRows(liveData.auditEvents as any);

    // Data metrics — currently no live API, keep as-is
    const dataRows = dataQualityRows();
    const dataComposite = dataQualityComposite(dataRows);

    // Risk metrics — governance process data (not AWS telemetry)
    // The risk register is human-curated; security findings are separate
    const riskRows = riskMetricRows();
    const aggregateRisk = aggregateRiskMetric();
    const residualRisk = residualPostureMetric();

    return [
      { owningModule: 'model' as const, generatedAt: now, metrics: modelRows },
      { owningModule: 'finops' as const, generatedAt: now, metrics: finRows },
      { owningModule: 'audit' as const, generatedAt: now, metrics: auditRows },
      { owningModule: 'data' as const, generatedAt: now, metrics: [dataComposite, ...dataRows] },
      { owningModule: 'risk' as const, generatedAt: now, metrics: [aggregateRisk, residualRisk, ...riskRows] },
    ];
  }, [liveData]);

  const liveDataSources = useMemo(() => {
    const sources: string[] = [];
    if (liveData.modelRuntime) sources.push('CloudWatch AWS/Bedrock');
    if (liveData.guardrails) sources.push('Bedrock Guardrails');
    if (liveData.securityHub) sources.push('SecurityHub');
    if (liveData.configCompliance) sources.push('AWS Config');
    if (liveData.evalJobs) sources.push('Bedrock Evaluations');
    if (liveData.cost) sources.push('Cost Explorer');
    if (liveData.aiCallers) sources.push('CloudTrail');
    if (liveData.businessCases) sources.push('Plan Business Cases');
    if (liveData.auditEvents) sources.push('Govern Audit API');
    return sources;
  }, [liveData]);

  return { loading, error, contributions, liveDataSources };
}

/**
 * Aggregates all module contributions into board-tier metrics for the scorecard.
 */
export function aggregateBoardMetrics(contributions: MetricContribution[]): ComputedMetric[] {
  return contributions
    .flatMap(c => c.metrics)
    .filter(m => m.tier === 'board');
}

/**
 * Computes the Go/No-Go verdict based on risk score and red count.
 */
export function computeGoNoGo(boardMetrics: ComputedMetric[]): {
  verdict: 'go' | 'no-go' | 'review';
  reason: string;
} {
  const redCount = boardMetrics.filter(m => m.rag === 'red').length;
  const riskMetric = boardMetrics.find(m => m.id === 'risk.aggregate-score');
  const riskScore = riskMetric?.actual ?? 0;

  if (redCount > 2) {
    return { verdict: 'no-go', reason: `${redCount} red metrics exceed threshold` };
  }
  if (riskScore > 15) {
    return { verdict: 'no-go', reason: `Aggregate risk ${riskScore} exceeds 15` };
  }
  if (redCount > 0) {
    return { verdict: 'review', reason: `${redCount} metric(s) need attention` };
  }
  return { verdict: 'go', reason: 'All metrics within tolerance' };
}
