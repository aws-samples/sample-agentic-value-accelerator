// Operate → Evaluation landing: every deployed application with its latest
// evaluation state. Measurement is what turns trust into something earned
// rather than assumed.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { FlaskConical, Play } from 'lucide-react';
import type { EvaluatedApp, EvaluatorResult } from './types';
import { EVALUATORS } from './demoData';
import { evaluationApi } from './api';
import { DemoBadge, VerdictBadge } from './ScoreCard';

// Compact column labels for the fleet heatmap.
const HEAT_LABELS: Record<string, string> = {
  'contextual-grounding': 'Grounding',
  hallucination: 'Halluc.',
  'toxicity-bias': 'Toxicity',
  'pii-leakage': 'PII',
  'regulatory-adherence': 'Regulatory',
  'evidence-sufficiency': 'Evidence',
  'reasoning-coherence': 'Reasoning',
  'decision-consistency': 'Consist.',
  'latency-sla': 'Latency',
  'cost-per-decision': 'Cost',
};

const heatClass = (score: number) =>
  score >= 95
    ? 'bg-emerald-100 text-emerald-800'
    : score >= 85
      ? 'bg-emerald-50 text-emerald-700'
      : score >= 75
        ? 'bg-amber-50 text-amber-700'
        : score >= 60
          ? 'bg-orange-50 text-orange-700'
          : 'bg-red-50 text-red-700';

export default function EvaluationLanding() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<EvaluatedApp[]>([]);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [heatRows, setHeatRows] = useState<{ app: EvaluatedApp; results: EvaluatorResult[] }[]>([]);
  const [heatLoading, setHeatLoading] = useState(false);

  useEffect(() => {
    evaluationApi.listApps().then(({ data, demo, error }) => {
      setApps(data);
      setDemo(demo);
      setError(error ?? null);
      setLoading(false);
      // Fleet heatmap: latest completed run per app, fetched concurrently
      // AFTER the cards render — a skeleton holds its place meanwhile.
      const evaluated = data.filter((a) => a.lastRun && a.lastRun.status === 'completed');
      if (evaluated.length >= 2) setHeatLoading(true);
      Promise.all(evaluated.map((a) => evaluationApi.getRun(a.lastRun!.id))).then((runs) => {
        setHeatRows(
          evaluated
            .map((app, i) => ({ app, results: runs[i].data?.results ?? [] }))
            .filter((r) => r.results.length > 0),
        );
        setHeatLoading(false);
      });
    });
  }, []);

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="mb-3 animate-fade-in">
          <Link to="/operate" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            ← Back to Operate
          </Link>
        </div>

        <div className="mb-8 animate-fade-in stagger-1">
          <div className="flex items-center gap-3">
            <div className="ml-auto order-last">
              <Link
                to="/operate/evaluation/playground"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white/80 border border-slate-200 rounded-lg px-3 py-2 transition-colors"
              >
                <FlaskConical className="w-4 h-4" /> Judge playground
              </Link>
            </div>
            <h1
              className="text-5xl font-semibold tracking-tight leading-tight"
              style={{
                backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Evaluation
            </h1>
            <DemoBadge show={demo} />
          </div>
          <p className="text-slate-500 mt-4 max-w-3xl">
            Measurement is what turns trust into something earned rather than assumed. Each evaluator scores a
            dimension of decision quality — <span className="font-semibold text-slate-700">hard gates</span> must pass
            for an agent to act autonomously; <span className="font-semibold text-slate-700">soft gates</span> inform
            the promotion decision.
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Backend error: {error}
          </div>
        )}

        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-fade-in stagger-2">
            {apps.map((app) => (
              <AppCard key={app.deploymentId} app={app} onClick={() => navigate(`/operate/evaluation/apps/${app.deploymentId}`)} />
            ))}
          </div>
        )}

        {heatLoading && heatRows.length < 2 && (
          <div className="mt-8 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">Fleet heatmap</h2>
            <div className="space-y-2 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-7 bg-slate-100 rounded-md" />
              ))}
            </div>
          </div>
        )}

        {heatRows.length >= 2 && (
          <div className="mt-8 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5 animate-fade-in">
            <h2 className="text-base font-bold text-slate-900 mb-1">Fleet heatmap</h2>
            <p className="text-xs text-slate-400 mb-3">
              Latest run per application, per evaluator — a weak column is a fleet-wide problem, not an app problem.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left font-bold uppercase tracking-wider text-[10px] text-slate-400 pb-2 pr-3">
                      Application
                    </th>
                    {EVALUATORS.filter((e) => heatRows.some((r) => r.results.some((x) => x.id === e.id))).map((e) => (
                      <th
                        key={e.id}
                        title={e.name}
                        className="text-center font-bold uppercase tracking-wider text-[10px] text-slate-400 pb-2 px-1"
                      >
                        {HEAT_LABELS[e.id] ?? e.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatRows.map(({ app, results }) => (
                    <tr
                      key={app.deploymentId}
                      onClick={() => navigate(`/operate/evaluation/apps/${app.deploymentId}`)}
                      className="cursor-pointer hover:bg-indigo-50/40 transition-colors"
                    >
                      <td className="py-1 pr-3 font-medium text-slate-700 whitespace-nowrap">{app.name}</td>
                      {EVALUATORS.filter((e) => heatRows.some((r) => r.results.some((x) => x.id === e.id))).map((e) => {
                        const r = results.find((x) => x.id === e.id);
                        return (
                          <td key={e.id} className="px-1 py-1">
                            {r ? (
                              <div
                                title={`${e.name}: ${r.score}% (threshold ${r.threshold}%)`}
                                className={`rounded-md text-center font-bold tabular-nums py-1.5 ${heatClass(r.score)}`}
                              >
                                {Math.round(r.score)}
                              </div>
                            ) : (
                              <div className="rounded-md text-center text-slate-300 py-1.5">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppCard({ app, onClick }: { app: EvaluatedApp; onClick: () => void }) {
  const trend = app.history.filter((h) => h.status === 'completed').reverse().map((h) => ({ v: h.overallScore }));

  return (
    <div
      onClick={onClick}
      className="group bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 p-5 cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-indigo-300/60 transition-all duration-300 flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-indigo-700 group-hover:text-indigo-800 transition-colors truncate">
            {app.name}
          </h2>
          <p className="text-xs text-slate-500">
            {app.domain} · {app.source}
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 bg-indigo-50/60 text-indigo-700 rounded-md font-medium border border-indigo-100/70 shrink-0">
          {app.framework}
        </span>
      </div>

      {app.status === 'never-evaluated' && app.isWebApp && (
        <div className="mt-4 flex-1 flex flex-col items-start justify-center">
          <p className="text-sm text-slate-400 mb-1">No agent runtime — live evaluation does not apply.</p>
          <span className="text-xs text-slate-400">
            Judge-only mode available: add cases with recorded outputs.
          </span>
        </div>
      )}

      {app.status === 'never-evaluated' && !app.isWebApp && (
        <div className="mt-4 flex-1 flex flex-col items-start justify-center">
          <p className="text-sm text-slate-500 mb-3">This application has never been evaluated.</p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 group-hover:text-indigo-800">
            <Play className="w-4 h-4" /> Run first evaluation
          </span>
        </div>
      )}

      {app.status === 'running' && (
        <div className="mt-4 flex-1 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Live</span>
          <span className="text-sm text-slate-500">Evaluation in progress…</span>
        </div>
      )}

      {app.status === 'evaluated' && app.lastRun && (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-bold text-slate-900 tabular-nums">{app.lastRun.overallScore.toFixed(1)}%</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                {app.lastRun.evaluatorsPassed}/{app.lastRun.evaluatorsTotal} passing · hard gates{' '}
                {app.lastRun.hardGatesPassed}/{app.lastRun.hardGatesTotal}
              </div>
            </div>
            {trend.length > 1 && (
              <div className="w-24 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <Line type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="mt-3">
            <VerdictBadge verdict={app.lastRun.verdict} />
          </div>
        </>
      )}
    </div>
  );
}
