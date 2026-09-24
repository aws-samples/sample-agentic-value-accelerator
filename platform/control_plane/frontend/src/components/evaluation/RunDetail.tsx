// Single evaluation run: summary header plus per-test-case judge verdicts
// with reasoning — the "what did the LLM judge actually say" view.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronDown, FileDown, XCircle } from 'lucide-react';
import type { EvalCase, EvalRun, OptimizationRec } from './types';
import { EVALUATORS } from './demoData';
import { apiUrl, evaluationApi, openReport } from './api';
import { DemoBadge, VerdictBadge } from './ScoreCard';

const EVALUATOR_INFO: Record<string, string> = Object.fromEntries(
  EVALUATORS.map((e) => [e.id, e.description]),
);

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<EvalRun | undefined>();
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    let timer: number | undefined;
    let es: EventSource | undefined;
    let closed = false;
    const load = () =>
      evaluationApi.getRun(runId).then(({ data, demo }) => {
        setRun(data);
        setDemo(demo);
        setLoading(false);
        if (data?.status !== 'running') es?.close();
        // Slow poll stays as the safety net; SSE below delivers the instant
        // updates when the backend streams them.
        else if (!closed) {
          window.clearTimeout(timer);
          timer = window.setTimeout(load, 8000);
        }
        return data;
      });
    load().then((data) => {
      if (closed || data?.status !== 'running' || typeof EventSource === 'undefined') return;
      // Live stream: each server event says "something changed — refetch".
      // EventSource can't attach auth headers, so the token rides a query
      // param that the backend validates; polling above remains the fallback.
      const token = localStorage.getItem('auth_token');
      es = new EventSource(
        apiUrl(`/runs/${encodeURIComponent(runId)}/events${token ? `?token=${encodeURIComponent(token)}` : ''}`),
      );
      es.onmessage = () => {
        if (!closed) load();
      };
      es.onerror = () => es?.close(); // polling continues regardless
    });
    return () => {
      closed = true;
      window.clearTimeout(timer);
      es?.close();
    };
  }, [runId]);

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-10 text-slate-400 text-sm">Loading…</div>;
  if (!run) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-slate-500">Run not found.</p>
        <Link to="/operate/evaluation" className="text-sm text-indigo-700 font-semibold">← Back to Evaluation</Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="relative max-w-5xl mx-auto px-6 py-8">
        <div className="mb-3">
          <Link
            to={`/operate/evaluation/apps/${run.deploymentId}`}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
          >
            ← Back to {run.appName}
          </Link>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Evaluation run</h1>
          {run.status === 'completed' && <VerdictBadge verdict={run.verdict} />}
          {run.status === 'failed' && (
            <span className="text-xs font-bold uppercase tracking-wide text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-0.5">
              failed
            </span>
          )}
          <DemoBadge show={demo} />
          {!demo && run.status === 'completed' && (
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => openReport(`/runs/${encodeURIComponent(run.id)}/report`, `evaluation-${run.id}.md`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white/80 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" /> Export report
              </button>
              <button
                onClick={() => openReport(`/runs/${encodeURIComponent(run.id)}/report?format=html`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white/80 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                Printable / PDF
              </button>
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-6">
          {run.appName} · {run.suiteName} ·{' '}
          {new Date(run.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {run.status === 'completed' && (
            <>
              &nbsp;|&nbsp; {run.evaluatorsPassed}/{run.evaluatorsTotal} passing &nbsp;|&nbsp; Hard gates:{' '}
              {run.hardGatesPassed}/{run.hardGatesTotal} &nbsp;|&nbsp; Overall: {run.overallScore.toFixed(1)}%
            </>
          )}
        </p>

        {run.status === 'failed' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            This run failed before producing scores{run.error ? ` — ${run.error}` : ''}.
          </div>
        )}

        <div className="space-y-4">
          {run.cases.map((c, i) => (
            <CaseCard key={c.id} c={c} index={i + 1} />
          ))}
          {run.status === 'running' && (
            <div className="bg-white/90 rounded-2xl border border-indigo-200/70 p-5 flex items-start gap-3">
              <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 font-medium leading-relaxed break-words">
                  {run.progressNote ?? 'Evaluation starting…'}
                </p>
                <p className="text-xs text-slate-400 mt-1">updates every few seconds</p>
              </div>
            </div>
          )}
          {run.status !== 'running' && run.cases.length === 0 && (
            <div className="bg-white/90 rounded-2xl border border-slate-200/70 p-6 text-sm text-slate-400">
              Per-case results are not available for this run.
            </div>
          )}
          {run.status === 'completed' && !demo && <OptimizationPanel run={run} />}
        </div>
      </div>
    </div>
  );
}

const LEVER_LABELS: Record<string, string> = {
  system_prompt: 'System prompt',
  model: 'Model choice',
  guardrail: 'Guardrail',
  agent_logic: 'Agent logic',
  suite: 'Suite calibration',
};

// The "optimize" step of evaluate → optimize → A/B: an advisory model pass
// that turns this run's failing judge verdicts into suggested changes.
// Apply one, re-run, then compare the two runs.
function OptimizationPanel({ run }: { run: EvalRun }) {
  const [recs, setRecs] = useState<OptimizationRec[] | undefined>(run.recommendations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    const res = await evaluationApi.recommendations(run.id);
    if (res.data) {
      setRecs(res.data);
      setBusy(false);
      return;
    }
    if (!res.generating) {
      setBusy(false);
      setError(res.error ?? 'Failed to generate recommendations.');
      return;
    }
    // Generation runs server-side; the result lands on the run record.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data } = await evaluationApi.getRun(run.id);
      if (data?.recommendations) {
        setRecs(data.recommendations);
        setBusy(false);
        return;
      }
      if (data?.recommendationsError) {
        setBusy(false);
        setError(data.recommendationsError);
        return;
      }
    }
    setBusy(false);
    setError('Recommendation generation timed out — try again.');
  };

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Optimization — what to change before the next run</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Synthesized from this run's failing judge verdicts. Apply one change, re-run the same suite, then
            compare the two runs to prove the improvement.
          </p>
        </div>
        {!recs && (
          <button
            onClick={generate}
            disabled={busy}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors shrink-0"
          >
            {busy ? 'Analyzing failing verdicts…' : 'Generate recommendations'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {recs && recs.length === 0 && (
        <p className="text-sm text-slate-500 mt-3">No failing verdicts to optimize against — nothing to recommend.</p>
      )}
      {recs && recs.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {recs.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                  {LEVER_LABELS[r.lever] ?? r.lever}
                </span>
                <span className="text-sm font-bold text-slate-800">{r.title}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed whitespace-pre-wrap">{r.detail}</p>
              {r.evaluators && r.evaluators.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Addresses: {r.evaluators.map((e) => EVALUATORS.find((x) => x.id === e)?.name ?? e).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Case inputs are often the literal JSON request sent to the agent — render
// those as labeled field chips instead of a raw JSON string. Plain-text
// inputs (e.g. demo scenarios) fall through unchanged.
function inputFields(raw: string): [string, string][] | null {
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj as Record<string, unknown>).map(([k, v]): [string, string] => [
        k.replace(/_/g, ' '),
        typeof v === 'string' ? v : JSON.stringify(v),
      ]);
    }
  } catch {
    /* not JSON — plain-text case input */
  }
  return null;
}

function CaseCard({ c, index }: { c: EvalCase; index: number }) {
  const [showResponse, setShowResponse] = useState(false);
  const fields = inputFields(c.input);

  return (
    <div
      className={`bg-white/90 backdrop-blur-sm rounded-2xl border p-5 ${
        c.passed ? 'border-slate-200/70' : 'border-red-200 ring-1 ring-red-100'
      }`}
    >
      <div className="flex items-start gap-3">
        {c.passed ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-slate-900">Case {index}</h2>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {(c.latencyMs / 1000).toFixed(1)}s · ${c.estCostUsd.toFixed(3)}
            </span>
          </div>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sent to the agent</p>
          {fields ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {fields.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-baseline gap-1 bg-slate-100 border border-slate-200/70 rounded-md px-2 py-0.5 text-xs"
                >
                  <span className="text-slate-400">{k}</span>
                  <span className="font-semibold text-slate-700">{v}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-700 mt-1">{c.input}</p>
          )}
          <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Answer key — what a correct response must do
          </p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{c.expectedBehavior}</p>

          <button
            onClick={() => setShowResponse(!showResponse)}
            className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showResponse ? 'rotate-180' : ''}`} />
            {showResponse ? 'Hide' : 'Show'} what the agent answered
          </button>
          {showResponse && (
            <div className="mt-2 bg-slate-50 rounded-lg border border-slate-200/70 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
              {c.agentResponse}
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {c.judgeVerdicts.map((v) => (
              <div
                key={v.evaluatorId}
                className={`rounded-lg border px-3 py-2 ${
                  v.passed ? 'bg-slate-50 border-slate-200/70' : 'bg-red-50/60 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-bold text-slate-800">{v.evaluatorName}</span>
                  <span className={`text-xs font-bold tabular-nums ml-auto ${v.passed ? 'text-slate-700' : 'text-red-600'}`}>
                    {v.score}%
                  </span>
                </div>
                {EVALUATOR_INFO[v.evaluatorId] && (
                  <p className="text-[11px] text-slate-400 mt-0.5 italic">
                    Checks: {EVALUATOR_INFO[v.evaluatorId]}
                  </p>
                )}
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  <span className="font-semibold text-slate-500">Judge:</span> {v.reasoning}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
