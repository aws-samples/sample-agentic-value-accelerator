/**
 * ModelEvaluations — LLM-as-Judge evaluation studio.
 *
 * Anchored on the per-job Deep Dive (ported/scaled from the AI Trust Tool):
 *  - Select an evaluation job (one per fleet model, run against the FSI Core set)
 *  - Overall score with fleet rank, 12-metric breakdown (9 quality + 3 safety)
 *  - Quality radar + all-metrics bar + category breakdown
 *  - Per-test-case drill-down: prompt / reference / response + per-metric judge
 *    scores with written explanations (the crown jewel)
 *
 * Data is mock (evalData.ts) but shaped like the live Bedrock job-results
 * contract, so wiring to real CreateEvaluationJob / S3 JSONL is a drop-in swap.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { tooltipStyle } from './mockData';
import {
  EVAL_JOBS, EVAL_LEADERBOARD, EVAL_DATASETS, loadJobResults,
  METRIC_COLOR, METRIC_SHORT, isNegativeMetric,
  type EvalMetric, type EvalJob, type EvalJobResults,
} from './evalData';
import { Link } from 'react-router-dom';
import { rowButtonProps } from './a11y';
import LiveBedrockEvals from './safety/LiveBedrockEvals';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';

const scoreColor = (pct: number) => (pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-rose-600');
const scoreBorder = (pct: number) => (pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#dc2626');
const shortModel = (arn: string) => arn.split('.').pop()?.split(':')[0] ?? arn;

const statusBadge: Record<EvalJob['status'], string> = {
  Completed: 'bg-emerald-100 text-emerald-700',
  InProgress: 'bg-blue-100 text-blue-700',
  Failed: 'bg-rose-100 text-rose-700',
};

export default function ModelEvaluations({ modelId }: { modelId?: string } = {}) {
  const completedJobs = useMemo(() => EVAL_JOBS.filter(j => j.status === 'Completed'), []);
  // Default to the shared dossier model's job when provided.
  const defaultJob = useMemo(() => {
    const forModel = modelId ? completedJobs.find(j => j.modelId === modelId) : undefined;
    return forModel?.jobName ?? completedJobs[0]?.jobName ?? '';
  }, [modelId, completedJobs]);
  const [selectedJobName, setSelectedJobName] = useState<string>(defaultJob);

  // Follow the shared model selection when it changes.
  const [lastModel, setLastModel] = useState(modelId);
  if (modelId !== lastModel) {
    setLastModel(modelId);
    if (defaultJob && defaultJob !== selectedJobName) setSelectedJobName(defaultJob);
  }
  const [expandedCase, setExpandedCase] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const [results, setResults] = useState<EvalJobResults | null>(null);
  const [loadingResults, setLoadingResults] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Bumped by the error-state "retry" action to re-run the load effect.
  const [retryNonce, setRetryNonce] = useState(0);

  // Lazy-load the selected job's full per-case results (596 cases) from /eval/.
  useEffect(() => {
    if (!selectedJobName) return;
    let cancelled = false;
    loadJobResults(selectedJobName).then(data => {
      if (!cancelled) { setResults(data); setLoadingResults(false); }
    }).catch(() => {
      // A genuine fetch/parse failure (vs. a benign "no data" null) → ERROR state.
      if (!cancelled) { setResults(null); setLoadingResults(false); setLoadError(true); }
    });
    return () => { cancelled = true; };
  }, [selectedJobName, retryNonce]);

  const retryLoad = () => { setLoadError(false); setLoadingResults(true); setRetryNonce(n => n + 1); };

  // Reset loading/results immediately when the selected job changes (render-derived,
  // not an effect, to avoid cascading renders).
  const [loadedFor, setLoadedFor] = useState(selectedJobName);
  if (loadedFor !== selectedJobName) {
    setLoadedFor(selectedJobName);
    setResults(null);
    setLoadingResults(true);
    setLoadError(false);
  }

  // Cases filtered by the selected category card (null = show all).
  const allFilteredCases = useMemo(() => {
    if (!results) return [];
    const indexed = results.cases.map((c, i) => ({ caseItem: c, index: i }));
    return categoryFilter ? indexed.filter(x => x.caseItem.category === categoryFilter) : indexed;
  }, [results, categoryFilter]);

  // Paginated cases
  const totalPages = Math.ceil(allFilteredCases.length / PAGE_SIZE);
  const visibleCases = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return allFilteredCases.slice(start, start + PAGE_SIZE);
  }, [allFilteredCases, currentPage]);

  // Reset to page 1 when filter changes
  const [lastFilter, setLastFilter] = useState(categoryFilter);
  if (categoryFilter !== lastFilter) {
    setLastFilter(categoryFilter);
    setCurrentPage(1);
  }

  // Fleet ranking context for the selected model.
  const fleetRank = useMemo(() => {
    if (!results) return null;
    const rank = EVAL_LEADERBOARD.filter(e => e.overall > results.overallScore).length + 1;
    const avg = Math.round((EVAL_LEADERBOARD.reduce((s, e) => s + e.overall, 0) / EVAL_LEADERBOARD.length) * 10) / 10;
    return { rank, total: EVAL_LEADERBOARD.length, avg, diff: Math.round((results.overallScore - avg) * 10) / 10 };
  }, [results]);

  // Per-metric fleet context (rank + delta vs fleet average).
  const getFleetContext = (metric: EvalMetric) => {
    if (!results) return null;
    const scores = EVAL_LEADERBOARD.map(e => e.metrics[metric]).filter((v): v is number => v !== undefined);
    if (!scores.length) return null;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const thisScore = results.metrics[metric].percent;
    const rank = scores.filter(v => (isNegativeMetric(metric) ? v < thisScore : v > thisScore)).length + 1;
    return { avg: Math.round(avg * 10) / 10, rank, total: scores.length, diff: Math.round((thisScore - avg) * 10) / 10 };
  };

  const radarData = results
    ? (Object.entries(results.metrics) as [EvalMetric, EvalJobResults['metrics'][EvalMetric]][])
        .filter(([k]) => !isNegativeMetric(k))
        .map(([k, v]) => ({ metric: METRIC_SHORT[k], score: v.percent }))
    : [];

  const barData = results
    ? (Object.entries(results.metrics) as [EvalMetric, EvalJobResults['metrics'][EvalMetric]][])
        .map(([k, v]) => ({ name: METRIC_SHORT[k], score: v.percent, color: METRIC_COLOR[k], neg: isNegativeMetric(k) }))
    : [];

  const dataset = results ? EVAL_DATASETS.find(d => EVAL_JOBS.find(j => j.jobName === results.jobName)?.datasetId === d.id) : undefined;

  return (
    <div className="space-y-6">
      {/* Cross-link: model vs agent evaluation */}
      <div className="text-[11px] text-slate-500">
        Evaluating an agent's behavior (tool use, trajectories, goal success)? See{' '}
        <Link to="/govern/agents?tab=evaluations" className="text-blue-600 hover:text-blue-700 font-medium">Agentic Evals in Agent Registry →</Link>
      </div>

      {/* Live AWS — real Bedrock evaluation jobs + per-metric scores from S3 */}
      <LiveBedrockEvals />

      {/* ══ Illustrative deep-dive studio — grouped container that mirrors the live
          zone above, so the live/illustrative boundary reads at a glance. Per-case
          judge explanations are shaped like the live job-results contract; real
          per-case S3 parsing is the next step. ══ */}
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/60 via-white to-white p-4 shadow-sm space-y-6">
        <div className="flex items-center gap-2 px-1 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Evaluation Studio · illustrative</span>
          <MockDataBadge integration="Per-case judge detail illustrative — live jobs & scores are in the panel above" />
          <span className="text-[10px] text-slate-400">deep-dive: per-test-case prompt/response + judge explanations</span>
        </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Evaluation Jobs" value={EVAL_JOBS.length} sub="Last 30 days" />
        <StatCard label="Completed" value={completedJobs.length} sub="Scored & ranked" variant="success" />
        <StatCard label="Judge Metrics" value={12} sub="9 quality · 3 safety" variant="info" />
        <StatCard label="Running" value={EVAL_JOBS.filter(j => j.status === 'InProgress').length} sub="In progress" variant="info" />
        <StatCard label="Failed" value={EVAL_JOBS.filter(j => j.status === 'Failed').length} sub="Needs attention" variant={EVAL_JOBS.some(j => j.status === 'Failed') ? 'danger' : 'muted'} />
      </div>

      {/* Job selector — horizontal scroll of evaluation jobs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Evaluation Jobs</h3>
          <span className="text-[11px] text-slate-400">LLM-as-Judge: Nova Pro · Select a completed job to inspect</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {EVAL_JOBS.map(job => {
            const isSelected = job.jobName === selectedJobName;
            const selectable = job.status === 'Completed';
            return (
              <button
                key={job.jobName}
                onClick={() => { if (selectable) { setSelectedJobName(job.jobName); setExpandedCase(null); setCategoryFilter(null); } }}
                className={`flex-shrink-0 min-w-[200px] max-w-[230px] text-left p-3 rounded-xl border-2 transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-blue-300'
                } ${selectable ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
              >
                <div className="text-[11px] font-semibold text-slate-900 truncate">{job.jobName}</div>
                <div className="text-[10px] text-blue-600 mb-2">{shortModel(job.model)}</div>
                <div className="flex flex-wrap gap-1">
                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded ${statusBadge[job.status]}`}>
                    {job.status === 'InProgress' && <span className="inline-block w-1 h-1 rounded-full bg-blue-500 animate-pulse mr-1 align-middle" />}
                    {job.status}
                  </span>
                  {job.metricCount > 0 && <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{job.metricCount} metrics</span>}
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{job.totalCases} cases</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {results && (
        <>
          {/* Overall score + metric grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
            {/* Score card */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm text-center" style={{ borderTop: `4px solid ${scoreBorder(results.overallScore)}` }}>
              <div className={`text-5xl font-bold ${scoreColor(results.overallScore)}`}>{results.overallScore}</div>
              <div className="text-[11px] text-slate-500 mt-1">Overall Score</div>
              {fleetRank && (
                <div className="mt-2">
                  <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">#{fleetRank.rank} of {fleetRank.total}</span>
                  <div className={`text-[9px] mt-1 ${results.overallScore >= fleetRank.avg ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {results.overallScore >= fleetRank.avg ? '▲' : '▼'} {Math.abs(fleetRank.diff)} vs fleet avg ({fleetRank.avg})
                  </div>
                </div>
              )}
              <div className="border-t border-slate-100 my-3" />
              <div className="text-xl font-semibold text-blue-600">{results.totalCases}</div>
              <div className="text-[10px] text-slate-500">Test Cases</div>
              <div className="border-t border-slate-100 my-3" />
              <div className="text-[11px] font-medium text-slate-700">{shortModel(results.model)}</div>
              <div className="text-[9px] text-slate-400">Judge: {shortModel(results.evaluator)}</div>
              {dataset && <div className="text-[9px] text-slate-400 mt-1">{dataset.name} · {dataset.version}</div>}
            </div>

            {/* 12 metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
              {(Object.entries(results.metrics) as [EvalMetric, EvalJobResults['metrics'][EvalMetric]][]).map(([name, data]) => {
                const neg = isNegativeMetric(name);
                const good = neg ? data.percent < 5 : data.percent >= 90;
                const fleet = getFleetContext(name);
                return (
                  <div key={name} className="bg-white rounded-lg border border-slate-200/70 p-2.5 shadow-sm" style={{ borderLeft: `3px solid ${METRIC_COLOR[name]}` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-800">{METRIC_SHORT[name]}</span>
                      <span className={`text-[11px] font-bold px-1.5 rounded ${good ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        <span className="mr-0.5" aria-hidden="true">{good ? '✓' : '!'}</span>{data.percent}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${neg ? 100 - data.percent : data.percent}%`, backgroundColor: good ? '#10b981' : '#f59e0b' }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[8px] text-slate-400">{neg ? `${data.count - data.perfect} clean / ${data.count}` : `${data.perfect} perfect / ${data.count}`}</span>
                      {fleet && (
                        <span className={`text-[8px] ${(neg ? fleet.diff <= 0 : fleet.diff >= 0) ? 'text-emerald-600' : 'text-amber-600'}`}>
                          #{fleet.rank}/{fleet.total} · {fleet.diff >= 0 ? '+' : ''}{fleet.diff}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Quality Radar (9 positive metrics)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 9 }} />
                  <PolarRadiusAxis angle={90} domain={[60, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                  <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">All 12 Metrics</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} layout="vertical" margin={{ left: 5, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" width={95} tick={{ fill: '#475569', fontSize: 9 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
                  <Bar dataKey="score" barSize={14} radius={[0, 4, 4, 0]}>
                    {barData.map((e, i) => <Cell key={i} fill={e.neg ? '#dc2626' : e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category breakdown — click a card to filter the per-case table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Score by Category</h3>
              {categoryFilter
                ? <button onClick={() => setCategoryFilter(null)} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">Clear filter ✕</button>
                : <span className="text-[10px] text-slate-400">Click a category to filter cases below</span>}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {Object.entries(results.categories).sort((a, b) => b[1].avg_score - a[1].avg_score).map(([cat, data]) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => { setCategoryFilter(active ? null : cat); setExpandedCase(null); }}
                    className={`rounded-lg p-3 text-center border-2 transition-all cursor-pointer ${
                      active ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-100 bg-slate-50 hover:border-blue-300'
                    }`}
                  >
                    <div className={`text-lg font-bold ${scoreColor(data.avg_score)}`}>{data.avg_score}%</div>
                    <div className="text-[9px] text-slate-600 leading-tight mt-0.5">{cat}</div>
                    <div className="text-[8px] text-slate-400">{data.count} cases</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-case drill-down */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Per-Case Results
                {categoryFilter
                  ? <> ({allFilteredCases.length} in <span className="text-blue-600">{categoryFilter}</span>)</>
                  : <> ({results.casesReturned} of {results.totalCases})</>}
              </h3>
              <div className="flex items-center gap-3">
                {totalPages > 1 && (
                  <span className="text-[10px] text-slate-500">Page {currentPage}/{totalPages}</span>
                )}
                <span className="text-[10px] text-slate-400">Click a row for the judge's per-metric explanations</span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                  <th scope="col" className="py-2.5 px-4 text-left font-medium w-8">#</th>
                  <th scope="col" className="py-2.5 px-3 text-left font-medium">Prompt</th>
                  <th scope="col" className="py-2.5 px-3 text-left font-medium w-28">Category</th>
                  <th scope="col" className="py-2.5 px-3 text-center font-medium w-16">Score</th>
                  <th scope="col" className="py-2.5 px-4 text-right font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {visibleCases.map(({ caseItem: c, index: i }) => {
                  const posScores = (Object.entries(c.scores) as [EvalMetric, { score: number }][]).filter(([k]) => !isNegativeMetric(k));
                  const avg = posScores.length ? posScores.reduce((s, [, v]) => s + v.score, 0) / posScores.length : 0;
                  const pct = Math.round(avg * 100);
                  const isExpanded = expandedCase === i;
                  return (
                    <FragmentRow
                      key={i}
                      index={i}
                      caseItem={c}
                      pct={pct}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedCase(isExpanded ? null : i)}
                    />
                  );
                })}
                {visibleCases.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-xs">No cases in this category.</td></tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, allFilteredCases.length)} of {allFilteredCases.length} cases
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-xs font-medium text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!results && loadingResults && !loadError && (
        <div className="bg-white/80 rounded-xl border border-slate-200/60 p-10 text-center text-slate-500 text-sm">
          <span className="inline-block w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mr-2 align-middle" />
          Loading 596 evaluated cases…
        </div>
      )}

      {!results && loadError && (
        <div className="bg-white/80 rounded-xl border border-rose-200 p-10 text-center text-sm">
          <div className="text-rose-600 font-medium">
            <span className="mr-1.5" aria-hidden="true">✕</span>
            Failed to load evaluation results.
          </div>
          <button
            onClick={retryLoad}
            className="mt-3 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:border-blue-300 hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            Retry
          </button>
        </div>
      )}

      {!results && !loadingResults && !loadError && (
        <div className="bg-white/80 rounded-xl border border-slate-200/60 p-10 text-center text-slate-500 text-sm">
          Select a completed evaluation job above to view its deep-dive results.
        </div>
      )}
      </div>
    </div>
  );
}

/** One per-case row plus its expandable judge-explanation panel. */
function FragmentRow({
  index, caseItem, pct, isExpanded, onToggle,
}: {
  index: number;
  caseItem: EvalJobResults['cases'][number];
  pct: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const badge = pct >= 90 ? 'bg-emerald-100 text-emerald-700' : pct >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
  const glyph = pct >= 90 ? '✓' : pct >= 70 ? '!' : '✕';
  return (
    <>
      <tr
        {...rowButtonProps(onToggle, 'Toggle case details')}
        aria-expanded={isExpanded}
        className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors focus:outline-none focus:bg-blue-50/50 ${isExpanded ? 'bg-blue-50/30' : ''}`}
      >
        <td className="py-2.5 px-4 text-slate-400">{index + 1}</td>
        <td className="py-2.5 px-3 text-slate-700 max-w-md truncate">{caseItem.prompt}</td>
        <td className="py-2.5 px-3"><span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{caseItem.category}</span></td>
        <td className="py-2.5 px-3 text-center"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badge}`}><span className="mr-0.5" aria-hidden="true">{glyph}</span>{pct}%</span></td>
        <td className="py-2.5 px-4 text-right">
          <svg className={`w-3.5 h-3.5 text-slate-400 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-slate-50/70 px-4 py-4">
            {/* Prompt / reference / response */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <Excerpt label="PROMPT" labelColor="text-blue-600" text={caseItem.prompt} />
              <Excerpt label="REFERENCE RESPONSE" labelColor="text-emerald-600" text={caseItem.reference} />
            </div>
            <Excerpt label="MODEL RESPONSE" labelColor="text-amber-600" text={caseItem.response} className="mb-3" />

            {/* Judge scores + explanations */}
            <div className="text-[10px] font-semibold text-violet-600 mb-2">JUDGE SCORES &amp; EXPLANATIONS</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {(Object.entries(caseItem.scores) as [EvalMetric, { score: number; explanation: string }][]).map(([metric, data]) => {
                const neg = isNegativeMetric(metric);
                // Quality: 1.0 ideal; Safety: 0.0 ideal. "good" = within tolerance.
                const good = neg ? data.score <= 0.001 : data.score >= 0.999;
                const warn = !good && (neg ? data.score < 0.5 : data.score >= 0.6);
                const accent = good ? '#10b981' : warn ? '#f59e0b' : '#dc2626';
                const badgeCls = good ? 'bg-emerald-100 text-emerald-700' : warn ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
                const glyph = good ? '✓' : warn ? '!' : '✕';
                return (
                  <div key={metric} className="bg-white rounded-lg p-2.5 border border-slate-200/70" style={{ borderLeft: `3px solid ${accent}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold" style={{ color: METRIC_COLOR[metric] }}>{METRIC_SHORT[metric]}</span>
                      <span className={`text-[9px] font-bold px-1.5 rounded ${badgeCls}`}><span className="mr-0.5" aria-hidden="true">{glyph}</span>{data.score.toFixed(2)}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 leading-relaxed">{data.explanation}</div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Excerpt({ label, labelColor, text, className = '' }: { label: string; labelColor: string; text: string; className?: string }) {
  return (
    <div className={className}>
      <div className={`text-[10px] font-semibold mb-1 ${labelColor}`}>{label}</div>
      <div className="text-[11px] text-slate-700 leading-relaxed bg-white rounded-lg p-2.5 border border-slate-200/70 max-h-32 overflow-auto">{text}</div>
    </div>
  );
}
