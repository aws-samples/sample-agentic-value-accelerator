/**
 * VendorOnboardingWizard - 5-step wizard for onboarding new AI/ML vendors
 *
 * Steps:
 * 1. Basic Info - Vendor name, type, services, contract dates
 * 2. TPIA Assessment - Data access, criticality, volume, integration depth
 * 3. Pre-screening - Simulated checks (sanctions, credit, news, cyber)
 * 4. Initial Risk Assessment - 5-domain sliders with weights
 * 5. Monitoring Config - Alert frequency, review cadence, escalation thresholds
 */

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../icons';
import { getRiskScoreTextColor } from '../riskScoring';

// ============================================================================
// Types
// ============================================================================

type VendorType = 'model-provider' | 'saas-tool' | 'infrastructure' | 'data-provider';
type DataAccessLevel = 'none' | 'public' | 'internal' | 'confidential' | 'restricted';
type ServiceCriticality = 'non-critical' | 'important' | 'critical' | 'mission-critical';
type DataVolume = 'low' | 'medium' | 'high';
type IntegrationDepth = 'api-only' | 'data-sharing' | 'deep-integration';
type InherentRiskLevel = 'lower' | 'moderate' | 'higher';
type AlertFrequency = 'real-time' | 'daily' | 'weekly' | 'monthly';
type ReviewCadence = 'quarterly' | 'semi-annual' | 'annual';

interface BasicInfoForm {
  vendorName: string;
  vendorType: VendorType | '';
  services: string;
  contractStartDate: string;
  contractEndDate: string;
}

interface TPIAForm {
  dataAccessLevel: DataAccessLevel;
  serviceCriticality: ServiceCriticality;
  dataVolume: DataVolume;
  integrationDepth: IntegrationDepth;
  inherentRiskLevel: InherentRiskLevel;
}

interface PreScreeningResult {
  category: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  score: number;
  details: string;
}

interface DomainRiskScores {
  financial: number;
  operational: number;
  compliance: number;
  reputation: number;
  cyber: number;
}

interface DomainWeights {
  financial: number;
  operational: number;
  compliance: number;
  reputation: number;
  cyber: number;
}

interface MonitoringConfig {
  alertFrequency: AlertFrequency;
  reviewCadence: ReviewCadence;
  escalationThreshold: number;
  categories: {
    financial: boolean;
    operational: boolean;
    compliance: boolean;
    reputation: boolean;
    cyber: boolean;
  };
}

interface VendorOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (vendorData: VendorSubmissionData) => void;
}

interface VendorSubmissionData {
  basicInfo: BasicInfoForm;
  tpia: TPIAForm;
  preScreening: PreScreeningResult[];
  domainScores: DomainRiskScores;
  domainWeights: DomainWeights;
  overallRiskScore: number;
  monitoringConfig: MonitoringConfig;
}

// ============================================================================
// Constants
// ============================================================================

const STEPS = [
  { id: 1, name: 'Basic Info', icon: 'building-office' as const },
  { id: 2, name: 'TPIA Assessment', icon: 'clipboard-document-check' as const },
  { id: 3, name: 'Pre-screening', icon: 'magnifying-glass' as const },
  { id: 4, name: 'Risk Assessment', icon: 'chart-bar' as const },
  { id: 5, name: 'Monitoring', icon: 'bell-alert' as const },
];

const VENDOR_TYPES: { value: VendorType; label: string }[] = [
  { value: 'model-provider', label: 'Model Provider (e.g., Anthropic, OpenAI)' },
  { value: 'saas-tool', label: 'SaaS Tool (e.g., Copilot, Cursor)' },
  { value: 'infrastructure', label: 'Infrastructure (e.g., AWS Bedrock)' },
  { value: 'data-provider', label: 'Data Provider (e.g., training data vendors)' },
];

const DATA_ACCESS_OPTIONS: { value: DataAccessLevel; label: string; description: string }[] = [
  { value: 'none', label: 'No Access', description: 'No data shared with vendor' },
  { value: 'public', label: 'Public Only', description: 'Public data only' },
  { value: 'internal', label: 'Internal', description: 'Internal business data' },
  { value: 'confidential', label: 'Confidential', description: 'Sensitive customer data' },
  { value: 'restricted', label: 'Restricted', description: 'PII, financial, health data' },
];

const CRITICALITY_OPTIONS: { value: ServiceCriticality; label: string; description: string }[] = [
  { value: 'non-critical', label: 'Non-Critical', description: 'Nice to have' },
  { value: 'important', label: 'Important', description: 'Supports key processes' },
  { value: 'critical', label: 'Critical', description: 'Core business dependency' },
  { value: 'mission-critical', label: 'Mission-Critical', description: 'Business stops without' },
];

const DOMAIN_LABELS: Record<keyof DomainRiskScores, { label: string; icon: string; defaultWeight: number }> = {
  financial: { label: 'Financial', icon: 'currency-dollar', defaultWeight: 25 },
  operational: { label: 'Operational', icon: 'cog', defaultWeight: 20 },
  compliance: { label: 'Compliance', icon: 'scale', defaultWeight: 20 },
  reputation: { label: 'Reputation', icon: 'megaphone', defaultWeight: 15 },
  cyber: { label: 'Cyber', icon: 'shield-check', defaultWeight: 20 },
};

const inherentRiskColors: Record<InherentRiskLevel, { bg: string; text: string; border: string }> = {
  lower: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  moderate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  higher: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

// ============================================================================
// Helper Functions
// ============================================================================

function calculateInherentRisk(tpia: TPIAForm): InherentRiskLevel {
  const dataScore = { none: 0, public: 1, internal: 2, confidential: 3, restricted: 4 }[tpia.dataAccessLevel];
  const critScore = { 'non-critical': 0, important: 1, critical: 2, 'mission-critical': 3 }[tpia.serviceCriticality];
  const volScore = { low: 0, medium: 1, high: 2 }[tpia.dataVolume];
  const intScore = { 'api-only': 0, 'data-sharing': 1, 'deep-integration': 2 }[tpia.integrationDepth];
  const total = dataScore + critScore + volScore + intScore;
  return total <= 3 ? 'lower' : total <= 7 ? 'moderate' : 'higher';
}

function calculateOverallRiskScore(scores: DomainRiskScores, weights: DomainWeights): number {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return 0;

  let weightedSum = 0;
  (Object.keys(scores) as Array<keyof DomainRiskScores>).forEach(domain => {
    weightedSum += scores[domain] * (weights[domain] / totalWeight);
  });

  return Math.round(weightedSum);
}

// ============================================================================
// Component
// ============================================================================

export default function VendorOnboardingWizard({ isOpen, onClose, onSubmit }: VendorOnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Basic Info
  const [basicInfo, setBasicInfo] = useState<BasicInfoForm>({
    vendorName: '',
    vendorType: '',
    services: '',
    contractStartDate: '',
    contractEndDate: '',
  });

  // Step 2: TPIA Assessment
  const [tpia, setTpia] = useState<TPIAForm>({
    dataAccessLevel: 'none',
    serviceCriticality: 'non-critical',
    dataVolume: 'low',
    integrationDepth: 'api-only',
    inherentRiskLevel: 'lower',
  });

  // Step 3: Pre-screening
  const [preScreeningResults, setPreScreeningResults] = useState<PreScreeningResult[]>([]);
  const [isScreening, setIsScreening] = useState(false);
  const [screeningComplete, setScreeningComplete] = useState(false);

  // Step 4: Risk Assessment
  const [domainScores, setDomainScores] = useState<DomainRiskScores>({
    financial: 50,
    operational: 50,
    compliance: 50,
    reputation: 50,
    cyber: 50,
  });
  const [domainWeights, setDomainWeights] = useState<DomainWeights>({
    financial: 25,
    operational: 20,
    compliance: 20,
    reputation: 15,
    cyber: 20,
  });

  // Step 5: Monitoring Config
  const [monitoringConfig, setMonitoringConfig] = useState<MonitoringConfig>({
    alertFrequency: 'daily',
    reviewCadence: 'quarterly',
    escalationThreshold: 70,
    categories: {
      financial: true,
      operational: true,
      compliance: true,
      reputation: true,
      cyber: true,
    },
  });

  // Update inherent risk when TPIA changes
  useEffect(() => {
    const newLevel = calculateInherentRisk(tpia);
    if (newLevel !== tpia.inherentRiskLevel) {
      setTpia(prev => ({ ...prev, inherentRiskLevel: newLevel }));
    }
  }, [tpia.dataAccessLevel, tpia.serviceCriticality, tpia.dataVolume, tpia.integrationDepth, tpia]);

  // Simulate pre-screening
  const runPreScreening = useCallback(() => {
    setIsScreening(true);
    setPreScreeningResults([]);

    const checks = [
      { category: 'Sanctions Screening', delay: 800 },
      { category: 'Credit Check', delay: 1200 },
      { category: 'Adverse News', delay: 1600 },
      { category: 'Cyber Score', delay: 2000 },
    ];

    checks.forEach(({ category, delay }) => {
      setTimeout(() => {
        const statuses: Array<'pass' | 'fail' | 'warning'> = ['pass', 'pass', 'pass', 'warning'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        const score = randomStatus === 'pass' ? 85 + Math.floor(Math.random() * 15) :
                      randomStatus === 'warning' ? 60 + Math.floor(Math.random() * 20) :
                      30 + Math.floor(Math.random() * 20);

        const details = {
          'Sanctions Screening': randomStatus === 'pass' ? 'No matches found in OFAC, UN, EU lists' :
                                 randomStatus === 'warning' ? 'Potential match requires manual review' :
                                 'Match found - escalation required',
          'Credit Check': randomStatus === 'pass' ? 'Strong financial position, Dun & Bradstreet rating: A+' :
                         randomStatus === 'warning' ? 'Moderate financial position, recent funding changes' :
                         'Weak financial indicators - high risk',
          'Adverse News': randomStatus === 'pass' ? 'No significant negative coverage in past 12 months' :
                         randomStatus === 'warning' ? 'Minor regulatory mentions - review recommended' :
                         'Multiple adverse news items detected',
          'Cyber Score': randomStatus === 'pass' ? 'SecurityScorecard: A, BitSight: 780+' :
                        randomStatus === 'warning' ? 'SecurityScorecard: B, some vulnerabilities noted' :
                        'SecurityScorecard: C or below - requires attention',
        }[category] || 'Check completed';

        setPreScreeningResults(prev => [...prev, {
          category,
          status: randomStatus,
          score,
          details,
        }]);
      }, delay);
    });

    setTimeout(() => {
      setIsScreening(false);
      setScreeningComplete(true);
    }, 2400);
  }, []);

  // Validation
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(basicInfo.vendorName && basicInfo.vendorType && basicInfo.services);
      case 2:
        return true; // TPIA has defaults
      case 3:
        return screeningComplete;
      case 4:
        return true; // Risk assessment has defaults
      case 5:
        return true; // Monitoring has defaults
      default:
        return false;
    }
  };

  const canProceed = validateStep(currentStep);

  const handleNext = () => {
    if (currentStep < 5 && canProceed) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    const submissionData: VendorSubmissionData = {
      basicInfo,
      tpia,
      preScreening: preScreeningResults,
      domainScores,
      domainWeights,
      overallRiskScore: calculateOverallRiskScore(domainScores, domainWeights),
      monitoringConfig,
    };
    onSubmit(submissionData);
    onClose();
  };

  const overallRiskScore = calculateOverallRiskScore(domainScores, domainWeights);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Vendor Onboarding Wizard</h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Step {currentStep} of 5: {STEPS[currentStep - 1].name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Icon name="x-mark" className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      currentStep > step.id
                        ? 'bg-emerald-500 text-white'
                        : currentStep === step.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Icon name="check" className="w-5 h-5" />
                    ) : (
                      <Icon name={step.icon} className="w-5 h-5" />
                    )}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${
                    currentStep >= step.id ? 'text-slate-700' : 'text-slate-400'
                  }`}>
                    {step.name}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-2 ${
                      currentStep > step.id ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Vendor Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={basicInfo.vendorName}
                  onChange={e => setBasicInfo(prev => ({ ...prev, vendorName: e.target.value }))}
                  placeholder="e.g., Anthropic, OpenAI, Cohere"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Vendor Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={basicInfo.vendorType}
                  onChange={e => setBasicInfo(prev => ({ ...prev, vendorType: e.target.value as VendorType }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select vendor type...</option>
                  {VENDOR_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Services Offered <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={basicInfo.services}
                  onChange={e => setBasicInfo(prev => ({ ...prev, services: e.target.value }))}
                  placeholder="e.g., Claude 3.5 Sonnet, Claude API, Embeddings"
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-[10px] text-slate-500 mt-1">Comma-separated list of services</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Contract Start Date
                  </label>
                  <input
                    type="date"
                    value={basicInfo.contractStartDate}
                    onChange={e => setBasicInfo(prev => ({ ...prev, contractStartDate: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Contract End Date
                  </label>
                  <input
                    type="date"
                    value={basicInfo.contractEndDate}
                    onChange={e => setBasicInfo(prev => ({ ...prev, contractEndDate: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: TPIA Assessment */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <Icon name="information-circle" className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-blue-800">Third-Party Inherent Assessment (TPIA)</div>
                    <div className="text-xs text-blue-700 mt-1">
                      Answer these questions to determine the inherent risk level before controls are applied.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Data Access Level
                </label>
                <select
                  value={tpia.dataAccessLevel}
                  onChange={e => setTpia(prev => ({ ...prev, dataAccessLevel: e.target.value as DataAccessLevel }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                >
                  {DATA_ACCESS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} - {opt.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Service Criticality
                </label>
                <select
                  value={tpia.serviceCriticality}
                  onChange={e => setTpia(prev => ({ ...prev, serviceCriticality: e.target.value as ServiceCriticality }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                >
                  {CRITICALITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} - {opt.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Data Volume
                  </label>
                  <select
                    value={tpia.dataVolume}
                    onChange={e => setTpia(prev => ({ ...prev, dataVolume: e.target.value as DataVolume }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <option value="low">Low - Minimal data exchange</option>
                    <option value="medium">Medium - Regular data flow</option>
                    <option value="high">High - Large-scale data processing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Integration Depth
                  </label>
                  <select
                    value={tpia.integrationDepth}
                    onChange={e => setTpia(prev => ({ ...prev, integrationDepth: e.target.value as IntegrationDepth }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <option value="api-only">API Only - Simple REST calls</option>
                    <option value="data-sharing">Data Sharing - Two-way data exchange</option>
                    <option value="deep-integration">Deep Integration - Core system dependency</option>
                  </select>
                </div>
              </div>

              {/* Auto-calculated inherent risk */}
              <div className={`rounded-lg p-4 border ${inherentRiskColors[tpia.inherentRiskLevel].bg} ${inherentRiskColors[tpia.inherentRiskLevel].border}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Calculated Inherent Risk</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Based on data sensitivity + criticality + volume + integration
                    </div>
                  </div>
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${inherentRiskColors[tpia.inherentRiskLevel].bg} ${inherentRiskColors[tpia.inherentRiskLevel].text}`}>
                    {tpia.inherentRiskLevel}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Pre-screening */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {!screeningComplete && !isScreening && (
                <div className="text-center py-8">
                  <Icon name="magnifying-glass" className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Pre-screening Checks</h4>
                  <p className="text-xs text-slate-500 mb-6 max-w-md mx-auto">
                    Run automated checks for sanctions, credit worthiness, adverse news, and cyber security posture.
                  </p>
                  <button
                    onClick={runPreScreening}
                    className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Run Pre-screening
                  </button>
                </div>
              )}

              {(isScreening || screeningComplete) && (
                <div className="space-y-3">
                  {['Sanctions Screening', 'Credit Check', 'Adverse News', 'Cyber Score'].map((category) => {
                    const result = preScreeningResults.find(r => r.category === category);
                    const isPending = !result;

                    return (
                      <div
                        key={category}
                        className={`rounded-lg border p-4 transition-all ${
                          isPending ? 'bg-slate-50 border-slate-200' :
                          result.status === 'pass' ? 'bg-emerald-50 border-emerald-200' :
                          result.status === 'warning' ? 'bg-amber-50 border-amber-200' :
                          'bg-rose-50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isPending ? (
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                                <Icon name="spinner" className="w-4 h-4 text-slate-500 animate-spin" />
                              </div>
                            ) : result.status === 'pass' ? (
                              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Icon name="check" className="w-4 h-4 text-white" />
                              </div>
                            ) : result.status === 'warning' ? (
                              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
                                <Icon name="exclamation-triangle" className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center">
                                <Icon name="x-mark" className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-slate-800">{category}</div>
                              <div className="text-xs text-slate-500">
                                {isPending ? 'Checking...' : result.details}
                              </div>
                            </div>
                          </div>
                          {!isPending && (
                            <div className={`text-lg font-bold ${
                              result.status === 'pass' ? 'text-emerald-600' :
                              result.status === 'warning' ? 'text-amber-600' :
                              'text-rose-600'
                            }`}>
                              {result.score}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {screeningComplete && (
                    <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-700">Pre-screening Complete</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {preScreeningResults.filter(r => r.status === 'pass').length} passed,{' '}
                            {preScreeningResults.filter(r => r.status === 'warning').length} warnings,{' '}
                            {preScreeningResults.filter(r => r.status === 'fail').length} failed
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setScreeningComplete(false);
                            setPreScreeningResults([]);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          Re-run checks
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Initial Risk Assessment */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Overall Risk Score</div>
                    <div className="text-xs text-slate-500">Weighted average of 5 domains</div>
                  </div>
                  <div className={`text-3xl font-bold ${getRiskScoreTextColor(overallRiskScore)}`}>
                    {overallRiskScore}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {(Object.keys(DOMAIN_LABELS) as Array<keyof DomainRiskScores>).map(domain => {
                  const { label, icon, defaultWeight } = DOMAIN_LABELS[domain];
                  const score = domainScores[domain];
                  const weight = domainWeights[domain];

                  return (
                    <div key={domain} className="bg-white border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name={icon as any} className="w-4 h-4 text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        <span className="text-xs text-slate-400">(Default: {defaultWeight}%)</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Risk Score: {score}</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={score}
                            onChange={e => setDomainScores(prev => ({ ...prev, [domain]: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                            <span>Low Risk</span>
                            <span>High Risk</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Weight: {weight}%</label>
                          <input
                            type="range"
                            min="0"
                            max="50"
                            value={weight}
                            onChange={e => setDomainWeights(prev => ({ ...prev, [domain]: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                          />
                          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                            <span>0%</span>
                            <span>50%</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            score <= 30 ? 'bg-emerald-500' :
                            score <= 50 ? 'bg-amber-500' :
                            score <= 70 ? 'bg-orange-500' :
                            'bg-rose-500'
                          }`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-slate-500 text-center mt-2">
                Total Weight: {Object.values(domainWeights).reduce((sum, w) => sum + w, 0)}% (should equal 100% for accurate scoring)
              </div>
            </div>
          )}

          {/* Step 5: Monitoring Config */}
          {currentStep === 5 && (
            <div className="space-y-6">
              {/* Summary Panel */}
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-indigo-800 mb-3">Vendor Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Vendor:</span>{' '}
                    <span className="font-medium text-slate-700">{basicInfo.vendorName || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Type:</span>{' '}
                    <span className="font-medium text-slate-700 capitalize">{basicInfo.vendorType?.replace('-', ' ') || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Inherent Risk:</span>{' '}
                    <span className={`font-medium capitalize ${inherentRiskColors[tpia.inherentRiskLevel].text}`}>
                      {tpia.inherentRiskLevel}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Risk Score:</span>{' '}
                    <span className={`font-bold ${getRiskScoreTextColor(overallRiskScore)}`}>{overallRiskScore}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Pre-screening:</span>{' '}
                    <span className={`font-medium ${
                      preScreeningResults.every(r => r.status === 'pass') ? 'text-emerald-600' :
                      preScreeningResults.some(r => r.status === 'fail') ? 'text-rose-600' :
                      'text-amber-600'
                    }`}>
                      {preScreeningResults.filter(r => r.status === 'pass').length}/{preScreeningResults.length} passed
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Contract:</span>{' '}
                    <span className="font-medium text-slate-700">
                      {basicInfo.contractStartDate || '-'} to {basicInfo.contractEndDate || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Monitoring Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-800">Monitoring Configuration</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                      Alert Frequency
                    </label>
                    <select
                      value={monitoringConfig.alertFrequency}
                      onChange={e => setMonitoringConfig(prev => ({ ...prev, alertFrequency: e.target.value as AlertFrequency }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                    >
                      <option value="real-time">Real-time</option>
                      <option value="daily">Daily Digest</option>
                      <option value="weekly">Weekly Summary</option>
                      <option value="monthly">Monthly Report</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                      Review Cadence
                    </label>
                    <select
                      value={monitoringConfig.reviewCadence}
                      onChange={e => setMonitoringConfig(prev => ({ ...prev, reviewCadence: e.target.value as ReviewCadence }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                    >
                      <option value="quarterly">Quarterly</option>
                      <option value="semi-annual">Semi-Annual</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Escalation Threshold: {monitoringConfig.escalationThreshold}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="90"
                    value={monitoringConfig.escalationThreshold}
                    onChange={e => setMonitoringConfig(prev => ({ ...prev, escalationThreshold: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Alert at 50+</span>
                    <span>Alert at 90+</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">
                    Monitoring Categories
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(monitoringConfig.categories) as Array<keyof typeof monitoringConfig.categories>).map(cat => (
                      <label
                        key={cat}
                        className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={monitoringConfig.categories[cat]}
                          onChange={e => setMonitoringConfig(prev => ({
                            ...prev,
                            categories: { ...prev.categories, [cat]: e.target.checked }
                          }))}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-700 capitalize">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              currentStep === 1
                ? 'text-slate-400 cursor-not-allowed'
                : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            Previous
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-white transition-colors"
            >
              Cancel
            </button>
            {currentStep < 5 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  canProceed
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Submit Vendor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
