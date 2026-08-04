/**
 * AgentCoreEvaluations — Agentic evaluation for Bedrock AgentCore runtimes.
 *
 * Evaluates AGENT behavior (not just model output): tool selection/parameters,
 * goal success, and assertion compliance, with per-scenario trace drill-down.
 * Includes baseline drift/regression and a synthetic test-set generator.
 *
 * AgentCore Evaluations (GA ~Mar 2026, preview Dec 2025) scores agent sessions
 * via LLM-as-Judge over OpenTelemetry/OpenInference traces in CloudWatch Logs,
 * through on-demand (Evaluate API), online, and batch evaluation. The per-step
 * trace visualization here is our UX layer; AgentCore returns per-evaluator
 * scores with judge reasoning, not a per-step correct/wrong verdict.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Icon } from './icons';
import { tooltipStyle } from './mockData';
import {
  AGENT_EVAL_JOBS, EVALUATORS, GROUP_LABEL, GROUP_COLOR, STEP_META,
  computeDrift, generateTestSet,
  type AgentEvalJob, type ScenarioResult, type EvaluatorGroup, type GeneratedTestCase,
} from './agentEvalData';
import UnifiedGuide, { AGENT_EVAL_GUIDE } from './UnifiedGuide';
import { rowButtonProps } from './a11y';
import { MockDataBadge } from './DataSourceIndicator';

type View = 'results' | 'catalog' | 'drift' | 'generator';

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';
const evLabel = (id: string) => EVALUATORS.find(e => e.id === id)?.label ?? id.replace('Builtin.', '');
const scoreText = (pct: number) => (pct >= 85 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-rose-600');

export default function AgentCoreEvaluations() {
  const [view, setView] = useState<View>('results');
  const [jobName, setJobName] = useState(AGENT_EVAL_JOBS.find(j => !j.isBaseline)?.jobName ?? AGENT_EVAL_JOBS[0].jobName);
  const job = AGENT_EVAL_JOBS.find(j => j.jobName === jobName) ?? AGENT_EVAL_JOBS[0];

  return (
    <div className="space-y-6">
      <UnifiedGuide {...AGENT_EVAL_GUIDE} />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Agentic Evaluations — Bedrock AgentCore</h2>
            <MockDataBadge />
          </div>
          <p className="text-[11px] text-slate-500">Evaluate deployed agent runtimes on tool use, goal success, and assertion compliance using AgentCore built-in evaluators (on-demand, online, and batch).</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Evaluating the underlying model's quality instead? See{' '}
            <Link to="/govern/models?tab=evaluations" className="text-blue-600 hover:text-blue-700 font-medium">Model Evaluations →</Link>
          </p>
        </div>
        <a href="https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations.html" target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1">
          AgentCore Evaluations docs ↗
        </a>
      </div>

      {/* View sub-nav */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([['results', 'Results'], ['catalog', 'Evaluator Catalog'], ['drift', 'Baseline Drift'], ['generator', 'Test-Set Generator']] as [View, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'results' && <ResultsView job={job} jobName={jobName} setJobName={setJobName} />}
      {view === 'catalog' && <CatalogView />}
      {view === 'drift' && <DriftView job={job} jobName={jobName} setJobName={setJobName} />}
      {view === 'generator' && <GeneratorView />}
    </div>
  );
}

/* ───────── Results ───────── */
function ResultsView({ job, jobName, setJobName }: { job: AgentEvalJob; jobName: string; setJobName: (n: string) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const goalRate = Math.round(job.scenarios.filter(s => s.goalSuccess).length / job.scenarios.length * 100);

  return (
    <div className="space-y-4">
      {/* Job selector + KPIs */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Job
          <select value={jobName} onChange={e => { setJobName(e.target.value); setExpanded(null); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
            {AGENT_EVAL_JOBS.map(j => <option key={j.jobName} value={j.jobName}>{j.agentName} · {j.jobName}{j.isBaseline ? ' (baseline)' : ''}</option>)}
          </select>
        </label>
        <span className="text-[10px] text-slate-400 font-mono">{job.agentArn}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`${card} !p-4`} style={{ borderTop: `3px solid ${job.overallScore >= 85 ? '#10b981' : '#f59e0b'}` }}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Overall</div>
          <div className={`text-2xl font-semibold mt-1 ${scoreText(job.overallScore)}`}>{job.overallScore}</div>
        </div>
        <div className={`${card} !p-4`}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Goal Success</div>
          <div className={`text-2xl font-semibold mt-1 ${scoreText(goalRate)}`}>{goalRate}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{job.scenarios.filter(s => s.goalSuccess).length}/{job.scenarios.length} scenarios</div>
        </div>
        <div className={`${card} !p-4`}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Tool Selection</div>
          <div className="text-2xl font-semibold mt-1 text-blue-600">{Math.round((job.aggregateScores['Builtin.ToolSelectionAccuracy'] ?? 0) * 100)}%</div>
        </div>
        <div className={`${card} !p-4`}>
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Harmfulness</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-600">{Math.round((job.aggregateScores['Builtin.Harmfulness'] ?? 0) * 100)}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">lower better</div>
        </div>
      </div>

      {/* Evaluator aggregates */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Evaluator Scores</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={job.evaluators.map(ev => ({ name: evLabel(ev), score: Math.round(job.aggregateScores[ev] * 100), neg: ev === 'Builtin.Harmfulness' }))} layout="vertical" margin={{ left: 5, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
            <YAxis dataKey="name" type="category" width={130} tick={{ fill: '#475569', fontSize: 9 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Bar dataKey="score" barSize={14} radius={[0, 4, 4, 0]}>
              {job.evaluators.map((ev, i) => <Cell key={i} fill={ev === 'Builtin.Harmfulness' ? '#dc2626' : '#2563eb'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-scenario table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Scenarios ({job.scenarios.length})</h3>
          <span className="text-[10px] text-slate-400">Click a scenario for trajectory &amp; assertions</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2.5 px-5 text-left font-medium">Scenario</th>
              <th scope="col" className="py-2.5 px-3 text-left font-medium">Expected Tool</th>
              <th scope="col" className="py-2.5 px-3 text-center font-medium">Goal</th>
              <th scope="col" className="py-2.5 px-3 text-center font-medium">Assertions</th>
              <th scope="col" className="py-2.5 px-3 text-center font-medium">Steps</th>
              <th scope="col" className="py-2.5 px-3 text-right font-medium">Latency</th>
              <th scope="col" className="py-2.5 px-4 text-right font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {job.scenarios.map((s, i) => (
              <ScenarioRow key={s.scenarioId} item={s} isExpanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioRow({ item, isExpanded, onToggle }: { item: ScenarioResult; isExpanded: boolean; onToggle: () => void }) {
  const metCount = item.assertions.filter(a => a.met).length;
  return (
    <>
      <tr
        {...rowButtonProps(onToggle, 'Toggle scenario details')}
        aria-expanded={isExpanded}
        className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors focus:outline-none focus:bg-blue-50/50 ${isExpanded ? 'bg-blue-50/30' : ''}`}
      >
        <td className="py-2.5 px-5 max-w-sm">
          <div className="font-medium text-slate-800 text-[12px] font-mono">{item.scenarioId}</div>
          <div className="text-[10px] text-slate-400 truncate">{item.prompt}</div>
        </td>
        <td className="py-2.5 px-3"><span className={`text-[10px] px-2 py-0.5 rounded ${item.expectedTool === 'refuse' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{item.expectedTool}</span></td>
        <td className="py-2.5 px-3 text-center"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${item.goalSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{item.goalSuccess ? 'PASS' : 'FAIL'}</span></td>
        <td className="py-2.5 px-3 text-center"><span className={`text-[11px] font-semibold ${metCount === item.assertions.length ? 'text-emerald-600' : 'text-amber-600'}`}>{metCount}/{item.assertions.length}</span></td>
        <td className="py-2.5 px-3 text-center text-slate-500 text-[11px]">{item.trajectory.length}</td>
        <td className="py-2.5 px-3 text-right text-slate-500 text-[11px]">{(item.latencyMs / 1000).toFixed(1)}s</td>
        <td className="py-2.5 px-4 text-right">
          <svg className={`w-3.5 h-3.5 text-slate-400 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-slate-50/70 px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Trajectory */}
              <div>
                <div className="text-[10px] font-semibold text-cyan-700 uppercase tracking-wide mb-2">Agent Trajectory</div>
                <div className="space-y-1.5">
                  {item.trajectory.map((step, i) => {
                    const meta = STEP_META[step.type];
                    const vBadge = step.verdict === 'wrong' ? 'bg-rose-100 text-rose-700' : step.verdict === 'extra' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                    return (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: meta.color }} />
                          {i < item.trajectory.length - 1 && <div className="w-px flex-1 bg-slate-200 my-0.5" style={{ minHeight: 14 }} />}
                        </div>
                        <div className="flex-1 bg-white rounded-lg p-2 border border-slate-200/70">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}{step.tool ? `: ${step.tool}` : ''}</span>
                            {step.verdict && <span className={`text-[8px] font-semibold px-1.5 rounded ${vBadge}`}>{step.verdict}</span>}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">{step.text}</div>
                          {step.params && <div className="font-mono text-[9px] text-slate-400 mt-0.5">{step.params}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Response + assertions */}
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Agent Response</div>
                  <div className="text-[11px] text-slate-700 leading-relaxed bg-white rounded-lg p-3 border border-slate-200/70 max-h-32 overflow-auto">{item.response}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">Assertions ({item.assertions.filter(a => a.met).length}/{item.assertions.length} met)</div>
                  <div className="space-y-1">
                    {item.assertions.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px]">
                        <Icon name={a.met ? 'check' : 'x-mark'} className={`w-3 h-3 ${a.met ? 'text-emerald-600' : 'text-rose-600'}`} />
                        <span className={a.met ? 'text-slate-600' : 'text-rose-600'}>{a.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────── Evaluator catalog ───────── */
function CatalogView() {
  const groups: EvaluatorGroup[] = ['session', 'trace', 'tool', 'safety'];
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">AgentCore's built-in evaluators, organized by AWS scope: session-level (whole conversation), trace-level (per response), and tool-level (per tool call). Expected tool trajectories are supplied as ground truth and graded by the tool-level evaluators.</p>
      {groups.map(g => (
        <div key={g} className={card}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GROUP_COLOR[g] }} />
            <h3 className="text-sm font-semibold text-slate-900">{GROUP_LABEL[g]}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {EVALUATORS.filter(e => e.group === g).map(e => (
              <div key={e.id} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100" style={{ borderLeft: `3px solid ${GROUP_COLOR[g]}` }}>
                <div className="text-[11px] font-semibold text-slate-800">{e.label}</div>
                <div className="font-mono text-[9px] text-slate-400">{e.id}</div>
                <div className="text-[10px] text-slate-500 mt-1">{e.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────── Drift ───────── */
function DriftView({ job, jobName, setJobName }: { job: AgentEvalJob; jobName: string; setJobName: (n: string) => void }) {
  const drift = computeDrift(job);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Compare job
          <select value={jobName} onChange={e => setJobName(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
            {AGENT_EVAL_JOBS.filter(j => !j.isBaseline).map(j => <option key={j.jobName} value={j.jobName}>{j.agentName} · {j.jobName}</option>)}
          </select>
        </label>
        <span className="text-[10px] text-slate-400">vs the agent's locked baseline · regression threshold &gt;10% drop</span>
      </div>
      {!drift ? (
        <div className={`${card} text-center text-slate-500 text-sm`}>No baseline found for this agent. Set a baseline job to enable drift detection.</div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="py-2.5 px-5 text-left font-medium">Evaluator</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Baseline</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Latest</th>
                <th scope="col" className="py-2.5 px-3 text-center font-medium">Δ</th>
                <th scope="col" className="py-2.5 px-5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {drift.map(d => (
                <tr key={d.evaluator} className="border-t border-slate-100">
                  <td className="py-2.5 px-5 font-medium text-slate-800">{evLabel(d.evaluator)}</td>
                  <td className="py-2.5 px-3 text-center text-slate-500">{Math.round(d.baseline * 100)}%</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{Math.round(d.latest * 100)}%</td>
                  <td className={`py-2.5 px-3 text-center font-semibold ${d.delta > 0 ? 'text-emerald-600' : d.delta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{d.delta > 0 ? '+' : ''}{Math.round(d.delta * 100)}%</td>
                  <td className="py-2.5 px-5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${d.status === 'regressed' ? 'bg-rose-100 text-rose-700' : d.status === 'improved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 text-[10px] text-slate-400 border-t border-slate-100">
            Regressions beyond threshold should block promotion and trigger a quality-monitor alert (circuit breaker can suspend the runtime).
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Test-set generator ───────── */
function GeneratorView() {
  const [useCase, setUseCase] = useState('customer_care');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [count, setCount] = useState(10);
  const [cases, setCases] = useState<GeneratedTestCase[]>([]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Generate Synthetic Test Set</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">Use case
            <select value={useCase} onChange={e => setUseCase(e.target.value)} className="block mt-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
              <option value="customer_care">Customer Care</option>
              <option value="disputes">Disputes</option>
              <option value="lending">Lending</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">Difficulty
            <select value={difficulty} onChange={e => setDifficulty(e.target.value as typeof difficulty)} className="block mt-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="mixed">Mixed</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">Count
            <select value={count} onChange={e => setCount(Number(e.target.value))} className="block mt-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
              <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
            </select>
          </label>
          <button onClick={() => setCases(generateTestSet(useCase, difficulty, count))}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Generate
          </button>
        </div>
      </div>

      {cases.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-[11px] text-slate-500">{cases.length} cases · AgentCore-evaluate compatible</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="py-2 px-5 text-left font-medium">ID</th>
                <th scope="col" className="py-2 px-3 text-left font-medium">Persona</th>
                <th scope="col" className="py-2 px-3 text-left font-medium">Issue</th>
                <th scope="col" className="py-2 px-3 text-center font-medium">Difficulty</th>
                <th scope="col" className="py-2 px-3 text-left font-medium">Expected Policy</th>
                <th scope="col" className="py-2 px-3 text-center font-medium">Escalate</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-2 px-5 font-mono text-[10px] text-slate-500">{c.id}</td>
                  <td className="py-2 px-3 text-[11px] text-slate-700">{c.persona.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-3 text-[11px] text-slate-700">{c.issueTag}</td>
                  <td className="py-2 px-3 text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${c.difficulty === 'hard' ? 'bg-rose-100 text-rose-700' : c.difficulty === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{c.difficulty}</span></td>
                  <td className="py-2 px-3 font-mono text-[10px] text-slate-500">{c.expectedPolicy}</td>
                  <td className="py-2 px-3 text-center text-[11px]">{c.expectedEscalation ? <Icon name="check" className="w-3.5 h-3.5 inline text-emerald-600" /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
