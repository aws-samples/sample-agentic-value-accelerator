/**
 * finopsMetrics — Govern FinOps's contribution to the shared metric contract.
 * PROPOSED (see metricContract.ts).
 *
 * FinOps OWNS operational cost & efficiency metrics; Plan/Command Center READ
 * them. Scope boundary: this is the OPERATIONAL cost layer (cost reduction %,
 * orchestration overhead, cost per task, AI investment as % revenue + the CLEAR
 * cost dimension). Investment-appraisal financials — NPV, IRR, BCR, payback,
 * DCF — deliberately stay in Plan's business-case model and are NOT recomputed
 * here, so the two modules don't both own "the financials".
 */
import {
  type ComputedMetric,
  type MetricContribution,
  type MetricPolarity,
  type MetricTier,
  computeVariance,
  ragForVariance,
} from './metricContract';

interface FinopsDef {
  id: string;
  label: string;
  expected: number;
  actual: number;
  target: number;
  unit: string;
  polarity: MetricPolarity;
  tier: MetricTier;
  owner: string;
  source: string;
}

/**
 * Operational cost/efficiency metric definitions. Values align with the
 * workbook's Financial (operational subset) + CLEAR cost rows so they reconcile
 * with Plan's financial sheet. FinOps would populate `actual` from live cloud
 * cost + orchestration telemetry in a real integration.
 */
const FINOPS_DEFS: FinopsDef[] = [
  { id: 'finops.cost-reduction',   label: 'Cost Reduction from AI',     expected: 0.28, actual: 0.18, target: 0.28, unit: '%',    polarity: 'higher-is-better', tier: 'board',      owner: 'COO',         source: 'Cost center analysis' },
  // Board KPI #6 (value side of ROI — pairs with cost reduction). Sheet: 7.5% exp / 4% actual.
  { id: 'finops.revenue-uplift',   label: 'Revenue Uplift from AI',     expected: 0.075, actual: 0.04, target: 0.075, unit: '%',  polarity: 'higher-is-better', tier: 'board',      owner: 'CRO',         source: 'Revenue attribution model' },
  { id: 'finops.ai-roi',           label: 'AI ROI ($ per $1)',          expected: 3,    actual: 2.2,  target: 3,    unit: 'x',    polarity: 'higher-is-better', tier: 'board',      owner: 'CFO',         source: 'Cost/benefit analysis' },
  // Board KPI #12. It's a healthy BAND (2–5% of revenue), not lower-is-better;
  // model expected = band ceiling (5%) so staying under it reads green — matches
  // the workbook's Green rating for actual 3.8%.
  { id: 'finops.investment-pct',   label: 'AI Investment as % Revenue', expected: 0.05, actual: 0.038, target: 0.035, unit: '%',  polarity: 'lower-is-better',  tier: 'board',      owner: 'CFO',         source: 'Budget tracking (target band 2–5% of revenue)' },
  { id: 'finops.orchestration',    label: 'Orchestration Cost Ratio',   expected: 4.4,  actual: 3.8,  target: 4.4,  unit: 'x',    polarity: 'lower-is-better',  tier: 'management', owner: 'FinOps Lead', source: 'Multi-agent overhead vs single-agent' },
  { id: 'finops.cost-per-task',    label: 'Cost per Successful Task',   expected: 0.12, actual: 0.14, target: 0.10, unit: '$',    polarity: 'lower-is-better',  tier: 'diagnostic', owner: 'FinOps Lead', source: 'Total cost / successful completions' },
  { id: 'finops.infra-efficiency', label: 'Infra Cost Efficiency (YoY)', expected: 0.20, actual: 0.12, target: 0.20, unit: '%',   polarity: 'higher-is-better', tier: 'diagnostic', owner: 'FinOps Lead', source: 'Cloud cost analysis' },
];

export function finopsRows(): ComputedMetric[] {
  return FINOPS_DEFS.map(d => {
    const { variance, variancePct } = computeVariance(d.expected, d.actual);
    return {
      id: d.id,
      label: d.label,
      tier: d.tier,
      owningModule: 'finops',
      cadence: 'monthly',
      polarity: d.polarity,
      unit: d.unit,
      expected: d.expected,
      actual: d.actual,
      target: d.target,
      owner: d.owner,
      source: `Govern · FinOps — ${d.source}`,
      variance,
      variancePct,
      rag: ragForVariance(variancePct, d.polarity),
    };
  });
}

/** Board-level headline: cost reduction from AI (the FinOps board KPI). */
export function costEfficiencyHeadline(rows: ComputedMetric[]): ComputedMetric {
  return rows.find(r => r.id === 'finops.cost-reduction') ?? rows[0];
}

export function finopsContribution(generatedAt: string): MetricContribution {
  return {
    owningModule: 'finops',
    generatedAt,
    metrics: finopsRows(),
  };
}
