/**
 * Risk Scoring Configuration and Utilities
 *
 * This module provides the risk tier calculation logic for Model Risk Management (MRM).
 *
 * ## Risk Tier Framework
 *
 * Models are classified into four risk tiers based on their inherent risk score (0-100):
 *
 * | Tier     | Score Range | Description                                      | Control Requirements        |
 * |----------|-------------|--------------------------------------------------|----------------------------|
 * | Critical | 75-100      | High-stakes decisions, regulatory impact         | Mandatory HITL, 60-day review |
 * | High     | 50-74       | Significant business impact, compliance scope    | HITL recommended, 90-day review |
 * | Medium   | 25-49       | Moderate impact, standard operations             | Automated controls, 180-day review |
 * | Low      | 0-24        | Low impact, high volume, well-understood         | Basic monitoring, annual review |
 *
 * ## Inherent Risk Scoring Factors
 *
 * The inherent risk score is computed from multiple dimensions:
 *
 * 1. **Use Case Criticality (0-25 points)**
 *    - Financial decision-making (lending, trading): 20-25
 *    - Regulatory/compliance scope: 15-20
 *    - Customer-facing with consequences: 10-15
 *    - Internal operations: 5-10
 *    - Low-stakes classification: 0-5
 *
 * 2. **Data Sensitivity (0-25 points)**
 *    - PHI/HIPAA data: 20-25
 *    - PII/financial data: 15-20
 *    - Confidential business data: 10-15
 *    - Internal data: 5-10
 *    - Public data only: 0-5
 *
 * 3. **Autonomy Level (0-25 points)**
 *    - Fully autonomous decisions: 20-25
 *    - Autonomous with exception escalation: 15-20
 *    - Human-in-the-loop for all decisions: 10-15
 *    - Advisory/recommendation only: 5-10
 *    - Information retrieval only: 0-5
 *
 * 4. **Model Complexity (0-25 points)**
 *    - Agentic/multi-step reasoning: 20-25
 *    - Complex reasoning (Opus-class): 15-20
 *    - Standard reasoning (Sonnet-class): 10-15
 *    - Simple classification (Haiku-class): 5-10
 *    - Deterministic/rule-based: 0-5
 *
 * ## Residual Risk Calculation
 *
 * Residual risk = Inherent risk - Control mitigations
 *
 * Each control has a mitigation value (points it reduces from inherent score).
 * Only "active" controls contribute to mitigation.
 *
 * ## Regulatory Alignment
 *
 * This framework aligns with:
 * - SR 26-2 (US Fed): Model risk tiering and proportionate controls
 * - OSFI E-23 (Canada): Materiality-based governance
 * - NIST AI RMF: Risk mapping and measurement
 * - EU AI Act: Risk classification (maps Critical/High to "High Risk AI")
 */

export type RiskTier = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RiskTierConfig {
  tier: RiskTier;
  minScore: number;
  maxScore: number;
  color: string;
  bgColor: string;
  textColor: string;
  description: string;
  revalidationDays: number;
  hitlRequired: boolean;
  euAiActClassification: string;
}

/**
 * Risk tier thresholds - configurable for organizational needs
 * Scores are 0-100, higher = more risk
 */
export const RISK_TIER_CONFIG: RiskTierConfig[] = [
  {
    tier: 'Critical',
    minScore: 75,
    maxScore: 100,
    color: '#991b1b',
    bgColor: 'bg-rose-100',
    textColor: 'text-rose-700',
    description: 'High-stakes decisions with significant regulatory, financial, or safety implications',
    revalidationDays: 60,
    hitlRequired: true,
    euAiActClassification: 'High Risk (Art. 6)',
  },
  {
    tier: 'High',
    minScore: 50,
    maxScore: 74,
    color: '#ea580c',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    description: 'Significant business impact with compliance or customer consequence potential',
    revalidationDays: 90,
    hitlRequired: true,
    euAiActClassification: 'High Risk (Art. 6)',
  },
  {
    tier: 'Medium',
    minScore: 25,
    maxScore: 49,
    color: '#d97706',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    description: 'Moderate operational impact with standard risk controls sufficient',
    revalidationDays: 180,
    hitlRequired: false,
    euAiActClassification: 'Limited Risk (Art. 52)',
  },
  {
    tier: 'Low',
    minScore: 0,
    maxScore: 24,
    color: '#16a34a',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    description: 'Low impact operations with well-understood behavior and minimal consequence',
    revalidationDays: 365,
    hitlRequired: false,
    euAiActClassification: 'Minimal Risk',
  },
];

/**
 * Risk scoring dimensions with weights
 */
export interface RiskScoringDimension {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  levels: { label: string; points: number; description: string }[];
}

export const RISK_SCORING_DIMENSIONS: RiskScoringDimension[] = [
  {
    id: 'use-case-criticality',
    name: 'Use Case Criticality',
    description: 'Business impact and regulatory scope of the use case',
    maxPoints: 25,
    levels: [
      { label: 'Financial Decision-Making', points: 25, description: 'Lending, trading, underwriting decisions' },
      { label: 'Regulatory/Compliance', points: 20, description: 'BSA/AML, fraud detection, regulatory reporting' },
      { label: 'Customer-Facing Consequential', points: 15, description: 'Claims adjudication, account actions' },
      { label: 'Internal Operations', points: 10, description: 'Process automation, document processing' },
      { label: 'Low-Stakes Classification', points: 5, description: 'Routing, triage, information lookup' },
    ],
  },
  {
    id: 'data-sensitivity',
    name: 'Data Sensitivity',
    description: 'Classification level of data accessed by the model',
    maxPoints: 25,
    levels: [
      { label: 'PHI/HIPAA', points: 25, description: 'Protected health information' },
      { label: 'PII/Financial', points: 20, description: 'SSN, account numbers, credit data' },
      { label: 'Confidential Business', points: 15, description: 'Trade secrets, strategy, internal financials' },
      { label: 'Internal Only', points: 10, description: 'Internal communications, operational data' },
      { label: 'Public Data', points: 5, description: 'Publicly available information only' },
    ],
  },
  {
    // NOTE: This is a RISK-SCORING DIMENSION, not the governance autonomy ladder.
    // It is deliberately distinct from the canonical AGENT_SCOPE_META (L1-L4) in
    // autonomyLadder.ts: these 5 bands map to 0-25 points feeding the 0-100
    // inherent-risk score, so collapsing them to 4 would change the risk math.
    // Rough alignment to canonical scopes: Information Retrieval/Advisory ~ L1,
    // Human-in-the-Loop ~ L2, Autonomous-with-Escalation ~ L3, Fully Autonomous ~ L4.
    id: 'autonomy-level',
    name: 'Autonomy Level',
    description: 'Degree of autonomous decision-making without human review',
    maxPoints: 25,
    levels: [
      { label: 'Fully Autonomous', points: 25, description: 'Executes decisions without human approval' },
      { label: 'Autonomous with Escalation', points: 20, description: 'Autonomous for normal cases, escalates exceptions' },
      { label: 'Human-in-the-Loop', points: 15, description: 'All decisions require human approval' },
      { label: 'Advisory Only', points: 10, description: 'Provides recommendations, human decides' },
      { label: 'Information Retrieval', points: 5, description: 'Retrieves/summarizes information only' },
    ],
  },
  {
    id: 'model-complexity',
    name: 'Model Complexity',
    description: 'Complexity of the model architecture and reasoning',
    maxPoints: 25,
    levels: [
      { label: 'Agentic/Multi-Step', points: 25, description: 'Multi-agent orchestration, tool use, planning' },
      { label: 'Complex Reasoning', points: 20, description: 'Extended thinking, complex analysis (Opus-class)' },
      { label: 'Standard Reasoning', points: 15, description: 'General-purpose reasoning (Sonnet-class)' },
      { label: 'Simple Tasks', points: 10, description: 'Classification, extraction (Haiku-class)' },
      { label: 'Deterministic', points: 5, description: 'Rule-based, templated responses' },
    ],
  },
];

/**
 * Get risk tier from a numeric score (0-100)
 */
export function getRiskTierFromScore(score: number): RiskTier {
  const clampedScore = Math.max(0, Math.min(100, score));
  for (const config of RISK_TIER_CONFIG) {
    if (clampedScore >= config.minScore && clampedScore <= config.maxScore) {
      return config.tier;
    }
  }
  return 'Low'; // Default fallback
}

/**
 * Get full tier configuration from a score
 */
export function getRiskTierConfig(score: number): RiskTierConfig {
  const tier = getRiskTierFromScore(score);
  return RISK_TIER_CONFIG.find(c => c.tier === tier) || RISK_TIER_CONFIG[3];
}

/**
 * Get tier configuration by tier name
 */
export function getRiskTierConfigByName(tier: RiskTier): RiskTierConfig {
  return RISK_TIER_CONFIG.find(c => c.tier === tier) || RISK_TIER_CONFIG[3];
}

/**
 * Calculate inherent risk score from dimension scores
 */
export function calculateInherentRiskScore(dimensionScores: Record<string, number>): number {
  let total = 0;
  for (const dim of RISK_SCORING_DIMENSIONS) {
    const score = dimensionScores[dim.id] || 0;
    total += Math.min(score, dim.maxPoints);
  }
  return Math.min(100, total);
}

/**
 * Calculate residual risk score after applying control mitigations
 */
export function calculateResidualRiskScore(
  inherentScore: number,
  controls: { mitigation: number; status: 'active' | 'planned' | 'not-started' }[]
): number {
  const activeMitigation = controls
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + c.mitigation, 0);

  return Math.max(0, inherentScore - activeMitigation);
}

/**
 * Calculate the risk reduction percentage
 */
export function calculateRiskReduction(inherentScore: number, residualScore: number): number {
  if (inherentScore === 0) return 0;
  return Math.round(((inherentScore - residualScore) / inherentScore) * 100);
}

/**
 * Check if a model meets the required controls for its risk tier
 */
export function validateControlsForTier(
  tier: RiskTier,
  controls: { status: 'active' | 'planned' | 'not-started' }[],
  hasHumanOversight: boolean
): { valid: boolean; gaps: string[] } {
  const config = getRiskTierConfigByName(tier);
  const gaps: string[] = [];

  if (config.hitlRequired && !hasHumanOversight) {
    gaps.push('Human-in-the-loop oversight required for this risk tier');
  }

  const activeControls = controls.filter(c => c.status === 'active').length;
  const totalControls = controls.length;

  if (tier === 'Critical' && activeControls < totalControls) {
    gaps.push('All controls must be active for Critical tier models');
  }

  if (tier === 'High' && activeControls / totalControls < 0.8) {
    gaps.push('At least 80% of controls must be active for High tier models');
  }

  return { valid: gaps.length === 0, gaps };
}

/**
 * Get color utilities for a risk tier
 */
export function getRiskTierColors(tier: RiskTier): { bg: string; text: string; color: string } {
  const config = getRiskTierConfigByName(tier);
  return {
    bg: config.bgColor,
    text: config.textColor,
    color: config.color,
  };
}

/**
 * Format risk score for display
 */
export function formatRiskScore(score: number): string {
  return `${Math.round(score)}/100`;
}

/**
 * Canonical Tailwind text-color class for a 0-100 risk score.
 * Routes through getRiskTierFromScore so every screen uses the same
 * 75/50/25 thresholds (Critical/High/Medium/Low) instead of ad-hoc cutoffs.
 */
export function getRiskScoreTextColor(score: number): string {
  const tier = getRiskTierFromScore(score);
  return getRiskTierConfigByName(tier).textColor;
}

/**
 * Canonical Tailwind badge classes (bg + text) for a 0-100 risk score.
 */
export function getRiskScoreBadge(score: number): string {
  const tier = getRiskTierFromScore(score);
  const c = getRiskTierConfigByName(tier);
  return `${c.bgColor} ${c.textColor}`;
}

/**
 * Get risk trend indicator
 */
export function getRiskTrend(
  currentScore: number,
  previousScore: number
): { direction: 'up' | 'down' | 'stable'; delta: number } {
  const delta = currentScore - previousScore;
  if (Math.abs(delta) < 2) return { direction: 'stable', delta: 0 };
  return { direction: delta > 0 ? 'up' : 'down', delta };
}

/**
 * Determine if residual risk is acceptable given inherent risk tier
 * Critical/High inherent risks must reduce to Medium or lower
 */
export function isResidualRiskAcceptable(inherentTier: RiskTier, residualTier: RiskTier): boolean {
  if (inherentTier === 'Critical' || inherentTier === 'High') {
    return residualTier === 'Medium' || residualTier === 'Low';
  }
  return true; // Medium and Low inherent risks have no reduction requirement
}

/**
 * Get recommended revalidation date based on risk tier
 */
export function getRevalidationDate(tier: RiskTier, lastValidationDate: Date): Date {
  const config = getRiskTierConfigByName(tier);
  const nextDate = new Date(lastValidationDate);
  nextDate.setDate(nextDate.getDate() + config.revalidationDays);
  return nextDate;
}
