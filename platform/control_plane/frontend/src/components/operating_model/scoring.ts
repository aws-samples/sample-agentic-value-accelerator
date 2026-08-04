import type {
  OperatingModelWeights,
  ComputedOperatingModel,
  DimensionResult,
  OperatingPattern,
  GovernanceApproach,
  InvestmentSplit,
  RoadmapPhase,
} from './types';
import { DIMENSIONS, QUESTION_CATALOG, LEVEL_NAMES } from './types';

const DIM_KEYS = DIMENSIONS.map((d) => d.key) as readonly string[];

function dimensionFor(qid: string): string | null {
  const pid = qid.trim().toUpperCase();
  if (pid.startsWith('STR')) return 'strategy';
  if (pid.startsWith('GOV')) return 'governance';
  if (pid.startsWith('ORG')) return 'organization';
  if (pid.startsWith('PEO')) return 'people';
  if (pid.startsWith('TEC')) return 'technology';
  if (pid.startsWith('PRO')) return 'process';
  if (pid.startsWith('ECO')) return 'ecosystem';
  return null;
}

export function recommendPattern(composite: number): OperatingPattern {
  if (composite >= 4.5) return 'Fully Federated';
  if (composite >= 3.6) return 'Federated + Central Gov';
  if (composite >= 3.0) return 'Hub-and-Spoke';
  if (composite >= 2.0) return 'CoE + BU Liaisons';
  return 'Centralized CoE';
}

export function recommendGovernance(composite: number): GovernanceApproach {
  if (composite >= 4.5) return 'Embedded in workflows';
  if (composite >= 3.6) return 'Automated central guardrails';
  if (composite >= 3.0) return 'Three-tier (Board · Council · Teams)';
  if (composite >= 2.0) return 'Formal AI Council';
  return 'Executive-sponsored / informal';
}

export function compute(
  scores: Record<string, number>,
  weights: OperatingModelWeights,
  roadmap: RoadmapPhase[],
  _investment: InvestmentSplit,
): ComputedOperatingModel {
  void _investment;
  const byDim: Record<string, number[]> = {};
  for (const k of DIM_KEYS) byDim[k] = [];

  for (const [pid, raw] of Object.entries(scores)) {
    const v = Math.trunc(raw);
    if (v < 1 || v > 5) continue;
    const d = dimensionFor(pid);
    if (!d) continue;
    byDim[d].push(v);
  }

  const dims: Record<string, DimensionResult> = {};
  let num = 0;
  let den = 0;
  let answered = 0;

  for (const d of DIMENSIONS) {
    const arr = byDim[d.key];
    const total = QUESTION_CATALOG[d.key].questions.length;
    const avg = arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const w = (weights as any)[d.key] ?? 0;
    const contrib = round(avg * w);
    dims[d.key] = {
      label: d.label,
      answered: arr.length,
      total,
      average: avg,
      weighted_contribution: contrib,
      level: avg ? Math.round(avg) : 0,
    };
    if (arr.length) {
      num += avg * w;
      den += w;
    }
    answered += arr.length;
  }

  const total = DIMENSIONS.reduce((s, d) => s + QUESTION_CATALOG[d.key].questions.length, 0);
  const composite = den ? round(num / den) : 0;
  const maturity_level = composite ? Math.round(composite) : 0;
  const recommended_pattern = recommendPattern(composite);
  const recommended_governance = recommendGovernance(composite);
  const total_investment_m = round(roadmap.filter((p) => p.enabled).reduce((s, p) => s + (p.investment_m || 0), 0));

  return {
    dimensions: dims,
    composite,
    maturity_level,
    recommended_pattern,
    recommended_governance,
    answered,
    total,
    completion: total ? round(answered / total) : 0,
    total_investment_m,
  };
}

function round(n: number) { return Math.round(n * 10000) / 10000; }

export function levelColor(level: number): string {
  if (level >= 5) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (level === 4) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (level === 3) return 'text-violet-700 bg-violet-50 border-violet-200';
  if (level === 2) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (level === 1) return 'text-red-700 bg-red-50 border-red-200';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

export function patternColor(pattern: OperatingPattern): string {
  switch (pattern) {
    case 'Fully Federated':           return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Federated + Central Gov':   return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'Hub-and-Spoke':             return 'text-violet-700 bg-violet-50 border-violet-200';
    case 'CoE + BU Liaisons':         return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Centralized CoE':           return 'text-red-700 bg-red-50 border-red-200';
  }
}

export function placementColor(p: 'Centralized' | 'Hub-and-Spoke' | 'Federated'): string {
  if (p === 'Centralized')   return 'bg-blue-50 text-blue-700 border-blue-200';
  if (p === 'Hub-and-Spoke') return 'bg-violet-50 text-violet-700 border-violet-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function levelTagline(level: number): string {
  return LEVEL_NAMES[level]?.tagline ?? '';
}
