/**
 * GovernanceAssessment - AI Governance Assessment UI Component
 *
 * A comprehensive assessment tool for evaluating organizational AI governance maturity
 * across 14 governance domains with regulatory framework mapping.
 *
 * Features:
 * - Multi-step assessment wizard (org info + 14 domain steps)
 * - Stakeholder view filtering (Board, Risk, Tech, Legal, Audit)
 * - Results dashboard with radar chart visualization
 * - Gap analysis table with filtering
 * - Prioritized recommendations panel
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../icons';
import { saveAssessmentResult, loadAssessmentResult, clearAssessmentResult } from './useAssessmentState';
import {
  type MaturityLevel,
  type AssessmentResponse,
  type DomainAssessment,
  type AssessmentResult,
  type Gap,
  type Recommendation,
  type GovernanceDomain,
  type AssessmentQuestion,
  type FrameworkId,
  type OperatingRegion,
  type StakeholderRole,
  type PlanModuleContext,
  MATURITY_LEVELS,
  GOVERNANCE_DOMAINS,
  REGULATORY_FRAMEWORKS,
  STAKEHOLDER_VIEWS,
  calculateDomainMaturity,
  calculateComplianceScore,
  identifyGaps,
  generateRecommendations,
  filterByStakeholder,
  getQuestionsForStakeholder,
  DOMAIN_COUNT,
} from './governanceAssessmentFramework';
import {
  useAssessmentAutoPopulate,
  type AutoPopulateSignal,
  type ModuleStatus,
} from './useAssessmentAutoPopulate';

// ============================================================================
// Types
// ============================================================================

type View = 'wizard' | 'results' | 'gaps' | 'recommendations';

// OperatingRegion moved to governanceAssessmentFramework.ts (imported above) so that
// AssessmentResult.assessmentScope can name it.

interface OrganizationInfo {
  name: string;
  industry: string;
  size: string;
  operatingRegions: OperatingRegion[];
  selectedFrameworks: FrameworkId[];
  stakeholderFilter?: StakeholderRole;
  planContext?: PlanModuleContext;
}

const OPERATING_REGIONS: { id: OperatingRegion; name: string; description: string }[] = [
  { id: 'north_america', name: 'North America', description: 'US, Mexico' },
  { id: 'canada', name: 'Canada', description: 'Canada' },
  { id: 'eu', name: 'Europe', description: 'EU, EEA, UK, Switzerland' },
  { id: 'apac', name: 'Asia-Pacific', description: 'Australia, Japan, Singapore, etc.' },
  { id: 'latam', name: 'Latin America', description: 'Brazil, Argentina, Chile, etc.' },
  { id: 'mea', name: 'Middle East & Africa', description: 'UAE, Saudi Arabia, South Africa, etc.' },
];

const REGION_FRAMEWORK_MAP: Record<OperatingRegion, FrameworkId[]> = {
  north_america: ['NIST_AI_RMF', 'SR_26_2', 'SR_11_7', 'CRI_FS_AI_RMF'],
  canada: ['NIST_AI_RMF', 'ISO_42001', 'OSFI_E23'],
  eu: ['EU_AI_ACT', 'ISO_42001'],
  apac: ['ISO_42001', 'NIST_AI_RMF', 'MAS_FEAT', 'SG_AI_FRAMEWORK', 'APRA_CPG235'],
  latam: ['ISO_42001', 'NIST_AI_RMF'],
  mea: ['ISO_42001', 'NIST_AI_RMF'],
};

const INDUSTRY_FRAMEWORK_MAP: Record<string, FrameworkId[]> = {
  'Financial Services': ['SR_26_2', 'SR_11_7', 'CRI_FS_AI_RMF'],
  'Banking': ['SR_26_2', 'SR_11_7', 'CRI_FS_AI_RMF'],
  'Insurance': ['SR_26_2', 'NAIC_AI_BULLETIN', 'CRI_FS_AI_RMF'],
  'Healthcare': ['NIST_AI_RMF', 'ISO_42001'],
  'Government': ['NIST_AI_RMF'],
};

interface DraftState {
  organizationInfo: OrganizationInfo;
  responses: Record<string, AssessmentResponse>;
  currentStep: number;
}

// ============================================================================
// Constants
// ============================================================================

const INDUSTRIES = [
  'Financial Services',
  'Healthcare',
  'Insurance',
  'Retail',
  'Manufacturing',
  'Technology',
  'Government',
  'Energy & Utilities',
  'Telecommunications',
  'Other',
];

const COMPANY_SIZES = [
  '1-50 employees',
  '51-200 employees',
  '201-1000 employees',
  '1001-5000 employees',
  '5001-10000 employees',
  '10000+ employees',
];

const DOMAIN_ICONS: Record<string, IconName> = {
  'inventory-registry': 'rectangle-stack',
  'model-governance': 'cpu-chip',
  'risk-management': 'exclamation-triangle',
  'data-governance': 'circle-stack',
  'fairness-bias': 'scale',
  'transparency-explainability': 'eye',
  'security-safety': 'shield-check',
  'compliance-audit': 'clipboard-document-check',
  'finops-cost': 'currency-dollar',
  'human-oversight': 'user-group',
  'agentic-autonomy': 'cog-6-tooth',
  'multi-agent-governance': 'squares-plus',
  'incident-management': 'fire',
  'shadow-ai': 'eye-slash',
};

const SEVERITY_CONFIG: Record<Gap['severity'], { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100' },
  high: { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  medium: { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  low: { label: 'Low', color: 'text-blue-700', bgColor: 'bg-blue-100' },
};

const EFFORT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low Effort', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  medium: { label: 'Medium Effort', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  high: { label: 'High Effort', color: 'text-red-700', bgColor: 'bg-red-100' },
};

const IMPACT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low Impact', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  medium: { label: 'Medium Impact', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  high: { label: 'High Impact', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
};

const STORAGE_KEY = 'governance-assessment-draft';

// ============================================================================
// Utility Functions
// ============================================================================

function getMaturityColor(level: MaturityLevel): string {
  const colors: Record<MaturityLevel, string> = {
    1: 'bg-rose-500',
    2: 'bg-orange-500',
    3: 'bg-amber-500',
    4: 'bg-blue-500',
    5: 'bg-emerald-500',
  };
  return colors[level];
}

function getMaturityBgColor(level: MaturityLevel): string {
  const colors: Record<MaturityLevel, string> = {
    1: 'bg-rose-100 text-rose-800',
    2: 'bg-orange-100 text-orange-800',
    3: 'bg-amber-100 text-amber-800',
    4: 'bg-blue-100 text-blue-800',
    5: 'bg-emerald-100 text-emerald-800',
  };
  return colors[level];
}

function loadDraft(): DraftState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveDraft(state: DraftState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Result Computation (deterministic — derived from real responses / signals)
// ============================================================================

function filterDomainsByFramework(domains: GovernanceDomain[], selectedFrameworks: FrameworkId[]): GovernanceDomain[] {
  if (selectedFrameworks.length === 0) return domains;
  return domains.filter((domain) =>
    domain.regulatoryMappings.some((mapping) => selectedFrameworks.includes(mapping.framework))
  );
}

function getQuestionCountByFramework(domains: GovernanceDomain[]): Record<FrameworkId, number> {
  const counts: Partial<Record<FrameworkId, number>> = {};
  for (const domain of domains) {
    for (const question of domain.questions) {
      if (question.frameworks) {
        for (const framework of question.frameworks) {
          counts[framework] = (counts[framework] || 0) + 1;
        }
      }
    }
  }
  return counts as Record<FrameworkId, number>;
}

/**
 * Compute an assessment result deterministically from the user's recorded responses
 * (including any auto-populated signals). No Math.random — identical responses always
 * produce the identical score, so the value is stable across reloads. Domains and
 * questions with no recorded response are simply skipped by the scoring helpers.
 */
function computeAssessmentResult(
  organizationInfo: OrganizationInfo,
  responses: Record<string, AssessmentResponse>,
): AssessmentResult {
  const domainsToAssess = filterDomainsByFramework(GOVERNANCE_DOMAINS, organizationInfo.selectedFrameworks);

  const domainAssessments: DomainAssessment[] = domainsToAssess.map((domain) => {
    // Use ONLY the user's real answers / auto-populated signals for this domain.
    const domainResponses: AssessmentResponse[] = domain.questions
      .map((q) => responses[q.id])
      .filter((r): r is AssessmentResponse => r !== undefined);

    return {
      domainId: domain.id,
      responses: domainResponses,
      maturityScore: calculateDomainMaturity(domainResponses, domain),
      complianceScore: calculateComplianceScore(domainResponses, domain),
      gaps: identifyGaps(domainResponses, domain),
    };
  });

  const now = new Date().toISOString();
  const baseResult: AssessmentResult = {
    id: `assessment-${Date.now()}`,
    name: 'AI Governance Assessment',
    createdAt: now,
    updatedAt: now,
    assessor: 'current-user',
    organization: organizationInfo.name || 'Organization',
    domainAssessments,
    overallMaturity: 0,
    overallCompliance: 0,
    totalGaps: 0,
    criticalGaps: 0,
    recommendations: [],
  };

  const recommendations = generateRecommendations(baseResult);

  // Weighted maturity across in-scope domains; deterministic given fixed responses.
  const totalWeight = domainsToAssess.reduce((sum, d) => sum + d.weight, 0);
  const overallMaturity = totalWeight > 0
    ? domainAssessments.reduce((sum, da, i) => sum + da.maturityScore * domainsToAssess[i].weight, 0) / totalWeight
    : 0;

  const overallCompliance = totalWeight > 0
    ? Math.round(domainAssessments.reduce((sum, da, i) => sum + da.complianceScore * domainsToAssess[i].weight, 0) / totalWeight)
    : 0;

  const allGaps = domainAssessments.flatMap((da) => da.gaps);

  return {
    ...baseResult,
    overallMaturity,
    overallCompliance,
    totalGaps: allGaps.length,
    criticalGaps: allGaps.filter((g) => g.severity === 'critical').length,
    recommendations,
  };
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const percentage = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="mb-6">
      <div className="flex justify-between text-sm text-gray-600 mb-2">
        <span>
          Step {currentStep + 1} of {totalSteps + 1}
        </span>
        <span>{percentage}% Complete</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface MaturityRadioProps {
  question: AssessmentQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}

function MaturityRadio({ question, value, onChange }: MaturityRadioProps) {
  return (
    <div className="space-y-2">
      {([1, 2, 3, 4, 5] as MaturityLevel[]).map((level) => {
        const maturityInfo = MATURITY_LEVELS[level];
        const description = question.maturityMapping?.[level] || maturityInfo.description;
        const isSelected = value === level;

        return (
          <label
            key={level}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              isSelected
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name={question.id}
              value={level}
              checked={isSelected}
              onChange={() => onChange(level)}
              className="mt-1 w-4 h-4 text-blue-600"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getMaturityBgColor(
                    level
                  )}`}
                >
                  {level} - {maturityInfo.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{description}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

interface BooleanToggleProps {
  question: AssessmentQuestion;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
}

function BooleanToggle({ question, value, onChange }: BooleanToggleProps) {
  return (
    <div className="flex gap-4">
      <label
        className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors ${
          value === true
            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <input
          type="radio"
          name={question.id}
          checked={value === true}
          onChange={() => onChange(true)}
          className="sr-only"
        />
        <Icon name="check-circle" className="w-5 h-5" />
        <span className="font-medium">Yes</span>
      </label>
      <label
        className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors ${
          value === false
            ? 'border-rose-500 bg-rose-50 text-rose-800'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <input
          type="radio"
          name={question.id}
          checked={value === false}
          onChange={() => onChange(false)}
          className="sr-only"
        />
        <Icon name="x-circle" className="w-5 h-5" />
        <span className="font-medium">No</span>
      </label>
    </div>
  );
}

interface MultiSelectInputProps {
  question: AssessmentQuestion;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}

function MultiSelectInput({ question, value = [], onChange }: MultiSelectInputProps) {
  const handleToggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <div className="space-y-2">
      {question.options?.map((option) => {
        const isSelected = value.includes(option);
        return (
          <label
            key={option}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              isSelected
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggle(option)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-900">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

interface SingleSelectInputProps {
  question: AssessmentQuestion;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}

function SingleSelectInput({ question, value, onChange }: SingleSelectInputProps) {
  const selectedValue = value?.[0] || '';
  return (
    <div className="space-y-2">
      {question.options?.map((option) => {
        const isSelected = selectedValue === option;
        return (
          <label
            key={option}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              isSelected
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name={question.id}
              checked={isSelected}
              onChange={() => onChange([option])}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-sm text-gray-900">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

interface RadarChartProps {
  data: { domain: string; score: number }[];
}

function RadarChart({ data }: RadarChartProps) {
  const size = 300;
  const center = size / 2;
  const maxRadius = (size - 60) / 2;
  const levels = 5;

  // Calculate points for the radar
  const angleStep = (2 * Math.PI) / data.length;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const radius = (value / 5) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Generate level circles
  const levelCircles = Array.from({ length: levels }, (_, i) => {
    const radius = ((i + 1) / levels) * maxRadius;
    return (
      <circle
        key={i}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="1"
      />
    );
  });

  // Generate axis lines
  const axisLines = data.map((_, i) => {
    const point = getPoint(i, 5);
    return (
      <line
        key={i}
        x1={center}
        y1={center}
        x2={point.x}
        y2={point.y}
        stroke="#e5e7eb"
        strokeWidth="1"
      />
    );
  });

  // Generate data polygon
  const polygonPoints = data
    .map((d, i) => {
      const point = getPoint(i, d.score);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Generate labels
  const labels = data.map((d, i) => {
    const point = getPoint(i, 5.8);
    const textAnchor =
      Math.abs(point.x - center) < 10
        ? 'middle'
        : point.x > center
        ? 'start'
        : 'end';
    return (
      <text
        key={i}
        x={point.x}
        y={point.y}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        className="text-xs fill-gray-600"
        style={{ fontSize: '10px' }}
      >
        {d.domain.length > 15 ? d.domain.slice(0, 15) + '...' : d.domain}
      </text>
    );
  });

  // Generate score dots
  const scoreDots = data.map((d, i) => {
    const point = getPoint(i, d.score);
    return (
      <circle
        key={i}
        cx={point.x}
        cy={point.y}
        r={4}
        fill="#3b82f6"
        stroke="#ffffff"
        strokeWidth="2"
      />
    );
  });

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {levelCircles}
        {axisLines}
        <polygon
          points={polygonPoints}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        {scoreDots}
        {labels}
      </svg>
    </div>
  );
}

interface DomainCardProps {
  domain: GovernanceDomain;
  assessment: DomainAssessment;
}

function DomainCard({ domain, assessment }: DomainCardProps) {
  const maturityInfo = MATURITY_LEVELS[assessment.maturityScore];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-gray-100">
          <Icon
            name={DOMAIN_ICONS[domain.id] || 'cube'}
            className="w-5 h-5 text-gray-700"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{domain.name}</h4>
          <p className="text-sm text-gray-500 truncate">{domain.avaModule}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {/* Maturity Badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Maturity</span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getMaturityBgColor(
              assessment.maturityScore
            )}`}
          >
            Level {assessment.maturityScore} - {maturityInfo.label}
          </span>
        </div>

        {/* Compliance Score */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Compliance</span>
          <span className="text-sm font-medium text-gray-900">
            {assessment.complianceScore}%
          </span>
        </div>

        {/* Compliance Bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              assessment.complianceScore >= 80
                ? 'bg-emerald-500'
                : assessment.complianceScore >= 60
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`}
            style={{ width: `${assessment.complianceScore}%` }}
          />
        </div>

        {/* Gap Count */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Gaps</span>
          <span
            className={`text-sm font-medium ${
              assessment.gaps.length === 0
                ? 'text-emerald-600'
                : assessment.gaps.length <= 2
                ? 'text-amber-600'
                : 'text-rose-600'
            }`}
          >
            {assessment.gaps.length} identified
          </span>
        </div>
      </div>
    </div>
  );
}

interface GapRowProps {
  gap: Gap;
  domain: GovernanceDomain | undefined;
  question: AssessmentQuestion | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

function GapRow({ gap, domain, question, isExpanded, onToggle }: GapRowProps) {
  const severityConfig = SEVERITY_CONFIG[gap.severity];

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              className="w-4 h-4 text-gray-400"
            />
            <span className="text-sm text-gray-900">{domain?.name || gap.domainId}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
          {question?.text || gap.questionId}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{gap.currentState}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{gap.targetState}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityConfig.bgColor} ${severityConfig.color}`}
          >
            {severityConfig.label}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{gap.timeline}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="pl-6 space-y-3">
              <div>
                <h5 className="text-sm font-medium text-gray-900">Remediation</h5>
                <p className="mt-1 text-sm text-gray-600">{gap.remediation}</p>
              </div>
              {gap.regulatoryRisk && (
                <div>
                  <h5 className="text-sm font-medium text-gray-900">Regulatory Reference</h5>
                  <p className="mt-1 text-sm text-gray-600">{gap.regulatoryRisk}</p>
                </div>
              )}
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">Effort:</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    EFFORT_CONFIG[gap.effort].bgColor
                  } ${EFFORT_CONFIG[gap.effort].color}`}
                >
                  {EFFORT_CONFIG[gap.effort].label}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  isExpanded: boolean;
  onToggle: () => void;
}

function RecommendationCard({ recommendation, isExpanded, onToggle }: RecommendationCardProps) {
  const effortConfig = EFFORT_CONFIG[recommendation.effort];
  const impactConfig = IMPACT_CONFIG[recommendation.impact];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-start gap-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${
            recommendation.priority === 1
              ? 'bg-rose-500'
              : recommendation.priority === 2
              ? 'bg-amber-500'
              : 'bg-blue-500'
          }`}
        >
          {recommendation.priority}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
          <p className="mt-1 text-sm text-gray-600">{recommendation.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${effortConfig.bgColor} ${effortConfig.color}`}
            >
              {effortConfig.label}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${impactConfig.bgColor} ${impactConfig.color}`}
            >
              {impactConfig.label}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
              <Icon name="clock" className="w-3 h-3" />
              {recommendation.timeline}
            </span>
          </div>
        </div>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          className="w-5 h-5 text-gray-400"
        />
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4">
          <div className="pl-12 space-y-3">
            <div>
              <h5 className="text-sm font-medium text-gray-900">Affected Domains</h5>
              <div className="mt-1 flex flex-wrap gap-2">
                {recommendation.domains.map((domainId) => {
                  const domain = GOVERNANCE_DOMAINS.find((d) => d.id === domainId);
                  return (
                    <span
                      key={domainId}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700"
                    >
                      <Icon
                        name={DOMAIN_ICONS[domainId] || 'cube'}
                        className="w-3 h-3"
                      />
                      {domain?.name || domainId}
                    </span>
                  );
                })}
              </div>
            </div>
            {recommendation.regulatoryBenefit && recommendation.regulatoryBenefit.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-900">Regulatory Benefits</h5>
                <ul className="mt-1 space-y-1">
                  {recommendation.regulatoryBenefit.map((benefit, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <Icon name="check" className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Views
// ============================================================================

interface WizardViewProps {
  organizationInfo: OrganizationInfo;
  responses: Record<string, AssessmentResponse>;
  currentStep: number;
  onOrganizationChange: (info: OrganizationInfo) => void;
  onResponseChange: (questionId: string, value: number | boolean | string[], notes?: string) => void;
  onStepChange: (step: number) => void;
  onComplete: () => void;
  onSaveDraft: () => void;
  autoPopulateSignals?: AutoPopulateSignal[];
  moduleStatuses?: ModuleStatus[];
  onAutoPopulate?: () => void;
  isAutoPopulating?: boolean;
}

function WizardView({
  organizationInfo,
  responses,
  currentStep,
  onOrganizationChange,
  onResponseChange,
  onStepChange,
  onComplete,
  onSaveDraft,
  autoPopulateSignals,
  moduleStatuses,
  onAutoPopulate,
  isAutoPopulating,
}: WizardViewProps) {
  const [stakeholderFilter, setStakeholderFilter] = useState<StakeholderRole | 'all'>('all');

  const filteredDomains = useMemo(() => {
    let domains = filterDomainsByFramework(GOVERNANCE_DOMAINS, organizationInfo.selectedFrameworks);
    if (stakeholderFilter !== 'all') {
      domains = filterByStakeholder(domains, stakeholderFilter);
    }
    return domains;
  }, [organizationInfo.selectedFrameworks, stakeholderFilter]);

  const questionCounts = useMemo(() => {
    return getQuestionCountByFramework(GOVERNANCE_DOMAINS);
  }, []);

  const getFilteredQuestions = useCallback((domain: GovernanceDomain) => {
    if (stakeholderFilter === 'all') return domain.questions;
    return getQuestionsForStakeholder(domain, stakeholderFilter);
  }, [stakeholderFilter]);

  const totalSteps = filteredDomains.length; // 0 = org info, 1-N = filtered domains
  const currentDomain = currentStep > 0 ? filteredDomains[currentStep - 1] : null;

  const canProceed = useMemo(() => {
    if (currentStep === 0) {
      return organizationInfo.name.trim() !== '' && organizationInfo.industry !== '';
    }
    if (currentDomain) {
      const questions = getFilteredQuestions(currentDomain);
      return questions.every((q) => {
        const response = responses[q.id];
        if (response === undefined) return false;
        if (q.type === 'multi-select' || q.type === 'single-select') {
          return Array.isArray(response.value) && response.value.length > 0 && response.value[0] !== '';
        }
        return response.value !== undefined;
      });
    }
    return true;
  }, [currentStep, organizationInfo, currentDomain, responses, getFilteredQuestions]);

  const handleFrameworkToggle = (frameworkId: FrameworkId) => {
    const current = organizationInfo.selectedFrameworks;
    const updated = current.includes(frameworkId)
      ? current.filter((f) => f !== frameworkId)
      : [...current, frameworkId];
    onOrganizationChange({ ...organizationInfo, selectedFrameworks: updated });
  };

  const handleRegionToggle = (regionId: OperatingRegion) => {
    const current = organizationInfo.operatingRegions;
    const updated = current.includes(regionId)
      ? current.filter((r) => r !== regionId)
      : [...current, regionId];
    onOrganizationChange({ ...organizationInfo, operatingRegions: updated });
  };

  const suggestedFrameworks = useMemo(() => {
    const suggestions = new Set<FrameworkId>();

    // Add frameworks based on operating regions
    organizationInfo.operatingRegions.forEach((region) => {
      REGION_FRAMEWORK_MAP[region]?.forEach((fw) => suggestions.add(fw));
    });

    // Add frameworks based on industry
    const industryFrameworks = INDUSTRY_FRAMEWORK_MAP[organizationInfo.industry];
    if (industryFrameworks) {
      industryFrameworks.forEach((fw) => suggestions.add(fw));
    }

    return Array.from(suggestions);
  }, [organizationInfo.operatingRegions, organizationInfo.industry]);

  const handleApplySuggestions = () => {
    const merged = new Set([...organizationInfo.selectedFrameworks, ...suggestedFrameworks]);
    onOrganizationChange({ ...organizationInfo, selectedFrameworks: Array.from(merged) });
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      onStepChange(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      onStepChange(currentStep - 1);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />

      {currentStep === 0 ? (
        // Organization Info Step
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-blue-100">
              <Icon name="building-office" className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Organization Information</h2>
              <p className="text-sm text-gray-500">Tell us about your organization</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={organizationInfo.name}
                onChange={(e) =>
                  onOrganizationChange({ ...organizationInfo, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter organization name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry <span className="text-red-500">*</span>
              </label>
              <select
                value={organizationInfo.industry}
                onChange={(e) =>
                  onOrganizationChange({ ...organizationInfo, industry: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Size
              </label>
              <select
                value={organizationInfo.size}
                onChange={(e) =>
                  onOrganizationChange({ ...organizationInfo, size: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select size</option>
                {COMPANY_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            {/* Operating Regions */}
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Operating Regions
              </label>
              <p className="text-sm text-gray-500 mb-3">
                Select where your organization operates. This helps recommend applicable frameworks.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {OPERATING_REGIONS.map((region) => {
                  const isSelected = organizationInfo.operatingRegions.includes(region.id);
                  return (
                    <label
                      key={region.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleRegionToggle(region.id)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">{region.name}</span>
                        <p className="text-xs text-gray-500">{region.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Auto-Populate from AVA Modules */}
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inherit Progress from AVA
              </label>
              <p className="text-sm text-gray-500 mb-3">
                Auto-populate assessment based on your existing work in Plan, Build, Secure, and Operate modules.
              </p>

              {/* Module Status Cards */}
              {moduleStatuses && moduleStatuses.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                  {moduleStatuses.map((status) => (
                    <div
                      key={status.module}
                      className={`p-2 rounded-lg border ${
                        status.connected
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            status.connected ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        />
                        <span className="text-xs font-medium text-gray-700">{status.module}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {status.connected ? `${status.dataPoints} data points` : 'Not connected'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-Populate Signals Summary */}
              {autoPopulateSignals && autoPopulateSignals.length > 0 && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Icon name="sparkles" className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-800">
                        {autoPopulateSignals.length} questions can be pre-filled
                      </p>
                      <p className="text-sm text-emerald-700 mt-0.5">
                        Based on data from{' '}
                        {[...new Set(autoPopulateSignals.map((s) => s.source.split(' > ')[0]))].join(', ')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {autoPopulateSignals.slice(0, 5).map((signal) => (
                          <span
                            key={signal.questionId}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                              signal.confidence === 'high'
                                ? 'bg-emerald-100 text-emerald-700'
                                : signal.confidence === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {signal.source.split(' > ')[1] || signal.source}
                          </span>
                        ))}
                        {autoPopulateSignals.length > 5 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            +{autoPopulateSignals.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onAutoPopulate}
                disabled={isAutoPopulating}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  isAutoPopulating
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600'
                }`}
              >
                {isAutoPopulating ? (
                  <>
                    <Icon name="arrow-path" className="w-4 h-4 animate-spin" />
                    Scanning AVA modules...
                  </>
                ) : autoPopulateSignals && autoPopulateSignals.length > 0 ? (
                  <>
                    <Icon name="arrow-path" className="w-4 h-4" />
                    Refresh from AVA
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" className="w-4 h-4" />
                    Auto-Populate from AVA Modules
                  </>
                )}
              </button>
            </div>

            {/* Framework Selection */}
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Applicable Regulatory Frameworks
              </label>

              {/* Suggested Frameworks Banner */}
              {suggestedFrameworks.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Icon name="light-bulb" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">Recommended Frameworks</p>
                      <p className="text-sm text-amber-700 mt-0.5">
                        Based on your region{organizationInfo.operatingRegions.length > 0 ? 's' : ''} and industry:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {suggestedFrameworks.map((fwId) => {
                          const fw = REGULATORY_FRAMEWORKS.find((f) => f.id === fwId);
                          const isAlreadySelected = organizationInfo.selectedFrameworks.includes(fwId);
                          return (
                            <span
                              key={fwId}
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                                isAlreadySelected
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {fw?.shortName || fwId.replace(/_/g, ' ')}
                              {isAlreadySelected && (
                                <Icon name="check" className="w-3 h-3 ml-1" />
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {suggestedFrameworks.some((fw) => !organizationInfo.selectedFrameworks.includes(fw)) && (
                        <button
                          type="button"
                          onClick={handleApplySuggestions}
                          className="mt-2 text-sm text-amber-700 hover:text-amber-900 font-medium underline"
                        >
                          Apply all suggestions
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-500 mb-4">
                Select the frameworks that apply to your organization. Questions will be filtered accordingly.
                Leave all unchecked to see all questions.
              </p>
              <div className="space-y-3">
                {REGULATORY_FRAMEWORKS.map((framework) => {
                  const isSelected = organizationInfo.selectedFrameworks.includes(framework.id);
                  const questionCount = questionCounts[framework.id];

                  return (
                    <label
                      key={framework.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleFrameworkToggle(framework.id)}
                        className="mt-1 w-4 h-4 text-blue-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{framework.shortName}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {questionCount} questions
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">{framework.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{framework.applicability}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {framework.regions.map((region) => (
                            <span
                              key={region}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                            >
                              {region}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {organizationInfo.selectedFrameworks.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <Icon name="information-circle" className="w-4 h-4" />
                    <span>
                      {filteredDomains.reduce((sum, d) => sum + d.questions.length, 0)} questions across{' '}
                      {filteredDomains.length} domains will be included based on your selection.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : currentDomain ? (
        // Domain Question Step
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100">
                <Icon
                  name={DOMAIN_ICONS[currentDomain.id] || 'cube'}
                  className="w-6 h-6 text-gray-700"
                />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{currentDomain.name}</h2>
                <p className="text-sm text-gray-500">{currentDomain.description}</p>
              </div>
            </div>

            {/* Stakeholder Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">View as:</label>
              <select
                value={stakeholderFilter}
                onChange={(e) => setStakeholderFilter(e.target.value as StakeholderRole | 'all')}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Stakeholders</option>
                {STAKEHOLDER_VIEWS.map((view) => (
                  <option key={view.role} value={view.role}>
                    {view.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Regulatory Mappings */}
          {currentDomain.regulatoryMappings.length > 0 && (
            <div className="mb-6 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-800 mb-2">
                <Icon name="document-check" className="w-4 h-4" />
                Regulatory Framework Mapping
              </div>
              <div className="flex flex-wrap gap-2">
                {currentDomain.regulatoryMappings.map((mapping, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-xs text-blue-700"
                  >
                    {mapping.framework.replace(/_/g, ' ')} - {mapping.section}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-8">
            {getFilteredQuestions(currentDomain).map((question, idx) => {
              const response = responses[question.id];
              const isAutoPopulated = response?.assessedBy === 'ava-auto-populate';
              const autoPopulateSignal = autoPopulateSignals?.find((s) => s.questionId === question.id);

              return (
                <div key={question.id} className="border-b border-gray-100 pb-6 last:border-0">
                  <div className="flex items-start gap-3 mb-4">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                      isAutoPopulated ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-gray-900">{question.text}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isAutoPopulated && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700" title={autoPopulateSignal?.reasoning}>
                              <Icon name="sparkles" className="w-3 h-3" />
                              Auto
                            </span>
                          )}
                          {question.planModuleLink && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                              <Icon name="link" className="w-3 h-3" />
                              Plan
                            </span>
                          )}
                        </div>
                      </div>
                      {question.frameworks && question.frameworks.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {question.frameworks.map((fwId) => {
                            const fw = REGULATORY_FRAMEWORKS.find((f) => f.id === fwId);
                            return (
                              <span
                                key={fwId}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                              >
                                {fw?.shortName || fwId.replace(/_/g, ' ')}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {question.regulatoryRef && (
                        <p className="mt-1 text-xs text-gray-500">
                          Regulatory Reference: {question.regulatoryRef}
                        </p>
                      )}
                      {question.category === 'evidence' && question.evidenceHint && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
                          <Icon name="light-bulb" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{question.evidenceHint}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {question.type === 'scale' ? (
                    <MaturityRadio
                      question={question}
                      value={typeof response?.value === 'number' ? response.value : undefined}
                      onChange={(value) => onResponseChange(question.id, value)}
                    />
                  ) : question.type === 'boolean' ? (
                    <BooleanToggle
                      question={question}
                      value={typeof response?.value === 'boolean' ? response.value : undefined}
                      onChange={(value) => onResponseChange(question.id, value)}
                    />
                  ) : question.type === 'multi-select' ? (
                    <MultiSelectInput
                      question={question}
                      value={Array.isArray(response?.value) ? response.value as string[] : undefined}
                      onChange={(value) => onResponseChange(question.id, value)}
                    />
                  ) : question.type === 'single-select' ? (
                    <SingleSelectInput
                      question={question}
                      value={Array.isArray(response?.value) ? response.value as string[] : undefined}
                      onChange={(value) => onResponseChange(question.id, value)}
                    />
                  ) : null}

                  {/* Optional Notes */}
                  <div className="mt-4">
                    <label className="block text-sm text-gray-600 mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      value={response?.notes || ''}
                      onChange={(e) =>
                        onResponseChange(
                          question.id,
                          response?.value as number | boolean | string[],
                          e.target.value
                        )
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Add any relevant notes or context..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {currentStep > 0 && (
            <button
              onClick={handlePrevious}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
              Previous
            </button>
          )}
          <button
            onClick={onSaveDraft}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-2"
          >
            <Icon name="document" className="w-4 h-4" />
            Save Draft
          </button>
        </div>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {currentStep === totalSteps ? (
            <>
              Complete Assessment
              <Icon name="check" className="w-4 h-4" />
            </>
          ) : (
            <>
              Continue
              <Icon name="arrow-right" className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface ResultsDashboardProps {
  result: AssessmentResult;
  selectedFrameworks: FrameworkId[];
  operatingRegions: OperatingRegion[];
  onViewGaps: () => void;
  onViewRecommendations: () => void;
}

function ResultsDashboard({ result, selectedFrameworks, operatingRegions, onViewGaps, onViewRecommendations }: ResultsDashboardProps) {
  const filteredDomains = useMemo(() => {
    return filterDomainsByFramework(GOVERNANCE_DOMAINS, selectedFrameworks);
  }, [selectedFrameworks]);
  const radarData = useMemo(() => {
    return result.domainAssessments.map((da) => {
      const domain = GOVERNANCE_DOMAINS.find((d) => d.id === da.domainId);
      return {
        domain: domain?.name || da.domainId,
        score: da.maturityScore,
      };
    });
  }, [result]);

  const overallMaturityLevel = Math.max(1, Math.round(result.overallMaturity)) as MaturityLevel;
  const maturityInfo = MATURITY_LEVELS[overallMaturityLevel] || MATURITY_LEVELS[1];

  // Framework coverage summary - only show selected frameworks (or all if none selected)
  const frameworkCoverage = useMemo(() => {
    const frameworks = new Map<string, { total: number; compliant: number }>();
    const frameworksToShow = selectedFrameworks.length > 0 ? selectedFrameworks : null;

    result.domainAssessments.forEach((da) => {
      const domain = filteredDomains.find((d) => d.id === da.domainId);
      if (!domain) return;

      domain.regulatoryMappings.forEach((mapping) => {
        if (frameworksToShow && !frameworksToShow.includes(mapping.framework)) return;

        const key = mapping.framework.replace(/_/g, ' ');
        const current = frameworks.get(key) || { total: 0, compliant: 0 };
        current.total += 1;
        if (da.complianceScore >= 70) {
          current.compliant += 1;
        }
        frameworks.set(key, current);
      });
    });

    return Array.from(frameworks.entries()).map(([framework, data]) => ({
      framework,
      coverage: Math.round((data.compliant / data.total) * 100),
    }));
  }, [result, selectedFrameworks, filteredDomains]);

  // Honest empty state: if no responses were recorded, the scores are placeholders,
  // not a measured result.
  const hasResponses = useMemo(
    () => result.domainAssessments.some((da) => da.responses.length > 0),
    [result],
  );

  return (
    <div className="space-y-6">
      {!hasResponses && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
          <Icon name="information-circle" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Assessment not completed.</strong> No responses were recorded, so the scores below are
            placeholders, not a measured result. Complete the wizard to generate a scored assessment.
          </p>
        </div>
      )}

      {/* Selected Frameworks Banner */}
      {(selectedFrameworks.length > 0 || operatingRegions.length > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="document-check" className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-blue-900">Assessment Scope</span>
          </div>
          {operatingRegions.length > 0 && (
            <div className="mb-2">
              <span className="text-sm text-blue-700 mr-2">Regions:</span>
              {operatingRegions.map((regionId) => {
                const region = OPERATING_REGIONS.find((r) => r.id === regionId);
                return (
                  <span
                    key={regionId}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 mr-1"
                  >
                    {region?.name || regionId}
                  </span>
                );
              })}
            </div>
          )}
          {selectedFrameworks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-blue-700 mr-1">Frameworks:</span>
              {selectedFrameworks.map((fwId) => {
                const fw = REGULATORY_FRAMEWORKS.find((f) => f.id === fwId);
                return (
                  <span
                    key={fwId}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                  >
                    {fw?.shortName || fwId.replace(/_/g, ' ')}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getMaturityColor(overallMaturityLevel)}`}>
              <Icon name="chart-line" className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Overall Maturity</p>
              <p className="text-2xl font-bold text-gray-900">
                {result.overallMaturity.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">{maturityInfo.label}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                result.overallCompliance >= 80
                  ? 'bg-emerald-500'
                  : result.overallCompliance >= 60
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            >
              <Icon name="document-check" className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Compliance Score</p>
              <p className="text-2xl font-bold text-gray-900">{result.overallCompliance}%</p>
              <p className="text-xs text-gray-500">
                {result.overallCompliance >= 80
                  ? 'On Track'
                  : result.overallCompliance >= 60
                  ? 'Needs Improvement'
                  : 'At Risk'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500">
              <Icon name="exclamation-triangle" className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Gaps</p>
              <p className="text-2xl font-bold text-gray-900">{result.totalGaps}</p>
              <p className="text-xs text-gray-500">{result.criticalGaps} critical</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500">
              <Icon name="light-bulb" className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Recommendations</p>
              <p className="text-2xl font-bold text-gray-900">{result.recommendations.length}</p>
              <p className="text-xs text-gray-500">prioritized actions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Maturity by Domain</h3>
          <RadarChart data={radarData} />
          <div className="mt-4 flex justify-center">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>1 = Initial</span>
              <span>3 = Defined</span>
              <span>5 = Optimizing</span>
            </div>
          </div>
        </div>

        {/* Regulatory Framework Coverage */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Regulatory Framework Coverage
          </h3>
          <div className="space-y-4">
            {frameworkCoverage.map((fw) => (
              <div key={fw.framework}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{fw.framework}</span>
                  <span className="font-medium text-gray-900">{fw.coverage}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      fw.coverage >= 80
                        ? 'bg-emerald-500'
                        : fw.coverage >= 60
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${fw.coverage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Domain Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Domain Breakdown</h3>
          <div className="flex gap-2">
            <button
              onClick={onViewGaps}
              className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Icon name="exclamation-triangle" className="w-4 h-4" />
              View All Gaps
            </button>
            <button
              onClick={onViewRecommendations}
              className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Icon name="light-bulb" className="w-4 h-4" />
              View Recommendations
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.domainAssessments.map((da) => {
            const domain = filteredDomains.find((d) => d.id === da.domainId);
            if (!domain) return null;
            return <DomainCard key={da.domainId} domain={domain} assessment={da} />;
          })}
        </div>
      </div>
    </div>
  );
}

interface GapAnalysisViewProps {
  result: AssessmentResult;
  onBack: () => void;
}

function GapAnalysisView({ result, onBack }: GapAnalysisViewProps) {
  const [severityFilter, setSeverityFilter] = useState<Gap['severity'] | 'all'>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const allGaps = useMemo(() => {
    return result.domainAssessments.flatMap((da) => da.gaps);
  }, [result]);

  const filteredGaps = useMemo(() => {
    return allGaps.filter((gap) => {
      if (severityFilter !== 'all' && gap.severity !== severityFilter) return false;
      if (domainFilter !== 'all' && gap.domainId !== domainFilter) return false;
      return true;
    });
  }, [allGaps, severityFilter, domainFilter]);

  const toggleRow = (gapId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  };

  const uniqueDomains = useMemo(() => {
    return [...new Set(allGaps.map((g) => g.domainId))];
  }, [allGaps]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Gap Analysis</h2>
            <p className="text-sm text-gray-500">
              {filteredGaps.length} gaps identified
              {severityFilter !== 'all' || domainFilter !== 'all' ? ' (filtered)' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Icon name="funnel" className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">Filter by:</span>
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Gap['severity'] | 'all')}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Domains</option>
          {uniqueDomains.map((domainId) => {
            const domain = GOVERNANCE_DOMAINS.find((d) => d.id === domainId);
            return (
              <option key={domainId} value={domainId}>
                {domain?.name || domainId}
              </option>
            );
          })}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Domain
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Question
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Current State
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target State
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timeline
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredGaps.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <Icon name="check-circle" className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p>No gaps found matching the current filters.</p>
                </td>
              </tr>
            ) : (
              filteredGaps.map((gap) => {
                const domain = GOVERNANCE_DOMAINS.find((d) => d.id === gap.domainId);
                const question = domain?.questions.find((q) => q.id === gap.questionId);
                return (
                  <GapRow
                    key={gap.id}
                    gap={gap}
                    domain={domain}
                    question={question}
                    isExpanded={expandedRows.has(gap.id)}
                    onToggle={() => toggleRow(gap.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RecommendationsViewProps {
  result: AssessmentResult;
  onBack: () => void;
}

function RecommendationsView({ result, onBack }: RecommendationsViewProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (recId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) {
        next.delete(recId);
      } else {
        next.add(recId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Icon name="arrow-left" className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Recommendations</h2>
          <p className="text-sm text-gray-500">
            {result.recommendations.length} prioritized actions to improve governance maturity
          </p>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {result.recommendations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <Icon name="check-circle" className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Excellent Work!</h3>
            <p className="text-gray-500">
              Your organization has no significant gaps requiring immediate attention.
            </p>
          </div>
        ) : (
          result.recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              isExpanded={expandedCards.has(rec.id)}
              onToggle={() => toggleCard(rec.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface GovernanceAssessmentProps {
  initialResult?: AssessmentResult;
}

export default function GovernanceAssessment({ initialResult }: GovernanceAssessmentProps) {
  // Rehydrate a previously completed assessment.
  //
  // handleComplete persists the result via saveAssessmentResult, but the route renders
  // <GovernanceAssessment /> with no initialResult, so every reload dropped the finished
  // assessment and restarted the 15-step wizard at step 1 - the score was only ever
  // visible in the browser tab that computed it. An explicit initialResult prop still
  // wins, so an embedding caller can override what is on disk.
  //
  // GovernLanding's "Re-assess" navigates here with { startNew: true } to ask for the
  // wizard explicitly, since rehydration otherwise makes every entry point land on results.
  const location = useLocation();
  const startNewRequested = (location.state as { startNew?: boolean } | null)?.startNew === true;
  const [persistedResult] = useState<AssessmentResult | null>(
    () => (startNewRequested ? null : initialResult ?? loadAssessmentResult()),
  );
  const [view, setView] = useState<View>(persistedResult ? 'results' : 'wizard');
  const [result, setResult] = useState<AssessmentResult | null>(persistedResult);

  // Auto-populate hook
  const {
    isLoading: isAutoPopulating,
    result: autoPopulateResult,
    runAutoPopulate,
    applySignalsToResponses,
  } = useAssessmentAutoPopulate();

  // Wizard state
  const [organizationInfo, setOrganizationInfo] = useState<OrganizationInfo>(() => {
    const draft = loadDraft();
    return draft?.organizationInfo || { name: '', industry: '', size: '', operatingRegions: [], selectedFrameworks: [] };
  });
  const [responses, setResponses] = useState<Record<string, AssessmentResponse>>(() => {
    const draft = loadDraft();
    return draft?.responses || {};
  });
  const [currentStep, setCurrentStep] = useState(() => {
    const draft = loadDraft();
    return draft?.currentStep || 0;
  });

  const handleResponseChange = useCallback(
    (questionId: string, value: number | boolean | string[], notes?: string) => {
      setResponses((prev) => ({
        ...prev,
        [questionId]: {
          questionId,
          value,
          notes,
          assessedAt: new Date().toISOString(),
          assessedBy: 'current-user',
        },
      }));
    },
    []
  );

  const handleAutoPopulate = useCallback(async () => {
    try {
      const result = await runAutoPopulate();
      if (result) {
        // Apply signals to responses
        const updatedResponses = applySignalsToResponses(result.signals, responses);
        setResponses(updatedResponses);

        // Update organization info with plan context and suggested frameworks
        setOrganizationInfo((prev) => ({
          ...prev,
          planContext: result.planContext,
          name: prev.name || result.planContext.organizationProfile?.companyName || '',
          industry: prev.industry || result.planContext.organizationProfile?.industry || '',
          selectedFrameworks: [
            ...new Set([...prev.selectedFrameworks, ...result.applicableFrameworks]),
          ],
        }));
      }
    } catch (err) {
      console.error('Auto-populate failed:', err);
    }
  }, [runAutoPopulate, applySignalsToResponses, responses]);

  // Auto-run on mount if no draft exists AND we are not showing a finished assessment.
  //
  // The persistedResult guard matters now that mount can land on the results view. Without
  // it this fired ~14 discovery calls (Bedrock, guardrail telemetry, cost) on every reload
  // of a completed assessment, and worse, its setOrganizationInfo merged
  // getApplicableFrameworks' unconditional NIST_AI_RMF / ISO_42001 seed into the selection
  // the results view reads - relabelling a finished assessment's scope about a second
  // after paint. Auto-populate exists to pre-fill the wizard; there is nothing to pre-fill
  // when the wizard is not what we are showing.
  useEffect(() => {
    if (persistedResult) return;
    const draft = loadDraft();
    if (!draft && !autoPopulateResult) {
      handleAutoPopulate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving via "Re-assess" drops the stored result, exactly as the in-component
  // "New Assessment" button does. Without this the wizard would open over a result still
  // on disk, and the next reload would rehydrate straight back to it - the same
  // silently-undone behaviour that made handleStartNew clear the result in the first place.
  useEffect(() => {
    if (startNewRequested) {
      clearAssessmentResult();
    }
  }, [startNewRequested]);

  const handleSaveDraft = useCallback(() => {
    saveDraft({
      organizationInfo,
      responses,
      currentStep,
    });
  }, [organizationInfo, responses, currentStep]);

  const handleComplete = useCallback(() => {
    // Deterministic scoring from the user's actual answers and auto-populated signals.
    // No Math.random — recomputing with the same responses always yields the same score,
    // so the value driving GovernLanding / ProgramProgress is stable across reloads.
    const computed = computeAssessmentResult(organizationInfo, responses);
    computed.planContext = organizationInfo.planContext;
    // Capture the scope before clearDraft() below removes the only other copy of it, so a
    // reloaded results view reports the frameworks and regions this run was scored against.
    computed.assessmentScope = {
      selectedFrameworks: organizationInfo.selectedFrameworks,
      operatingRegions: organizationInfo.operatingRegions,
    };
    setResult(computed);
    setView('results');
    clearDraft();
    // Save result for cross-module access (landing page, role cards, etc.)
    saveAssessmentResult(computed);
  }, [organizationInfo, responses]);

  const handleStartNew = useCallback(() => {
    setOrganizationInfo({ name: '', industry: '', size: '', operatingRegions: [], selectedFrameworks: [] });
    setResponses({});
    setCurrentStep(0);
    setResult(null);
    setView('wizard');
    clearDraft();
    // Also drop the persisted result, not just the draft. Now that mount rehydrates from
    // localStorage, leaving the old result behind would send the very next reload straight
    // back to the results view - "Start New Assessment" would look like it had worked, then
    // silently undo itself. This also clears the stale score out of the consumers that read
    // it (GovernLanding, ProgramProgress, role cards) the moment a new run starts.
    clearAssessmentResult();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Top Bar */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600">
              <Icon name="clipboard-document-check" className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Governance Assessment</h1>
              <p className="text-sm text-gray-500">
                Benchmark your AI governance maturity across {DOMAIN_COUNT} domains — scored and evidence-backed, with prioritized gaps and next steps.
              </p>
            </div>
          </div>

          {view !== 'wizard' && (
            <div className="flex items-center gap-2">
              {view !== 'results' && (
                <button
                  onClick={() => setView('results')}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back to Dashboard
                </button>
              )}
              <button
                onClick={handleStartNew}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Icon name="plus" className="w-4 h-4" />
                New Assessment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        {view === 'wizard' && (
          <WizardView
            organizationInfo={organizationInfo}
            responses={responses}
            currentStep={currentStep}
            onOrganizationChange={setOrganizationInfo}
            onResponseChange={handleResponseChange}
            onStepChange={setCurrentStep}
            onComplete={handleComplete}
            onSaveDraft={handleSaveDraft}
            autoPopulateSignals={autoPopulateResult?.signals}
            moduleStatuses={autoPopulateResult?.moduleStatuses}
            onAutoPopulate={handleAutoPopulate}
            isAutoPopulating={isAutoPopulating}
          />
        )}

        {/* ResultsDashboard prefers the scope stored on the result. Reading wizard state
            was correct only in the tab that ran the wizard; after a reload the draft is
            gone and organizationInfo is empty, which silently widened the framework
            coverage panel to every mapped framework. Falls back to wizard state for
            results persisted before assessmentScope existed. */}
        {view === 'results' && result && (
          <ResultsDashboard
            result={result}
            selectedFrameworks={result.assessmentScope?.selectedFrameworks ?? organizationInfo.selectedFrameworks}
            operatingRegions={result.assessmentScope?.operatingRegions ?? organizationInfo.operatingRegions}
            onViewGaps={() => setView('gaps')}
            onViewRecommendations={() => setView('recommendations')}
          />
        )}

        {view === 'gaps' && result && (
          <GapAnalysisView result={result} onBack={() => setView('results')} />
        )}

        {view === 'recommendations' && result && (
          <RecommendationsView result={result} onBack={() => setView('results')} />
        )}
      </div>
    </div>
  );
}
