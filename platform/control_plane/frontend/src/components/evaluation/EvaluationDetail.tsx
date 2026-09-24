// Per-application evaluation dashboard: category scores, promotion gate,
// score trend, run history, and the Run Evaluation / suite builder actions.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Play, Settings2, Sparkles, Trash2 } from 'lucide-react';
import type { Category, EvaluatedApp, EvalRun } from './types';
import { CATEGORY_LABELS } from './types';
import { evaluationApi } from './api';
import ScoreCard, { DemoBadge, VerdictBadge } from './ScoreCard';
import PromotionGate from './PromotionGate';
import SuiteBuilder from './SuiteBuilder';

export default function EvaluationDetail() {
  const { deploymentId } = useParams<{ deploymentId: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<EvaluatedApp | undefined>();
  const [run, setRun] = useState<EvalRun | undefined>();
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showSuiteBuilder, setShowSuiteBuilder] = useState(false);
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [currentSuiteName, setCurrentSuiteName] = useState<string | null>(null);

  // Auto-enrollment: draft a suite scaffold server-side, then open the
  // builder pre-filled with the draft for human review.
  const enroll = async () => {
    if (!deploymentId || enrolling) return;
    setEnrolling(true);
    setEnrollError(null);
    const { data, error } = await evaluationApi.enroll(deploymentId);
    setEnrolling(false);
    if (!data) {
      setEnrollError(error ?? 'Auto-enrollment failed.');
      return;
    }
    evaluationApi.getSuite(deploymentId).then((s) => setCurrentSuiteName(s?.name ?? null));
    setShowSuiteBuilder(true);
  };

  // Keep at most two runs selected — picking a third replaces the oldest pick.
  const toggleCompare = (id: string) =>
    setCompareSel((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel.slice(-1), id]));

  const goCompare = () => {
    if (!app) return;
    const picked = app.history.filter((h) => compareSel.includes(h.id));
    const [a, b] = [...picked].sort((x, y) => x.startedAt.localeCompare(y.startedAt));
    if (a && b) navigate(`/operate/evaluation/compare?a=${a.id}&b=${b.id}`);
  };

  useEffect(() => {
    if (!deploymentId) return;
    let timer: number | undefined;
    let closed = false; // in-flight fetches must not reschedule after unmount
    const load = () =>
      evaluationApi.getApp(deploymentId).then(async ({ data, demo }) => {
        if (closed) return;
        setApp(data);
        setDemo(demo);
        // Fetch the run in every state: running runs carry live progress,
        // failed runs carry the error to display.
        if (data?.lastRun) {
          const runRes = await evaluationApi.getRun(data.lastRun.id);
          if (closed) return;
          setRun(runRes.data);
          if (runRes.data?.status === 'running') timer = window.setTimeout(load, 5000);
        }
        // Which suite would a run use right now? Runs always take the newest
        // saved suite, so surface its name before the user clicks Run.
        evaluationApi.getSuite(deploymentId).then((s) =>
          setCurrentSuiteName(s && (s.cases?.length ?? 0) > 0 ? s.name : null),
        );
        setLoading(false);
      });
    load();
    return () => {
      closed = true;
      window.clearTimeout(timer);
    };
  }, [deploymentId]);

  const startRun = async () => {
    if (!deploymentId || simulating) return;
    setSimulating(true);
    setRunError(null);
    // If this APP came from the demo catalog (backend has no data for it),
    // Run Evaluation simulates — asking the real backend to evaluate a
    // demo-only deployment id would just 422.
    if (demo) {
      setTimeout(() => {
        setSimulating(false);
        navigate(`/operate/evaluation/runs/${app?.lastRun?.id ?? 'run-kyc-005'}`);
      }, 2600);
      return;
    }
    // Real mode navigates to the backend's run. A real backend error is
    // surfaced inline — never masked with demo data.
    const { data, demo: startDemo, error } = await evaluationApi.startRun(deploymentId);
    if (!data) {
      setSimulating(false);
      setRunError(error ?? 'Failed to start evaluation run.');
      return;
    }
    const delay = startDemo ? 2600 : 400;
    setTimeout(() => {
      setSimulating(false);
      navigate(`/operate/evaluation/runs/${data.runId}`);
    }, delay);
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-6 py-10 text-slate-400 text-sm">Loading…</div>;
  }
  if (!app) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <p className="text-slate-500">Application not found.</p>
        <Link to="/operate/evaluation" className="text-sm text-indigo-700 font-semibold">← Back to Evaluation</Link>
      </div>
    );
  }

  const trend = app.history
    .filter((h) => h.status === 'completed')
    .reverse()
    .map((h) => ({
      date: new Date(h.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      score: h.overallScore,
    }));

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="mb-3">
          <Link to="/operate/evaluation" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            ← Back to Evaluation
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900">{app.name}</h1>
          {app.lastRun && app.lastRun.status === 'completed' && <VerdictBadge verdict={app.lastRun.verdict} />}
          <DemoBadge show={demo} />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowSuiteBuilder(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white/80 border border-slate-200 rounded-lg px-3 py-2 transition-colors"
            >
              <Settings2 className="w-4 h-4" /> Configure suite
            </button>
            <button
              onClick={startRun}
              disabled={simulating}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg px-4 py-2 shadow-sm transition-colors"
            >
              {simulating ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  Evaluating…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Run Evaluation
                </>
              )}
            </button>
          </div>
        </div>

        {currentSuiteName && !demo && (
          <p className="-mt-3 mb-5 text-xs text-slate-400 text-right">
            Run Evaluation uses the newest saved suite:{' '}
            <span className="font-semibold text-slate-500">{currentSuiteName}</span> — saving in the suite
            builder creates a new version that becomes current.
          </p>
        )}

        {runError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {runError}
          </div>
        )}

        {app.lastRun?.status === 'failed' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Last evaluation run failed{run?.error ? ` — ${run.error}` : ''}.
          </div>
        )}

        {app.lastRun && app.lastRun.status === 'completed' && (
          <p className="text-sm text-slate-500 mb-6">
            {run?.suiteName ?? 'Evaluation suite'} — {app.lastRun.evaluatorsPassed}/{app.lastRun.evaluatorsTotal} passing
            &nbsp;|&nbsp; Hard gates: {app.lastRun.hardGatesPassed}/{app.lastRun.hardGatesTotal}
            &nbsp;|&nbsp; Overall: {app.lastRun.overallScore.toFixed(1)}%
          </p>
        )}

        {!app.lastRun && (
          <div className="bg-white/90 rounded-2xl border border-slate-200/70 p-8 text-center">
            <p className="text-slate-500 mb-1">This application has never been evaluated.</p>
            {currentSuiteName ? (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  {app.isWebApp
                    ? 'A draft suite exists. This deployment has nothing to invoke, so evaluation is judge-only: open the suite, paste a real recorded output into agentResponse, describe what a correct output must contain, then run.'
                    : "A suite already exists (auto-enrolled drafts need review — check the case inputs match this agent's API). Review it, then run the first evaluation."}
                </p>
                <button
                  onClick={() => setShowSuiteBuilder(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 shadow-sm transition-colors"
                >
                  <Settings2 className="w-4 h-4" /> Review suite
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400 mb-4">Configure a suite and run the first evaluation to establish a baseline.</p>
                {!demo && (
                  <button
                    onClick={enroll}
                    disabled={enrolling}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg px-4 py-2 shadow-sm transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    {enrolling ? 'Drafting suite from the app catalog…' : 'Auto-enroll — draft a suite for review'}
                  </button>
                )}
              </>
            )}
            {enrollError && <p className="text-sm text-red-600 mt-3">{enrollError}</p>}
          </div>
        )}

        {app.lastRun && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4">Evaluator scores</h2>
              {run && run.results.length > 0 ? (
                <ScoreCard results={run.results} />
              ) : (
                <p className="text-sm text-slate-500">
                  {run?.status === 'running' ? (run.progressNote ?? 'Run in progress…') : 'No results yet.'}
                </p>
              )}
            </div>

            <div className="lg:col-span-2 space-y-5">
              {run && run.results.length > 0 && (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
                  <h2 className="text-base font-bold text-slate-900 mb-1">Category profile</h2>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        data={Object.entries(
                          run.results.reduce((acc, r) => {
                            (acc[r.category] ??= []).push(r.score);
                            return acc;
                          }, {} as Record<Category, number[]>),
                        ).map(([cat, vals]) => ({
                          category: CATEGORY_LABELS[cat as Category] ?? cat,
                          score: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
                        }))}
                        margin={{ top: 10, right: 30, bottom: 5, left: 30 }}
                      >
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.22} isAnimationActive={false} />
                        <Tooltip formatter={(v) => [`${v}%`, 'Score']} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {run && (
                <PromotionGate
                  overallScore={run.overallScore}
                  hardGatesPassed={run.hardGatesPassed}
                  hardGatesTotal={run.hardGatesTotal}
                  verdict={run.verdict}
                  results={run.results}
                />
              )}

              {trend.length > 1 && (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
                  <h2 className="text-base font-bold text-slate-900 mb-3">Score trend</h2>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis domain={[70, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-slate-900">Run history</h2>
                  {compareSel.length === 2 ? (
                    <button
                      onClick={goCompare}
                      className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Compare selected
                    </button>
                  ) : (
                    app.history.filter((h) => h.status === 'completed').length > 1 && (
                      <span className="text-[11px] text-slate-400">tick two runs to compare</span>
                    )
                  )}
                </div>
                <div className="space-y-1.5">
                  {app.history.map((h) => (
                    <div key={h.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={h.status !== 'completed'}
                        checked={compareSel.includes(h.id)}
                        onChange={() => toggleCompare(h.id)}
                        className="accent-indigo-600 shrink-0 disabled:opacity-30"
                        title="Select for comparison"
                      />
                      <button
                        onClick={() => navigate(`/operate/evaluation/runs/${h.id}`)}
                        className="flex-1 flex items-center gap-3 bg-slate-50 hover:bg-indigo-50/60 rounded-lg px-3 py-2 border border-slate-200/70 transition-colors text-left"
                      >
                        <span className="text-xs text-slate-500 tabular-nums w-24 shrink-0">
                          {new Date(h.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-sm font-bold text-slate-800 tabular-nums w-14">{h.overallScore.toFixed(1)}%</span>
                        <span className="text-xs text-slate-500 flex-1">
                          hard {h.hardGatesPassed}/{h.hardGatesTotal} · {h.evaluatorsPassed}/{h.evaluatorsTotal} passing
                        </span>
                        <VerdictBadge verdict={h.verdict} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Delete this run and its results? History is otherwise kept as an audit trail.')) return;
                          const res = await evaluationApi.deleteRun(h.id);
                          if (res.ok) window.location.reload();
                          else setRunError(res.error ?? 'Delete failed.');
                        }}
                        title="Delete this run (e.g. scored against a crashed agent)"
                        className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showSuiteBuilder && <SuiteBuilder app={app} onClose={() => setShowSuiteBuilder(false)} />}
    </div>
  );
}
