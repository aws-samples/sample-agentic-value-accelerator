/**
 * FriaWizard - Fundamental Rights Impact Assessment Wizard
 *
 * Implements EU AI Act Article 27 requirements for high-risk AI systems.
 * A step-by-step wizard for conducting FRIA assessments covering:
 * - Human dignity
 * - Privacy and data protection
 * - Non-discrimination
 * - Equality
 * - Effective remedy
 * - Freedom of expression
 * - Good administration
 * - Workers' rights
 *
 * Features:
 * - Impact level assessment per right
 * - Mitigation measures documentation
 * - Residual risk rating
 * - Evidence/documentation links
 * - Overall FRIA score calculation
 * - Risk summary dashboard
 * - Export to PDF capability (mock)
 * - Save draft functionality
 * - High-risk AI system identification
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Icon, type IconName } from '../icons';
import { MockDataBadge } from '../DataSourceIndicator';

// ─────────────────────────── Types ───────────────────────────

type ImpactLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type ResidualRisk = 'acceptable' | 'tolerable' | 'unacceptable';

interface RightAssessment {
  impactLevel: ImpactLevel;
  mitigationMeasures: string;
  residualRisk: ResidualRisk;
  evidenceLinks: string[];
  notes: string;
}

interface FriaData {
  assessmentId: string;
  aiSystemId: string;
  aiSystemName: string;
  assessorName: string;
  assessmentDate: string;
  lastModified: string;
  status: 'draft' | 'in-review' | 'approved' | 'rejected';
  rights: Record<string, RightAssessment>;
  overallNotes: string;
}

interface FundamentalRight {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  euAiActRef: string;
  considerations: string[];
}

interface HighRiskSystem {
  id: string;
  name: string;
  description: string;
  annexRef: string;
  friaRequired: boolean;
  friaStatus: 'not-started' | 'draft' | 'complete';
}

// ─────────────────────────── Constants ───────────────────────────

const FUNDAMENTAL_RIGHTS: FundamentalRight[] = [
  {
    id: 'human-dignity',
    name: 'Right to Human Dignity',
    icon: 'user',
    description: 'The inherent dignity of all human beings and their right to be treated with respect.',
    euAiActRef: 'Art. 27(1)(a)',
    considerations: [
      'Does the AI system make decisions that affect human autonomy?',
      'Could the system be used to manipulate or deceive users?',
      'Are there safeguards against degrading treatment?',
      'Does the system respect human agency in decision-making?',
    ],
  },
  {
    id: 'privacy-data',
    name: 'Right to Privacy and Data Protection',
    icon: 'lock-closed',
    description: 'Protection of personal data and privacy in the processing of AI systems.',
    euAiActRef: 'Art. 27(1)(b)',
    considerations: [
      'What personal data does the AI system process?',
      'Is data minimization applied?',
      'Are there adequate security measures?',
      'How long is data retained?',
      'Is there a lawful basis for processing?',
    ],
  },
  {
    id: 'non-discrimination',
    name: 'Right to Non-Discrimination',
    icon: 'scale',
    description: 'Protection against discrimination based on protected characteristics.',
    euAiActRef: 'Art. 27(1)(c)',
    considerations: [
      'Has bias testing been conducted on protected groups?',
      'Are there disparate impact concerns?',
      'What proxy variables might encode protected attributes?',
      'Has fairness been validated across demographic groups?',
    ],
  },
  {
    id: 'equality',
    name: 'Right to Equality',
    icon: 'users',
    description: 'Equal treatment and equal access regardless of personal characteristics.',
    euAiActRef: 'Art. 27(1)(d)',
    considerations: [
      'Does the system provide equal access to all users?',
      'Are there accessibility considerations?',
      'Could the system perpetuate existing inequalities?',
      'Are outcomes equitable across different groups?',
    ],
  },
  {
    id: 'effective-remedy',
    name: 'Right to an Effective Remedy',
    icon: 'shield-check',
    description: 'The right to challenge AI decisions and seek redress.',
    euAiActRef: 'Art. 27(1)(e)',
    considerations: [
      'Can users contest AI decisions?',
      'Is there a human review mechanism?',
      'Are appeal processes clearly documented?',
      'How quickly can decisions be reviewed?',
    ],
  },
  {
    id: 'freedom-expression',
    name: 'Freedom of Expression',
    icon: 'chat-bubble',
    description: 'Protection of free speech and information access.',
    euAiActRef: 'Art. 27(1)(f)',
    considerations: [
      'Does the system filter or moderate content?',
      'Could it restrict access to information?',
      'Are content policies transparent?',
      'Is there over-blocking of legitimate content?',
    ],
  },
  {
    id: 'good-administration',
    name: 'Right to Good Administration',
    icon: 'clipboard-list',
    description: 'Fair, transparent, and accountable administrative decisions.',
    euAiActRef: 'Art. 27(1)(g)',
    considerations: [
      'Are AI-assisted decisions documented?',
      'Is there adequate human oversight?',
      'Are decision criteria transparent?',
      'Can decisions be explained to affected persons?',
    ],
  },
  {
    id: 'workers-rights',
    name: 'Workers\' Rights',
    icon: 'briefcase',
    description: 'Protection of employee rights in AI-assisted workplace decisions.',
    euAiActRef: 'Art. 27(1)(h)',
    considerations: [
      'Does the system affect hiring, evaluation, or termination?',
      'Are workers informed about AI monitoring?',
      'Is there consultation with worker representatives?',
      'Does the system respect working time and conditions?',
    ],
  },
];

const IMPACT_LEVELS: { value: ImpactLevel; label: string; color: string; bgColor: string; description: string }[] = [
  { value: 'none', label: 'None', color: 'text-slate-600', bgColor: 'bg-slate-100 border-slate-200', description: 'No impact identified' },
  { value: 'low', label: 'Low', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', description: 'Minor impact, easily mitigated' },
  { value: 'medium', label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', description: 'Moderate impact, requires mitigation' },
  { value: 'high', label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200', description: 'Significant impact, substantial mitigation needed' },
  { value: 'critical', label: 'Critical', color: 'text-rose-700', bgColor: 'bg-rose-50 border-rose-200', description: 'Severe impact, may require system redesign' },
];

const RESIDUAL_RISK_OPTIONS: { value: ResidualRisk; label: string; color: string; bgColor: string }[] = [
  { value: 'acceptable', label: 'Acceptable', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' },
  { value: 'tolerable', label: 'Tolerable', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
  { value: 'unacceptable', label: 'Unacceptable', color: 'text-rose-700', bgColor: 'bg-rose-50 border-rose-200' },
];

// Mock high-risk AI systems that require FRIA
const HIGH_RISK_SYSTEMS: HighRiskSystem[] = [
  { id: 'sys-001', name: 'Credit Decisioning Agent', description: 'Automated credit scoring and loan approval', annexRef: 'Annex III(5)(b)', friaRequired: true, friaStatus: 'complete' },
  { id: 'sys-002', name: 'Fraud Detection Agent', description: 'Real-time transaction fraud scoring', annexRef: 'Annex III(5)(a)', friaRequired: true, friaStatus: 'draft' },
  { id: 'sys-003', name: 'Trading Assistant', description: 'Trade rationale generation', annexRef: 'Annex III(5)(c)', friaRequired: true, friaStatus: 'not-started' },
  { id: 'sys-004', name: 'HR Screening Tool', description: 'Resume screening and candidate ranking', annexRef: 'Annex III(4)(a)', friaRequired: true, friaStatus: 'not-started' },
  { id: 'sys-005', name: 'Customer Service Bot', description: 'Customer inquiry handling', annexRef: 'Art. 50 transparency', friaRequired: false, friaStatus: 'not-started' },
];

// ─────────────────────────── Default Assessment ───────────────────────────

const createDefaultAssessment = (): RightAssessment => ({
  impactLevel: 'none',
  mitigationMeasures: '',
  residualRisk: 'acceptable',
  evidenceLinks: [],
  notes: '',
});

const createDefaultFriaData = (systemId: string, systemName: string): FriaData => ({
  assessmentId: `FRIA-${Date.now()}`,
  aiSystemId: systemId,
  aiSystemName: systemName,
  assessorName: '',
  assessmentDate: new Date().toISOString().split('T')[0],
  lastModified: new Date().toISOString(),
  status: 'draft',
  rights: Object.fromEntries(FUNDAMENTAL_RIGHTS.map(r => [r.id, createDefaultAssessment()])),
  overallNotes: '',
});

// ─────────────────────────── Component ───────────────────────────

interface FriaWizardProps {
  embedded?: boolean;
  initialSystemId?: string;
  onClose?: () => void;
}

export default function FriaWizard({ embedded = false, initialSystemId, onClose }: FriaWizardProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(initialSystemId || null);
  const [friaData, setFriaData] = useState<FriaData | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load saved draft from localStorage
  useEffect(() => {
    if (selectedSystem) {
      const savedKey = `fria_draft_${selectedSystem}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        try {
          setFriaData(JSON.parse(saved));
        } catch {
          const system = HIGH_RISK_SYSTEMS.find(s => s.id === selectedSystem);
          setFriaData(createDefaultFriaData(selectedSystem, system?.name || 'Unknown System'));
        }
      } else {
        const system = HIGH_RISK_SYSTEMS.find(s => s.id === selectedSystem);
        setFriaData(createDefaultFriaData(selectedSystem, system?.name || 'Unknown System'));
      }
    }
  }, [selectedSystem]);

  // Auto-save draft
  useEffect(() => {
    if (friaData && selectedSystem) {
      const savedKey = `fria_draft_${selectedSystem}`;
      localStorage.setItem(savedKey, JSON.stringify({ ...friaData, lastModified: new Date().toISOString() }));
    }
  }, [friaData, selectedSystem]);

  // Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Calculate overall FRIA score
  const friaScore = useMemo(() => {
    if (!friaData) return { score: 0, level: 'N/A', color: 'text-slate-500' };

    const impactWeights: Record<ImpactLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const residualWeights: Record<ResidualRisk, number> = { acceptable: 0, tolerable: 1, unacceptable: 3 };

    let totalImpact = 0;
    let totalResidual = 0;
    let assessedCount = 0;

    Object.values(friaData.rights).forEach(assessment => {
      totalImpact += impactWeights[assessment.impactLevel];
      totalResidual += residualWeights[assessment.residualRisk];
      if (assessment.impactLevel !== 'none' || assessment.mitigationMeasures) {
        assessedCount++;
      }
    });

    const maxScore = FUNDAMENTAL_RIGHTS.length * 7; // max impact (4) + max residual (3)
    const rawScore = totalImpact + totalResidual;
    const normalizedScore = Math.round((1 - rawScore / maxScore) * 100);

    let level: string;
    let color: string;
    if (normalizedScore >= 80) { level = 'Low Risk'; color = 'text-emerald-600'; }
    else if (normalizedScore >= 60) { level = 'Medium Risk'; color = 'text-amber-600'; }
    else if (normalizedScore >= 40) { level = 'High Risk'; color = 'text-orange-600'; }
    else { level = 'Critical Risk'; color = 'text-rose-600'; }

    return { score: normalizedScore, level, color, assessedCount, totalRights: FUNDAMENTAL_RIGHTS.length };
  }, [friaData]);

  // Update assessment for a specific right
  const updateRightAssessment = useCallback((rightId: string, updates: Partial<RightAssessment>) => {
    setFriaData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rights: {
          ...prev.rights,
          [rightId]: { ...prev.rights[rightId], ...updates },
        },
      };
    });
  }, []);

  // Add evidence link
  const addEvidenceLink = useCallback((rightId: string, link: string) => {
    if (!link.trim()) return;
    setFriaData(prev => {
      if (!prev) return prev;
      const currentLinks = prev.rights[rightId].evidenceLinks || [];
      return {
        ...prev,
        rights: {
          ...prev.rights,
          [rightId]: { ...prev.rights[rightId], evidenceLinks: [...currentLinks, link] },
        },
      };
    });
  }, []);

  // Remove evidence link
  const removeEvidenceLink = useCallback((rightId: string, index: number) => {
    setFriaData(prev => {
      if (!prev) return prev;
      const currentLinks = [...(prev.rights[rightId].evidenceLinks || [])];
      currentLinks.splice(index, 1);
      return {
        ...prev,
        rights: {
          ...prev.rights,
          [rightId]: { ...prev.rights[rightId], evidenceLinks: currentLinks },
        },
      };
    });
  }, []);

  // Save draft
  const saveDraft = useCallback(() => {
    if (friaData && selectedSystem) {
      const savedKey = `fria_draft_${selectedSystem}`;
      localStorage.setItem(savedKey, JSON.stringify({ ...friaData, lastModified: new Date().toISOString(), status: 'draft' }));
      showToast('Draft saved successfully', 'success');
    }
  }, [friaData, selectedSystem, showToast]);

  // Export to PDF (mock)
  const exportToPdf = useCallback(() => {
    if (!friaData) return;

    // Create a text representation for download
    let report = `FUNDAMENTAL RIGHTS IMPACT ASSESSMENT (FRIA)\n`;
    report += `EU AI Act Article 27 Compliance Report\n`;
    report += `${'='.repeat(60)}\n\n`;
    report += `Assessment ID: ${friaData.assessmentId}\n`;
    report += `AI System: ${friaData.aiSystemName} (${friaData.aiSystemId})\n`;
    report += `Assessor: ${friaData.assessorName || 'Not specified'}\n`;
    report += `Date: ${friaData.assessmentDate}\n`;
    report += `Status: ${friaData.status.toUpperCase()}\n`;
    report += `Overall Score: ${friaScore.score}/100 (${friaScore.level})\n\n`;
    report += `${'─'.repeat(60)}\n\n`;

    FUNDAMENTAL_RIGHTS.forEach(right => {
      const assessment = friaData.rights[right.id];
      report += `${right.name} (${right.euAiActRef})\n`;
      report += `Impact Level: ${assessment.impactLevel.toUpperCase()}\n`;
      report += `Residual Risk: ${assessment.residualRisk}\n`;
      report += `Mitigation: ${assessment.mitigationMeasures || 'None documented'}\n`;
      if (assessment.evidenceLinks.length > 0) {
        report += `Evidence:\n`;
        assessment.evidenceLinks.forEach(link => { report += `  - ${link}\n`; });
      }
      report += `\n`;
    });

    report += `${'─'.repeat(60)}\n`;
    report += `Overall Notes: ${friaData.overallNotes || 'None'}\n`;
    report += `\nGenerated: ${new Date().toISOString()}\n`;

    // Download as text file (PDF generation would require a library)
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FRIA_${friaData.aiSystemId}_${friaData.assessmentDate}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Report exported (PDF generation mock - exported as text)', 'info');
  }, [friaData, friaScore, showToast]);

  // Navigation
  const goToStep = (step: number) => {
    if (step >= 0 && step <= FUNDAMENTAL_RIGHTS.length) {
      setCurrentStep(step);
      setShowSummary(step === FUNDAMENTAL_RIGHTS.length);
    }
  };

  const nextStep = () => goToStep(currentStep + 1);
  const prevStep = () => goToStep(currentStep - 1);

  // Current right being assessed
  const currentRight = currentStep < FUNDAMENTAL_RIGHTS.length ? FUNDAMENTAL_RIGHTS[currentStep] : null;
  const currentAssessment = currentRight && friaData ? friaData.rights[currentRight.id] : null;

  // ─────────────────────────── Render ───────────────────────────

  // System selection step
  if (!selectedSystem) {
    return (
      <div className={embedded ? '' : 'p-6'}>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Icon name="document-text" className="w-5 h-5 text-violet-600" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Fundamental Rights Impact Assessment</h2>
                <p className="text-sm text-slate-500">EU AI Act Article 27 - Select an AI system to assess</p>
              </div>
            </div>
            <MockDataBadge integration="FRIA Wizard (local storage)" />
          </div>

          <div className="p-5">
            {/* High-Risk Systems Requiring FRIA */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-slate-800">High-Risk AI Systems Requiring FRIA</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Under EU AI Act Article 27, deployers of high-risk AI systems must conduct a Fundamental Rights Impact Assessment
                before putting the system into use.
              </p>

              <div className="space-y-2">
                {HIGH_RISK_SYSTEMS.filter(s => s.friaRequired).map(system => (
                  <button
                    key={system.id}
                    onClick={() => setSelectedSystem(system.id)}
                    className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800 group-hover:text-violet-700">{system.name}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            system.friaStatus === 'complete' ? 'bg-emerald-100 text-emerald-700' :
                            system.friaStatus === 'draft' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {system.friaStatus === 'complete' ? 'FRIA Complete' :
                             system.friaStatus === 'draft' ? 'Draft' : 'Not Started'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{system.description}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{system.annexRef}</div>
                      </div>
                      <Icon name="chevron-right" className="w-4 h-4 text-slate-400 group-hover:text-violet-600" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Other Systems (not requiring FRIA) */}
            <details className="border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Other AI Systems (FRIA not mandatory, but recommended)
              </summary>
              <div className="mt-3 space-y-2">
                {HIGH_RISK_SYSTEMS.filter(s => !s.friaRequired).map(system => (
                  <button
                    key={system.id}
                    onClick={() => setSelectedSystem(system.id)}
                    className="w-full p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-all text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{system.name}</span>
                        <span className="text-xs text-slate-400 ml-2">{system.annexRef}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Optional</span>
                    </div>
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  // Main wizard UI
  return (
    <div className={embedded ? '' : 'p-6'}>
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Icon name="document-text" className="w-5 h-5 text-violet-600" strokeWidth={2} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">FRIA Wizard</h2>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                    EU AI Act Art. 27
                  </span>
                </div>
                <p className="text-sm text-slate-500">{friaData?.aiSystemName || 'Loading...'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedSystem(null)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Change System
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <Icon name="x-mark" className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Progress indicator */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                {showSummary ? 'Summary' : `Step ${currentStep + 1} of ${FUNDAMENTAL_RIGHTS.length}`}
              </span>
              <span className="text-xs font-medium text-slate-700">
                {Math.round(((currentStep + (showSummary ? 1 : 0)) / (FUNDAMENTAL_RIGHTS.length + 1)) * 100)}% complete
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + (showSummary ? 1 : 0)) / (FUNDAMENTAL_RIGHTS.length + 1)) * 100}%` }}
              />
            </div>
            {/* Step indicators */}
            <div className="flex items-center justify-between mt-2 px-1">
              {FUNDAMENTAL_RIGHTS.map((right, idx) => {
                const assessment = friaData?.rights[right.id];
                const hasContent = assessment && (assessment.impactLevel !== 'none' || assessment.mitigationMeasures);
                return (
                  <button
                    key={right.id}
                    onClick={() => goToStep(idx)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all ${
                      idx === currentStep && !showSummary
                        ? 'bg-violet-500 text-white ring-2 ring-violet-300 ring-offset-1'
                        : hasContent
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                    title={right.name}
                  >
                    {idx + 1}
                  </button>
                );
              })}
              <button
                onClick={() => goToStep(FUNDAMENTAL_RIGHTS.length)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  showSummary
                    ? 'bg-violet-500 text-white ring-2 ring-violet-300 ring-offset-1'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                }`}
              >
                Summary
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {showSummary ? (
            // Summary view
            <div className="space-y-6">
              {/* Overall Score Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-1 md:col-span-2 p-5 rounded-xl bg-gradient-to-br from-violet-50 to-slate-50 border border-violet-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-violet-600 uppercase tracking-wide font-semibold">Overall FRIA Score</div>
                      <div className={`text-4xl font-bold mt-1 ${friaScore.color}`}>
                        {friaScore.score}/100
                      </div>
                      <div className={`text-sm font-medium mt-1 ${friaScore.color}`}>{friaScore.level}</div>
                      <div className="text-xs text-slate-500 mt-2">
                        {friaScore.assessedCount} of {friaScore.totalRights} rights assessed with content
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500">Status</div>
                      <div className="text-sm font-semibold text-amber-600 capitalize">{friaData?.status}</div>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Quick Actions</div>
                  <div className="space-y-2">
                    <button
                      onClick={saveDraft}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                      <Icon name="document" className="w-4 h-4" />
                      Save Draft
                    </button>
                    <button
                      onClick={exportToPdf}
                      className="w-full px-3 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 transition-colors flex items-center gap-2"
                    >
                      <Icon name="document-arrow-down" className="w-4 h-4" />
                      Export Report
                    </button>
                  </div>
                </div>
              </div>

              {/* Rights Summary Grid */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="clipboard-list" className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-800">Assessment Summary by Right</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {FUNDAMENTAL_RIGHTS.map((right, idx) => {
                    const assessment = friaData?.rights[right.id];
                    const impactConfig = IMPACT_LEVELS.find(l => l.value === assessment?.impactLevel);
                    const residualConfig = RESIDUAL_RISK_OPTIONS.find(r => r.value === assessment?.residualRisk);
                    return (
                      <button
                        key={right.id}
                        onClick={() => goToStep(idx)}
                        className="p-4 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 transition-all text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Icon name={right.icon} className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-800 truncate">{right.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${impactConfig?.bgColor || 'bg-slate-100'} ${impactConfig?.color || 'text-slate-500'}`}>
                                {impactConfig?.label || 'Not assessed'}
                              </span>
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${residualConfig?.bgColor || 'bg-slate-100'} ${residualConfig?.color || 'text-slate-500'}`}>
                                {residualConfig?.label || '—'}
                              </span>
                            </div>
                            {assessment?.mitigationMeasures && (
                              <div className="text-[10px] text-slate-500 mt-1 truncate">
                                Mitigation: {assessment.mitigationMeasures.slice(0, 50)}...
                              </div>
                            )}
                          </div>
                          <Icon name="chevron-right" className="w-4 h-4 text-slate-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Overall Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Overall Assessment Notes</label>
                <textarea
                  value={friaData?.overallNotes || ''}
                  onChange={(e) => setFriaData(prev => prev ? { ...prev, overallNotes: e.target.value } : prev)}
                  placeholder="Add any overall observations, recommendations, or next steps..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  rows={4}
                />
              </div>

              {/* Assessment Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Assessment ID</div>
                  <div className="text-xs font-mono text-slate-700">{friaData?.assessmentId}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">AI System</div>
                  <div className="text-xs text-slate-700">{friaData?.aiSystemId}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Assessment Date</div>
                  <div className="text-xs text-slate-700">{friaData?.assessmentDate}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Last Modified</div>
                  <div className="text-xs text-slate-700">
                    {friaData?.lastModified ? new Date(friaData.lastModified).toLocaleString() : '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : currentRight && currentAssessment ? (
            // Individual right assessment
            <div className="space-y-6">
              {/* Right header */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <Icon name={currentRight.icon} className="w-6 h-6 text-violet-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{currentRight.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      {currentRight.euAiActRef}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{currentRight.description}</p>
                </div>
              </div>

              {/* Considerations checklist */}
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="light-bulb" className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-800">Key Considerations</span>
                </div>
                <ul className="space-y-2">
                  {currentRight.considerations.map((consideration, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-blue-700">
                      <Icon name="chevron-right" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {consideration}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Impact Level Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-3">Impact Level</label>
                <div className="grid grid-cols-5 gap-2">
                  {IMPACT_LEVELS.map(level => (
                    <button
                      key={level.value}
                      onClick={() => updateRightAssessment(currentRight.id, { impactLevel: level.value })}
                      className={`p-3 rounded-xl border-2 transition-all text-center ${
                        currentAssessment.impactLevel === level.value
                          ? `${level.bgColor} border-current ring-2 ring-offset-1`
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                      style={{
                        ['--tw-ring-color' as string]: currentAssessment.impactLevel === level.value ? `${level.color.replace('text-', '')}40` : undefined,
                      }}
                    >
                      <div className={`text-sm font-semibold ${currentAssessment.impactLevel === level.value ? level.color : 'text-slate-700'}`}>
                        {level.label}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5 hidden md:block">{level.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mitigation Measures */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Mitigation Measures</label>
                <textarea
                  value={currentAssessment.mitigationMeasures}
                  onChange={(e) => updateRightAssessment(currentRight.id, { mitigationMeasures: e.target.value })}
                  placeholder="Describe the measures implemented or planned to mitigate the identified impacts..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  rows={4}
                />
              </div>

              {/* Residual Risk */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-3">Residual Risk (after mitigation)</label>
                <div className="grid grid-cols-3 gap-3">
                  {RESIDUAL_RISK_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => updateRightAssessment(currentRight.id, { residualRisk: option.value })}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        currentAssessment.residualRisk === option.value
                          ? `${option.bgColor} border-current ring-2 ring-offset-1`
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${currentAssessment.residualRisk === option.value ? option.color : 'text-slate-700'}`}>
                        {option.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Evidence Links */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Evidence / Documentation Links</label>
                <div className="space-y-2">
                  {currentAssessment.evidenceLinks.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <Icon name="link" className="w-4 h-4 text-slate-400" />
                      <span className="flex-1 text-xs text-slate-600 truncate">{link}</span>
                      <button
                        onClick={() => removeEvidenceLink(currentRight.id, idx)}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <Icon name="x-mark" className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add evidence link (e.g., document URL, policy reference)..."
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addEvidenceLink(currentRight.id, e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        if (input.value) {
                          addEvidenceLink(currentRight.id, input.value);
                          input.value = '';
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Additional Notes</label>
                <textarea
                  value={currentAssessment.notes}
                  onChange={(e) => updateRightAssessment(currentRight.id, { notes: e.target.value })}
                  placeholder="Any additional observations or context..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">Loading assessment data...</div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={saveDraft}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors flex items-center gap-1"
            >
              <Icon name="document" className="w-4 h-4" />
              Save Draft
            </button>
          </div>
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                Previous
              </button>
            )}
            {!showSummary ? (
              <button
                onClick={nextStep}
                className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 transition-colors flex items-center gap-1"
              >
                {currentStep === FUNDAMENTAL_RIGHTS.length - 1 ? 'View Summary' : 'Next'}
                <Icon name="arrow-right" className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={exportToPdf}
                className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 transition-colors flex items-center gap-1"
              >
                <Icon name="document-arrow-down" className="w-4 h-4" />
                Export Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' :
          toast.type === 'error' ? 'bg-rose-500 text-white' :
          'bg-slate-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
