// Promotion Gate panel — overall score, hard-gate tally, verdict, and an
// expandable per-evaluator breakdown of the most recent run.

import { useState } from 'react';
import { ChevronDown, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { EvaluatorResult, Verdict } from './types';
import { GateChip, VerdictBadge } from './ScoreCard';

interface Props {
  overallScore: number;
  hardGatesPassed: number;
  hardGatesTotal: number;
  verdict: Verdict;
  results: EvaluatorResult[];
}

export default function PromotionGate({ overallScore, hardGatesPassed, hardGatesTotal, verdict, results }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [whatIf, setWhatIf] = useState(false);
  // Hypothetical hard-gate thresholds — client-side only; makes "thresholds
  // are a risk-appetite choice" tangible without touching stored results.
  const [hypo, setHypo] = useState<Record<string, number>>({});
  const hardOk = hardGatesPassed === hardGatesTotal;

  const hardResults = results.filter((r) => r.gate === 'hard');
  const th = (r: EvaluatorResult) => hypo[r.id] ?? r.threshold;
  const hypoHardPassed = hardResults.filter((r) => r.score >= th(r)).length;
  const softAllPass = results.filter((r) => r.gate === 'soft').every((r) => r.passed);
  const hypoVerdict: Verdict =
    hardResults.length > 0 && hypoHardPassed < hardResults.length
      ? 'blocked'
      : softAllPass && overallScore >= 90
        ? 'autonomy-eligible'
        : 'conditional';
  const dirty = Object.keys(hypo).length > 0;

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-slate-900">Promotion Gate</h2>
          <p className="text-xs text-slate-500">
            Hard gates must pass for an agent to act autonomously; soft gates inform the promotion decision.
          </p>
        </div>
        <VerdictBadge verdict={verdict} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="bg-slate-50 rounded-xl border border-slate-200/70 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Overall score</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{overallScore.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-50 rounded-xl border border-slate-200/70 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hard gates</div>
          <div className={`text-2xl font-bold tabular-nums ${hardOk ? 'text-emerald-600' : 'text-red-600'}`}>
            {hardGatesPassed}/{hardGatesTotal}
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl border border-slate-200/70 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Evaluators passing</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {results.filter((r) => r.passed).length}/{results.length}
          </div>
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-800 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {expanded ? 'Hide' : 'Show'} per-evaluator results for the most recent run
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200/70">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-xs text-slate-700 font-medium flex-1 truncate">{r.name}</span>
              <GateChip gate={r.gate} />
              <span className="text-xs font-bold tabular-nums text-slate-800">{r.score}%</span>
              <span className="text-[10px] text-slate-400 tabular-nums">/ {r.threshold}</span>
            </div>
          ))}
        </div>
      )}

      {hardResults.length > 0 && (
        <>
          <button
            onClick={() => setWhatIf(!whatIf)}
            className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-800 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            What-if thresholds
          </button>
          {whatIf && (
            <div className="mt-3 bg-slate-50 rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs text-slate-500">
                  Thresholds are a risk-appetite choice. Drag a hard gate to see how the verdict would move —
                  hypothetical only, stored results are unchanged.
                </p>
                <VerdictBadge verdict={hypoVerdict} />
              </div>
              {hardResults.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-xs text-slate-700 w-40 truncate">{r.name}</span>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={th(r)}
                    onChange={(e) => setHypo({ ...hypo, [r.id]: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className={`text-xs font-bold tabular-nums w-10 text-right ${r.score >= th(r) ? 'text-emerald-600' : 'text-red-600'}`}>
                    ≥{th(r)}
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums w-16 text-right">score {r.score}%</span>
                </div>
              ))}
              {dirty && (
                <button
                  onClick={() => setHypo({})}
                  className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Reset to suite thresholds
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
