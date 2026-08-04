import type { PrioritizationScores, DimensionWeights, ComputedScore, GoNoGo } from '../../api/client';
import { SUB_CRITERIA } from './types';

function dimSubtotal(scores: Record<string, number>, dim: string): number {
  return SUB_CRITERIA[dim].reduce((acc, s) => acc + (scores[s.key] || 0) * s.weight, 0);
}

export function computeLocal(scores: PrioritizationScores, weights: DimensionWeights): ComputedScore {
  const bv = dimSubtotal(scores.business_value as any, 'business_value');
  const tf = dimSubtotal(scores.technical_feasibility as any, 'technical_feasibility');
  const rg = dimSubtotal(scores.risk_governance as any, 'risk_governance');
  const orr = dimSubtotal(scores.org_readiness as any, 'org_readiness');
  const sa = dimSubtotal(scores.strategic_alignment as any, 'strategic_alignment');
  const ce = dimSubtotal(scores.cost_efficiency as any, 'cost_efficiency');

  const subtotals = {
    business_value: round(bv),
    technical_feasibility: round(tf),
    risk_governance: round(rg),
    org_readiness: round(orr),
    strategic_alignment: round(sa),
    cost_efficiency: round(ce),
  };

  const composite = round(
    bv * weights.business_value
    + tf * weights.technical_feasibility
    + rg * weights.risk_governance
    + orr * weights.org_readiness
    + sa * weights.strategic_alignment
    + ce * weights.cost_efficiency
  );

  const rgScores = scores.risk_governance as any as Record<string, number>;
  const rgValues = Object.values(rgScores);
  const likelihood = 6 - Math.min(...rgValues);
  const impact = 6 - Math.min(rgScores.autonomous_decision_risk, rgScores.model_reliability);
  const risk_score = Math.max(1, Math.min(25, likelihood * impact));

  const readiness_score = round(orr);

  let go_no_go: GoNoGo;
  if (composite >= 3.5 && risk_score <= 15 && readiness_score >= 3.0) go_no_go = 'GO';
  else if (composite < 2.5 && risk_score > 20 && readiness_score < 2.0) go_no_go = 'NO GO';
  else go_no_go = 'CONDITIONAL GO';

  return { dimension_subtotals: subtotals as DimensionWeights, composite, risk_score, readiness_score, go_no_go };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function verdictColor(v: GoNoGo): string {
  if (v === 'GO') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (v === 'NO GO') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}
