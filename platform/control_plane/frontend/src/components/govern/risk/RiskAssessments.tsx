/**
 * RiskAssessments — Run and track risk assessments
 *
 * HYBRID DATA SOURCES:
 * - Implicit Assessments: LIVE - derived from use cases that have been scored
 * - Formal Assessments: MOCK - would come from custom backend
 *
 * Each use case with risk_governance scores represents a completed risk assessment.
 */

import { useState, useMemo } from 'react';
import { ASSESSMENTS } from './riskData';
import { useGovernanceAggregator } from '../useGovernanceAggregator';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { getRiskScoreTextColor } from '../riskScoring';
import { rowButtonProps } from '../a11y';

interface UseCaseAssessment {
  id: string;
  name: string;
  type: 'initial' | 'periodic' | 'change-triggered';
  status: 'draft' | 'in-progress' | 'completed' | 'approved';
  scope: string;
  assessor: string;
  startDate: string;
  completedDate?: string;
  risksIdentified: number;
  controlsEvaluated: number;
  findings: number;
  goNoGo: string;
  riskScore: number;
  useCaseStatus: string;
  isLive: boolean;
}

export default function RiskAssessments() {
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'live' | 'mock'>('live');
  const [toast, setToast] = useState<string | null>(null);

  const { useCases, loading } = useGovernanceAggregator();

  // Derive assessments from use cases with risk scores
  const liveAssessments = useMemo<UseCaseAssessment[]>(() => {
    return useCases
      .filter(uc => uc.scores?.risk_governance || uc.computed?.risk_score != null)
      .map(uc => {
        const rg = uc.scores?.risk_governance;
        const riskScore = uc.computed?.risk_score ?? 0;
        const goNoGo = uc.computed?.go_no_go ?? 'N/A';

        // Determine assessment type based on use case status
        const type: UseCaseAssessment['type'] = uc.status === 'Concept' ? 'initial' :
          uc.status === 'Production' ? 'periodic' : 'change-triggered';

        // Determine status based on scoring completeness and go/no-go
        const status: UseCaseAssessment['status'] =
          goNoGo === 'GO' ? 'approved' :
          goNoGo === 'CONDITIONAL GO' ? 'completed' :
          goNoGo === 'NO GO' ? 'completed' :
          rg ? 'in-progress' : 'draft';

        // Count risks identified (categories with high risk)
        const risksIdentified = rg ? [
          rg.regulatory_compliance,
          rg.data_privacy_security,
          rg.ethical_bias_risk,
          rg.model_reliability,
          rg.autonomous_decision_risk,
        ].filter(score => score <= 2).length : 0; // Low scores = high risk (1-5 scale inverted)

        return {
          id: `ASM-UC-${uc.use_case_id.slice(0, 6)}`,
          name: `${uc.name} Risk Assessment`,
          type,
          status,
          scope: `${uc.business_domain} - ${uc.ai_type}`,
          assessor: uc.business_owner || 'Auto-scored',
          startDate: uc.created_at.split('T')[0],
          completedDate: status === 'approved' || status === 'completed' ? uc.updated_at.split('T')[0] : undefined,
          risksIdentified,
          controlsEvaluated: 5, // 5 risk dimensions evaluated
          findings: risksIdentified,
          goNoGo,
          riskScore,
          useCaseStatus: uc.status,
          isLive: true,
        };
      })
      .sort((a, b) => new Date(b.completedDate || b.startDate).getTime() - new Date(a.completedDate || a.startDate).getTime());
  }, [useCases]);

  // Mock assessments converted to same format
  const mockAssessments = useMemo<UseCaseAssessment[]>(() => {
    return ASSESSMENTS.map(a => ({
      ...a,
      goNoGo: a.status === 'approved' ? 'GO' : a.status === 'completed' ? 'CONDITIONAL GO' : 'N/A',
      riskScore: a.risksIdentified > 2 ? 65 : a.risksIdentified > 0 ? 45 : 25,
      useCaseStatus: 'Production',
      isLive: false,
    }));
  }, []);

  const displayedAssessments = viewMode === 'live' ? liveAssessments : mockAssessments;
  const selectedData = selectedAssessment ? displayedAssessments.find(a => a.id === selectedAssessment) : null;
  const hasLiveData = liveAssessments.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Risk Assessments</h3>
          <p className="text-xs text-slate-500 mt-1">Initial, periodic, and change-triggered risk evaluations</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('live')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'live' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Live ({liveAssessments.length})
            </button>
            <button
              onClick={() => setViewMode('mock')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'mock' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Demo ({mockAssessments.length})
            </button>
          </div>
          <button
            onClick={() => {
              setToast('Starting new risk assessment wizard — select scope to begin');
              setTimeout(() => setToast(null), 2800);
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            + New Assessment
          </button>
        </div>
      </div>

      {/* Data Source Indicator */}
      {viewMode === 'live' && hasLiveData && (
        <div className="flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg w-fit">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Assessments: Derived from {liveAssessments.length} scored use cases
        </div>
      )}

      {viewMode === 'live' && !hasLiveData && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-amber-800">No use cases scored yet</div>
              <div className="text-xs text-amber-700 mt-1">
                Score use cases in Plan → Prioritization to generate risk assessments automatically.
                Each scored use case becomes a risk assessment record.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayedAssessments.map(assessment => (
          <div
            key={assessment.id}
            {...rowButtonProps(
              () => setSelectedAssessment(selectedAssessment === assessment.id ? null : assessment.id),
              `View assessment ${assessment.id}: ${assessment.name}`
            )}
            className={`bg-white/80 backdrop-blur-sm rounded-xl border p-5 shadow-sm cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              selectedAssessment === assessment.id
                ? 'border-blue-300 ring-2 ring-blue-500'
                : 'border-slate-200/60 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-400">{assessment.id}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                    assessment.type === 'initial' ? 'bg-blue-100 text-blue-700' :
                    assessment.type === 'periodic' ? 'bg-purple-100 text-purple-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {assessment.type}
                  </span>
                  {assessment.isLive ? <LiveDataBadge /> : <MockDataBadge />}
                </div>
                <h4 className="text-sm font-semibold text-slate-900 mt-1">{assessment.name}</h4>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${
                assessment.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                assessment.status === 'approved' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                assessment.status === 'in-progress' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                {assessment.status}
              </span>
            </div>

            <div className="text-xs text-slate-600 mb-3">{assessment.scope}</div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-900">{assessment.risksIdentified}</div>
                <div className="text-[9px] text-slate-500 uppercase">Risks</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-900">{assessment.controlsEvaluated}</div>
                <div className="text-[9px] text-slate-500 uppercase">Dims</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className={`text-lg font-bold ${getRiskScoreTextColor(assessment.riskScore)}`}>{assessment.riskScore}</div>
                <div className="text-[9px] text-slate-500 uppercase">Score</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className={`text-sm font-bold ${
                  assessment.goNoGo === 'GO' ? 'text-emerald-600' :
                  assessment.goNoGo === 'NO GO' ? 'text-rose-600' : 'text-amber-600'
                }`}>{assessment.goNoGo === 'CONDITIONAL GO' ? 'COND' : assessment.goNoGo}</div>
                <div className="text-[9px] text-slate-500 uppercase">Decision</div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span>Assessor: {assessment.assessor}</span>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                  assessment.useCaseStatus === 'Production' ? 'bg-emerald-100 text-emerald-700' :
                  assessment.useCaseStatus === 'Pilot' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{assessment.useCaseStatus}</span>
                <span>{assessment.completedDate || assessment.startDate}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Assessment Detail */}
      {selectedData && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{selectedData.name}</h3>
                {selectedData.isLive ? <LiveDataBadge /> : <MockDataBadge />}
              </div>
              <p className="text-sm text-slate-500 mt-1">{selectedData.scope}</p>
            </div>
            <button onClick={() => setSelectedAssessment(null)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Assessment Progress */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-900 mb-3">Assessment Workflow</div>
            <div className="flex items-center gap-2">
              {['Draft', 'In Progress', 'Completed', 'Approved'].map((step, i) => {
                const statusIndex = ['draft', 'in-progress', 'completed', 'approved'].indexOf(selectedData.status);
                const isComplete = i <= statusIndex;
                const isCurrent = i === statusIndex;
                return (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <div className={`flex-1 h-2 rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`text-xs ${isCurrent ? 'font-semibold text-emerald-600' : 'text-slate-500'}`}>
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Type</div>
              <div className="text-sm font-medium text-slate-900 capitalize">{selectedData.type.replace('-', ' ')}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Assessor</div>
              <div className="text-sm font-medium text-slate-900">{selectedData.assessor}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Risk Score</div>
              <div className={`text-sm font-medium ${getRiskScoreTextColor(selectedData.riskScore)}`}>{selectedData.riskScore}/100</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">GO / NO GO</div>
              <div className={`text-sm font-medium ${
                selectedData.goNoGo === 'GO' ? 'text-emerald-600' :
                selectedData.goNoGo === 'NO GO' ? 'text-rose-600' : 'text-amber-600'
              }`}>{selectedData.goNoGo}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Completed</div>
              <div className="text-sm font-medium text-slate-900">{selectedData.completedDate || 'In progress'}</div>
            </div>
          </div>

          {/* Risk Dimensions Evaluated */}
          {selectedData.isLive && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-slate-900 mb-3">Risk Dimensions Evaluated</div>
              <div className="grid grid-cols-5 gap-2">
                {['Regulatory', 'Data Privacy', 'Ethical/Bias', 'Model Reliability', 'Autonomy Risk'].map((dim) => (
                  <div key={dim} className="p-2 bg-slate-50 rounded-lg text-center">
                    <div className="text-[10px] text-slate-500 truncate">{dim}</div>
                    <div className="w-full h-1 bg-slate-200 rounded-full mt-1">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '80%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks Identified */}
          {selectedData.risksIdentified > 0 && (
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-3">Risks Identified in This Assessment</div>
              <div className="text-xs text-slate-500">
                {selectedData.risksIdentified} high-risk areas were identified across {selectedData.controlsEvaluated} dimensions.
                {selectedData.isLive
                  ? ' View the full risk breakdown in the Risk Register tab or in Plan → Prioritization.'
                  : ' View them in the Risk Register tab.'
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assessment Types Info */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Assessment Types</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { type: 'Initial', desc: 'First assessment before production deployment', trigger: 'New AI system', color: 'blue' },
            { type: 'Periodic', desc: 'Scheduled recurring assessments', trigger: 'Quarterly / Annual', color: 'purple' },
            { type: 'Change-Triggered', desc: 'Assessment due to significant changes', trigger: 'Model upgrade, scope change', color: 'amber' },
          ].map(item => (
            <div key={item.type} className="p-4 border border-slate-200 rounded-lg">
              <div className={`text-sm font-semibold text-${item.color}-700 mb-2`}>{item.type}</div>
              <div className="text-xs text-slate-600 mb-2">{item.desc}</div>
              <div className="text-[10px] text-slate-400">Trigger: {item.trigger}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
