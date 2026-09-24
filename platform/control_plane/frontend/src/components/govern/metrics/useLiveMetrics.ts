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
  governSageMakerApi,
  businessCasesApi,
  governAuditApi,
  type BusinessCase,
  type GovernAuditEvent,
} from '../../../api/client';
import { modelMetricRows } from './modelMetrics';
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
  /** Every real (non-illustrative) source backing the scorecard — AWS + platform. */
  liveDataSources: string[];
  /**
   * The AWS-telemetry subset of `liveDataSources`. Only these justify a
   * "Live AWS data" claim: each is populated exclusively when the upstream
   * response reported `live: true`. Platform REST sources (Plan business cases,
   * Govern audit log) are real data but are NOT AWS telemetry, so they are
   * deliberately excluded.
   */
  awsLiveDataSources: string[];
}

interface LiveData {
  modelRuntime?: { invocations: number; errors: number; latencyP50: number };
  /**
   * `groundingFailures` is `null` when contextual grounding cannot be observed in the
   * policy breakdown at all — in that case the grounding/hallucination rates are left
   * illustrative instead of asserting a fabricated 0%. See the honesty guard below.
   */
  guardrails?: { total: number; interventions: number; groundingFailures: number | null };
  securityHub?: { critical: number; high: number; total: number };
  configCompliance?: { passing: number; failing: number; pct: number };
  evalJobs?: { completed: number; total: number };
  // SageMaker Model Monitor drift — only populated when the monitor is configured
  // AND the response is live (no fabricated rate when there's no baseline).
  modelMonitor?: { driftDetectionRate: number; violationsCount: number; baselineFeatures: number };
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
      governCostApi.byModel(12),
      governTrailApi.aiCallers(168),
      businessCasesApi.list(),
      governAuditApi.list(),
      governSageMakerApi.modelMonitor(),
    ]).then(results => {
      if (cancelled) return;

      const data: LiveData = {};

      // Model runtime metrics
      const [runtimeResult] = results;
      if (runtimeResult.status === 'fulfilled' && runtimeResult.value.live) {
        const r = runtimeResult.value;
        // AwsModelMetricsResponse exposes fleet_error_rate_pct (not an absolute
        // total_errors); derive the count from the rate.
        data.modelRuntime = {
          invocations: r.total_invocations,
          errors: Math.round(r.total_invocations * (r.fleet_error_rate_pct || 0) / 100),
          latencyP50: r.avg_latency_ms,
        };
      }

      // Guardrails telemetry
      const [, guardrailsResult] = results;
      if (guardrailsResult.status === 'fulfilled' && guardrailsResult.value.live) {
        const g = guardrailsResult.value;
        // ── Why the denominator is ACCOUNT-WIDE (and why that is the correct pairing) ──
        // `groundingFailures` is the contextual-grounding (CG) intervention count from
        // `by_policy`. The backend builds `by_policy` from CloudWatch
        // `InvocationsIntervened` with dimensions GuardrailPolicyType + Operation=
        // ApplyGuardrail and NO GuardrailArn dimension (govern_guardrails_service.
        // _per_policy_metrics), so the CG numerator is inherently account-wide and
        // CANNOT be attributed to an individual guardrail. Per-guardrail invocations
        // come from a separate query keyed on GuardrailArn+Version
        // (_per_guardrail_metrics). Pairing this account-wide numerator with the
        // account-wide `total_invocations` denominator keeps both sides on the same
        // dimension; narrowing the denominator to a subset of guardrails would make the
        // ratio dimensionally MISMATCHED, not more precise. Do not "fix" it that way.
        //
        // ── Honesty guard ──
        // The ratio is only meaningful while contextual grounding is actually in force
        // across the guardrails producing those invocations. This telemetry payload
        // carries no policy configuration at all (AwsGuardrailSummary has no
        // contextual_grounding field, because /guardrails/telemetry only calls
        // bedrock:list_guardrails), so per-guardrail CG config cannot be verified here
        // without a second, slower round trip to /govern/guardrails/list (which does
        // expose it, at the cost of an extra get_guardrail call per guardrail on a page
        // -load path). Conservative stand-in using data already fetched: require that
        // contextual grounding appears in the policy breakdown at all. When it is
        // absent we cannot distinguish "CG enabled, never intervened" (a true 0%) from
        // "CG not configured anywhere" (no signal), so `groundingFailures` is left null
        // and the grounding/hallucination metrics keep their illustrative values rather
        // than publishing a fabricated 0% under a [LIVE] source label.
        // TRADEOFF: this does NOT catch a MIXED fleet (some guardrails with CG, some
        // without), which would understate the rate by inflating the denominator with
        // invocations that could never produce a CG intervention. Detecting that needs
        // the policy config from governGuardrailsApi.list(). Verified 2026-09-04:
        // 7/7 live guardrails report contextual_grounding.enabled === true, so the
        // numerator and denominator cover the same population today.
        const cgPolicies = g.by_policy.filter(p => p.policy_type === 'ContextualGroundingPolicy');
        const groundingFailures = cgPolicies.length > 0
          ? cgPolicies.reduce((s, p) => s + p.interventions, 0)
          : null;
        data.guardrails = {
          total: g.total_invocations,
          interventions: g.total_interventions,
          groundingFailures,
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
          pct: c.pct_compliant,
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
        // Cost API returns { by_model: [{ model, amount }], total }. The old code read
        // c.models / m.cost (wrong shape) which threw and was swallowed by the outer
        // .catch(), silently zeroing the live scorecard exactly when cost data WAS live.
        data.cost = {
          total: c.total,
          byModel: Object.fromEntries(c.by_model.map((m) => [m.model, m.amount])),
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

      // Business cases from Plan (ROI/NPV/BCR - the financial metrics).
      // NOTE: unlike the AWS calls above there is no `.live` flag to check — this
      // is the platform's own REST API, so "real" means "returned cases with
      // computed financials". It is therefore NOT counted as AWS telemetry when
      // the scorecard decides whether it may claim live AWS data.
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

      // SageMaker Model Monitor — data-quality drift (baseline constraints vs captured).
      // Only claim live when the monitor is configured AND the response is live; the
      // detection rate = share of monitored features passing constraint checks. Leave
      // undefined (illustrative fallback) when there's no baseline to measure against.
      const monitorResult = results[9];
      if (monitorResult.status === 'fulfilled' && monitorResult.value.live && monitorResult.value.monitor_configured) {
        const mm = monitorResult.value;
        let driftDetectionRate: number | null = null;
        if (mm.baseline_features > 0) {
          const clean = Math.max(0, mm.baseline_features - mm.violations_count);
          driftDetectionRate = clean / mm.baseline_features;
        } else if (mm.violations_count === 0) {
          driftDetectionRate = 1.0;
        }
        if (driftDetectionRate !== null) {
          data.modelMonitor = {
            driftDetectionRate,
            violationsCount: mm.violations_count,
            baselineFeatures: mm.baseline_features,
          };
        }
      }

      // Audit events from Govern audit API (platform REST, no `.live` flag —
      // same non-AWS classification as the business cases above).
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
        // groundingFailures === null → contextual grounding is not observable in the
        // policy breakdown, so leave the illustrative value rather than claim 100%.
        const actual = total > 0 && groundingFailures !== null ? (total - groundingFailures) / total : null;
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
        // Account-wide CG interventions ÷ account-wide guardrail invocations — the
        // dimensionally matched pairing explained at the fetch site above. Suppressed
        // (illustrative fallback) when CG is not observable, so a missing signal never
        // renders as a 0% hallucination rate under [LIVE].
        const actual = total > 0 && groundingFailures !== null ? groundingFailures / total : null;
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
      // Model drift — real SageMaker Model Monitor detection rate (replaces the
      // hardcoded illustrative 1.0). Only patched when the monitor is live/configured.
      if (m.id === 'model.drift' && liveData.modelMonitor) {
        const actual = liveData.modelMonitor.driftDetectionRate;
        sources.push('SageMaker Model Monitor');
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
      return m;
    });

    // FinOps metrics — patch with live AWS cost AND Plan business case financials
    const finRows = finopsRows().map(m => {
      // Cost-per-task from AWS Cost Explorer + CloudWatch
      if (m.id === 'finops.cost-per-task' && liveData.modelRuntime && liveData.cost) {
        const invocations = liveData.modelRuntime.invocations;
        const totalCost = liveData.cost.total;
        if (invocations > 0 && totalCost > 0) {
          // Match windows: totalCost spans ~12 months (byModel(12)) while invocations
          // are a 7-day count (runtimeMetrics(7)). Normalize both to a daily rate so
          // cost-per-task divides over a matched window (was ~47x overstated).
          const COST_WINDOW_DAYS = 365;   // byModel(12) — trailing 12 months
          const RUNTIME_WINDOW_DAYS = 7;  // runtimeMetrics(7)
          const actual = (totalCost / COST_WINDOW_DAYS) / (invocations / RUNTIME_WINDOW_DAYS);
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

  const { liveDataSources, awsLiveDataSources } = useMemo(() => {
    // AWS telemetry. Every block that populates these fields checks the
    // response's own `live` flag first, so presence here == real AWS data.
    const aws: string[] = [];
    if (liveData.modelRuntime) aws.push('CloudWatch AWS/Bedrock');
    if (liveData.guardrails) aws.push('Bedrock Guardrails');
    if (liveData.securityHub) aws.push('SecurityHub');
    if (liveData.configCompliance) aws.push('AWS Config');
    if (liveData.evalJobs) aws.push('Bedrock Evaluations');
    if (liveData.modelMonitor) aws.push('SageMaker Model Monitor');
    if (liveData.cost) aws.push('Cost Explorer');
    if (liveData.aiCallers) aws.push('CloudTrail');

    // Platform REST sources. These endpoints return plain arrays with no `live`
    // flag, so the only honest gate is "did they return records that actually
    // back a rendered metric" — they are listed only when they do, and never as
    // AWS telemetry (otherwise the scorecard could show "Live · 0/N live").
    const platform: string[] = [];
    if (liveData.businessCases && liveData.businessCases.portfolioRoi > 0) {
      platform.push('Plan Business Cases');
    }
    if (liveData.auditEvents && liveData.auditEvents.length > 0) {
      platform.push('Govern Audit API');
    }

    return { liveDataSources: [...aws, ...platform], awsLiveDataSources: aws };
  }, [liveData]);

  return { loading, error, contributions, liveDataSources, awsLiveDataSources };
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
