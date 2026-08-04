/**
 * riskMetrics — Govern Risk Management's contribution to the shared metric
 * contract. PROPOSED (see metricContract.ts).
 *
 * Risk Management OWNS these metrics; Plan READS them (chiefly the Aggregate
 * Risk Score, which is one of Plan's three Go/No-Go gates). Computed once here
 * from the canonical agentic-risk catalog (agenticRiskCatalog.ts) so there is a
 * single source of truth — faithful to the workbook's Risk & Governance sheet.
 *
 * Workbook formulas:
 *   rawScore  = likelihood × impact
 *   residual  = rawScore × (1 − controlEffectiveness)
 *   Aggregate Risk Score = mean of RAW scores (sheet: 12.25; Go/No-Go gate ≤ 15)
 *   per-risk RAG = Green ≤ 0.6×threshold, Amber ≤ threshold, else Red (on residual)
 */
import {
  type ComputedMetric,
  type MetricContribution,
  type RagStatus,
  ragForResidualRisk,
} from './metricContract';
import {
  AGENTIC_RISK_CATALOG,
  type AgenticRisk,
  rawScore,
  residualOf,
  aggregateRawScore,
  aggregateResidualScore,
} from './agenticRiskCatalog';

/** Go/No-Go gate: aggregate raw risk score must be ≤ this (workbook). */
export const RISK_GO_THRESHOLD = 15;

export interface RiskMetricRow extends ComputedMetric {
  velocity: AgenticRisk['velocity'];
  leadingIndicator: string;
  raw: number;
  residual: number;
  riskThreshold: number;
  controlEffectiveness: number;
}

/** Per-risk residual rows (management tier), one per catalog category. */
export function riskMetricRows(catalog: AgenticRisk[] = AGENTIC_RISK_CATALOG): RiskMetricRow[] {
  return catalog.map(r => {
    const raw = rawScore(r);
    const residual = residualOf(r);
    const threshold = r.threshold;
    const rag: RagStatus = ragForResidualRisk(residual, threshold);
    return {
      id: `risk.${r.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
      label: r.category,
      tier: 'management',
      owningModule: 'risk',
      cadence: 'monthly',
      polarity: 'lower-is-better',
      unit: 'score',
      expected: threshold,
      actual: residual,
      target: Math.round(threshold * 0.6 * 100) / 100,
      owner: r.owner,
      source: 'Govern · Agentic Risk Register',
      variance: residual - threshold,
      variancePct: threshold === 0 ? null : (residual - threshold) / threshold,
      rag,
      velocity: r.velocity,
      leadingIndicator: r.leadingIndicator,
      raw,
      residual,
      riskThreshold: threshold,
      controlEffectiveness: r.controlEffectiveness,
    };
  });
}

/** Board-level Aggregate Risk Score — the Go/No-Go gate feed.
 *  Uses the MEAN OF RAW SCORES to match the workbook (sheet: 12.25, gate ≤ 15). */
export function aggregateRiskMetric(catalog: AgenticRisk[] = AGENTIC_RISK_CATALOG): ComputedMetric {
  const aggregate = aggregateRawScore(catalog);
  const rag: RagStatus = ragForResidualRisk(aggregate, RISK_GO_THRESHOLD);
  return {
    id: 'risk.aggregate-score',
    label: 'Aggregate Risk Score',
    tier: 'board',
    owningModule: 'risk',
    cadence: 'monthly',
    polarity: 'lower-is-better',
    unit: 'score',
    expected: RISK_GO_THRESHOLD,
    actual: aggregate,
    target: 10,
    owner: 'CRO',
    source: 'Govern · Agentic Risk Register (mean of L×I scores)',
    variance: aggregate - RISK_GO_THRESHOLD,
    variancePct: (aggregate - RISK_GO_THRESHOLD) / RISK_GO_THRESHOLD,
    rag,
  };
}

/** Post-control residual posture (sheet also reports this: 7.125). Management tier. */
export function residualPostureMetric(catalog: AgenticRisk[] = AGENTIC_RISK_CATALOG): ComputedMetric {
  const residual = aggregateResidualScore(catalog);
  return {
    id: 'risk.residual-posture',
    label: 'Residual Risk (post-control)',
    tier: 'management',
    owningModule: 'risk',
    cadence: 'monthly',
    polarity: 'lower-is-better',
    unit: 'score',
    expected: RISK_GO_THRESHOLD,
    actual: residual,
    target: 10,
    owner: 'CRO',
    source: 'Govern · Agentic Risk Register (mean residual)',
    variance: residual - RISK_GO_THRESHOLD,
    variancePct: (residual - RISK_GO_THRESHOLD) / RISK_GO_THRESHOLD,
    rag: ragForResidualRisk(residual, RISK_GO_THRESHOLD),
  };
}

/** The full Risk module contribution to the shared scorecard. */
export function riskContribution(generatedAt: string): MetricContribution {
  const rows = riskMetricRows();
  return {
    owningModule: 'risk',
    generatedAt,
    metrics: [aggregateRiskMetric(), residualPostureMetric(), ...rows],
  };
}
