/**
 * DataReadiness — AI Data Readiness Assessment (LIVE)
 *
 * Computes readiness scores from live AWS data:
 * - Guardrails (Bedrock)
 * - Invocation Logs
 * - CloudTrail
 * - AWS Config
 * - Security Hub
 * - Service Approvals
 *
 * No user deployment required - uses existing AWS data.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useDataReadiness } from './useDataReadiness';
import { MATURITY_QUESTIONS, MATURITY_LEVELS } from './dataGovernanceData';
import { LiveDataBadge } from '../DataSourceIndicator';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px' };

export default function DataReadiness() {
  const readiness = useDataReadiness();

  const met = readiness.dimensions.filter(d => d.status === 'met').length;
  const atRisk = readiness.dimensions.filter(d => d.status === 'at-risk').length;
  const notMet = readiness.dimensions.filter(d => d.status === 'not-met').length;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">AI Data Readiness</h1>
              <LiveDataBadge />
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                {readiness.liveSourcesCount}/{readiness.totalSourcesCount} live
              </span>
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              7-dimension assessment computed from live AWS data. No additional setup required.
            </p>
          </div>
          <button
            onClick={readiness.refresh}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Refresh
          </button>
        </div>

        {readiness.loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-sm text-slate-500">Loading readiness data from AWS...</span>
            </div>
          </div>
        ) : readiness.error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
            <p className="text-sm text-rose-700">Error loading readiness data: {readiness.error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Maturity Self-Assessment */}
            <MaturityAssessment />

            {/* Hero banner */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-50/80 to-blue-50/80 border border-cyan-200/60 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-cyan-800">AI Data Readiness Assessment</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Computed from {readiness.liveSourcesCount} live AWS data sources. Target: {readiness.overallTarget}+ to be AI-Ready.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    readiness.status === 'ai-ready' ? 'bg-emerald-100 text-emerald-700' :
                    readiness.status === 'partially-ready' ? 'bg-amber-100 text-amber-700' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {readiness.overallScore}/100
                  </span>
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">{met} met</span>
                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-medium">{atRisk} at-risk</span>
                  <span className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-medium">{notMet} not met</span>
                </div>
              </div>
            </div>

            {/* Score + Radar + Bar */}
            <div className="grid grid-cols-[200px_1fr_1fr] gap-4">
              {/* Overall score card */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center border-t-4 border-t-cyan-500">
                <div className="text-xs text-slate-500">Overall Readiness</div>
                <div className={`text-5xl font-bold ${
                  readiness.status === 'ai-ready' ? 'text-emerald-600' :
                  readiness.status === 'partially-ready' ? 'text-amber-600' :
                  'text-rose-600'
                }`}>
                  {readiness.overallScore}
                </div>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                  readiness.status === 'ai-ready' ? 'bg-emerald-100 text-emerald-700' :
                  readiness.status === 'partially-ready' ? 'bg-amber-100 text-amber-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {readiness.status === 'ai-ready' ? 'AI-Ready' : readiness.status === 'partially-ready' ? 'Partially Ready' : 'Not Ready'}
                </span>
                <div className="mt-4 text-left">
                  <div className="text-[10px] text-slate-500 mb-1">Data sources:</div>
                  {readiness.dimensions.slice(0, 4).map(d => (
                    <div key={d.id} className="flex items-center gap-1 text-[9px] text-slate-600 mb-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${d.live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {d.source}
                    </div>
                  ))}
                </div>
              </div>

              {/* Radar chart */}
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Readiness Radar</h4>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={readiness.dimensions.map(d => ({
                    dimension: d.name.split(' ').pop(),
                    score: d.score,
                    target: d.target,
                  }))}>
                    <PolarGrid stroke="#cbd5e1" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: '#475569', fontSize: 9 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
                    <Radar name="Current" dataKey="score" stroke="#0891b2" fill="#0891b2" fillOpacity={0.3} />
                    <Radar name="Target" dataKey="target" stroke="#d97706" fill="none" strokeDasharray="5 5" />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Bar chart */}
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Dimension Scores</h4>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={readiness.dimensions.map(d => ({
                      name: d.name.split(' ').pop(),
                      score: d.score,
                      target: d.target,
                    }))}
                    layout="vertical"
                    margin={{ left: 70, right: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 9 }} width={65} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="score" name="Current" radius={[0, 4, 4, 0]}>
                      {readiness.dimensions.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.status === 'met' ? '#10b981' : d.status === 'at-risk' ? '#f59e0b' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Dimension detail cards */}
            <div className="grid grid-cols-2 gap-4">
              {readiness.dimensions.map((d) => (
                <div
                  key={d.id}
                  className={`bg-white rounded-xl border p-4 border-l-4 ${
                    d.status === 'met' ? 'border-l-emerald-500' :
                    d.status === 'at-risk' ? 'border-l-amber-500' :
                    'border-l-rose-500'
                  } border-slate-200`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{d.name}</h4>
                      <span className={`w-2 h-2 rounded-full ${d.live ? 'bg-emerald-500' : 'bg-slate-300'}`} title={d.live ? 'Live data' : 'Estimated'} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        d.status === 'met' ? 'text-emerald-600' : d.status === 'at-risk' ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {d.score}
                      </span>
                      <span className="text-xs text-slate-500">/ {d.target}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        d.status === 'met' ? 'bg-emerald-100 text-emerald-700' :
                        d.status === 'at-risk' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {d.status}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full mb-3">
                    <div
                      className={`h-2 rounded-full ${
                        d.status === 'met' ? 'bg-emerald-500' :
                        d.status === 'at-risk' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${d.score}%` }}
                    />
                  </div>

                  <p className="text-xs text-slate-600 mb-2">{d.description}</p>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{d.source}</span>
                    <span className="text-[9px] text-slate-500">{d.sourceDetail}</span>
                  </div>

                  <div className="text-[10px] text-slate-500 mb-1 font-medium">Findings:</div>
                  {d.findings.map((f, i) => (
                    <div key={i} className="text-[10px] text-slate-600 mb-0.5 pl-2">• {f}</div>
                  ))}

                  <div className="text-[10px] text-blue-600 mt-2 mb-1 font-medium">Actions:</div>
                  {d.actions.slice(0, 2).map((a, i) => (
                    <div key={i} className="text-[10px] text-emerald-600 mb-0.5 pl-2">• {a}</div>
                  ))}
                </div>
              ))}
            </div>

            {/* Status callout */}
            <div className={`p-4 rounded-xl border ${
              readiness.status === 'ai-ready' ? 'bg-emerald-50 border-emerald-200' :
              readiness.status === 'partially-ready' ? 'bg-amber-50 border-amber-200' :
              'bg-rose-50 border-rose-200'
            }`}>
              <p className={`text-xs ${
                readiness.status === 'ai-ready' ? 'text-emerald-800' :
                readiness.status === 'partially-ready' ? 'text-amber-800' :
                'text-rose-800'
              }`}>
                <strong>
                  {readiness.status === 'ai-ready' ? 'AI-Ready!' :
                   readiness.status === 'partially-ready' ? 'Partially Ready' :
                   'Not Ready'}
                </strong>
                {' '}
                {readiness.status === 'ai-ready'
                  ? `Your data governance posture scores ${readiness.overallScore}/100, exceeding the ${readiness.overallTarget} threshold. All ${readiness.liveSourcesCount} dimensions assessed from live AWS data.`
                  : readiness.status === 'partially-ready'
                    ? `Score ${readiness.overallScore}/100 (target: ${readiness.overallTarget}). Focus on dimensions marked "at-risk" or "not-met" to improve readiness.`
                    : `Score ${readiness.overallScore}/100 (target: ${readiness.overallTarget}). Multiple dimensions need attention before AI workloads are production-ready.`
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MaturityAssessment() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState(false);

  const answered = Object.keys(answers).length;
  const total = MATURITY_QUESTIONS.length;
  const avgScore = answered > 0 ? Object.values(answers).reduce((s, v) => s + v, 0) / answered : 0;
  const maturityLevel = useMemo(() =>
    MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1]) || MATURITY_LEVELS[0],
  [avgScore]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-slate-800">Data Governance Maturity Self-Assessment</span>
            {answered === total && (
              <span
                className="ml-2 text-[9px] px-2 py-0.5 rounded font-semibold text-white"
                style={{ backgroundColor: maturityLevel.color }}
              >
                {maturityLevel.level}
              </span>
            )}
            <div className="text-[10px] text-slate-500">{expanded ? 'Click to collapse' : 'Optional: self-assess maturity level'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">{answered}/{total} answered</span>
          <div className="w-16 h-1.5 bg-slate-200 rounded-full">
            <div
              className="h-1.5 bg-blue-500 rounded-full transition-all"
              style={{ width: `${(answered / total) * 100}%` }}
            />
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
            {MATURITY_QUESTIONS.map((q, qi) => (
              <div
                key={qi}
                className="p-3 bg-slate-50 rounded-lg"
                style={{
                  borderLeft: `3px solid ${
                    answers[qi]
                      ? answers[qi] >= 3 ? '#10b981' : answers[qi] >= 2 ? '#f59e0b' : '#ef4444'
                      : '#cbd5e1'
                  }`
                }}
              >
                <div className="text-[10px] font-semibold text-slate-800 mb-1">{q.dimension}</div>
                <div className="text-[9px] text-slate-600 mb-2">{q.question}</div>
                <div className="space-y-1">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => setAnswers(prev => ({ ...prev, [qi]: opt.score }))}
                      className={`w-full text-left px-2 py-1.5 text-[9px] rounded transition-colors ${
                        answers[qi] === opt.score
                          ? 'bg-blue-100 border border-blue-400 text-slate-800'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {answered === total && (
            <div
              className="mt-4 p-4 bg-slate-50 rounded-lg border"
              style={{ borderColor: `${maturityLevel.color}40` }}
            >
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <div className="text-center">
                  <div className="text-4xl font-bold" style={{ color: maturityLevel.color }}>
                    {avgScore.toFixed(1)}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: maturityLevel.color }}>
                    {maturityLevel.level}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1">of 4.0</div>
                </div>
                <div>
                  <p className="text-xs text-slate-700 mb-2">{maturityLevel.desc}</p>
                  <div className="text-[10px] text-blue-600 font-semibold mb-1">Priority Actions:</div>
                  {maturityLevel.actions.map((a, i) => (
                    <div key={i} className="text-[10px] text-slate-600 mb-0.5 pl-2">• {a}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
