/**
 * RagEvaluations — Retrieval-Augmented Generation quality evaluation.
 *
 * 6-metric LLM-as-Judge model (faithfulness, response relevance, context relevance,
 * context coverage, hallucination, citation coverage) with weighted overall score,
 * per-query drill-down, and retrieved-context inspection. Ported from the AI Trust
 * Tool's RAG analysis.
 */

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { tooltipStyle } from './mockData';
import {
  RAG_RUNS, RAG_METRICS, type RagEvalRun, type RagCase, type RagMetricId,
} from './ragEvalData';
import { rowButtonProps } from './a11y';

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';

const metricPct = (run: RagEvalRun, id: RagMetricId) => Math.round(run.aggregates[id] * 100);
const good = (id: RagMetricId, v: number) => {
  const m = RAG_METRICS.find(x => x.id === id)!;
  return m.negative ? v <= m.good : v >= m.good;
};
const scoreText = (pct: number) => (pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600');

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
      {/* Header + run selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">RAG Evaluations</h2>
          <p className="text-[11px] text-slate-500">Retrieval-augmented generation quality via Bedrock LLM-as-a-judge: faithfulness, context relevance, context coverage, and citation coverage over an FSI knowledge base.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Run
          <select value={runId} onChange={e => { setRunId(e.target.value); setExpanded(null); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
            {RAG_RUNS.map(r => <option key={r.id} value={r.id}>{r.modelName} · {r.knowledgeBase}</option>)}
          </select>
        </label>
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
                <span className="text-base mr-0.5 align-middle" aria-hidden="true">{isGood ? '✓' : '!'}</span>{pct}{m.negative ? '%' : ''}
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
                    <span className={`font-bold ${isGood ? 'text-emerald-600' : 'text-amber-600'}`}><span className="mr-0.5" aria-hidden="true">{isGood ? '✓' : '!'}</span>{pct}%</span>
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
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
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
  );
}

function cell(id: RagMetricId, v: number) {
  const pct = Math.round(v * 100);
  const isGood = good(id, v);
  return <span className={`font-semibold ${isGood ? 'text-emerald-600' : 'text-amber-600'}`}><span className="mr-0.5" aria-hidden="true">{isGood ? '✓' : '!'}</span>{pct}</span>;
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
        <td className="py-2.5 px-2 text-center"><span className={`font-semibold ${item.scores.hallucination <= 0.05 ? 'text-emerald-600' : 'text-rose-600'}`}><span className="mr-0.5" aria-hidden="true">{item.scores.hallucination <= 0.05 ? '✓' : '✕'}</span>{Math.round(item.scores.hallucination * 100)}%</span></td>
        <td className="py-2.5 px-2 text-center">{cell('groundedness', item.scores.groundedness)}</td>
        <td className="py-2.5 px-2 text-center text-slate-500">{item.sources.length}</td>
        <td className="py-2.5 px-4 text-right">
          <svg className={`w-3.5 h-3.5 text-slate-400 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
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
