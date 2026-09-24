// Evaluator score rows grouped by category, plus small shared UI atoms
// (gate chip, verdict badge, demo badge) used across the Evaluation pages.

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { Category, EvaluatorResult, Verdict } from './types';
import { CATEGORY_LABELS, VERDICT_META } from './types';

export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      Demo data
    </span>
  );
}

export function GateChip({ gate }: { gate: 'hard' | 'soft' }) {
  return gate === 'hard' ? (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
      Hard
    </span>
  ) : (
    <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
      Soft
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

function StatusIcon({ passed, nearMiss }: { passed: boolean; nearMiss: boolean }) {
  if (passed) return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (nearMiss) return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
}

function ScoreRow({ r }: { r: EvaluatorResult }) {
  const nearMiss = !r.passed && r.score >= r.threshold - 5;
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70">
      <StatusIcon passed={r.passed} nearMiss={nearMiss} />
      <span className="text-sm text-slate-800 font-medium flex-1 min-w-0 truncate">{r.name}</span>
      <GateChip gate={r.gate} />
      <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden hidden sm:block">
        <div
          className={`h-full rounded-full ${r.passed ? 'bg-emerald-500' : nearMiss ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(100, r.score)}%` }}
        />
      </div>
      <span className={`text-sm font-bold tabular-nums text-right ${r.passed ? 'text-slate-800' : nearMiss ? 'text-amber-600' : 'text-red-600'}`}>
        {r.score}%
        {r.stddev !== undefined && (
          <span className="text-[10px] font-medium text-slate-400 ml-0.5" title="Run-to-run noise across repeats (±1 std dev)">
            ±{r.stddev}
          </span>
        )}
      </span>
    </div>
  );
}

const CATEGORY_ORDER: Category[] = ['accuracy', 'safety', 'compliance', 'quality', 'performance'];

export default function ScoreCard({ results }: { results: EvaluatorResult[] }) {
  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => {
        const rows = results.filter((r) => r.category === cat);
        if (rows.length === 0) return null;
        return (
          <div key={cat}>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {CATEGORY_LABELS[cat]}
            </div>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <ScoreRow key={r.id} r={r} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
