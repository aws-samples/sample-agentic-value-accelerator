// Side-by-side comparison of two evaluation runs — the measuring instrument
// for the optimize → A/B loop: change one thing (prompt, model, guardrail
// config, suite), re-run, and read the per-evaluator deltas.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Swords } from 'lucide-react';
import type { Category, EvalRun, PairwiseResult } from './types';
import { CATEGORY_LABELS } from './types';
import { evaluationApi, openReport } from './api';
import { DemoBadge, GateChip, VerdictBadge } from './ScoreCard';

const CATEGORY_ORDER: Category[] = ['accuracy', 'safety', 'compliance', 'quality', 'performance'];

function avg(nums: number[]): number | null {
  const vals = nums.filter((n) => n > 0);
  return vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
}

function Delta({ value, digits = 1, invert = false }: { value: number; digits?: number; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  const cls = value === 0 ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-red-600';
  return (
    <span className={`text-xs font-bold tabular-nums ${cls}`}>
      {value > 0 ? '+' : ''}
      {value.toFixed(digits)}
    </span>
  );
}

function RunHeader({ run, label }: { run: EvalRun; label: string }) {
  const latency = avg(run.cases.map((c) => c.latencyMs));
  const cost = avg(run.cases.map((c) => c.estCostUsd));
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-900">{run.appName}</span>
        <VerdictBadge verdict={run.verdict} />
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {run.suiteName} ·{' '}
        {new Date(run.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      <p className="text-xs text-slate-600 mt-2 tabular-nums">
        Overall <span className="font-bold">{run.overallScore.toFixed(1)}%</span> · Hard gates{' '}
        <span className="font-bold">{run.hardGatesPassed}/{run.hardGatesTotal}</span>
        {latency !== null && <> · avg {(latency / 1000).toFixed(1)}s</>}
        {cost !== null && <> · ~${cost.toFixed(3)}/decision</>}
      </p>
    </div>
  );
}

export default function RunCompare() {
  const [params] = useSearchParams();
  const idA = params.get('a') ?? '';
  const idB = params.get('b') ?? '';
  const [runA, setRunA] = useState<EvalRun | undefined>();
  const [runB, setRunB] = useState<EvalRun | undefined>();
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!idA || !idB) {
      setLoading(false);
      return;
    }
    Promise.all([evaluationApi.getRun(idA), evaluationApi.getRun(idB)]).then(([a, b]) => {
      setRunA(a.data);
      setRunB(b.data);
      setDemo(a.demo || b.demo);
      setLoading(false);
    });
  }, [idA, idB]);

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-10 text-slate-400 text-sm">Loading…</div>;
  if (!runA || !runB) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-slate-500">Two completed runs are needed for a comparison.</p>
        <Link to="/operate/evaluation" className="text-sm text-indigo-700 font-semibold">
          ← Back to Evaluation
        </Link>
      </div>
    );
  }

  // Union of evaluators across both runs, keyed for per-row lookup.
  const meta = new Map<string, { name: string; category: Category; gate: 'hard' | 'soft' }>();
  for (const r of [...runA.results, ...runB.results]) {
    meta.set(r.id, { name: r.name, category: r.category, gate: r.gate });
  }
  const scoreOf = (run: EvalRun, id: string) => run.results.find((r) => r.id === id);

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="relative max-w-6xl mx-auto px-6 py-8">
        <div className="mb-3">
          <Link
            to={`/operate/evaluation/apps/${runB.deploymentId}`}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
          >
            ← Back to {runB.appName}
          </Link>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Compare runs</h1>
          <DemoBadge show={demo} />
          {!demo && (
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => openReport(`/compare/report?a=${encodeURIComponent(runA.id)}&b=${encodeURIComponent(runB.id)}`, `ab-report-${runA.id}-vs-${runB.id}.md`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white/80 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                Export A/B report
              </button>
              <button
                onClick={() => openReport(`/compare/report?a=${encodeURIComponent(runA.id)}&b=${encodeURIComponent(runB.id)}&format=html`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white/80 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                Printable / PDF
              </button>
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Baseline vs candidate — change one thing, re-run the same suite, read the deltas. Overall:{' '}
          {runA.overallScore.toFixed(1)}% → {runB.overallScore.toFixed(1)}%{' '}
          <Delta value={runB.overallScore - runA.overallScore} />
        </p>
        {runA.suiteName !== runB.suiteName && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            These runs used <span className="font-semibold">different suites</span> (“{runA.suiteName}” vs
            “{runB.suiteName}”), so the deltas reflect the change in the test as much as any change in the
            agent. For an agent A/B, compare two runs of the <span className="font-semibold">same</span> suite.
          </div>
        )}
        <div className="mb-3" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <RunHeader run={runA} label="Baseline (A)" />
          <RunHeader run={runB} label="Candidate (B)" />
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
          <div className="grid grid-cols-[1fr_5rem_5rem_4rem] gap-2 items-center pb-2 border-b border-slate-200/70 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evaluator</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">A</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">B</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Δ</span>
          </div>
          {CATEGORY_ORDER.filter((cat) => [...meta.values()].some((m) => m.category === cat)).map((cat) => (
            <div key={cat} className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mt-3 mb-1">
                {CATEGORY_LABELS[cat]}
              </p>
              {[...meta.entries()]
                .filter(([, m]) => m.category === cat)
                .map(([id, m]) => {
                  const a = scoreOf(runA, id);
                  const b = scoreOf(runB, id);
                  return (
                    <div key={id} className="grid grid-cols-[1fr_5rem_5rem_4rem] gap-2 items-center py-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-slate-800 truncate">{m.name}</span>
                        <GateChip gate={m.gate} />
                      </span>
                      <span className={`text-sm font-bold tabular-nums text-right ${a ? (a.passed ? 'text-slate-700' : 'text-red-600') : 'text-slate-300'}`}>
                        {a ? `${a.score.toFixed(1)}%` : '—'}
                      </span>
                      <span className={`text-sm font-bold tabular-nums text-right ${b ? (b.passed ? 'text-slate-700' : 'text-red-600') : 'text-slate-300'}`}>
                        {b ? `${b.score.toFixed(1)}%` : '—'}
                      </span>
                      <span className="text-right">
                        {a && b ? <Delta value={b.score - a.score} /> : <span className="text-xs text-slate-300">—</span>}
                      </span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>

        {!demo && <PairwisePanel runA={runA} runB={runB} />}

        {(() => {
          const pairs = runA.cases
            .map((ca) => ({ ca, cb: runB.cases.find((c) => c.id === ca.id) }))
            .filter((p) => p.cb && (p.ca.agentResponse || p.cb.agentResponse));
          if (pairs.length === 0) return null;
          return (
            <div className="mt-5 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
              <h2 className="text-base font-bold text-slate-900 mb-1">Answers, side by side</h2>
              <p className="text-xs text-slate-400 mb-2">
                Same question to both variants — read what actually changed, not just the scores.
              </p>
              {pairs.map(({ ca, cb }) => (
                <details key={ca.id} className="group border-t border-slate-100 py-2">
                  <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-800 transition-colors">
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                    Case {ca.id}
                  </summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Baseline (A)</p>
                      <div className="bg-slate-50 rounded-lg border border-slate-200/70 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto">
                        {ca.agentResponse || '—'}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Candidate (B)</p>
                      <div className="bg-slate-50 rounded-lg border border-slate-200/70 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto">
                        {cb!.agentResponse || '—'}
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function WinnerChip({ winner }: { winner: 'A' | 'B' | 'tie' }) {
  const cls =
    winner === 'A'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : winner === 'B'
        ? 'bg-violet-50 text-violet-700 border-violet-200'
        : 'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>
      {winner === 'tie' ? 'TIE' : winner}
    </span>
  );
}

// Head-to-head battles: the judge sees both answers anonymized and picks a
// winner per rubric; every pair is judged twice with the order swapped, so a
// win only counts when it survives the swap (position bias cancels to a tie).
function PairwisePanel({ runA, runB }: { runA: EvalRun; runB: EvalRun }) {
  const [result, setResult] = useState<PairwiseResult | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const battle = async () => {
    setBusy(true);
    setError(null);
    // First POST starts (or joins) the server-side battle; poll until the
    // cached result lands. ~30 polls x 6s bounds the wait at ~3 minutes.
    for (let i = 0; i < 30; i++) {
      const res = await evaluationApi.pairwise(runA.id, runB.id);
      if (res.data) {
        setResult(res.data);
        setBusy(false);
        return;
      }
      if (!res.generating) {
        setBusy(false);
        setError(res.error ?? 'Pairwise comparison failed.');
        return;
      }
      await new Promise((r) => setTimeout(r, 6000));
    }
    setBusy(false);
    setError('Battle timed out — try again.');
  };

  return (
    <div className="mt-5 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Head-to-head</h2>
          <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
            Judges rank more reliably than they score: both answers go to the judge anonymized, per rubric, judged
            twice with the order swapped — a win only counts if it survives the swap.
          </p>
          <details className="mt-1.5 max-w-xl">
            <summary className="text-xs font-semibold text-indigo-700 cursor-pointer">How to read this</summary>
            <ul className="text-xs text-slate-500 mt-1.5 space-y-1 list-disc pl-4">
              <li>
                Each row is one dimension; the letter chips at the end are the per-test-case outcomes
                (one chip per case).
              </li>
              <li>
                A <span className="font-semibold">win</span> means the judge preferred the same answer twice —
                once in each order. If the preference flips with the order, it was position bias, and it counts
                as a <span className="font-semibold">tie</span>.
              </li>
              <li>
                Ties are information: on a tied dimension the answers are indistinguishable, so treat that
                dimension's score delta above as run-to-run noise, not improvement.
              </li>
              <li>
                Scores answer “does it clear the bar?” (gates); head-to-head answers “which variant is better?”
                (adoption). Use both: gates can block a candidate that still wins every battle.
              </li>
            </ul>
          </details>
        </div>
        {!result && (
          <button
            onClick={battle}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors shrink-0"
          >
            <Swords className="w-3.5 h-3.5" />
            {busy ? 'Battling — judging every pair twice…' : 'Run head-to-head'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {result && (
        <>
          <p className="text-sm text-slate-700 mt-3 font-semibold tabular-nums">
            Baseline wins {result.tally.A} · Candidate wins {result.tally.B} · ties {result.tally.tie}
            <span className="text-xs text-slate-400 font-normal ml-2">
              ({result.caseCount} case{result.caseCount === 1 ? '' : 's'} × {result.byEvaluator.length} dimensions,
              order-swapped)
            </span>
          </p>
          {(() => {
            // Name the dimensions and quantify the evidence — "regresses on 1
            // dimension" reads very differently when it is 1 of 14 comparisons
            // on a 2-case suite vs 10 of 14 on a 50-case one.
            const dims = (es: typeof result.byEvaluator, key: 'aWins' | 'bWins', other: 'aWins' | 'bWins') =>
              es.filter((e) => e[key] > e[other]);
            const improved = dims(result.byEvaluator, 'bWins', 'aWins');
            const regressed = dims(result.byEvaluator, 'aWins', 'bWins');
            const total = result.tally.A + result.tally.B + result.tally.tie;
            const name = (e: (typeof result.byEvaluator)[number], wins: number) =>
              `${e.evaluatorName} (${wins} of ${result.caseCount} case${result.caseCount === 1 ? '' : 's'})`;
            const tieNote = `${result.tally.tie} of ${total} comparisons tied — on tied dimensions the score deltas above are noise, not improvement.`;
            const weak = result.caseCount < 5 ? ' With this few cases that is weak evidence — read those answers side-by-side below, or re-run with repeats, before deciding.' : '';
            const reading = regressed.length
              ? `The judge preferred the BASELINE on ${regressed.map((e) => name(e, e.aWins)).join(', ')}.${weak} ${tieNote}`
              : improved.length
                ? `The judge preferred the CANDIDATE on ${improved.map((e) => name(e, e.bWins)).join(', ')} and the baseline nowhere.${weak} ${tieNote}`
                : `All ${total} comparisons tied — the variants are indistinguishable on quality. Decide on the score gates (e.g. safety), cost, and latency instead. ${tieNote}`;
            const cls = regressed.length
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : improved.length
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-600';
            return (
              <p className={`mt-2 text-sm rounded-lg border px-3 py-2 ${cls}`}>
                <span className="font-bold">What this means:</span> {reading}
              </p>
            );
          })()}
          <div className="mt-3 space-y-1.5">
            {result.byEvaluator.map((e) => (
              <div key={e.evaluatorId} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70">
                <span className="text-xs text-slate-700 font-medium flex-1 truncate">{e.evaluatorName}</span>
                <span className="text-xs tabular-nums text-sky-700 font-bold w-14 text-right">A {e.aWins}</span>
                <span className="text-xs tabular-nums text-slate-400 w-14 text-right">tie {e.ties}</span>
                <span className="text-xs tabular-nums text-violet-700 font-bold w-14 text-right">B {e.bWins}</span>
                <span className="flex items-center gap-1 ml-2">
                  {result.battles
                    .filter((b) => b.evaluatorId === e.evaluatorId)
                    .map((b) => (
                      <span key={b.caseId} title={`${b.caseId}: ${b.reasoning}`}>
                        <WinnerChip winner={b.winner} />
                      </span>
                    ))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
