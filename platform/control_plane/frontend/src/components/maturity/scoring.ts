import type { MaturityWeights, ComputedMaturity, DimensionResult } from '../../api/client';
import { CATALOG, DIMENSIONS } from './types';

const DIM_KEYS = DIMENSIONS.map((d) => d.key) as readonly string[];

function dimensionFor(paramId: string): string | null {
  const pid = paramId.trim().toUpperCase();
  if (pid.startsWith('PR')) return 'process';
  if (pid.startsWith('P')) return 'people';
  if (pid.startsWith('T')) return 'technology';
  if (pid.startsWith('D')) return 'data';
  if (pid.startsWith('G')) return 'governance';
  if (pid.startsWith('S')) return 'strategy';
  return null;
}

export function computeMaturity(scores: Record<string, number>, weights: MaturityWeights): ComputedMaturity {
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
    const total = (CATALOG as any)[d.key]?.count ?? 0;
    const avg = arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const w = (weights as any)[d.key] ?? 0;
    const contrib = round(avg * w);
    dims[d.key] = {
      label: d.label,
      answered: arr.length,
      total,
      average: avg,
      weighted_contribution: contrib,
      maturity_level: avg ? Math.round(avg) : 0,
    };
    if (arr.length) {
      num += avg * w;
      den += w;
    }
    answered += arr.length;
  }

  const total = DIMENSIONS.reduce((s, d) => s + ((CATALOG as any)[d.key]?.count ?? 0), 0);
  const composite = den ? round(num / den) : 0;
  return {
    dimensions: dims,
    composite,
    maturity_level: composite ? Math.round(composite) : 0,
    answered,
    total,
    completion: total ? round(answered / total) : 0,
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
