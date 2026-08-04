/**
 * FrameworkSelectionGuide - Interactive governance framework selection wizard
 *
 * Helps customers identify which compliance and governance frameworks apply to their
 * organization based on industry, geography, AI risk level, data sensitivity, and
 * regulatory oversight. Provides prioritized recommendations with control counts
 * and direct links to the Compliance Center.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import { usePersistedState } from './usePersistedState';

// ─────────────────────────── Types ───────────────────────────

type Industry = 'banking' | 'insurance' | 'capital-markets' | 'healthcare' | 'general';
type Geography = 'us' | 'canada' | 'eu' | 'uk' | 'apac' | 'global';
type AIRiskLevel = 'high' | 'medium' | 'low';
type DataSensitivity = 'pii-phi' | 'financial' | 'public';
type RegulatoryOversight = 'federal-reserve' | 'occ' | 'sec' | 'state' | 'none';

interface QuestionnaireAnswers {
  industry: Industry | null;
  geography: Geography | null;
  aiRiskLevel: AIRiskLevel | null;
  dataSensitivity: DataSensitivity | null;
  regulatoryOversight: RegulatoryOversight | null;
}

type FrameworkPriority = 'required' | 'recommended' | 'optional';

interface Framework {
  id: string;
  name: string;
  shortName: string;
  description: string;
  controlCount: number;
  color: string;
  applicability: {
    industries: Industry[];
    geographies: Geography[];
    aiRiskLevels: AIRiskLevel[];
    dataSensitivities: DataSensitivity[];
    regulatoryOversights: RegulatoryOversight[];
  };
  priorityWeight: number;
}

interface FrameworkRecommendation {
  framework: Framework;
  priority: FrameworkPriority;
  reasons: string[];
  score: number;
}

// ─────────────────────────── Framework Data ───────────────────────────

const FRAMEWORKS: Framework[] = [
  {
    id: 'sr-26-2',
    name: 'SR 26-2 (Federal Reserve AI Guidance)',
    shortName: 'SR 26-2',
    description: 'Federal Reserve guidance on AI risk management for supervised banking organizations.',
    controlCount: 47,
    color: '#8b5cf6',
    applicability: {
      industries: ['banking'],
      geographies: ['us'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['federal-reserve'],
    },
    priorityWeight: 100,
  },
  {
    id: 'osfi-e23',
    name: 'OSFI E-23 (Model Risk Management)',
    shortName: 'OSFI E-23',
    description: 'Canadian OSFI guideline for model risk management at federally regulated financial institutions. Principles-based with 6 core sections plus Appendix 1 inventory requirements.',
    controlCount: 26,
    color: '#ec4899',
    applicability: {
      industries: ['banking', 'insurance'],
      geographies: ['canada'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['none'],
    },
    priorityWeight: 95,
  },
  {
    id: 'eu-ai-act',
    name: 'EU AI Act',
    shortName: 'EU AI Act',
    description: 'European Union regulation on artificial intelligence with risk-based classification and requirements.',
    controlCount: 62,
    color: '#f59e0b',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets', 'healthcare', 'general'],
      geographies: ['eu', 'global'],
      aiRiskLevels: ['high', 'medium'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 90,
  },
  {
    id: 'nist-ai-rmf',
    name: 'NIST AI Risk Management Framework',
    shortName: 'NIST AI RMF',
    description: 'US federal framework for managing AI risks throughout the AI lifecycle.',
    controlCount: 54,
    color: '#3b82f6',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets', 'healthcare', 'general'],
      geographies: ['us', 'global'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 85,
  },
  {
    id: 'iso-42001',
    name: 'ISO/IEC 42001 (AI Management System)',
    shortName: 'ISO 42001',
    description: 'International standard for AI management systems, suitable for certification.',
    controlCount: 41,
    color: '#06b6d4',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets', 'healthcare', 'general'],
      geographies: ['us', 'canada', 'eu', 'uk', 'apac', 'global'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 80,
  },
  {
    id: 'soc-2',
    name: 'SOC 2 (Service Organization Controls)',
    shortName: 'SOC 2',
    description: 'Trust services criteria for SaaS and cloud service providers.',
    controlCount: 64,
    color: '#10b981',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets', 'healthcare', 'general'],
      geographies: ['us', 'canada', 'global'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 75,
  },
  {
    id: 'hipaa',
    name: 'HIPAA (Health Insurance Portability)',
    shortName: 'HIPAA',
    description: 'US federal law protecting sensitive patient health information.',
    controlCount: 52,
    color: '#ef4444',
    applicability: {
      industries: ['healthcare'],
      geographies: ['us'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 100,
  },
  {
    id: 'pci-dss',
    name: 'PCI-DSS (Payment Card Industry)',
    shortName: 'PCI-DSS',
    description: 'Security standard for organizations handling credit card data.',
    controlCount: 78,
    color: '#ea580c',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets', 'general'],
      geographies: ['us', 'canada', 'eu', 'uk', 'apac', 'global'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['financial'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 90,
  },
  {
    id: 'gdpr',
    name: 'GDPR (General Data Protection Regulation)',
    shortName: 'GDPR',
    description: 'EU regulation on data protection and privacy for individuals.',
    controlCount: 45,
    color: '#4338ca',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets', 'healthcare', 'general'],
      geographies: ['eu', 'uk', 'global'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 95,
  },
  {
    id: 'dora',
    name: 'DORA (Digital Operational Resilience Act)',
    shortName: 'DORA',
    description: 'EU regulation on digital operational resilience for financial services.',
    controlCount: 56,
    color: '#a855f7',
    applicability: {
      industries: ['banking', 'insurance', 'capital-markets'],
      geographies: ['eu'],
      aiRiskLevels: ['high', 'medium', 'low'],
      dataSensitivities: ['pii-phi', 'financial', 'public'],
      regulatoryOversights: ['federal-reserve', 'occ', 'sec', 'state', 'none'],
    },
    priorityWeight: 85,
  },
];

// ─────────────────────────── Question Options ───────────────────────────

interface QuestionOption<T> {
  value: T;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const INDUSTRY_OPTIONS: QuestionOption<Industry>[] = [
  { value: 'banking', label: 'Banking', description: 'Commercial, retail, or investment banking', icon: <Icon name="building-office" className="w-5 h-5" /> },
  { value: 'insurance', label: 'Insurance', description: 'Life, P&C, health, or reinsurance', icon: <Icon name="shield-check" className="w-5 h-5" /> },
  { value: 'capital-markets', label: 'Capital Markets', description: 'Asset management, trading, securities', icon: <Icon name="chart-bar" className="w-5 h-5" /> },
  { value: 'healthcare', label: 'Healthcare', description: 'Providers, payers, pharma, medtech', icon: <Icon name="hospital" className="w-5 h-5" /> },
  { value: 'general', label: 'General', description: 'Technology, retail, manufacturing, other', icon: <Icon name="cube" className="w-5 h-5" /> },
];

const GEOGRAPHY_OPTIONS: QuestionOption<Geography>[] = [
  { value: 'us', label: 'United States', description: 'US-only operations', icon: <Icon name="globe-alt" className="w-5 h-5" /> },
  { value: 'canada', label: 'Canada', description: 'Canadian operations', icon: <Icon name="globe-alt" className="w-5 h-5" /> },
  { value: 'eu', label: 'European Union', description: 'EU member state operations', icon: <Icon name="globe-alt" className="w-5 h-5" /> },
  { value: 'uk', label: 'United Kingdom', description: 'UK operations', icon: <Icon name="globe-alt" className="w-5 h-5" /> },
  { value: 'apac', label: 'Asia-Pacific', description: 'APAC regional operations', icon: <Icon name="globe-alt" className="w-5 h-5" /> },
  { value: 'global', label: 'Global', description: 'Multi-region/global operations', icon: <Icon name="globe-alt" className="w-5 h-5" /> },
];

const AI_RISK_OPTIONS: QuestionOption<AIRiskLevel>[] = [
  { value: 'high', label: 'High-Risk Autonomous', description: 'Autonomous decisions affecting life, safety, finances', icon: <Icon name="exclamation-triangle" className="w-5 h-5" /> },
  { value: 'medium', label: 'Medium-Risk Assisted', description: 'AI-assisted decisions with human oversight', icon: <Icon name="information-circle" className="w-5 h-5" /> },
  { value: 'low', label: 'Low-Risk Informational', description: 'Informational AI, no critical decisions', icon: <Icon name="check-circle" className="w-5 h-5" /> },
];

const DATA_SENSITIVITY_OPTIONS: QuestionOption<DataSensitivity>[] = [
  { value: 'pii-phi', label: 'PII / PHI', description: 'Personal identifiable or protected health info', icon: <Icon name="lock-closed" className="w-5 h-5" /> },
  { value: 'financial', label: 'Financial Data', description: 'Payment, account, or transaction data', icon: <Icon name="banknotes" className="w-5 h-5" /> },
  { value: 'public', label: 'Public Data', description: 'Non-sensitive, publicly available data', icon: <Icon name="eye" className="w-5 h-5" /> },
];

const REGULATORY_OPTIONS: QuestionOption<RegulatoryOversight>[] = [
  { value: 'federal-reserve', label: 'Federal Reserve', description: 'Fed-supervised institution', icon: <Icon name="building-office" className="w-5 h-5" /> },
  { value: 'occ', label: 'OCC', description: 'Office of the Comptroller of the Currency', icon: <Icon name="building-office" className="w-5 h-5" /> },
  { value: 'sec', label: 'SEC', description: 'Securities and Exchange Commission', icon: <Icon name="scale" className="w-5 h-5" /> },
  { value: 'state', label: 'State Regulators', description: 'State banking or insurance regulators', icon: <Icon name="map-pin" className="w-5 h-5" /> },
  { value: 'none', label: 'None / Other', description: 'No primary US financial regulator', icon: <Icon name="circle" className="w-5 h-5" /> },
];

// ─────────────────────────── Recommendation Logic ───────────────────────────

function calculateRecommendations(answers: QuestionnaireAnswers): FrameworkRecommendation[] {
  if (!answers.industry || !answers.geography || !answers.aiRiskLevel || !answers.dataSensitivity || !answers.regulatoryOversight) {
    return [];
  }

  const recommendations: FrameworkRecommendation[] = [];

  FRAMEWORKS.forEach(framework => {
    const reasons: string[] = [];
    let score = 0;

    // Check industry match
    if (framework.applicability.industries.includes(answers.industry!)) {
      reasons.push(`Applicable to ${INDUSTRY_OPTIONS.find(o => o.value === answers.industry)?.label} industry`);
      score += 25;
    }

    // Check geography match
    if (framework.applicability.geographies.includes(answers.geography!) ||
        framework.applicability.geographies.includes('global')) {
      reasons.push(`Covers ${GEOGRAPHY_OPTIONS.find(o => o.value === answers.geography)?.label} operations`);
      score += 25;
    }

    // Check AI risk level match
    if (framework.applicability.aiRiskLevels.includes(answers.aiRiskLevel!)) {
      reasons.push(`Addresses ${AI_RISK_OPTIONS.find(o => o.value === answers.aiRiskLevel)?.label} AI systems`);
      score += 20;
    }

    // Check data sensitivity match
    if (framework.applicability.dataSensitivities.includes(answers.dataSensitivity!)) {
      reasons.push(`Covers ${DATA_SENSITIVITY_OPTIONS.find(o => o.value === answers.dataSensitivity)?.label} protection`);
      score += 15;
    }

    // Check regulatory oversight match
    if (framework.applicability.regulatoryOversights.includes(answers.regulatoryOversight!)) {
      score += 15;
    }

    // Apply priority weight
    score = (score * framework.priorityWeight) / 100;

    // Only include if score is significant
    if (score >= 40 && reasons.length >= 2) {
      let priority: FrameworkPriority = 'optional';
      if (score >= 80) priority = 'required';
      else if (score >= 60) priority = 'recommended';

      // Special rules for regulatory-specific frameworks
      if (framework.id === 'sr-26-2' && answers.regulatoryOversight === 'federal-reserve' && answers.industry === 'banking') {
        priority = 'required';
        score = 100;
      }
      if (framework.id === 'hipaa' && answers.dataSensitivity === 'pii-phi' && answers.industry === 'healthcare') {
        priority = 'required';
        score = 100;
      }
      if (framework.id === 'gdpr' && (answers.geography === 'eu' || answers.geography === 'global') && answers.dataSensitivity === 'pii-phi') {
        priority = 'required';
        score = 95;
      }
      if (framework.id === 'pci-dss' && answers.dataSensitivity === 'financial') {
        priority = 'required';
        score = 95;
      }
      if (framework.id === 'eu-ai-act' && (answers.geography === 'eu' || answers.geography === 'global') && answers.aiRiskLevel === 'high') {
        priority = 'required';
        score = 95;
      }
      if (framework.id === 'dora' && answers.geography === 'eu' && ['banking', 'insurance', 'capital-markets'].includes(answers.industry!)) {
        priority = 'required';
        score = 90;
      }

      recommendations.push({ framework, priority, reasons, score });
    }
  });

  // Sort by score descending
  return recommendations.sort((a, b) => b.score - a.score);
}

// ─────────────────────────── Components ───────────────────────────

interface QuestionCardProps<T> {
  title: string;
  description: string;
  options: QuestionOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  stepNumber: number;
  isExpanded: boolean;
  onToggle: () => void;
  isCompleted: boolean;
}

function QuestionCard<T extends string>({
  title,
  description,
  options,
  value,
  onChange,
  stepNumber,
  isExpanded,
  onToggle,
  isCompleted,
}: QuestionCardProps<T>) {
  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
              isCompleted
                ? 'bg-emerald-500 text-white'
                : 'bg-violet-100 text-violet-700'
            }`}
          >
            {isCompleted ? <Icon name="check" className="w-4 h-4" /> : stepNumber}
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {isCompleted && selectedOption && !isExpanded && (
              <div className="text-xs text-emerald-600 mt-0.5">{selectedOption.label}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted && !isExpanded && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              Completed
            </span>
          )}
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-sm text-slate-500 mt-3 mb-4">{description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {options.map(option => {
              const isSelected = value === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => onChange(option.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? 'border-violet-500 bg-violet-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${isSelected ? 'text-violet-900' : 'text-slate-800'}`}>
                        {option.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {option.description}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                        <Icon name="check" className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface FrameworkCardProps {
  recommendation: FrameworkRecommendation;
}

function FrameworkCard({ recommendation }: FrameworkCardProps) {
  const { framework, priority, reasons } = recommendation;

  const priorityConfig = {
    required: { label: 'Required', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', textColor: 'text-rose-700', badgeBg: 'bg-rose-500' },
    recommended: { label: 'Recommended', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700', badgeBg: 'bg-amber-500' },
    optional: { label: 'Optional', bgColor: 'bg-slate-50', borderColor: 'border-slate-200', textColor: 'text-slate-600', badgeBg: 'bg-slate-400' },
  };

  const config = priorityConfig[priority];

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all hover:shadow-md ${config.bgColor} ${config.borderColor}`}
      style={{ borderLeftWidth: '4px', borderLeftColor: framework.color }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: framework.color }}
            />
            <span className="text-sm font-bold text-slate-900">{framework.shortName}</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white ${config.badgeBg}`}>
              {config.label.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-slate-600 mb-3">{framework.description}</div>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((reason, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/80 text-slate-600 border border-slate-200">
                {reason}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold" style={{ color: framework.color }}>
            {framework.controlCount}
          </div>
          <div className="text-[10px] text-slate-500">controls</div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
        <div className="text-[10px] text-slate-500">
          View control checklist and compliance status
        </div>
        <Link
          to={`/govern/compliance?framework=${framework.id}`}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            backgroundColor: `${framework.color}15`,
            color: framework.color,
          }}
        >
          Open in Compliance Center
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

export function FrameworkSelectionGuide() {
  const [answers, setAnswers] = usePersistedState<QuestionnaireAnswers>('framework_selection_answers', {
    industry: null,
    geography: null,
    aiRiskLevel: null,
    dataSensitivity: null,
    regulatoryOversight: null,
  });

  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(0);
  const [showResults, setShowResults] = useState(false);

  const recommendations = useMemo(() => calculateRecommendations(answers), [answers]);

  const isComplete = answers.industry && answers.geography && answers.aiRiskLevel && answers.dataSensitivity && answers.regulatoryOversight;

  const completedCount = [answers.industry, answers.geography, answers.aiRiskLevel, answers.dataSensitivity, answers.regulatoryOversight].filter(Boolean).length;
  const progressPct = (completedCount / 5) * 100;

  const handleReset = () => {
    setAnswers({
      industry: null,
      geography: null,
      aiRiskLevel: null,
      dataSensitivity: null,
      regulatoryOversight: null,
    });
    setExpandedQuestion(0);
    setShowResults(false);
  };

  const requiredCount = recommendations.filter(r => r.priority === 'required').length;
  const recommendedCount = recommendations.filter(r => r.priority === 'recommended').length;
  const optionalCount = recommendations.filter(r => r.priority === 'optional').length;
  const totalControls = recommendations.reduce((sum, r) => sum + r.framework.controlCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 rounded-xl border border-violet-200/60 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
              <Icon name="document-check" className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Framework Selection Guide</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Answer 5 questions to discover which governance frameworks apply to your organization.
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-white/50 transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">{completedCount}/5 questions completed</span>
            <span className="text-xs font-medium text-violet-600">{Math.round(progressPct)}%</span>
          </div>
          <div className="w-full h-2 bg-white/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      {!showResults && (
        <div className="space-y-3">
          <QuestionCard
            title="Industry"
            description="Select the primary industry your organization operates in."
            options={INDUSTRY_OPTIONS}
            value={answers.industry}
            onChange={(v) => {
              setAnswers(prev => ({ ...prev, industry: v }));
              setExpandedQuestion(1);
            }}
            stepNumber={1}
            isExpanded={expandedQuestion === 0}
            onToggle={() => setExpandedQuestion(expandedQuestion === 0 ? null : 0)}
            isCompleted={!!answers.industry}
          />

          <QuestionCard
            title="Geography"
            description="Where does your organization primarily operate or serve customers?"
            options={GEOGRAPHY_OPTIONS}
            value={answers.geography}
            onChange={(v) => {
              setAnswers(prev => ({ ...prev, geography: v }));
              setExpandedQuestion(2);
            }}
            stepNumber={2}
            isExpanded={expandedQuestion === 1}
            onToggle={() => setExpandedQuestion(expandedQuestion === 1 ? null : 1)}
            isCompleted={!!answers.geography}
          />

          <QuestionCard
            title="AI Risk Level"
            description="What is the risk level of your AI systems based on autonomy and impact?"
            options={AI_RISK_OPTIONS}
            value={answers.aiRiskLevel}
            onChange={(v) => {
              setAnswers(prev => ({ ...prev, aiRiskLevel: v }));
              setExpandedQuestion(3);
            }}
            stepNumber={3}
            isExpanded={expandedQuestion === 2}
            onToggle={() => setExpandedQuestion(expandedQuestion === 2 ? null : 2)}
            isCompleted={!!answers.aiRiskLevel}
          />

          <QuestionCard
            title="Data Sensitivity"
            description="What type of sensitive data do your AI systems process?"
            options={DATA_SENSITIVITY_OPTIONS}
            value={answers.dataSensitivity}
            onChange={(v) => {
              setAnswers(prev => ({ ...prev, dataSensitivity: v }));
              setExpandedQuestion(4);
            }}
            stepNumber={4}
            isExpanded={expandedQuestion === 3}
            onToggle={() => setExpandedQuestion(expandedQuestion === 3 ? null : 3)}
            isCompleted={!!answers.dataSensitivity}
          />

          <QuestionCard
            title="Regulatory Oversight"
            description="Which primary regulatory body has oversight of your organization?"
            options={REGULATORY_OPTIONS}
            value={answers.regulatoryOversight}
            onChange={(v) => {
              setAnswers(prev => ({ ...prev, regulatoryOversight: v }));
              if (answers.industry && answers.geography && answers.aiRiskLevel && answers.dataSensitivity) {
                setShowResults(true);
              }
            }}
            stepNumber={5}
            isExpanded={expandedQuestion === 4}
            onToggle={() => setExpandedQuestion(expandedQuestion === 4 ? null : 4)}
            isCompleted={!!answers.regulatoryOversight}
          />
        </div>
      )}

      {/* Show Results Button */}
      {isComplete && !showResults && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowResults(true)}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 transition-all hover:-translate-y-0.5"
          >
            View Framework Recommendations
          </button>
        </div>
      )}

      {/* Results */}
      {showResults && recommendations.length > 0 && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="chart-bar" className="w-4 h-4 text-violet-600" strokeWidth={2} />
              <span className="text-sm font-semibold text-slate-800">Recommendation Summary</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-rose-600">{requiredCount}</div>
                <div className="text-[10px] text-rose-600 font-medium uppercase tracking-wide">Required</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{recommendedCount}</div>
                <div className="text-[10px] text-amber-600 font-medium uppercase tracking-wide">Recommended</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-slate-600">{optionalCount}</div>
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Optional</div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-indigo-600">{totalControls}</div>
                <div className="text-[10px] text-indigo-500 font-medium uppercase tracking-wide">Total Controls</div>
              </div>
            </div>
          </div>

          {/* Back to Questions */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowResults(false)}
              className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
              Edit Answers
            </button>
            <Link
              to="/govern/compliance"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              Go to Compliance Center
              <Icon name="arrow-right" className="w-4 h-4" />
            </Link>
          </div>

          {/* Framework Cards */}
          <div className="space-y-4">
            {/* Required Frameworks */}
            {recommendations.filter(r => r.priority === 'required').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <span className="text-sm font-semibold text-slate-800">Required Frameworks</span>
                  <span className="text-[10px] text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full font-medium">
                    Must comply
                  </span>
                </div>
                <div className="space-y-3">
                  {recommendations.filter(r => r.priority === 'required').map(r => (
                    <FrameworkCard key={r.framework.id} recommendation={r} />
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Frameworks */}
            {recommendations.filter(r => r.priority === 'recommended').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm font-semibold text-slate-800">Recommended Frameworks</span>
                  <span className="text-[10px] text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                    Strong alignment
                  </span>
                </div>
                <div className="space-y-3">
                  {recommendations.filter(r => r.priority === 'recommended').map(r => (
                    <FrameworkCard key={r.framework.id} recommendation={r} />
                  ))}
                </div>
              </div>
            )}

            {/* Optional Frameworks */}
            {recommendations.filter(r => r.priority === 'optional').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-slate-400" />
                  <span className="text-sm font-semibold text-slate-800">Optional Frameworks</span>
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                    Consider for best practices
                  </span>
                </div>
                <div className="space-y-3">
                  {recommendations.filter(r => r.priority === 'optional').map(r => (
                    <FrameworkCard key={r.framework.id} recommendation={r} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export Actions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Export Assessment</div>
                <div className="text-xs text-slate-500">Download your framework recommendations</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const data = {
                      assessmentDate: new Date().toISOString(),
                      answers,
                      recommendations: recommendations.map(r => ({
                        framework: r.framework.shortName,
                        priority: r.priority,
                        controlCount: r.framework.controlCount,
                        reasons: r.reasons,
                      })),
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `framework-assessment-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                >
                  Export JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Recommendations */}
      {showResults && recommendations.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Icon name="exclamation-triangle" className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <div className="text-amber-800 font-semibold">No Framework Matches Found</div>
          <div className="text-sm text-amber-700 mt-1">
            Your answers did not match any specific frameworks. Consider reviewing NIST AI RMF and ISO 42001 as general best practice frameworks.
          </div>
          <button
            onClick={() => setShowResults(false)}
            className="mt-4 px-4 py-2 text-sm font-medium text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
          >
            Revise Answers
          </button>
        </div>
      )}
    </div>
  );
}

export default FrameworkSelectionGuide;
