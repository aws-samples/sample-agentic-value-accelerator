/**
 * agenticRiskCatalog — the canonical agentic-AI risk register, faithful to the
 * "AWS Agentic AI Enterprise Metrics" workbook's Risk & Governance sheet.
 *
 * These are the 12 named risk categories the workbook scores (Likelihood × Impact,
 * threshold, control effectiveness, residual, velocity, leading indicator). The
 * board-level Aggregate Risk Score and its Go/No-Go gate are defined against this
 * set — the sheet reports aggregate = 12.25 (mean of RAW L×I scores; gate ≤ 15).
 *
 * This lives alongside the metric contract (rather than in risk/riskData.ts) so
 * the enterprise-metrics feed has a single, spec-faithful source that doesn't
 * disturb the separate operational risk register used by the Risk Management tabs.
 */

export interface AgenticRisk {
  category: string;
  likelihood: number;        // 1-5
  impact: number;            // 1-5
  threshold: number;         // residual must stay under this
  controlEffectiveness: number; // 0-1
  velocity: 'slow' | 'medium' | 'immediate';
  leadingIndicator: string;
  owner: string;
  mitigationStatus: 'Not Started' | 'In Progress' | 'Implemented';
}

/** rawScore = likelihood × impact (workbook "Risk Score", max 25). */
export function rawScore(r: AgenticRisk): number {
  return r.likelihood * r.impact;
}

/** residual = rawScore × (1 − controlEffectiveness) (workbook formula). */
export function residualOf(r: AgenticRisk): number {
  return Math.round(rawScore(r) * (1 - r.controlEffectiveness) * 100) / 100;
}

/** The 12 categories, values verbatim from the workbook Risk & Governance sheet. */
export const AGENTIC_RISK_CATALOG: AgenticRisk[] = [
  { category: 'Data Bias / Fairness',            likelihood: 2, impact: 3, threshold: 9,  controlEffectiveness: 0.40, velocity: 'slow',      leadingIndicator: 'Bias drift score >5% monthly',       owner: 'AI Ethics Lead',   mitigationStatus: 'In Progress' },
  { category: 'Model Drift',                     likelihood: 3, impact: 3, threshold: 12, controlEffectiveness: 0.45, velocity: 'medium',    leadingIndicator: 'PSI >0.2 weekly; accuracy <90%',     owner: 'ML Lead',          mitigationStatus: 'In Progress' },
  { category: 'Data Privacy (GDPR)',             likelihood: 3, impact: 4, threshold: 10, controlEffectiveness: 0.50, velocity: 'medium',    leadingIndicator: 'PII exposure incidents >0',          owner: 'DPO',              mitigationStatus: 'Implemented' },
  { category: 'Hallucination Risk',              likelihood: 4, impact: 4, threshold: 12, controlEffectiveness: 0.45, velocity: 'immediate', leadingIndicator: 'Hallucination rate >5%; RAG miss >10%', owner: 'ML Lead',        mitigationStatus: 'In Progress' },
  { category: 'Output Quality Drift',            likelihood: 3, impact: 3, threshold: 12, controlEffectiveness: 0.40, velocity: 'medium',    leadingIndicator: 'Quality score <85% weekly',          owner: 'Quality Lead',     mitigationStatus: 'In Progress' },
  { category: 'IP / Copyright Leakage',          likelihood: 2, impact: 4, threshold: 10, controlEffectiveness: 0.50, velocity: 'medium',    leadingIndicator: 'Copyright match >0 per batch',       owner: 'Legal',            mitigationStatus: 'Implemented' },
  { category: 'Prompt Injection',                likelihood: 3, impact: 4, threshold: 10, controlEffectiveness: 0.45, velocity: 'immediate', leadingIndicator: 'Injection attempts >0 daily',        owner: 'Security Lead',    mitigationStatus: 'In Progress' },
  { category: 'Decision Authority Scope',        likelihood: 3, impact: 4, threshold: 12, controlEffectiveness: 0.35, velocity: 'medium',    leadingIndicator: 'Out-of-scope decisions >0',          owner: 'Governance Lead',  mitigationStatus: 'In Progress' },
  { category: 'Autonomous Decision Liability',   likelihood: 4, impact: 5, threshold: 15, controlEffectiveness: 0.35, velocity: 'immediate', leadingIndicator: 'Unreviewed decisions >threshold',    owner: 'Legal',            mitigationStatus: 'Not Started' },
  { category: 'Emergent Behavior',               likelihood: 4, impact: 4, threshold: 12, controlEffectiveness: 0.40, velocity: 'immediate', leadingIndicator: 'Anomalous output patterns >2σ',      owner: 'ML Lead',          mitigationStatus: 'In Progress' },
  { category: 'Multi-Agent Coordination Failure', likelihood: 3, impact: 5, threshold: 12, controlEffectiveness: 0.35, velocity: 'immediate', leadingIndicator: 'Coordination failures >0 weekly',   owner: 'ML Lead',          mitigationStatus: 'In Progress' },
  { category: 'EU AI Act High-Risk Classification', likelihood: 3, impact: 4, threshold: 10, controlEffectiveness: 0.50, velocity: 'slow',   leadingIndicator: 'Compliance gap score >0',            owner: 'Compliance Lead',  mitigationStatus: 'Implemented' },
];

/** Aggregate Risk Score = mean of RAW scores (workbook headline; gate ≤ 15). */
export function aggregateRawScore(catalog: AgenticRisk[] = AGENTIC_RISK_CATALOG): number {
  if (!catalog.length) return 0;
  const mean = catalog.reduce((s, r) => s + rawScore(r), 0) / catalog.length;
  return Math.round(mean * 100) / 100;
}

/** Mean of residual scores (the post-control posture; sheet also reports 7.125). */
export function aggregateResidualScore(catalog: AgenticRisk[] = AGENTIC_RISK_CATALOG): number {
  if (!catalog.length) return 0;
  const mean = catalog.reduce((s, r) => s + residualOf(r), 0) / catalog.length;
  return Math.round(mean * 100) / 100;
}
