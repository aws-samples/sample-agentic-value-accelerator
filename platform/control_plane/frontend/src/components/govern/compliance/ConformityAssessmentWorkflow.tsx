/**
 * ConformityAssessmentWorkflow - EU AI Act Article 43 Conformity Assessment
 *
 * Multi-step workflow for EU AI Act conformity assessment covering:
 * - Risk Classification (determine if high-risk AI system)
 * - Technical Documentation review
 * - Quality Management System verification
 * - Post-market monitoring plan
 * - Declaration of Conformity generation
 * - CE Marking readiness check
 *
 * Each step tracks status, evidence, responsible party, target date, and notes.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Icon, type IconName } from '../icons';
import { MockDataBadge } from '../DataSourceIndicator';
import { usePersistedState } from '../usePersistedState';

// ─────────────────────────── Types ───────────────────────────

type StepStatus = 'not-started' | 'in-progress' | 'complete' | 'blocked';

interface Evidence {
  id: string;
  name: string;
  type: 'document' | 'certificate' | 'report' | 'link';
  url?: string;
  uploadedAt?: string;
  verified: boolean;
}

interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  article: string;
  icon: IconName;
  requiredEvidence: string[];
  guidance: string[];
  dependencies?: string[];
}

interface StepState {
  status: StepStatus;
  responsibleParty: string;
  targetDate: string;
  completedDate?: string;
  notes: string;
  evidence: Evidence[];
}

// ─────────────────────────── Constants ───────────────────────────

const STATUS_CONFIG: Record<StepStatus, { label: string; color: string; bgColor: string; icon: IconName }> = {
  'not-started': { label: 'Not Started', color: '#6b7280', bgColor: 'bg-slate-100 border-slate-200 text-slate-600', icon: 'circle' },
  'in-progress': { label: 'In Progress', color: '#f59e0b', bgColor: 'bg-amber-50 border-amber-200 text-amber-700', icon: 'circle-half' },
  'complete': { label: 'Complete', color: '#10b981', bgColor: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: 'check-circle' },
  'blocked': { label: 'Blocked', color: '#ef4444', bgColor: 'bg-rose-50 border-rose-200 text-rose-700', icon: 'exclamation-circle' },
};

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'risk-classification',
    name: 'Risk Classification',
    description: 'Determine if the AI system qualifies as high-risk under Annex I or Annex III of the EU AI Act.',
    article: 'Art. 6 & Annex III',
    icon: 'exclamation-triangle',
    requiredEvidence: [
      'Risk classification assessment document',
      'Use case and deployment context analysis',
      'Annex III area mapping (if applicable)',
    ],
    guidance: [
      'Review Annex I for harmonized legislation areas',
      'Review Annex III for high-risk AI system categories',
      'Document the AI system\'s intended purpose and deployment context',
      'If high-risk, proceed with full conformity assessment',
    ],
  },
  {
    id: 'technical-documentation',
    name: 'Technical Documentation',
    description: 'Compile comprehensive technical documentation per Annex IV requirements.',
    article: 'Art. 11 & Annex IV',
    icon: 'document-text',
    requiredEvidence: [
      'System design and architecture documentation',
      'Data governance and quality documentation',
      'Model training and validation methodology',
      'Performance metrics and benchmarks',
      'Intended use and limitations documentation',
    ],
    guidance: [
      'Document system description including general logic',
      'Describe training data selection and governance',
      'Include accuracy and robustness test results',
      'Detail human oversight measures implemented',
      'List known limitations and residual risks',
    ],
    dependencies: ['risk-classification'],
  },
  {
    id: 'qms-verification',
    name: 'Quality Management System',
    description: 'Verify QMS compliance with Art. 17 requirements for high-risk AI systems.',
    article: 'Art. 17',
    icon: 'clipboard-document-check',
    requiredEvidence: [
      'QMS policy and procedures documentation',
      'Resource and responsibility assignments',
      'Design and development control procedures',
      'Data management procedures',
      'Post-market monitoring integration',
    ],
    guidance: [
      'Establish written AI governance policies',
      'Define roles and responsibilities for AI lifecycle',
      'Implement design controls and validation procedures',
      'Ensure traceability of AI system changes',
      'Integrate with existing quality management frameworks',
    ],
    dependencies: ['risk-classification'],
  },
  {
    id: 'post-market-monitoring',
    name: 'Post-Market Monitoring Plan',
    description: 'Establish post-market monitoring system per Art. 72 requirements.',
    article: 'Art. 72',
    icon: 'chart-bar',
    requiredEvidence: [
      'Post-market monitoring plan document',
      'Performance monitoring procedures',
      'Incident reporting procedures',
      'User feedback collection mechanism',
      'Corrective action procedures',
    ],
    guidance: [
      'Define KPIs for ongoing performance monitoring',
      'Establish incident detection and reporting processes',
      'Create feedback loops from deployers and users',
      'Document escalation and corrective action procedures',
      'Plan for periodic system reviews and updates',
    ],
    dependencies: ['technical-documentation', 'qms-verification'],
  },
  {
    id: 'declaration-of-conformity',
    name: 'Declaration of Conformity',
    description: 'Generate EU Declaration of Conformity per Art. 47 and Annex V.',
    article: 'Art. 47 & Annex V',
    icon: 'document-check',
    requiredEvidence: [
      'Signed Declaration of Conformity (Annex V format)',
      'Attestation of technical documentation completeness',
      'QMS conformity statement',
      'Risk management summary',
    ],
    guidance: [
      'Complete the declaration using Annex V template',
      'Ensure signatory has appropriate authority',
      'Reference all applicable harmonized standards',
      'Include notified body reference (if required)',
      'Maintain declaration for 10 years after placement',
    ],
    dependencies: ['technical-documentation', 'qms-verification', 'post-market-monitoring'],
  },
  {
    id: 'ce-marking',
    name: 'CE Marking Readiness',
    description: 'Verify readiness for CE marking and EU database registration per Art. 48-49.',
    article: 'Art. 48-49',
    icon: 'check-badge',
    requiredEvidence: [
      'CE marking application checklist',
      'EU database registration preparation',
      'Instructions for use documentation',
      'Conformity marking visibility confirmation',
    ],
    guidance: [
      'Verify all preceding steps are complete',
      'Prepare for EU AI database registration (Art. 49/71)',
      'Ensure CE marking visibility and traceability',
      'Finalize instructions for use per Art. 13',
      'Confirm authority notification requirements (if any)',
    ],
    dependencies: ['declaration-of-conformity'],
  },
];

// Initial state for steps
const getInitialStepStates = (): Record<string, StepState> => {
  const states: Record<string, StepState> = {};
  WORKFLOW_STEPS.forEach(step => {
    states[step.id] = {
      status: 'not-started',
      responsibleParty: '',
      targetDate: '',
      notes: '',
      evidence: [],
    };
  });
  return states;
};

// ─────────────────────────── Components ───────────────────────────

interface StepCardProps {
  step: WorkflowStep;
  state: StepState;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateState: (updates: Partial<StepState>) => void;
  dependenciesMet: boolean;
}

function StepCard({ step, state, isExpanded, onToggleExpand, onUpdateState, dependenciesMet }: StepCardProps) {
  const statusConfig = STATUS_CONFIG[state.status];
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const handleStatusChange = (newStatus: StepStatus) => {
    const updates: Partial<StepState> = { status: newStatus };
    if (newStatus === 'complete') {
      updates.completedDate = new Date().toISOString().split('T')[0];
    }
    onUpdateState(updates);
  };

  const handleAddEvidence = () => {
    const name = prompt('Enter evidence name:');
    if (name) {
      const newEvidence: Evidence = {
        id: `ev-${Date.now()}`,
        name,
        type: 'document',
        verified: false,
      };
      onUpdateState({ evidence: [...state.evidence, newEvidence] });
    }
  };

  const handleRemoveEvidence = (evidenceId: string) => {
    onUpdateState({ evidence: state.evidence.filter(e => e.id !== evidenceId) });
  };

  const handleToggleVerified = (evidenceId: string) => {
    onUpdateState({
      evidence: state.evidence.map(e =>
        e.id === evidenceId ? { ...e, verified: !e.verified } : e
      ),
    });
  };

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm overflow-hidden transition-all ${
      state.status === 'blocked' ? 'border-rose-200' :
      state.status === 'complete' ? 'border-emerald-200' :
      state.status === 'in-progress' ? 'border-amber-200' :
      'border-slate-200/60'
    }`}>
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          state.status === 'complete' ? 'bg-emerald-100' :
          state.status === 'in-progress' ? 'bg-amber-100' :
          state.status === 'blocked' ? 'bg-rose-100' :
          'bg-slate-100'
        }`}>
          <Icon
            name={step.icon}
            className={`w-5 h-5 ${
              state.status === 'complete' ? 'text-emerald-600' :
              state.status === 'in-progress' ? 'text-amber-600' :
              state.status === 'blocked' ? 'text-rose-600' :
              'text-slate-500'
            }`}
            strokeWidth={2}
          />
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{step.name}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
              {step.article}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">{step.description}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {!dependenciesMet && state.status === 'not-started' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
              Waiting
            </span>
          )}
          <span className={`text-[10px] font-medium px-2 py-1 rounded border ${statusConfig.bgColor}`}>
            <Icon name={statusConfig.icon} className="w-3 h-3 inline mr-1" />
            {statusConfig.label}
          </span>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            className="w-4 h-4 text-slate-400"
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
          {/* Status, Responsible Party, Target Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Status
              </label>
              <select
                value={state.status}
                onChange={(e) => handleStatusChange(e.target.value as StepStatus)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Responsible Party
              </label>
              <input
                type="text"
                value={state.responsibleParty}
                onChange={(e) => onUpdateState({ responsibleParty: e.target.value })}
                placeholder="e.g., Compliance Team"
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={state.targetDate}
                onChange={(e) => onUpdateState({ targetDate: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Completed Date (if complete) */}
          {state.completedDate && (
            <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="text-[10px] text-emerald-700">
                <Icon name="check-circle" className="w-3 h-3 inline mr-1" />
                Completed on {state.completedDate}
              </div>
            </div>
          )}

          {/* Required Evidence */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Required Evidence / Artifacts
              </label>
              <button
                onClick={handleAddEvidence}
                className="text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1"
              >
                <Icon name="plus" className="w-3 h-3" />
                Add Evidence
              </button>
            </div>
            <div className="space-y-1.5">
              {step.requiredEvidence.map((req, idx) => {
                const matchingEvidence = state.evidence.find(e =>
                  e.name.toLowerCase().includes(req.toLowerCase().slice(0, 20))
                );
                return (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    {matchingEvidence?.verified ? (
                      <Icon name="check-circle" className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : matchingEvidence ? (
                      <Icon name="circle-half" className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <Icon name="circle" className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    )}
                    <span className={matchingEvidence?.verified ? 'text-slate-400 line-through' : 'text-slate-700'}>
                      {req}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Uploaded Evidence */}
            {state.evidence.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] font-medium text-slate-500">Uploaded Evidence:</div>
                {state.evidence.map(ev => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="document" className="w-4 h-4 text-slate-400" />
                      <span className="text-[11px] text-slate-700">{ev.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleVerified(ev.id)}
                        className={`text-[9px] px-2 py-0.5 rounded ${
                          ev.verified
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {ev.verified ? 'Verified' : 'Mark Verified'}
                      </button>
                      <button
                        onClick={() => handleRemoveEvidence(ev.id)}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <Icon name="x-mark" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guidance */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">
              Implementation Guidance
            </label>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-1.5">
              {step.guidance.map((g, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[11px] text-blue-700">
                  <Icon name="light-bulb" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{g}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Notes
              </label>
              {!isEditingNotes && (
                <button
                  onClick={() => setIsEditingNotes(true)}
                  className="text-[10px] text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              )}
            </div>
            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={state.notes}
                  onChange={(e) => onUpdateState({ notes: e.target.value })}
                  placeholder="Add notes, blockers, or action items..."
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 h-20 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => setIsEditingNotes(false)}
                  className="text-[10px] px-3 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2 min-h-[40px]">
                {state.notes || <span className="text-slate-400 italic">No notes yet</span>}
              </div>
            )}
          </div>

          {/* Dependencies */}
          {step.dependencies && step.dependencies.length > 0 && (
            <div className="text-[10px] text-slate-500">
              <Icon name="link" className="w-3 h-3 inline mr-1" />
              Depends on: {step.dependencies.map(d => {
                const depStep = WORKFLOW_STEPS.find(s => s.id === d);
                return depStep?.name;
              }).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Workflow Diagram ───────────────────────────

interface WorkflowDiagramProps {
  stepStates: Record<string, StepState>;
  onStepClick: (stepId: string) => void;
}

function WorkflowDiagram({ stepStates, onStepClick }: WorkflowDiagramProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="map" className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-800">Assessment Flow</span>
        <span className="text-[10px] text-slate-400">Click a step to expand</span>
      </div>

      <div className="flex items-start justify-between overflow-x-auto pb-2">
        {WORKFLOW_STEPS.map((step, idx) => {
          const state = stepStates[step.id];
          const statusConfig = STATUS_CONFIG[state.status];

          return (
            <React.Fragment key={step.id}>
              {/* Step Node */}
              <button
                onClick={() => onStepClick(step.id)}
                className="flex flex-col items-center min-w-[100px] group"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all group-hover:scale-110 ${
                    state.status === 'complete' ? 'bg-emerald-100 border-emerald-400' :
                    state.status === 'in-progress' ? 'bg-amber-100 border-amber-400 animate-pulse' :
                    state.status === 'blocked' ? 'bg-rose-100 border-rose-400' :
                    'bg-slate-100 border-slate-300'
                  }`}
                >
                  <Icon
                    name={step.icon}
                    className={`w-5 h-5 ${
                      state.status === 'complete' ? 'text-emerald-600' :
                      state.status === 'in-progress' ? 'text-amber-600' :
                      state.status === 'blocked' ? 'text-rose-600' :
                      'text-slate-400'
                    }`}
                    strokeWidth={2}
                  />
                </div>
                <div className="mt-2 text-center">
                  <div className="text-[10px] font-semibold text-slate-800 max-w-[90px] leading-tight">
                    {step.name}
                  </div>
                  <div
                    className="text-[9px] font-medium mt-0.5"
                    style={{ color: statusConfig.color }}
                  >
                    {statusConfig.label}
                  </div>
                </div>
              </button>

              {/* Connector Arrow */}
              {idx < WORKFLOW_STEPS.length - 1 && (
                <div className="flex items-center px-1 mt-5">
                  <div className={`h-0.5 w-6 ${
                    state.status === 'complete' ? 'bg-emerald-400' : 'bg-slate-200'
                  }`} />
                  <Icon
                    name="chevron-right"
                    className={`w-4 h-4 ${
                      state.status === 'complete' ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Progress Tracker ───────────────────────────

interface ProgressTrackerProps {
  stepStates: Record<string, StepState>;
}

function ProgressTracker({ stepStates }: ProgressTrackerProps) {
  const stats = useMemo(() => {
    const total = WORKFLOW_STEPS.length;
    const complete = Object.values(stepStates).filter(s => s.status === 'complete').length;
    const inProgress = Object.values(stepStates).filter(s => s.status === 'in-progress').length;
    const blocked = Object.values(stepStates).filter(s => s.status === 'blocked').length;
    const notStarted = Object.values(stepStates).filter(s => s.status === 'not-started').length;
    const percentage = Math.round((complete / total) * 100);
    return { total, complete, inProgress, blocked, notStarted, percentage };
  }, [stepStates]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="chart-bar" className="w-4 h-4 text-blue-600" strokeWidth={2} />
          <span className="text-sm font-semibold text-slate-800">Assessment Progress</span>
        </div>
        <span className="text-2xl font-bold text-slate-900">{stats.percentage}%</span>
      </div>

      {/* Progress Bar */}
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div className="h-full flex">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(stats.complete / stats.total) * 100}%` }}
          />
          <div
            className="bg-amber-400 transition-all"
            style={{ width: `${(stats.inProgress / stats.total) * 100}%` }}
          />
          <div
            className="bg-rose-400 transition-all"
            style={{ width: `${(stats.blocked / stats.total) * 100}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center p-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="text-lg font-bold text-emerald-700">{stats.complete}</div>
          <div className="text-[10px] text-emerald-600">Complete</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-200">
          <div className="text-lg font-bold text-amber-700">{stats.inProgress}</div>
          <div className="text-[10px] text-amber-600">In Progress</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-rose-50 border border-rose-200">
          <div className="text-lg font-bold text-rose-700">{stats.blocked}</div>
          <div className="text-[10px] text-rose-600">Blocked</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-lg font-bold text-slate-600">{stats.notStarted}</div>
          <div className="text-[10px] text-slate-500">Not Started</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

interface ConformityAssessmentWorkflowProps {
  embedded?: boolean;
}

export default function ConformityAssessmentWorkflow({ embedded = false }: ConformityAssessmentWorkflowProps) {
  const [stepStates, setStepStates] = usePersistedState<Record<string, StepState>>(
    'conformity_assessment_workflow_states',
    getInitialStepStates()
  );
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const handleUpdateStepState = useCallback((stepId: string, updates: Partial<StepState>) => {
    setStepStates(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], ...updates },
    }));
  }, [setStepStates]);

  const checkDependenciesMet = useCallback((step: WorkflowStep): boolean => {
    if (!step.dependencies || step.dependencies.length === 0) return true;
    return step.dependencies.every(depId => stepStates[depId]?.status === 'complete');
  }, [stepStates]);

  const handleStepClick = useCallback((stepId: string) => {
    setExpandedStep(prev => prev === stepId ? null : stepId);
  }, []);

  const content = (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">EU AI Act Conformity Assessment</h2>
          <p className="text-sm text-slate-500">Article 43 workflow for high-risk AI systems</p>
        </div>
        <MockDataBadge integration="Conformity assessment data stored locally" />
      </div>

      {/* Progress Tracker */}
      <ProgressTracker stepStates={stepStates} />

      {/* Visual Workflow Diagram */}
      <WorkflowDiagram stepStates={stepStates} onStepClick={handleStepClick} />

      {/* Step Cards */}
      <div className="space-y-3">
        {WORKFLOW_STEPS.map(step => (
          <StepCard
            key={step.id}
            step={step}
            state={stepStates[step.id]}
            isExpanded={expandedStep === step.id}
            onToggleExpand={() => handleStepClick(step.id)}
            onUpdateState={(updates) => handleUpdateStepState(step.id, updates)}
            dependenciesMet={checkDependenciesMet(step)}
          />
        ))}
      </div>

      {/* Regulatory Reference */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <Icon name="information-circle" className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-blue-800 mb-1">Regulatory Reference</div>
            <p className="text-[11px] text-blue-700 leading-relaxed">
              This workflow implements the conformity assessment procedure per EU AI Act Regulation 2024/1689,
              Article 43. For high-risk AI systems listed in Annex III, providers must complete an internal
              conformity assessment based on Annex VI. Systems in Annex I areas may require notified body
              involvement. The Declaration of Conformity (Art. 47) and CE marking (Art. 48) are required
              before placing the system on the EU market.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {content}
    </div>
  );
}
