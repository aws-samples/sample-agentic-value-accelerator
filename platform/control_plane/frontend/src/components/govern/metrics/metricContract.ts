/**
 * metricContract — PROPOSED shared metric contract for AVA value/observability metrics.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ STATUS: PROPOSED — authored inside the Govern module for now.             │
 * │ This is the single shared vocabulary both Plan (scorecard / business      │
 * │ case) and Govern (risk, data governance, FinOps) can key off so the SAME  │
 * │ metric means the SAME thing in both places. It intentionally lives under  │
 * │ components/govern/ until the Plan owner + steering align on it; when       │
 * │ ratified it should graduate to the shared layer (src/api or src/types).   │
 * │ Nothing in Plan is edited by shipping this file.                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Design principles:
 *  - Single source of truth per metric: each metric is OWNED + computed by one
 *    module and READ by the other. Neither side recomputes the other's numbers.
 *  - Compute RAG + variance ONCE (here) so "Amber"/"on-track" render identically
 *    everywhere. (Formulas mirror the enterprise metrics workbook's rules.)
 *  - Join on the entity IDs both modules already share (use_case_id, agent_id,
 *    business_case_id) so a Govern metric and a Plan metric can refer to the
 *    same subject and deep-link to each other with context.
 *
 * Reference: "AWS Agentic AI Enterprise Metrics" workbook — 12 Board → 30
 * Management → 167 Diagnostic KPI tiers; RAG + residual-risk formulas from its
 * Configuration & Lookups sheet.
 */

// ─────────────────────────── Core enums ───────────────────────────

/** Which module is the source of truth for a metric. Read-only elsewhere. */
export type OwningModule =
  | 'plan'        // scorecard, DCF/NPV, maturity, adoption — Plan owns
  | 'risk'        // risk register, residual/aggregate risk — Govern Risk owns
  | 'data'        // data quality/lineage/PII — Govern Data Governance owns
  | 'model'       // model accuracy/drift/bias — Govern Model Management owns
  | 'finops'      // operational cost/efficiency + ROI — Govern FinOps owns
  | 'audit';      // incident resolution / audit trail — Govern Audit & Incidents owns

/** KPI tier from the workbook's "Rule of 12" architecture. */
export type MetricTier = 'board' | 'management' | 'diagnostic';

/** Review cadence (workbook Reporting Cadences sheet). */
export type MetricCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

/** RAG status — the shared status vocabulary. Maps to StatCard variants. */
export type RagStatus = 'green' | 'amber' | 'red' | 'na';

/**
 * Direction of "good": most metrics improve as actual approaches/exceeds target
 * (higher-is-better). Costs/incident-rates are lower-is-better, which flips the
 * RAG banding. Risk residual is its own scheme (see ragForResidualRisk).
 */
export type MetricPolarity = 'higher-is-better' | 'lower-is-better';

// ─────────────────────────── Metric shape ───────────────────────────

/** The optional entity this metric is scoped to — the cross-module join key. */
export interface MetricSubject {
  useCaseId?: string;        // Plan use_case_id
  businessCaseId?: string;   // Plan business_case_id
  agentId?: string;          // Govern/registry agent_id
}

export interface Metric {
  /** Stable identifier, unique across the platform (e.g. 'risk.aggregate-score'). */
  id: string;
  label: string;
  tier: MetricTier;
  owningModule: OwningModule;
  cadence: MetricCadence;
  polarity: MetricPolarity;
  unit?: string;             // '%', '$K', 'ms', 'score', etc. (display only)

  expected?: number | null;  // plan/target baseline for the period
  actual?: number | null;    // measured value (null = not yet captured)
  target?: number | null;    // aspirational/threshold target

  /** Optional entity scope — enables Plan<->Govern deep-linking with context. */
  subject?: MetricSubject;

  owner?: string;            // accountable role (RACI)
  source?: string;           // where the actual comes from (sheet/system)
  asOf?: string;             // ISO date the actual was captured
  note?: string;
}

/** A metric with its computed status fields resolved (compute once, read many). */
export interface ComputedMetric extends Metric {
  variance: number | null;      // actual - expected (absolute)
  variancePct: number | null;   // (actual - expected) / |expected|
  rag: RagStatus;
}

// ─────────────────── Shared RAG + variance rules ───────────────────
// These mirror the workbook's Configuration & Lookups formulas so Plan and
// Govern band identically. Change them HERE only.

/** Default RAG thresholds on variance % (workbook: Green ≤5%, Amber ≤15%). */
export const RAG_THRESHOLDS = { green: 0.05, amber: 0.15 } as const;

export function computeVariance(expected?: number | null, actual?: number | null): {
  variance: number | null;
  variancePct: number | null;
} {
  if (expected == null || actual == null) return { variance: null, variancePct: null };
  const variance = actual - expected;
  const variancePct = expected === 0 ? null : variance / Math.abs(expected);
  return { variance, variancePct };
}

/**
 * RAG for a target-vs-actual metric. Polarity flips the sign that counts as
 * "underperformance": higher-is-better dislikes negative variance; lower-is-
 * better (costs) dislikes positive variance.
 */
export function ragForVariance(
  variancePct: number | null,
  polarity: MetricPolarity,
): RagStatus {
  if (variancePct == null) return 'na';
  // Signed shortfall: positive = worse than expected, regardless of polarity.
  const shortfall = polarity === 'higher-is-better' ? -variancePct : variancePct;
  if (shortfall <= RAG_THRESHOLDS.green) return 'green';
  if (shortfall <= RAG_THRESHOLDS.amber) return 'amber';
  return 'red';
}

/**
 * Residual-risk RAG (workbook Risk & Governance rule): differentiated by each
 * risk's own threshold. Green ≤ 60% of threshold, Amber ≤ threshold, else Red.
 */
export function ragForResidualRisk(residual: number, threshold: number): RagStatus {
  if (threshold <= 0) return 'na';
  if (residual <= threshold * 0.6) return 'green';
  if (residual <= threshold) return 'amber';
  return 'red';
}

/** Residual = raw score × (1 - control effectiveness). Workbook formula. */
export function residualRisk(rawScore: number, controlEffectiveness: number): number {
  const eff = Math.min(1, Math.max(0, controlEffectiveness));
  return Math.round(rawScore * (1 - eff) * 100) / 100;
}

/** Resolve a raw Metric into a ComputedMetric (variance + RAG computed once). */
export function computeMetric(m: Metric): ComputedMetric {
  const { variance, variancePct } = computeVariance(m.expected, m.actual);
  return { ...m, variance, variancePct, rag: ragForVariance(variancePct, m.polarity) };
}

// ─────────────────── Display helpers (shared semantics) ───────────────────

/** Format a metric value for display, consistently across all panels.
 *  '%' values are stored as 0-1 fractions and rendered as percentages. */
export function formatMetricValue(value: number | null | undefined, unit?: string): string {
  if (value == null) return '—';
  switch (unit) {
    case '%': return `${Math.round(value * 1000) / 10}%`;
    case 'x': return `${value}x`;
    case 'min': return `${value} min`;
    case '$K': return `$${value}K`;
    case '$': return `$${value}`;
    case 'count':
    case 'score':
    case undefined: return `${value}`;
    default: return `${value} ${unit}`;
  }
}

/** Map RAG to the existing StatCard variant vocabulary for consistent color. */
export function ragToStatCardVariant(rag: RagStatus): 'success' | 'warning' | 'danger' | 'muted' {
  switch (rag) {
    case 'green': return 'success';
    case 'amber': return 'warning';
    case 'red': return 'danger';
    default: return 'muted';
  }
}

export const RAG_META: Record<RagStatus, { label: string; badge: string }> = {
  green: { label: 'On Track', badge: 'bg-emerald-100 text-emerald-700' },
  amber: { label: 'Attention', badge: 'bg-amber-100 text-amber-700' },
  red:   { label: 'Off Track', badge: 'bg-rose-100 text-rose-700' },
  na:    { label: 'No Data', badge: 'bg-slate-100 text-slate-500' },
};

/**
 * A module's contribution to the shared scorecard. Each Govern module exposes
 * one of these; Plan aggregates them into the board KPIs / Go-No-Go gate WITHOUT
 * recomputing. This is the read-contract shape the deep-link + reconciliation
 * both rely on.
 */
export interface MetricContribution {
  owningModule: OwningModule;
  generatedAt: string;
  metrics: ComputedMetric[];
}
