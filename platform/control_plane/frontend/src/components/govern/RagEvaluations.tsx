/**
 * RagEvaluations — Retrieval-Augmented Generation quality evaluation.
 *
 * 6-metric LLM-as-Judge model (faithfulness, response relevance, context relevance,
 * context coverage, hallucination, citation coverage) with weighted overall score,
 * per-query drill-down, and retrieved-context inspection. Ported from the AI Trust
 * Tool's RAG analysis.
 */

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { tooltipStyle } from './mockData';
import {
  RAG_RUNS, RAG_METRICS, type RagEvalRun, type RagCase, type RagMetricId,
} from './ragEvalData';
import { rowButtonProps } from './a11y';
import { Icon } from './icons';
import { governEvalsApi, type AwsEvaluationJobsResponse, type AwsEvalScoresResponse } from '../../api/client';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { usePollingKey } from './usePollingKey';
import LiveHeader from './LiveHeader';
import { useDataSources } from './DataSourceContext';

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';

const metricPct = (run: RagEvalRun, id: RagMetricId) => Math.round(run.aggregates[id] * 100);
const good = (id: RagMetricId, v: number) => {
  const m = RAG_METRICS.find(x => x.id === id)!;
  return m.negative ? v <= m.good : v >= m.good;
};
const scoreText = (pct: number) => (pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600');

// ─── Live RAG evaluation jobs (real Bedrock ListEvaluationJobs, RagEvaluation only) ───
// A focused, RAG-filtered variant of the shared LiveBedrockEvals pattern: lists the
// account's real Bedrock RAG evaluation jobs and, on click of a completed job, loads
// the S3-parsed per-metric mean scores. Honest live badge; graceful empty state.

const ragStatusBadge: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  inprogress: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-blue-100 text-blue-700',
  stopped: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
};

// Responsible-AI RAG metrics where LOWER is safer; quality metrics are higher-is-better.
const RAG_LOWER_IS_BETTER = new Set(['Harmfulness', 'Stereotyping', 'Refusal']);
const shortRagMetric = (m: string) => m.replace(/^Builtin\./, '');

function ragScoreColor(metric: string, v: number): string {
  const lower = RAG_LOWER_IS_BETTER.has(shortRagMetric(metric));
  const isGood = lower ? v <= 0.2 : v >= 0.7;
  const isBad = lower ? v >= 0.5 : v < 0.4;
  return isGood ? 'bg-emerald-500' : isBad ? 'bg-rose-500' : 'bg-amber-500';
}

// Per-job score panel — lazy-fetches the real S3-parsed metric means on expand.
// Uses job name (not ARN) for the lookup to avoid exposing account IDs.
function RagJobScores({ jobName }: { jobName: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsEvalScoresResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    governEvalsApi.scores(jobName)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobName]);

  if (loading) return <div className="py-3 text-[11px] text-slate-400">Loading scores from S3…</div>;
  if (!data?.live || data.metrics.length === 0) {
    return <div className="py-3 text-[11px] text-slate-500">{data?.note ?? 'No parsed scores for this job.'}</div>;
  }
  return (
    <div className="py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-slate-700">Per-metric RAG scores</span>
        <LiveDataBadge source="S3 eval results" />
        <span className="text-[10px] text-slate-400">
          {data.records_scored.toLocaleString()} records{data.capped ? ' (capped)' : ''} · aggregated mean score per metric
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
        {data.metrics.map(m => (
          <div key={m.metric} className="flex items-center gap-2 text-[11px]">
            <span className="w-40 shrink-0 truncate text-slate-600" title={m.metric}>
              {shortRagMetric(m.metric)}
              {RAG_LOWER_IS_BETTER.has(shortRagMetric(m.metric)) && <span className="text-[8px] text-slate-400 ml-1">↓safer</span>}
            </span>
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${ragScoreColor(m.metric, m.mean_score)}`} style={{ width: `${Math.max(3, m.mean_score * 100)}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums font-medium text-slate-700">{m.mean_score.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Live panel: real Bedrock RAG evaluation jobs (filtered from ListEvaluationJobs).
function LiveRagEvals() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsEvaluationJobsResponse | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const pollKey = usePollingKey(60_000);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll (don't reset to spinner) so the list updates in place.
    governEvalsApi.jobs(100)
      .then(d => {
        if (!cancelled) {
          setData(d);
          if (d?.live) updateSource('aws-bedrock', { status: 'live', lastFetch: Date.now() });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          updateSource('aws-bedrock', { status: 'error', error: 'Evaluation jobs API unavailable' });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey, updateSource]);

  const live = !!data?.live;
  const ragJobs = (data?.jobs ?? []).filter(j => j.application_type === 'RagEvaluation');
  const ragCompleted = ragJobs.filter(j => j.status.toLowerCase() === 'completed').length;
  const ragInProgress = ragJobs.filter(j => ['inprogress', 'in_progress'].includes(j.status.toLowerCase())).length;
  const ragFailed = ragJobs.filter(j => j.status.toLowerCase() === 'failed').length;

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · Bedrock RAG evaluations"
        caption="real RAG evaluation jobs run in your account (bedrock:ListEvaluationJobs)"
        autoRefresh
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="RAG eval jobs" value={data ? data.rag_evals : '—'} variant="info" sub={live ? `of ${data!.total} total eval jobs` : undefined} />
        <StatCard label="Completed" value={live ? ragCompleted : '—'} variant="success" />
        <StatCard label="In progress" value={live ? ragInProgress : '—'} variant={ragInProgress > 0 ? 'info' : 'muted'} />
        <StatCard label="Failed" value={live ? ragFailed : '—'} variant={ragFailed > 0 ? 'danger' : 'muted'} />
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">RAG Evaluation Jobs</h3>
          {live && <LiveDataBadge source="ListEvaluationJobs" />}
          <span className="text-[11px] text-slate-400">most recent first · click a completed job for real per-metric scores</span>
        </div>
        {loading ? (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : ragJobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                  <th scope="col" className="font-medium pb-2">Job</th>
                  <th scope="col" className="font-medium pb-2">Task types</th>
                  <th scope="col" className="font-medium pb-2">Model</th>
                  <th scope="col" className="font-medium pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {ragJobs.slice(0, 12).map((j, i) => {
                  const completed = j.status.toLowerCase() === 'completed';
                  const isOpen = openJob === j.name;
                  return (
                    <>
                      <tr
                        key={j.name || i}
                        className={`${i > 0 ? 'border-t border-slate-100' : ''} ${completed ? 'cursor-pointer hover:bg-slate-50/60' : ''}`}
                        onClick={completed ? () => setOpenJob(isOpen ? null : j.name) : undefined}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-800 max-w-[260px] truncate" title={j.name}>
                          {completed && <Icon name="chevron-down" className={`w-3 h-3 text-slate-400 inline-block align-middle mr-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2} />}
                          {j.name}
                        </td>
                        <td className="py-2 pr-2 text-slate-500">{[...new Set(j.task_types)].join(', ') || '—'}</td>
                        <td className="py-2 pr-2 text-slate-500">{j.models[0] ?? '—'}</td>
                        <td className="py-2 text-right">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${ragStatusBadge[j.status.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>{j.status}</span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-slate-100 bg-slate-50/30">
                          <td colSpan={4} className="px-2"><RagJobScores jobName={j.name} /></td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {ragJobs.length > 12 && <div className="text-[11px] text-slate-400 mt-2">+{ragJobs.length - 12} more RAG jobs</div>}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
            <div>
              <div className="font-medium text-slate-600">{live ? 'No RAG evaluation jobs found' : 'Bedrock evaluations unavailable'}</div>
              <div className="text-[11px] mt-0.5">
                {live
                  ? 'Run a RAG (Knowledge Base) evaluation in the Bedrock console and it appears here.'
                  : (data?.note ?? 'The evaluation jobs API is not reachable right now.')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RagEvaluations({ modelId, onNavigateTab }: { modelId?: string; onNavigateTab?: (tab: string) => void } = {}) {
  // Default the run to the shared dossier model when one exists.
  const defaultRun = (modelId && RAG_RUNS.find(r => r.modelId === modelId)?.id) ?? RAG_RUNS[0].id;
  const [runId, setRunId] = useState(defaultRun);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Follow the shared model selection when it changes.
  const [lastModel, setLastModel] = useState(modelId);
  if (modelId !== lastModel) {
    setLastModel(modelId);
    if (defaultRun !== runId) { setRunId(defaultRun); setExpanded(null); }
  }
  const run = RAG_RUNS.find(r => r.id === runId) ?? RAG_RUNS[0];

  return (
    <div className="space-y-6">
      {/* Page intro */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900">RAG Evaluations</h2>
        <p className="text-[11px] text-slate-500">Retrieval-augmented generation quality via Bedrock LLM-as-a-judge: faithfulness, context relevance, context coverage, and citation coverage over an FSI knowledge base.</p>
      </div>

      {/* Cross-link: RAG faithfulness/hallucination feed the gate */}
      {onNavigateTab && (
        <div className="text-[11px] text-slate-500 -mt-2 flex items-center gap-3">
          <span>Faithfulness and hallucination here feed the{' '}
          <button onClick={() => onNavigateTab('gate')} className="text-blue-600 hover:text-blue-700 font-medium">Deployment Gate →</button></span>
          <span className="text-slate-300">|</span>
          <span>See real-time detection:{' '}
          <a href="/govern/models?tab=operations" className="text-blue-600 hover:text-blue-700 font-medium">Hallucination Detection →</a></span>
        </div>
      )}

      {/* Live: real Bedrock RAG evaluation jobs + S3-parsed per-metric scores */}
      <LiveRagEvals />

      {/* ══ Illustrative RAG studio — grouped container mirroring the live zone above,
          so the live/illustrative boundary reads at a glance. The live scores() API
          returns only AGGREGATED per-metric means (no per-case rows), so this
          per-query context/score deep-dive stays illustrative. ══ */}
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/60 via-white to-white p-4 shadow-sm space-y-6">
        <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">RAG Evaluation Studio · illustrative</span>
            <MockDataBadge integration="Per-query retrieved context & scores illustrative — live RAG jobs & aggregated scores are in the panel above" />
            <span className="text-[10px] text-slate-400">deep-dive: per-query retrieved context + per-metric judge scores</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Run
            <select value={runId} onChange={e => { setRunId(e.target.value); setExpanded(null); }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
              {RAG_RUNS.map(r => <option key={r.id} value={r.id}>{r.modelName} · {r.knowledgeBase}</option>)}
            </select>
          </label>
        </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className={`${card} !p-4`} style={{ borderTop: `3px solid ${run.overallScore >= 90 ? '#10b981' : '#f59e0b'}` }}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Overall</div>
          <div className={`text-2xl font-semibold mt-1 ${scoreText(run.overallScore)}`}>{run.overallScore}</div>
          <div className="text-[10px] mt-0.5">
            <span className={`font-semibold px-1.5 rounded ${run.passing ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{run.passing ? 'PASS' : 'REVIEW'}</span>
          </div>
        </div>
        {RAG_METRICS.slice(0, 5).map(m => {
          const pct = metricPct(run, m.id);
          const isGood = good(m.id, run.aggregates[m.id]);
          return (
            <div key={m.id} className={`${card} !p-4`}>
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide truncate">{m.name}</div>
              <div className={`text-2xl font-semibold mt-1 ${isGood ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className="text-base mr-0.5 align-middle" aria-hidden="true">{isGood ? <Icon name="check" className="w-4 h-4 inline-block align-middle" /> : '!'}</span>{pct}{m.negative ? '%' : ''}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{m.negative ? 'lower better' : `wt ${m.weight}%`}</div>
            </div>
          );
        })}
      </div>

      {/* Metric breakdown */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-900">Metric Breakdown</h3>
          <span className="text-[10px] text-slate-400">{run.totalQueries} queries · avg latency {(run.cases.reduce((s, c) => s + c.latency, 0) / run.cases.length).toFixed(1)}s</span>
        </div>
        <p className="text-[10px] text-slate-400 mb-3">Bedrock reports per-metric scores; the weighted <span className="font-medium">Overall</span> and pass rule are this platform's governance overlay, not a Bedrock output.</p>
        <div className="space-y-2.5">
          {RAG_METRICS.map(m => {
            const pct = metricPct(run, m.id);
            const barPct = m.negative ? 100 - pct : pct;
            const isGood = good(m.id, run.aggregates[m.id]);
            return (
              <div key={m.id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="font-medium text-slate-700">{m.name} <span className="text-slate-400">· {m.desc}</span></span>
                  <span className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">wt {m.weight}%</span>
                    <span className={`font-bold ${isGood ? 'text-emerald-600' : 'text-amber-600'}`}><span className="mr-0.5" aria-hidden="true">{isGood ? <Icon name="check" className="w-3 h-3 inline-block align-middle" /> : '!'}</span>{pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: m.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Model comparison */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Overall RAG Score by Model</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={RAG_RUNS.map(r => ({ name: r.modelName.replace('Claude ', ''), score: r.overallScore, current: r.id === runId }))} margin={{ left: 5, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => `${v}%`) as Formatter<ValueType, NameType>} />
            <Bar dataKey="score" barSize={36} radius={[4, 4, 0, 0]}>
              {RAG_RUNS.map((r, i) => <Cell key={i} fill={r.id === runId ? '#2563eb' : '#cbd5e1'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-query table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Test Queries ({run.cases.length})</h3>
          <span className="text-[10px] text-slate-400">Click a query for retrieved context &amp; per-metric scores</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2.5 px-5 text-left font-medium">Query</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium" title="Faithfulness">Faith</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium" title="Response Relevance">Rel</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium" title="Context Relevance">Ctx Rel</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium" title="Context Coverage">Ctx Cov</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium" title="Hallucination (lower better)">Halluc</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium" title="Citation Coverage">Cite</th>
              <th scope="col" className="py-2.5 px-2 text-center font-medium">Src</th>
              <th scope="col" className="py-2.5 px-4 text-right font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {run.cases.map((c, i) => (
              <RagRow key={i} item={c} isExpanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

function cell(id: RagMetricId, v: number) {
  const pct = Math.round(v * 100);
  const isGood = good(id, v);
  return <span className={`font-semibold ${isGood ? 'text-emerald-600' : 'text-amber-600'}`}><span className="mr-0.5" aria-hidden="true">{isGood ? <Icon name="check" className="w-3 h-3 inline-block align-middle" /> : '!'}</span>{pct}</span>;
}

function RagRow({ item, isExpanded, onToggle }: { item: RagCase; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        {...rowButtonProps(onToggle, 'Toggle query details')}
        aria-expanded={isExpanded}
        className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors focus:outline-none focus:bg-blue-50/50 ${isExpanded ? 'bg-blue-50/30' : ''}`}
      >
        <td className="py-2.5 px-5 max-w-sm">
          <div className="text-slate-700 truncate">{item.query}</div>
          <div className="text-[10px] text-slate-400">{item.category} · {item.latency}s</div>
        </td>
        <td className="py-2.5 px-2 text-center">{cell('faithfulness', item.scores.faithfulness)}</td>
        <td className="py-2.5 px-2 text-center">{cell('relevance', item.scores.relevance)}</td>
        <td className="py-2.5 px-2 text-center">{cell('context_precision', item.scores.context_precision)}</td>
        <td className="py-2.5 px-2 text-center">{cell('context_recall', item.scores.context_recall)}</td>
        <td className="py-2.5 px-2 text-center"><span className={`font-semibold ${item.scores.hallucination <= 0.05 ? 'text-emerald-600' : 'text-rose-600'}`}><span className="mr-0.5" aria-hidden="true">{item.scores.hallucination <= 0.05 ? <Icon name="check" className="w-3 h-3 inline-block align-middle" /> : <Icon name="x-mark" className="w-3 h-3 inline-block align-middle" />}</span>{Math.round(item.scores.hallucination * 100)}%</span></td>
        <td className="py-2.5 px-2 text-center">{cell('groundedness', item.scores.groundedness)}</td>
        <td className="py-2.5 px-2 text-center text-slate-500">{item.sources.length}</td>
        <td className="py-2.5 px-4 text-right">
          <Icon name="chevron-down" className={`w-3.5 h-3.5 text-slate-400 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} strokeWidth={2} />
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-slate-50/70 px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Answer */}
              <div>
                <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Generated Answer</div>
                <div className="text-[11px] text-slate-700 leading-relaxed bg-white rounded-lg p-3 border border-slate-200/70">{item.answer}</div>
              </div>
              {/* Retrieved context */}
              <div>
                <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Retrieved Context ({item.sources.length} chunks)</div>
                <div className="space-y-1.5">
                  {item.sources.map((s, i) => (
                    <div key={i} className="bg-white rounded-lg p-2.5 border border-slate-200/70">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[9px] text-slate-400 truncate max-w-[70%]">{s.location}</span>
                        <span className={`text-[9px] font-semibold px-1.5 rounded ${s.score >= 0.85 ? 'bg-emerald-100 text-emerald-700' : s.score >= 0.7 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>rel {s.score.toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] text-slate-600 leading-relaxed">{s.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
