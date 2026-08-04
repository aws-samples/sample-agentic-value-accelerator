/**
 * DataMaturity — Maturity journey with assessment and roadmap
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';
import { MockDataBadge } from '../DataSourceIndicator';
import UnifiedGuide, { DATA_MATURITY_GUIDE } from '../UnifiedGuide';
import { MATURITY_QUESTIONS, MATURITY_LEVELS, MATURITY_ROADMAP } from './dataGovernanceData';

type SubTab = 'assessment' | 'roadmap' | 'raci';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'assessment', label: 'Self-Assessment' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'raci', label: 'RACI Matrix' },
];

export default function DataMaturity() {
  const [subTab, setSubTab] = useState<SubTab>('assessment');
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const dimensionScores = MATURITY_QUESTIONS.map(q => ({
    dimension: q.dimension,
    score: answers[q.dimension] ?? 0,
    answered: q.dimension in answers,
  }));

  const answeredCount = Object.keys(answers).length;
  const avgScore = answeredCount > 0
    ? dimensionScores.reduce((s, d) => s + d.score, 0) / answeredCount
    : 0;

  const currentLevel = MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1])
    ?? MATURITY_LEVELS[0];

  const radarData = MATURITY_QUESTIONS.map(q => ({
    dimension: q.dimension.split(' ').slice(0, 2).join(' '),
    score: answers[q.dimension] ?? 0,
    target: 3,
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Maturity Journey</h1>
              <MockDataBadge integration="Assessment Framework" />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Initial → Developing → Defined → Optimizing maturity model with AWS implementation guidance.
            </p>
          </div>
        </div>

        {/* Make This Live in AWS */}
        <UnifiedGuide {...DATA_MATURITY_GUIDE} />

        {/* Header summary */}
        <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-blue-200 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Data Governance Maturity</h2>
              <p className="text-sm text-slate-600 mt-1">
                Complete the self-assessment to identify gaps and get a personalized roadmap.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                avgScore >= 3.5 ? 'bg-emerald-100 text-emerald-700' :
                avgScore >= 2.5 ? 'bg-blue-100 text-blue-700' :
                avgScore >= 1.5 ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {answeredCount > 0 ? `${avgScore.toFixed(1)}/4.0` : 'Not Started'} {answeredCount > 0 && `(${currentLevel.level})`}
              </span>
              <span className="text-xs text-slate-500">{answeredCount}/{MATURITY_QUESTIONS.length} answered</span>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-6">
          {SUB_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                subTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Assessment */}
        {subTab === 'assessment' && (
          <div className="grid grid-cols-[1fr_300px] gap-6">
            <div className="space-y-4">
              {MATURITY_QUESTIONS.map(q => (
                <div key={q.dimension} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">{q.dimension}</h4>
                    {answers[q.dimension] !== undefined && (
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        answers[q.dimension] >= 3 ? 'bg-emerald-100 text-emerald-700' :
                        answers[q.dimension] >= 2 ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {answers[q.dimension]}/4
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mb-3">{q.question}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <button
                        key={oi}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.dimension]: opt.score }))}
                        className={`text-left p-3 rounded-lg text-xs transition-colors ${
                          answers[q.dimension] === opt.score
                            ? 'bg-blue-100 border-2 border-blue-500 text-slate-900'
                            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-medium">{opt.score}.</span> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">Maturity Radar</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: '#475569', fontSize: 9 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 4]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                    <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                    <Radar name="Target" dataKey="target" stroke="#10b981" fill="none" strokeDasharray="4 4" />
                  </RadarChart>
                </ResponsiveContainer>

                {answeredCount === MATURITY_QUESTIONS.length && (
                  <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: `${currentLevel.color}15`, borderColor: `${currentLevel.color}40`, borderWidth: 1 }}>
                    <div className="text-center mb-2">
                      <span className="text-3xl font-bold" style={{ color: currentLevel.color }}>{avgScore.toFixed(1)}</span>
                      <span className="text-xs text-slate-500 ml-1">/ 4.0</span>
                    </div>
                    <div className="text-center text-sm font-semibold" style={{ color: currentLevel.color }}>
                      {currentLevel.level}
                    </div>
                    <p className="text-xs text-slate-600 mt-2">{currentLevel.desc}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Roadmap */}
        {subTab === 'roadmap' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Implementation Roadmap</h3>
            <div className="space-y-6">
              {MATURITY_ROADMAP.phases.map((phase, i) => (
                <div key={phase.id} className="p-4 bg-slate-50 rounded-lg border-l-4" style={{ borderLeftColor: phase.color }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold" style={{ backgroundColor: phase.color }}>
                      {i + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{phase.name}</h4>
                      <span className="text-xs text-slate-500">{phase.timeline} • Target: {phase.targetScore}/4.0</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-3">{phase.description}</p>
                  <div className="space-y-2">
                    {phase.tasks.map((task, ti) => (
                      <div key={ti} className="flex items-center gap-3 p-2 bg-white rounded border border-slate-100">
                        <span className={`w-2 h-2 rounded-full ${
                          task.status === 'done' ? 'bg-emerald-500' :
                          task.status === 'in-progress' ? 'bg-blue-500' :
                          'bg-slate-300'
                        }`} />
                        <span className="text-xs text-slate-700 flex-1">{task.task}</span>
                        <span className="text-[10px] text-slate-500">{task.owner}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          task.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                          task.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RACI */}
        {subTab === 'raci' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Data Governance RACI Matrix</h3>
            <p className="text-xs text-slate-500 mb-4">
              <strong>R</strong> = Responsible, <strong>A</strong> = Accountable, <strong>C</strong> = Consulted, <strong>I</strong> = Informed
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-200">
                    <th scope="col" className="pb-2 font-medium text-slate-700">Activity</th>
                    <th scope="col" className="pb-2 font-medium text-blue-600">Responsible</th>
                    <th scope="col" className="pb-2 font-medium text-rose-600">Accountable</th>
                    <th scope="col" className="pb-2 font-medium text-amber-600">Consulted</th>
                    <th scope="col" className="pb-2 font-medium text-slate-600">Informed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MATURITY_ROADMAP.raci.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-3 font-medium text-slate-900">{r.activity}</td>
                      <td className="py-3 text-blue-700">{r.responsible}</td>
                      <td className="py-3 text-rose-700">{r.accountable}</td>
                      <td className="py-3 text-amber-700">{r.consulted}</td>
                      <td className="py-3 text-slate-600">{r.informed}</td>
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
