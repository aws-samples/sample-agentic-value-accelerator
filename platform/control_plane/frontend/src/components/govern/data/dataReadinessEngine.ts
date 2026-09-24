/**
 * dataReadiness — ONE data-governance readiness / maturity scoring engine
 *
 * Single source of truth for the data-governance module's shared readiness and
 * maturity math. The same computations were previously duplicated — with divergent
 * denominators — across useDataReadiness, useDataQuality, useDataGovernance,
 * DataMaturity, DataReadiness and DataGovernanceLanding. Consolidating them here
 * guarantees every surface pools scores the SAME way, against ONE denominator.
 *
 * This module does not fetch data or render UI: callers keep their own live-signal
 * fetching and their own display. Only the scoring is unified, so the honest
 * `.live`-gated / "Derived" badges each surface shows stay intact.
 *
 * It also owns the ADOPTION MATURITY ladder (`computeAdoptionMaturity`) alongside the
 * shared pooling math, so both of the module's scales are declared in one file and the
 * "never rescale one into the other" invariant is stated where it can be enforced.
 */

import { MATURITY_QUESTIONS, MATURITY_LEVELS } from './dataGovernanceData';

/**
 * Shared target for the "unique PII entity types protected" coverage metric.
 * Used by DataReadiness, DataQuality, useDataGovernance and DataGovernanceLanding
 * so the same PII metric is scored against ONE denominator everywhere instead of
 * the previous 20 / 25 / 10 divergence.
 */
export const PII_COVERAGE_TARGET = 20;

/**
 * The data-governance module scores TWO different things on TWO different scales.
 * Both scales are declared here so no surface can silently rescale one into the other:
 *
 * - CONTROL READINESS (0-100) — "are the controls in place and effective?" Derived from
 *   live AWS control-plane signals (Guardrails, Bedrock invocation logs, AWS Config,
 *   Security Hub, Service Approvals, Glue Data Quality). Built by `useDataReadiness`.
 * - ADOPTION MATURITY (0-5 levels) — "how far along is the organisation?" Derived from
 *   human self-assessment (maturity survey, use-case scoring) and platform inventory
 *   (deployment count). Built by `computeAdoptionMaturity` below.
 *
 * They answer different questions and MUST NOT be mixed, averaged, or converted into
 * each other's units. A 0-5 maturity level is not a readiness percentage, and dividing
 * a readiness percentage by 20 does not produce a maturity level.
 */
export const READINESS_MAX_SCORE = 100;
export const ADOPTION_MAX_LEVEL = 5;

/** A scorable dimension: a raw score out of a per-dimension maximum. */
export interface PooledScoreItem {
  score: number;
  maxScore: number;
}

/**
 * Pool a set of dimension scores into a single 0-100 coverage percentage using
 * ONE denominator: Sum(score) / Sum(maxScore) * 100 (rounded). Returns 0 when no
 * applicable maximum exists so an empty set cannot divide by zero. This is the
 * canonical pooled coverage math for the data-governance readiness surfaces.
 */
export function pooledScore(items: PooledScoreItem[]): number {
  const totalScore = items.reduce((sum, d) => sum + d.score, 0);
  const maxTotal = items.reduce((sum, d) => sum + d.maxScore, 0);
  return maxTotal > 0 ? Math.round((totalScore / maxTotal) * 100) : 0;
}

// ───────────────────── Adoption Maturity ladder (0-5 levels) ─────────────────────

/**
 * Inputs for the adoption-maturity ladder. Deliberately primitive so this engine
 * stays free of API DTO coupling — callers reduce their own fetched payloads down
 * to these values and keep their own live-signal handling.
 */
export interface AdoptionMaturityInputs {
  /** Data-dimension average (0-5) from the latest maturity self-assessment, or null if none. */
  maturityDataScore: number | null;
  /** Name of the assessment the score came from, for provenance display. */
  assessmentName: string | null;
  /** Whether the maturity-assessment feed was fetched successfully. */
  maturityLoaded: boolean;
  /** Per-use-case human-entered data-readiness scores (0-5). */
  useCaseDataReadinessScores: number[];
  /** Whether the use-case feed was fetched successfully. */
  useCasesLoaded: boolean;
  /** Number of agent deployments on the platform. */
  deploymentCount: number;
  /** Whether the deployments feed was fetched successfully. */
  deploymentsLoaded: boolean;
}

export interface AdoptionMaturityDimension {
  id: string;
  name: string;
  /** Level achieved, 0..ADOPTION_MAX_LEVEL. Only meaningful when `measured` is true. */
  score: number;
  maxScore: number;
  /**
   * Whether the underlying signal actually exists. `false` means "nobody has assessed
   * this yet" (no survey submitted / no scored use cases / feed unavailable) rather than
   * "level 0", so the dimension is excluded from the pooled percentage instead of
   * dragging it down — mirroring the `scored` gate on the control-readiness ladder.
   */
  measured: boolean;
  source: string;
  sourceDetail: string;
}

export interface AdoptionMaturityResult {
  /** All dimensions, including unmeasured ones (shown as "not assessed"). */
  dimensions: AdoptionMaturityDimension[];
  /** Only the dimensions backed by a real signal. */
  measuredDimensions: AdoptionMaturityDimension[];
  /** Sum of levels achieved across MEASURED dimensions. */
  levelsAchieved: number;
  /** Sum of the maximum levels available across MEASURED dimensions. */
  levelsPossible: number;
  /** Pooled 0-100 coverage of the MEASURED maturity levels. NOT a readiness score. */
  pooledPct: number;
}

/**
 * Score the ADOPTION MATURITY ladder (0-5 levels per dimension).
 *
 * These three dimensions measure adoption and self-assessed maturity — they are
 * deliberately NOT control-effectiveness signals, and they intentionally do not
 * overlap with the control-readiness dimensions in `useDataReadiness` (Data
 * Protection, PII Coverage, Audit Trail, Compliance, Security, Access Governance,
 * Data Quality). Those four used to be duplicated here on a 0-5 scale and produced
 * contradictory numbers for the same input; they now live only on the readiness ladder.
 */
export function computeAdoptionMaturity(inputs: AdoptionMaturityInputs): AdoptionMaturityResult {
  const {
    maturityDataScore,
    assessmentName,
    maturityLoaded,
    useCaseDataReadinessScores,
    useCasesLoaded,
    deploymentCount,
    deploymentsLoaded,
  } = inputs;

  const useCaseCount = useCaseDataReadinessScores.length;
  const useCaseAvg = useCaseCount > 0
    ? useCaseDataReadinessScores.reduce((sum, v) => sum + v, 0) / useCaseCount
    : 0;

  const dimensions: AdoptionMaturityDimension[] = [
    {
      id: 'data-maturity',
      name: 'Data Maturity',
      score: maturityDataScore != null ? Math.round(maturityDataScore) : 0,
      maxScore: ADOPTION_MAX_LEVEL,
      measured: maturityLoaded && maturityDataScore != null,
      source: 'Maturity Assessment (self-reported)',
      sourceDetail: maturityDataScore != null && assessmentName
        ? `Data dimension of "${assessmentName}"`
        : 'No maturity assessment submitted',
    },
    {
      id: 'use-case-readiness',
      name: 'Use Case Data Readiness',
      score: Math.round(useCaseAvg),
      maxScore: ADOPTION_MAX_LEVEL,
      measured: useCasesLoaded && useCaseCount > 0,
      source: 'Use Case Prioritization (human-scored)',
      sourceDetail: useCaseCount > 0
        ? `Mean of ${useCaseCount} scored use case${useCaseCount === 1 ? '' : 's'}`
        : 'No use cases scored for data readiness',
    },
    {
      id: 'agent-data-integration',
      name: 'Agent Data Integration',
      // Identical to the previous min(5, ceil(count / 5 * 5)) — one level per deployed
      // agent, capped at the top level — written plainly.
      score: Math.min(ADOPTION_MAX_LEVEL, deploymentCount),
      maxScore: ADOPTION_MAX_LEVEL,
      // A real zero: the deployments inventory is authoritative, so 0 agents is a
      // measured level 0, not an absent signal. Only a failed fetch is unmeasured.
      measured: deploymentsLoaded,
      source: 'Deployments API (platform inventory)',
      sourceDetail: `${deploymentCount} agent${deploymentCount === 1 ? '' : 's'} deployed`,
    },
  ];

  const measuredDimensions = dimensions.filter(d => d.measured);

  return {
    dimensions,
    measuredDimensions,
    levelsAchieved: measuredDimensions.reduce((sum, d) => sum + d.score, 0),
    levelsPossible: measuredDimensions.reduce((sum, d) => sum + d.maxScore, 0),
    pooledPct: pooledScore(measuredDimensions),
  };
}

export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export interface MaturityAssessmentResult {
  /** Number of dimensions answered so far. */
  answered: number;
  /** Total number of maturity dimensions. */
  total: number;
  /** Average score across ANSWERED dimensions (0 when none answered). */
  avgScore: number;
  /** Maturity level whose range contains avgScore (falls back to the first level). */
  level: MaturityLevel;
  /** Whether every dimension has been answered. */
  complete: boolean;
}

/**
 * Score a data-governance maturity self-assessment ONE consistent way.
 *
 * `answers` maps a question key (dimension name OR question index — both keying
 * schemes are used across the surfaces) to the selected option score. Only the
 * selected VALUES and their count matter, so either scheme yields the same result:
 *   avgScore = Sum(answered scores) / count(answered)
 *
 * The level is the MATURITY_LEVELS entry whose [min, max] range contains avgScore,
 * falling back to the first level (matches the prior per-component behaviour).
 */
export function computeMaturityAssessment<K extends PropertyKey>(
  answers: Record<K, number>,
): MaturityAssessmentResult {
  const scores: number[] = Object.values(answers);
  const answered = scores.length;
  const total = MATURITY_QUESTIONS.length;
  const avgScore = answered > 0 ? scores.reduce((sum, v) => sum + v, 0) / answered : 0;
  const level =
    MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1]) ?? MATURITY_LEVELS[0];
  return { answered, total, avgScore, level, complete: answered === total };
}
