/**
 * TaskAssessment — Evaluate workloads for Agentic AI suitability
 *
 * Based on AWS Prescriptive Guidance: Understanding Agentic AI Economics
 * https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-economics/understanding.html
 *
 * 4-Factor Assessment:
 * - Complexity: Does it require reasoning and adaptive decisions?
 * - Standardization: Does it need contextual interpretation?
 * - Volume: Autonomous activities vs high-volume deterministic?
 * - Value: High-value outcomes requiring human-like autonomy?
 *
 * Plus Risk-Based Deployment Approach selection.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGovernanceAggregator } from '../useGovernanceAggregator';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import type { UseCase } from '../../../api/client';

interface TaskScore {
  complexity: number;
  standardization: number;
  volume: number;
  value: number;
}

interface Assessment {
  id: string;
  name: string;
  description: string;
  scores: TaskScore;
  riskProfile: 'low' | 'medium' | 'high' | 'critical';
  recommendedApproach: 'autonomous' | 'human-in-loop' | 'co-pilot' | 'human-led';
  estimatedROI: number;
  status: 'draft' | 'reviewed' | 'approved';
  createdAt: string;
}

const FACTOR_DEFINITIONS = {
  complexity: {
    label: 'Complexity',
    description: 'Does the task require reasoning, context understanding, and adaptive decisions?',
    lowLabel: 'Simple rules',
    highLabel: 'Complex reasoning',
    agenticFit: 'high',
  },
  standardization: {
    label: 'Standardization',
    description: 'Does the task need contextual interpretation vs deterministic workflows?',
    lowLabel: 'Deterministic',
    highLabel: 'Contextual',
    agenticFit: 'high',
  },
  volume: {
    label: 'Volume Pattern',
    description: 'Is it autonomous decision-making or high-volume repetitive processing?',
    lowLabel: 'High-volume batch',
    highLabel: 'Autonomous decisions',
    agenticFit: 'high',
  },
  value: {
    label: 'Value Impact',
    description: 'Does success require human-like judgment for high-value outcomes?',
    lowLabel: 'Commodity task',
    highLabel: 'High-value outcome',
    agenticFit: 'high',
  },
};

// NOTE: This ladder scores WORKLOADS/use-cases (by risk range), not deployed
// agents. It is deliberately distinct from the canonical agent autonomy ladder
// (AGENT_SCOPE_META / autonomyLadder.ts). Its top rung "Human-Led" has no agent
// equivalent, and ordering is by recommended approach for a task's risk, not by
// an agent's earned scope level. Do not fold into the canonical L1-L4.
const DEPLOYMENT_APPROACHES = [
  {
    id: 'autonomous',
    label: 'Fully Autonomous',
    errorTolerance: '1-2%',
    costEfficiency: 'Highest',
    useCases: 'Data categorization, document routing, simple queries',
    color: '#10b981',
    riskRange: [0, 25],
  },
  {
    id: 'human-in-loop',
    label: 'Human-in-the-Loop',
    errorTolerance: '<0.5%',
    costEfficiency: 'High',
    useCases: 'Draft responses, claims processing, recommendations',
    color: '#3b82f6',
    riskRange: [25, 50],
  },
  {
    id: 'co-pilot',
    label: 'Co-Pilot',
    errorTolerance: 'Near-zero',
    costEfficiency: 'Medium',
    useCases: 'Strategic planning, risk assessments, complex analysis',
    color: '#f59e0b',
    riskRange: [50, 75],
  },
  {
    id: 'human-led',
    label: 'Human-Led',
    errorTolerance: 'Zero tolerance',
    costEfficiency: 'Lower',
    useCases: 'Legal decisions, medical diagnosis, compliance sign-off',
    color: '#ef4444',
    riskRange: [75, 100],
  },
];

const MOCK_ASSESSMENTS: Assessment[] = [
  {
    id: 'assess-001',
    name: 'Customer Support Triage',
    description: 'Route and respond to customer inquiries based on intent and sentiment',
    scores: { complexity: 65, standardization: 70, volume: 45, value: 60 },
    riskProfile: 'low',
    recommendedApproach: 'human-in-loop',
    estimatedROI: 340,
    status: 'approved',
    createdAt: '2026-05-15',
  },
  {
    id: 'assess-002',
    name: 'Fraud Alert Investigation',
    description: 'Analyze transaction patterns and recommend fraud disposition',
    scores: { complexity: 85, standardization: 75, volume: 60, value: 90 },
    riskProfile: 'high',
    recommendedApproach: 'co-pilot',
    estimatedROI: 520,
    status: 'approved',
    createdAt: '2026-05-20',
  },
  {
    id: 'assess-003',
    name: 'Document Classification',
    description: 'Categorize incoming documents by type and route to appropriate queues',
    scores: { complexity: 40, standardization: 35, volume: 85, value: 30 },
    riskProfile: 'low',
    recommendedApproach: 'autonomous',
    estimatedROI: 180,
    status: 'reviewed',
    createdAt: '2026-06-01',
  },
  {
    id: 'assess-004',
    name: 'Regulatory Compliance Review',
    description: 'Assess regulatory filings for compliance gaps and recommend remediation',
    scores: { complexity: 90, standardization: 80, volume: 25, value: 95 },
    riskProfile: 'critical',
    recommendedApproach: 'human-led',
    estimatedROI: 280,
    status: 'draft',
    createdAt: '2026-06-10',
  },
];

// Build a task-fit Assessment from a REAL Plan use case. The 4 factors are
// derived from the use case's risk_governance sub-scores (1-5, higher = lower
// risk → risk% = (5-x)*25). Recommended approach comes from composite risk via
// the same riskRange bands the UI already uses. The scoring FRAMEWORK is ours;
// the inputs are real Plan use-case scores.
function useCaseToAssessment(uc: UseCase): Assessment | null {
  const rg = uc.scores?.risk_governance;
  if (!rg) return null;
  const riskPct = (x: number) => Math.round((5 - x) * 25); // 1-5 → 0-100 risk
  // Factor mapping: agentic fit rises with reasoning complexity + value, falls
  // with regulatory/privacy risk. Use inverse-risk where "higher = more agentic".
  const scores: TaskScore = {
    complexity: riskPct(rg.model_reliability),        // harder/less-reliable → needs reasoning
    standardization: riskPct(rg.regulatory_compliance),
    volume: 100 - riskPct(rg.autonomous_decision_risk), // higher autonomy risk → less batch
    value: riskPct(rg.ethical_bias_risk),
  };
  const composite = uc.computed?.risk_score ??
    Math.round((riskPct(rg.regulatory_compliance) + riskPct(rg.data_privacy_security) + riskPct(rg.ethical_bias_risk) + riskPct(rg.model_reliability) + riskPct(rg.autonomous_decision_risk)) / 5);
  const approach = composite < 25 ? 'autonomous' : composite < 50 ? 'human-in-loop' : composite < 75 ? 'co-pilot' : 'human-led';
  const riskProfile: Assessment['riskProfile'] = composite < 25 ? 'low' : composite < 50 ? 'medium' : composite < 75 ? 'high' : 'critical';
  const status: Assessment['status'] = uc.status === 'Production' || uc.status === 'Pilot' ? 'approved' : uc.status === 'Active' ? 'reviewed' : 'draft';
  return {
    id: uc.use_case_id,
    name: uc.name,
    description: uc.business_domain ? `${uc.business_domain} use case` : 'Plan use case',
    scores,
    riskProfile,
    recommendedApproach: approach,
    estimatedROI: 0, // not modeled from a use case; hidden in live mode
    status,
    createdAt: uc.created_at?.slice(0, 10) ?? '',
  };
}

export default function TaskAssessment() {
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newScores, setNewScores] = useState<TaskScore>({ complexity: 50, standardization: 50, volume: 50, value: 50 });
  const [toast, setToast] = useState<string | null>(null);
  const { useCases } = useGovernanceAggregator();

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  // Prefer REAL risk-scored use cases; fall back to illustrative mock when none.
  const { assessments, live } = useMemo(() => {
    const real = useCases.map(useCaseToAssessment).filter((a): a is Assessment => a !== null);
    return real.length > 0 ? { assessments: real, live: true } : { assessments: MOCK_ASSESSMENTS, live: false };
  }, [useCases]);

  const getAgenticFitScore = (scores: TaskScore) => {
    return Math.round((scores.complexity + scores.standardization + (100 - scores.volume) + scores.value) / 4);
  };

  const stats = useMemo(() => ({
    total: assessments.length,
    approved: assessments.filter(a => a.status === 'approved').length,
    avgROI: assessments.length ? Math.round(assessments.reduce((s, a) => s + a.estimatedROI, 0) / assessments.length) : 0,
    autonomous: assessments.filter(a => a.recommendedApproach === 'autonomous').length,
    humanLed: assessments.filter(a => a.recommendedApproach === 'human-led').length,
  }), [assessments]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Task Assessment</h2>
            {live ? <LiveDataBadge /> : <MockDataBadge integration="Score use cases in Plan to populate real task-fit" />}
          </div>
          <p className="text-sm text-slate-500">
            {live
              ? 'Agentic-fit scoring of your Plan use cases — factors derived from each use case’s risk-governance scores.'
              : 'Illustrative example — evaluate workloads for agentic AI suitability using the AWS economics framework.'}
          </p>
          <Link to="/use-cases" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
            {live ? 'Manage use cases in Plan →' : 'Score use cases in Plan →'}
          </Link>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Assessment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-xs text-slate-500">Assessments</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-emerald-600">{stats.approved}</div>
          <div className="text-xs text-slate-500">Approved</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          {live ? (
            <>
              <div className="text-2xl font-bold text-indigo-600">{stats.humanLed}</div>
              <div className="text-xs text-slate-500">Human-Led (high risk)</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-indigo-600">{stats.avgROI}%</div>
              <div className="text-xs text-slate-500">Avg Est. ROI</div>
            </>
          )}
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200 p-4">
          <div className="text-2xl font-bold text-emerald-600">{stats.autonomous}</div>
          <div className="text-xs text-slate-500">Fully Autonomous</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 p-4">
          <div className="text-2xl font-bold text-amber-600">{stats.humanLed}</div>
          <div className="text-xs text-slate-500">Human-Led</div>
        </div>
      </div>

      {/* New Assessment Form */}
      {showNewForm && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">New Task Assessment</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Scoring Sliders */}
            <div className="space-y-5">
              {(Object.entries(FACTOR_DEFINITIONS) as [keyof TaskScore, typeof FACTOR_DEFINITIONS[keyof typeof FACTOR_DEFINITIONS]][]).map(([key, factor]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{factor.label}</div>
                      <div className="text-xs text-slate-500">{factor.description}</div>
                    </div>
                    <div className="text-lg font-bold text-indigo-600">{newScores[key]}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 w-20">{factor.lowLabel}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={newScores[key]}
                      onChange={(e) => setNewScores({ ...newScores, [key]: parseInt(e.target.value) })}
                      aria-label={factor.label}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-400 w-20 text-right">{factor.highLabel}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Result Preview */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Assessment Result Preview</h4>

              <div className="mb-4">
                <div className="text-xs text-slate-500 mb-1">Agentic AI Fit Score</div>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-indigo-600">{getAgenticFitScore(newScores)}</div>
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                      style={{ width: `${getAgenticFitScore(newScores)}%` }}
                    />
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {getAgenticFitScore(newScores) >= 70 ? 'Excellent fit for agentic AI' :
                   getAgenticFitScore(newScores) >= 50 ? 'Good fit with hybrid approach' :
                   'Consider traditional automation'}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-xs text-slate-500 mb-2">Recommended Deployment Approach</div>
                <div className="grid grid-cols-2 gap-2">
                  {DEPLOYMENT_APPROACHES.map(approach => {
                    const fitScore = getAgenticFitScore(newScores);
                    const isRecommended = fitScore >= approach.riskRange[0] && fitScore < approach.riskRange[1];
                    return (
                      <div
                        key={approach.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isRecommended ? 'ring-2 bg-white' : 'opacity-50 bg-slate-100'
                        }`}
                        style={{ borderColor: approach.color, boxShadow: isRecommended ? `0 0 0 2px ${approach.color}` : 'none' }}
                      >
                        <div className="text-xs font-semibold" style={{ color: approach.color }}>{approach.label}</div>
                        <div className="text-[10px] text-slate-500 mt-1">Error: {approach.errorTolerance}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => {
                  flashToast('Assessment saved — review in Completed Assessments');
                  setShowNewForm(false);
                  setNewScores({ complexity: 50, standardization: 50, volume: 50, value: 50 });
                }}
                className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Save Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deployment Approaches Reference */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Risk-Based Deployment Approaches</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {DEPLOYMENT_APPROACHES.map(approach => (
            <div
              key={approach.id}
              className="p-4 rounded-xl border"
              style={{ borderColor: `${approach.color}40`, backgroundColor: `${approach.color}08` }}
            >
              <div className="text-sm font-semibold mb-2" style={{ color: approach.color }}>{approach.label}</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Error Tolerance:</span>
                  <span className="font-medium text-slate-700">{approach.errorTolerance}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cost Efficiency:</span>
                  <span className="font-medium text-slate-700">{approach.costEfficiency}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-[10px] text-slate-500">{approach.useCases}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assessment List */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Completed Assessments</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {assessments.map(assessment => {
            const approach = DEPLOYMENT_APPROACHES.find(a => a.id === assessment.recommendedApproach);
            const fitScore = getAgenticFitScore(assessment.scores);
            return (
              <div
                key={assessment.id}
                onClick={() => setSelectedAssessment(selectedAssessment?.id === assessment.id ? null : assessment)}
                className="p-4 hover:bg-slate-50/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{assessment.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        assessment.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        assessment.status === 'reviewed' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {assessment.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{assessment.description}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-indigo-600">{fitScore}</div>
                      <div className="text-[10px] text-slate-500">Fit Score</div>
                    </div>
                    <div className="text-center">
                      <div
                        className="text-xs font-semibold px-2 py-1 rounded"
                        style={{ backgroundColor: `${approach?.color}15`, color: approach?.color }}
                      >
                        {approach?.label}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">Recommended</div>
                    </div>
                    <div className="text-center">
                      {live ? (
                        <>
                          <div className="text-lg font-bold text-slate-900 capitalize">{assessment.riskProfile}</div>
                          <div className="text-[10px] text-slate-500">Risk profile</div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-bold text-emerald-600">{assessment.estimatedROI}%</div>
                          <div className="text-[10px] text-slate-500">Est. ROI</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {selectedAssessment?.id === assessment.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    {live && (
                      <div className="flex justify-end mb-3">
                        <Link
                          to="/use-cases"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View use case in Plan →
                        </Link>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-4">
                      {(Object.entries(FACTOR_DEFINITIONS) as [keyof TaskScore, typeof FACTOR_DEFINITIONS[keyof typeof FACTOR_DEFINITIONS]][]).map(([key, factor]) => (
                        <div key={key}>
                          <div className="text-xs text-slate-500 mb-1">{factor.label}</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${assessment.scores[key]}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 w-8">{assessment.scores[key]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
