/**
 * ModelGovernance — Model risk management and compliance
 *
 * Features:
 * - Risk assessment wizard with FSI-specific categories
 * - Severity × Likelihood matrix with editable ratings
 * - Mitigation tracking with control types
 * - SR 26-2 attestation workflow
 * - EU AI Act classification
 * - Model cards and review scheduling
 */

import { useState, useMemo } from 'react';
import { MODELS, MODEL_DETAILS } from './mockData';
import { Icon, type IconName } from './icons';
import { usePersistedState } from './usePersistedState';
import ModelMetricsPanel from './metrics/ModelMetricsPanel';
import { useGovernModels } from './useGovernModels';
import { LiveDataBadge } from './DataSourceIndicator';

// ─────────────────────────── Risk Categories ───────────────────────────

const RISK_CATEGORIES = [
  { id: 'bias', name: 'Algorithmic Bias', icon: 'scale' as const, desc: 'Disparate treatment or outcomes across protected groups' },
  { id: 'privacy', name: 'Privacy & Data', icon: 'lock-closed' as const, desc: 'PII exposure, unauthorized access, data rights' },
  { id: 'accuracy', name: 'Accuracy & Hallucination', icon: 'viewfinder-circle' as const, desc: 'False outputs, hallucinations, incorrect decisions' },
  { id: 'security', name: 'Cybersecurity', icon: 'shield-check' as const, desc: 'Prompt injection, adversarial attacks, exploitation' },
  { id: 'autonomy', name: 'Excessive Autonomy', icon: 'cpu-chip' as const, desc: 'Over-reliance on automation, loss of human control' },
  { id: 'transparency', name: 'Transparency', icon: 'eye' as const, desc: 'Lack of explainability, insufficient audit trail' },
  { id: 'compliance', name: 'Regulatory', icon: 'clipboard' as const, desc: 'ECOA, Fair Lending, SR 26-2, EU AI Act violations' },
  { id: 'operational', name: 'Operational', icon: 'cog' as const, desc: 'System failures, cascading errors, availability' },
];

const MITIGATION_TYPES = [
  { id: 'eliminate', label: 'Eliminate', tag: 'Primary', color: '#10b981', desc: 'Remove the risk source entirely' },
  { id: 'reduce', label: 'Reduce', tag: 'Primary', color: '#3b82f6', desc: 'Lower inherent risk level' },
  { id: 'control', label: 'Control', tag: 'Secondary', color: '#f59e0b', desc: 'Manage residual risk' },
  { id: 'monitor', label: 'Monitor', tag: 'Supporting', color: '#8b5cf6', desc: 'Detect and respond to incidents' },
];

// ─────────────────────────── Risk Calculations ───────────────────────────

const getRiskScore = (s: number, l: number) => s * l;
const getRiskClass = (s: number, l: number): string => {
  const score = getRiskScore(s, l);
  if (score >= 16) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 6) return 'Medium';
  if (score >= 3) return 'Low';
  return 'Very Low';
};

const getRiskColor = (riskClass: string): string => {
  const colors: Record<string, string> = {
    'Critical': '#991b1b',
    'High': '#ef4444',
    'Medium': '#f59e0b',
    'Low': '#3b82f6',
    'Very Low': '#10b981',
  };
  return colors[riskClass] || '#64748b';
};

const RISK_CLASS_STYLES: Record<string, string> = {
  'Critical': 'bg-rose-100 text-rose-800 border-rose-300',
  'High': 'bg-orange-100 text-orange-800 border-orange-300',
  'Medium': 'bg-amber-100 text-amber-800 border-amber-300',
  'Low': 'bg-blue-100 text-blue-800 border-blue-300',
  'Very Low': 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const TIER_STYLES: Record<string, string> = {
  'Tier 1': 'bg-rose-50 text-rose-700 border-rose-200',
  'Tier 2': 'bg-amber-50 text-amber-700 border-amber-200',
  'Tier 3': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// ─────────────────────────── Mock Risk Data ───────────────────────────

interface RiskItem {
  id: string;
  name: string;
  category: string;
  description: string;
  severity: number;
  likelihood: number;
  mitigations: { text: string; type: string }[];
  residualSeverity: number;
  residualLikelihood: number;
}

interface ModelRiskAssessment {
  modelId: string;
  modelName: string;
  provider: string;
  tier: string;
  risks: RiskItem[];
  lastAssessment: string;
  nextReview: string;
  assessor: string;
  status: 'draft' | 'in-review' | 'approved';
}

const DEFAULT_RISKS: RiskItem[] = [
  { id: 'R01', name: 'Output Hallucination', category: 'accuracy', description: 'Model generates fabricated information presented as fact', severity: 4, likelihood: 3, mitigations: [{ text: 'Guardrail grounding check enabled', type: 'control' }, { text: 'Citation requirement in prompts', type: 'reduce' }], residualSeverity: 3, residualLikelihood: 2 },
  { id: 'R02', name: 'Prompt Injection', category: 'security', description: 'Malicious input manipulates model behavior', severity: 4, likelihood: 2, mitigations: [{ text: 'Input validation guardrails', type: 'control' }], residualSeverity: 3, residualLikelihood: 1 },
  { id: 'R03', name: 'PII Leakage', category: 'privacy', description: 'Sensitive data exposed in model outputs', severity: 5, likelihood: 2, mitigations: [{ text: 'PII detection guardrail (31 types)', type: 'control' }, { text: 'Output filtering active', type: 'reduce' }], residualSeverity: 3, residualLikelihood: 1 },
  { id: 'R04', name: 'Biased Outputs', category: 'bias', description: 'Disparate treatment across demographic groups', severity: 4, likelihood: 3, mitigations: [{ text: 'Bias testing in eval suite', type: 'monitor' }], residualSeverity: 3, residualLikelihood: 2 },
  { id: 'R05', name: 'Lack of Explainability', category: 'transparency', description: 'Cannot explain reasoning for decisions', severity: 3, likelihood: 4, mitigations: [{ text: 'Chain-of-thought prompting', type: 'reduce' }], residualSeverity: 2, residualLikelihood: 3 },
];

const INITIAL_ASSESSMENTS: ModelRiskAssessment[] = MODELS.map(m => ({
  modelId: m.id,
  modelName: m.name,
  provider: m.provider,
  tier: m.tier,
  risks: DEFAULT_RISKS.map(r => ({
    ...r,
    severity: r.severity + (m.tier === 'Tier 1' ? 1 : m.tier === 'Tier 3' ? -1 : 0),
    residualSeverity: r.residualSeverity + (m.tier === 'Tier 1' ? 1 : m.tier === 'Tier 3' ? -1 : 0),
  })).map(r => ({ ...r, severity: Math.min(5, Math.max(1, r.severity)), residualSeverity: Math.min(5, Math.max(1, r.residualSeverity)) })),
  lastAssessment: '2026-04-15',
  nextReview: m.tier === 'Tier 1' ? '2026-07-15' : m.tier === 'Tier 2' ? '2026-10-15' : '2027-04-15',
  assessor: 'MRM Team',
  status: m.tier === 'Tier 1' ? 'approved' : 'in-review',
}));

// ─────────────────────────── Component ───────────────────────────

type Tab = 'risk-assessment' | 'attestation' | 'model-cards' | 'schedule';

export default function ModelGovernance() {
  const [activeTab, setActiveTab] = useState<Tab>('risk-assessment');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(MODELS[0]?.id || null);
  const [editingRisk, setEditingRisk] = useState<string | null>(null);
  const [newMitigation, setNewMitigation] = useState('');
  const [newMitigationType, setNewMitigationType] = useState('control');
  const [assessments, setAssessments] = usePersistedState<ModelRiskAssessment[]>('model_assessments', INITIAL_ASSESSMENTS);
  const [toast, setToast] = useState<string | null>(null);

  // Live Bedrock model catalog
  const { catalog, catalogLive } = useGovernModels(7, 3);

  // Build unified model list: live catalog when available, mock fallback
  const unifiedModels = useMemo(() => {
    if (catalog?.live && catalog.models.length > 0) {
      const mockById = new Map(MODELS.map(m => [m.id, m]));
      const mockByNameNorm = new Map(MODELS.map(m => [m.name.toLowerCase().replace(/[^a-z0-9]/g, ''), m]));

      return catalog.models.slice(0, 20).map((liveModel) => {
        const normName = liveModel.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const mockMatch = mockById.get(liveModel.model_id) ?? mockByNameNorm.get(normName);
        return {
          id: liveModel.model_id,
          name: liveModel.name,
          provider: liveModel.provider,
          owner: mockMatch?.owner ?? 'Unassigned',
          tier: mockMatch?.tier ?? 'Tier 3' as const,
          status: mockMatch?.status ?? 'Production' as const,
          evalScore: mockMatch?.evalScore ?? 75,
          useCases: mockMatch?.useCases ?? 0,
          monthlyCost: mockMatch?.monthlyCost ?? 0,
          lastValidated: mockMatch?.lastValidated ?? 'N/A',
          isLive: true,
        };
      });
    }
    return MODELS.map(m => ({ ...m, isLive: false }));
  }, [catalog]);

  const showingLiveData = catalogLive && unifiedModels.some(m => m.isLive);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const selectedAssessment = selectedModelId
    ? assessments.find(a => a.modelId === selectedModelId)
    : null;

  const addMitigation = (riskId: string) => {
    const text = newMitigation.trim();
    if (!text || !selectedModelId) return;
    setAssessments(prev => prev.map(a =>
      a.modelId === selectedModelId
        ? { ...a, risks: a.risks.map(r => r.id === riskId ? { ...r, mitigations: [...r.mitigations, { text, type: newMitigationType }] } : r) }
        : a,
    ));
    setNewMitigation('');
    flashToast('Mitigation added');
  };

  const addRisk = () => {
    if (!selectedModelId) return;
    const newId = `R${String(Date.now()).slice(-4)}`;
    const starter: RiskItem = {
      id: newId, name: 'New Risk', category: 'accuracy', description: 'Describe the risk…',
      severity: 3, likelihood: 3, mitigations: [], residualSeverity: 3, residualLikelihood: 3,
    };
    setAssessments(prev => prev.map(a =>
      a.modelId === selectedModelId ? { ...a, risks: [...a.risks, starter] } : a,
    ));
    setEditingRisk(newId);
    flashToast('Risk added — edit to refine');
  };

  // Aggregate stats
  const stats = useMemo(() => {
    const all = assessments.flatMap(a => a.risks);
    const byClass: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, 'Very Low': 0 };
    all.forEach(r => {
      const cls = getRiskClass(r.residualSeverity, r.residualLikelihood);
      byClass[cls]++;
    });
    return {
      totalRisks: all.length,
      mitigated: all.filter(r => r.mitigations.length > 0).length,
      byClass,
      criticalHigh: byClass.Critical + byClass.High,
    };
  }, [assessments]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'risk-assessment', label: 'Risk Assessment' },
    { id: 'attestation', label: 'MRM Frameworks' },
    { id: 'model-cards', label: 'Model Cards' },
    { id: 'schedule', label: 'Review Schedule' },
  ];

  return (
    <div className="space-y-6">
      {/* Shared metric contract: Model Management's contribution to the scorecard */}
      <ModelMetricsPanel />

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit" role="tablist" aria-label="Model Governance sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ RISK ASSESSMENT TAB ═══════════════════ */}
      {activeTab === 'risk-assessment' && (
        <div className="space-y-6">
          {/* Fleet Summary */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Fleet Risk Summary</h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{stats.totalRisks} risks identified</span>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-600">{stats.mitigated} with controls</span>
                {stats.criticalHigh > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-rose-600 font-semibold">{stats.criticalHigh} Critical/High</span>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {['Critical', 'High', 'Medium', 'Low', 'Very Low'].map(level => (
                <div key={level} className={`p-3 rounded-lg border ${RISK_CLASS_STYLES[level]}`}>
                  <div className="text-2xl font-bold">{stats.byClass[level]}</div>
                  <div className="text-xs font-medium">{level}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Model Selector + Risk Matrix */}
          <div className="grid grid-cols-3 gap-6">
            {/* Model List */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Select Model</h4>
                {showingLiveData && <LiveDataBadge source="Bedrock" detail={`${unifiedModels.length} models from live catalog`} />}
              </div>
              <div className="space-y-2">
                {assessments.map(assessment => {
                  const worstRisk = assessment.risks.reduce((worst, r) => {
                    const cls = getRiskClass(r.residualSeverity, r.residualLikelihood);
                    const order = ['Very Low', 'Low', 'Medium', 'High', 'Critical'];
                    return order.indexOf(cls) > order.indexOf(worst) ? cls : worst;
                  }, 'Very Low');

                  return (
                    <button
                      key={assessment.modelId}
                      onClick={() => setSelectedModelId(assessment.modelId)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        selectedModelId === assessment.modelId
                          ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-200'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-900">{assessment.modelName}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${TIER_STYLES[assessment.tier]}`}>
                          {assessment.tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-500">{assessment.risks.length} risks</span>
                        <span className={`font-medium px-1.5 py-0.5 rounded ${RISK_CLASS_STYLES[worstRisk]}`}>
                          {worstRisk}
                        </span>
                        <span className={`ml-auto px-1.5 py-0.5 rounded ${
                          assessment.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          assessment.status === 'in-review' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {assessment.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5×5 Risk Matrix */}
            <div className="col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-slate-900">
                  Risk Matrix — {selectedAssessment?.modelName || 'Select a model'}
                </h4>
                <div className="text-[10px] text-slate-500">
                  Residual risk after controls
                </div>
              </div>

              {selectedAssessment && (
                <div className="flex gap-6">
                  {/* Matrix Grid */}
                  <div className="flex-1">
                    <div className="flex items-end gap-2 mb-2">
                      <div className="w-8" />
                      <div className="flex-1 grid grid-cols-5 gap-1 text-[9px] text-slate-500 text-center">
                        <span>Rare</span><span>Unlikely</span><span>Possible</span><span>Likely</span><span>Certain</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-8 flex flex-col justify-around text-[9px] text-slate-500 text-right pr-1">
                        <span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>
                      </div>
                      <div className="flex-1 grid grid-cols-5 gap-1">
                        {[5, 4, 3, 2, 1].map(s =>
                          [1, 2, 3, 4, 5].map(l => {
                            const risksHere = selectedAssessment.risks.filter(
                              r => r.residualSeverity === s && r.residualLikelihood === l
                            );
                            const riskClass = getRiskClass(s, l);
                            return (
                              <div
                                key={`${s}-${l}`}
                                className={`aspect-square rounded-lg flex items-center justify-center border ${RISK_CLASS_STYLES[riskClass]} relative group cursor-pointer`}
                                title={`S${s} × L${l} = ${riskClass}\n${risksHere.map(r => r.name).join('\n')}`}
                              >
                                {risksHere.length > 0 && (
                                  <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">
                                    {risksHere.length}
                                  </span>
                                )}
                                {risksHere.length > 0 && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                    <div className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                      {risksHere.map(r => r.id).join(', ')}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-slate-500">
                      <span>← Lower Likelihood</span>
                      <span>Higher Likelihood →</span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="w-32 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-700 mb-2">Risk Levels</div>
                    {['Critical', 'High', 'Medium', 'Low', 'Very Low'].map(level => (
                      <div key={level} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded ${RISK_CLASS_STYLES[level]}`} />
                        <span className="text-[10px] text-slate-600">{level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Risk Details */}
          {selectedAssessment && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-slate-900">Risk Register — {selectedAssessment.modelName}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    Assessed: {selectedAssessment.lastAssessment} by {selectedAssessment.assessor}
                  </span>
                  <button onClick={addRisk} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    + Add Risk
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {selectedAssessment.risks.map(risk => {
                  const category = RISK_CATEGORIES.find(c => c.id === risk.category);
                  const inherentClass = getRiskClass(risk.severity, risk.likelihood);
                  const residualClass = getRiskClass(risk.residualSeverity, risk.residualLikelihood);
                  const isEditing = editingRisk === risk.id;

                  return (
                    <div
                      key={risk.id}
                      className={`p-4 rounded-lg border transition-all ${
                        isEditing ? 'ring-2 ring-blue-500 bg-blue-50/30' : 'bg-slate-50/50 hover:bg-slate-50'
                      }`}
                      style={{ borderLeftWidth: '4px', borderLeftColor: getRiskColor(residualClass) }}
                    >
                      {/* Risk Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {category?.icon && <Icon name={category.icon as IconName} className="w-5 h-5 flex-shrink-0" />}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-400">{risk.id}</span>
                              <span className="text-sm font-semibold text-slate-900">{risk.name}</span>
                            </div>
                            <div className="text-xs text-slate-500">{category?.name} · {risk.description}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingRisk(isEditing ? null : risk.id)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                      </div>

                      {/* Risk Scores */}
                      <div className="grid grid-cols-4 gap-4 mb-3">
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase mb-1">Inherent Risk</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${RISK_CLASS_STYLES[inherentClass]}`}>
                              {inherentClass}
                            </span>
                            <span className="text-[10px] text-slate-400">S{risk.severity}×L{risk.likelihood}={getRiskScore(risk.severity, risk.likelihood)}</span>
                          </div>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase mb-1">Controls</div>
                          <div className="text-sm font-semibold text-slate-900">{risk.mitigations.length} active</div>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase mb-1">Residual Risk</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${RISK_CLASS_STYLES[residualClass]}`}>
                              {residualClass}
                            </span>
                            <span className="text-[10px] text-slate-400">S{risk.residualSeverity}×L{risk.residualLikelihood}={getRiskScore(risk.residualSeverity, risk.residualLikelihood)}</span>
                          </div>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <div className="text-[9px] text-slate-500 uppercase mb-1">Reduction</div>
                          <div className="text-sm font-semibold text-emerald-600">
                            -{getRiskScore(risk.severity, risk.likelihood) - getRiskScore(risk.residualSeverity, risk.residualLikelihood)} pts
                          </div>
                        </div>
                      </div>

                      {/* Mitigations */}
                      <div className="mb-2">
                        <div className="text-[10px] font-semibold text-slate-700 uppercase mb-2">Mitigations & Controls</div>
                        <div className="space-y-1">
                          {risk.mitigations.map((m, i) => {
                            const mtype = MITIGATION_TYPES.find(t => t.id === m.type);
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-slate-100">
                                <span className="font-semibold px-1.5 py-0.5 rounded text-[9px]" style={{ background: mtype?.color + '20', color: mtype?.color }}>
                                  {mtype?.tag}
                                </span>
                                <span className="text-slate-700">{m.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Add Mitigation (when editing) */}
                      {isEditing && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                          <select
                            value={newMitigationType}
                            onChange={e => setNewMitigationType(e.target.value)}
                            aria-label={`Mitigation type for ${risk.name}`}
                            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                          >
                            {MITIGATION_TYPES.map(t => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={newMitigation}
                            onChange={e => setNewMitigation(e.target.value)}
                            aria-label={`Mitigation measure for ${risk.name}`}
                            placeholder="Describe mitigation measure..."
                            className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                          />
                          <button
                            onClick={() => addMitigation(risk.id)}
                            disabled={!newMitigation.trim()}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ MRM FRAMEWORKS TAB ═══════════════════ */}
      {activeTab === 'attestation' && (
        <div className="space-y-6">
          {/* Global Framework Summary */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'SR 26-2', region: 'US Federal Reserve', value: Object.values(MODEL_DETAILS).filter(d => d.attestation.sr26_2.attested).length, sub: `of ${MODELS.length} attested`, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
              { label: 'OSFI E-23', region: 'Canada', value: Math.round(Object.values(MODEL_DETAILS).reduce((sum, d) => sum + (d.mrmFrameworks?.find((f: { framework: string; compliance: number }) => f.framework === 'OSFI E-23 (Canada)')?.compliance || 0), 0) / MODELS.length), sub: '% avg compliance', color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
              { label: 'NIST AI RMF', region: 'US', value: Math.round(Object.values(MODEL_DETAILS).reduce((sum, d) => sum + (d.mrmFrameworks?.find((f: { framework: string; compliance: number }) => f.framework === 'NIST AI RMF (US)')?.compliance || 0), 0) / MODELS.length), sub: '% avg compliance', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
              { label: 'EU AI Act', region: 'European Union', value: Object.values(MODEL_DETAILS).filter(d => d.attestation.euAiAct.documented).length, sub: `of ${MODELS.length} documented`, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
            ].map(kpi => (
              <div key={kpi.label} className={`${kpi.bg} backdrop-blur-sm rounded-xl border ${kpi.border} p-4 shadow-sm`}>
                <div className="text-xs font-semibold text-slate-700">{kpi.label}</div>
                <div className="text-[9px] text-slate-500 -mt-0.5">{kpi.region}</div>
                <div className={`text-2xl font-bold mt-1.5 ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-slate-500">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Framework Legend */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Cross-Jurisdictional MRM Compliance</div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span> SR 26-2 (US Fed)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span> OSFI E-23 (Canada)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> NIST AI RMF (US)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> EU AI Act</span>
              </div>
            </div>
          </div>

          {/* Per-Model Framework Compliance */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Model Framework Compliance & Approval Status</h3>
            <div className="space-y-4">
              {MODELS.map(model => {
                const detail = MODEL_DETAILS[model.id];
                if (!detail) return null;

                const frameworkColors: Record<string, { bg: string; border: string; text: string; bar: string }> = {
                  'SR 26-2 (US Fed)': { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', bar: 'bg-violet-500' },
                  'OSFI E-23 (Canada)': { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', bar: 'bg-pink-500' },
                  'NIST AI RMF (US)': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-500' },
                  'EU AI Act': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500' },
                };

                const frameworks = detail.mrmFrameworks || [];

                return (
                  <div key={model.id} className="p-4 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{model.name}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${TIER_STYLES[model.tier]}`}>
                          {model.tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {detail.attestation.sr26_2.attested && (
                          <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <span className="font-bold">US</span> SR Attested
                          </span>
                        )}
                        {detail.attestation.euAiAct.documented && (
                          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <span className="font-bold">EU</span> Documented
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Framework Compliance Bars */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {frameworks.map((fw: { framework: string; compliance: number; controlsMet: number; totalControls: number }, idx: number) => {
                        const c = frameworkColors[fw.framework] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', bar: 'bg-slate-500' };
                        const region = fw.framework.includes('Canada') ? 'CA' : fw.framework.includes('EU') ? 'EU' : 'US';
                        return (
                          <div key={idx} className={`${c.bg} ${c.border} border rounded-lg p-2.5`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-medium text-slate-600"><span className="font-bold">{region}</span> {fw.framework.split(' ')[0]}</span>
                              <span className={`text-[11px] font-bold ${c.text}`}>{fw.compliance}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                              <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${fw.compliance}%` }}></div>
                            </div>
                            <div className="text-[9px] text-slate-500 mt-1">{fw.controlsMet}/{fw.totalControls} controls</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Approval Chain */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-[10px] font-medium text-slate-500 mb-2">Approval Workflow</div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {detail.approvalChain.map((step, i) => (
                          <div key={i} className="flex items-center gap-2 flex-shrink-0">
                            <div className={`px-2.5 py-1.5 rounded-lg text-[10px] min-w-[100px] ${
                              step.status === 'approved' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
                              step.status === 'pending' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                              'bg-slate-50 border border-slate-200 text-slate-500'
                            }`}>
                              <div className="font-semibold">{step.step}</div>
                              <div className="text-[9px] opacity-80">{step.approver}</div>
                            </div>
                            {i < detail.approvalChain.length - 1 && (
                              <span className="text-slate-300">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ MODEL CARDS TAB ═══════════════════ */}
      {activeTab === 'model-cards' && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Model Card Documentation</h3>
            <button
              onClick={() => flashToast('Model card generation wizard coming soon')}
              className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Generate New Card
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {MODELS.map(model => {
              const detail = MODEL_DETAILS[model.id];
              if (!detail) return null;

              const sections = [
                { name: 'Intended Use', complete: detail.attestation.modelCard.complete },
                { name: 'Training Data', complete: detail.attestation.modelCard.complete },
                { name: 'Evaluation Results', complete: detail.attestation.modelCard.complete },
                { name: 'Limitations & Risks', complete: detail.attestation.modelCard.complete },
                { name: 'Ethical Considerations', complete: detail.attestation.modelCard.complete },
              ];
              const completePct = Math.round((sections.filter(s => s.complete).length / sections.length) * 100);

              return (
                <div key={model.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{model.name}</div>
                      <div className="text-xs text-slate-500">{model.provider}</div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      completePct === 100 ? 'bg-emerald-100 text-emerald-700' :
                      completePct >= 60 ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {completePct}% Complete
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    {sections.map(section => (
                      <div key={section.name} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{section.name}</span>
                        <span className={section.complete ? 'text-emerald-600' : 'text-slate-300'}>
                          {section.complete
                            ? <Icon name="check" className="w-3.5 h-3.5" />
                            : <Icon name="circle" className="w-3.5 h-3.5" />}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3 pt-2 border-t border-slate-100">
                    <span>EU AI Act: {detail.attestation.euAiAct.classification}</span>
                  </div>

                  <div className="flex gap-2">
                    <a href={detail.attestation.modelCard.url} className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg text-center hover:bg-blue-50">
                      View Card
                    </a>
                    <button
                      onClick={() => flashToast(`Editing model card for ${model.name}`)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════ SCHEDULE TAB ═══════════════════ */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Validation & Review Schedule</h3>
              <button
                onClick={() => flashToast('Review scheduling wizard coming soon')}
                className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + Schedule Review
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200">
                  <th scope="col" className="text-left py-3 font-medium">Model</th>
                  <th scope="col" className="text-left py-3 font-medium">Tier</th>
                  <th scope="col" className="text-left py-3 font-medium">Last Validation</th>
                  <th scope="col" className="text-left py-3 font-medium">Next Review</th>
                  <th scope="col" className="text-left py-3 font-medium">Frequency</th>
                  <th scope="col" className="text-left py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => {
                  const reviewDate = new Date(assessment.nextReview).getTime();
                  const now = new Date().getTime();
                  const daysUntil = Math.floor((reviewDate - now) / (1000 * 60 * 60 * 24));
                  const isOverdue = daysUntil < 0;
                  const isUpcoming = daysUntil <= 30 && daysUntil >= 0;

                  return (
                    <tr key={assessment.modelId} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="py-3 font-medium text-slate-900">{assessment.modelName}</td>
                      <td className="py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${TIER_STYLES[assessment.tier]}`}>
                          {assessment.tier}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600">{assessment.lastAssessment}</td>
                      <td className="py-3 text-slate-600">{assessment.nextReview}</td>
                      <td className="py-3 text-slate-500">
                        {assessment.tier === 'Tier 1' ? 'Quarterly' : assessment.tier === 'Tier 2' ? 'Semi-Annual' : 'Annual'}
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          isOverdue ? 'bg-rose-100 text-rose-700' :
                          isUpcoming ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isOverdue ? 'Overdue' : isUpcoming ? `${daysUntil}d remaining` : 'On Track'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
