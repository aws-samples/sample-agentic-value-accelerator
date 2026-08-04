/**
 * UnfairDiscriminationTesting - NAIC Model Bulletin Unfair Discrimination Testing
 *
 * Implements statistical fairness analysis for insurance AI systems per NAIC Model
 * Bulletin requirements. Tests for disparate impact across protected classes and
 * identifies potential proxy variable issues.
 *
 * Key features:
 * - Disparate Impact Ratio (80% / four-fifths rule)
 * - Statistical Parity Difference
 * - Protected class testing (Age, Gender, Race, Marital Status, Geography, Credit Score)
 * - Proxy variable correlation analysis
 * - Remediation recommendations
 * - Test history and trend visualization
 * - Export for regulatory filing
 *
 * Based on NAIC 2023 Model Bulletin on the Use of AI Systems by Insurers.
 */

import { useState, useMemo, useCallback } from 'react';
import { Icon, type IconName } from '../icons';
import { MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';

// ─────────────────────────── Types ───────────────────────────

type TestStatus = 'pass' | 'fail' | 'needs-review';
type UseCase = 'underwriting' | 'claims' | 'pricing' | 'marketing';

interface ProtectedClassTest {
  id: string;
  protectedClass: string;
  icon: IconName;
  disparateImpactRatio: number;
  statisticalParityDiff: number;
  status: TestStatus;
  sampleSize: number;
  confidenceInterval: [number, number];
  lastTestDate: string;
  privilegedGroup: string;
  unprivilegedGroup: string;
  approvalRatePrivileged: number;
  approvalRateUnprivileged: number;
  note?: string;
}

interface ProxyVariable {
  feature: string;
  correlatedWith: string;
  correlationCoeff: number;
  influenceOnDecision: number;
  riskLevel: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface TestHistoryEntry {
  date: string;
  overallScore: number;
  testsRun: number;
  testsPassed: number;
  failedClasses: string[];
}

interface RemediationRecommendation {
  id: string;
  protectedClass: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedActions: string[];
  estimatedEffort: string;
  regulatoryRef: string;
}

// ─────────────────────────── Mock Data ───────────────────────────

const USE_CASE_LABELS: Record<UseCase, string> = {
  underwriting: 'Underwriting Decisions',
  claims: 'Claims Processing',
  pricing: 'Premium Pricing',
  marketing: 'Marketing/Targeting',
};

const PROTECTED_CLASS_TESTS: Record<UseCase, ProtectedClassTest[]> = {
  underwriting: [
    {
      id: 'age',
      protectedClass: 'Age',
      icon: 'calendar',
      disparateImpactRatio: 0.87,
      statisticalParityDiff: 0.08,
      status: 'pass',
      sampleSize: 15420,
      confidenceInterval: [0.84, 0.90],
      lastTestDate: '2026-07-18',
      privilegedGroup: '25-54',
      unprivilegedGroup: '55+',
      approvalRatePrivileged: 0.72,
      approvalRateUnprivileged: 0.63,
      note: 'Within acceptable range for age-based underwriting factors.',
    },
    {
      id: 'gender',
      protectedClass: 'Gender',
      icon: 'users',
      disparateImpactRatio: 0.94,
      statisticalParityDiff: 0.03,
      status: 'pass',
      sampleSize: 15420,
      confidenceInterval: [0.91, 0.97],
      lastTestDate: '2026-07-18',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      approvalRatePrivileged: 0.68,
      approvalRateUnprivileged: 0.64,
    },
    {
      id: 'race',
      protectedClass: 'Race/Ethnicity',
      icon: 'globe-alt',
      disparateImpactRatio: 0.76,
      statisticalParityDiff: 0.14,
      status: 'fail',
      sampleSize: 15420,
      confidenceInterval: [0.72, 0.80],
      lastTestDate: '2026-07-18',
      privilegedGroup: 'White',
      unprivilegedGroup: 'Non-White',
      approvalRatePrivileged: 0.71,
      approvalRateUnprivileged: 0.54,
      note: 'Below four-fifths threshold. Immediate remediation required.',
    },
    {
      id: 'marital',
      protectedClass: 'Marital Status',
      icon: 'user',
      disparateImpactRatio: 0.82,
      statisticalParityDiff: 0.11,
      status: 'needs-review',
      sampleSize: 15420,
      confidenceInterval: [0.78, 0.86],
      lastTestDate: '2026-07-18',
      privilegedGroup: 'Married',
      unprivilegedGroup: 'Single/Other',
      approvalRatePrivileged: 0.73,
      approvalRateUnprivileged: 0.60,
      note: 'Borderline. Review correlation with other factors.',
    },
    {
      id: 'geography',
      protectedClass: 'Geographic Location',
      icon: 'map-pin',
      disparateImpactRatio: 0.73,
      statisticalParityDiff: 0.18,
      status: 'fail',
      sampleSize: 15420,
      confidenceInterval: [0.68, 0.78],
      lastTestDate: '2026-07-18',
      privilegedGroup: 'Suburban',
      unprivilegedGroup: 'Urban Core',
      approvalRatePrivileged: 0.74,
      approvalRateUnprivileged: 0.54,
      note: 'Potential redlining proxy. Requires immediate investigation.',
    },
    {
      id: 'credit',
      protectedClass: 'Credit Score (Proxy)',
      icon: 'credit-card',
      disparateImpactRatio: 0.79,
      statisticalParityDiff: 0.13,
      status: 'needs-review',
      sampleSize: 15420,
      confidenceInterval: [0.75, 0.83],
      lastTestDate: '2026-07-18',
      privilegedGroup: 'Score 700+',
      unprivilegedGroup: 'Score <700',
      approvalRatePrivileged: 0.82,
      approvalRateUnprivileged: 0.65,
      note: 'Credit score highly correlated with race/ethnicity in this market.',
    },
  ],
  claims: [
    {
      id: 'age',
      protectedClass: 'Age',
      icon: 'calendar',
      disparateImpactRatio: 0.91,
      statisticalParityDiff: 0.05,
      status: 'pass',
      sampleSize: 8750,
      confidenceInterval: [0.87, 0.95],
      lastTestDate: '2026-07-15',
      privilegedGroup: '25-54',
      unprivilegedGroup: '55+',
      approvalRatePrivileged: 0.85,
      approvalRateUnprivileged: 0.77,
    },
    {
      id: 'gender',
      protectedClass: 'Gender',
      icon: 'users',
      disparateImpactRatio: 0.96,
      statisticalParityDiff: 0.02,
      status: 'pass',
      sampleSize: 8750,
      confidenceInterval: [0.93, 0.99],
      lastTestDate: '2026-07-15',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      approvalRatePrivileged: 0.83,
      approvalRateUnprivileged: 0.80,
    },
    {
      id: 'race',
      protectedClass: 'Race/Ethnicity',
      icon: 'globe-alt',
      disparateImpactRatio: 0.84,
      statisticalParityDiff: 0.09,
      status: 'pass',
      sampleSize: 8750,
      confidenceInterval: [0.80, 0.88],
      lastTestDate: '2026-07-15',
      privilegedGroup: 'White',
      unprivilegedGroup: 'Non-White',
      approvalRatePrivileged: 0.84,
      approvalRateUnprivileged: 0.71,
    },
    {
      id: 'marital',
      protectedClass: 'Marital Status',
      icon: 'user',
      disparateImpactRatio: 0.92,
      statisticalParityDiff: 0.04,
      status: 'pass',
      sampleSize: 8750,
      confidenceInterval: [0.88, 0.96],
      lastTestDate: '2026-07-15',
      privilegedGroup: 'Married',
      unprivilegedGroup: 'Single/Other',
      approvalRatePrivileged: 0.82,
      approvalRateUnprivileged: 0.75,
    },
    {
      id: 'geography',
      protectedClass: 'Geographic Location',
      icon: 'map-pin',
      disparateImpactRatio: 0.88,
      statisticalParityDiff: 0.07,
      status: 'pass',
      sampleSize: 8750,
      confidenceInterval: [0.84, 0.92],
      lastTestDate: '2026-07-15',
      privilegedGroup: 'Suburban',
      unprivilegedGroup: 'Urban Core',
      approvalRatePrivileged: 0.81,
      approvalRateUnprivileged: 0.71,
    },
    {
      id: 'credit',
      protectedClass: 'Credit Score (Proxy)',
      icon: 'credit-card',
      disparateImpactRatio: 0.93,
      statisticalParityDiff: 0.04,
      status: 'pass',
      sampleSize: 8750,
      confidenceInterval: [0.89, 0.97],
      lastTestDate: '2026-07-15',
      privilegedGroup: 'Score 700+',
      unprivilegedGroup: 'Score <700',
      approvalRatePrivileged: 0.86,
      approvalRateUnprivileged: 0.80,
    },
  ],
  pricing: [
    {
      id: 'age',
      protectedClass: 'Age',
      icon: 'calendar',
      disparateImpactRatio: 0.85,
      statisticalParityDiff: 0.09,
      status: 'pass',
      sampleSize: 22100,
      confidenceInterval: [0.82, 0.88],
      lastTestDate: '2026-07-20',
      privilegedGroup: '25-54',
      unprivilegedGroup: '55+',
      approvalRatePrivileged: 0.78,
      approvalRateUnprivileged: 0.66,
      note: 'Age-based pricing permitted with actuarial justification.',
    },
    {
      id: 'gender',
      protectedClass: 'Gender',
      icon: 'users',
      disparateImpactRatio: 0.89,
      statisticalParityDiff: 0.06,
      status: 'pass',
      sampleSize: 22100,
      confidenceInterval: [0.86, 0.92],
      lastTestDate: '2026-07-20',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      approvalRatePrivileged: 0.75,
      approvalRateUnprivileged: 0.67,
    },
    {
      id: 'race',
      protectedClass: 'Race/Ethnicity',
      icon: 'globe-alt',
      disparateImpactRatio: 0.78,
      statisticalParityDiff: 0.13,
      status: 'needs-review',
      sampleSize: 22100,
      confidenceInterval: [0.74, 0.82],
      lastTestDate: '2026-07-20',
      privilegedGroup: 'White',
      unprivilegedGroup: 'Non-White',
      approvalRatePrivileged: 0.76,
      approvalRateUnprivileged: 0.59,
      note: 'Borderline. Review territory factors for proxy effects.',
    },
    {
      id: 'marital',
      protectedClass: 'Marital Status',
      icon: 'user',
      disparateImpactRatio: 0.86,
      statisticalParityDiff: 0.08,
      status: 'pass',
      sampleSize: 22100,
      confidenceInterval: [0.82, 0.90],
      lastTestDate: '2026-07-20',
      privilegedGroup: 'Married',
      unprivilegedGroup: 'Single/Other',
      approvalRatePrivileged: 0.77,
      approvalRateUnprivileged: 0.66,
    },
    {
      id: 'geography',
      protectedClass: 'Geographic Location',
      icon: 'map-pin',
      disparateImpactRatio: 0.71,
      statisticalParityDiff: 0.19,
      status: 'fail',
      sampleSize: 22100,
      confidenceInterval: [0.67, 0.75],
      lastTestDate: '2026-07-20',
      privilegedGroup: 'Suburban',
      unprivilegedGroup: 'Urban Core',
      approvalRatePrivileged: 0.79,
      approvalRateUnprivileged: 0.56,
      note: 'Territory rating factors require actuarial review for redlining.',
    },
    {
      id: 'credit',
      protectedClass: 'Credit Score (Proxy)',
      icon: 'credit-card',
      disparateImpactRatio: 0.74,
      statisticalParityDiff: 0.16,
      status: 'fail',
      sampleSize: 22100,
      confidenceInterval: [0.70, 0.78],
      lastTestDate: '2026-07-20',
      privilegedGroup: 'Score 700+',
      unprivilegedGroup: 'Score <700',
      approvalRatePrivileged: 0.84,
      approvalRateUnprivileged: 0.62,
      note: 'Credit-based pricing showing disparate impact. Review per state regs.',
    },
  ],
  marketing: [
    {
      id: 'age',
      protectedClass: 'Age',
      icon: 'calendar',
      disparateImpactRatio: 0.92,
      statisticalParityDiff: 0.04,
      status: 'pass',
      sampleSize: 45000,
      confidenceInterval: [0.90, 0.94],
      lastTestDate: '2026-07-19',
      privilegedGroup: '25-54',
      unprivilegedGroup: '55+',
      approvalRatePrivileged: 0.45,
      approvalRateUnprivileged: 0.41,
    },
    {
      id: 'gender',
      protectedClass: 'Gender',
      icon: 'users',
      disparateImpactRatio: 0.97,
      statisticalParityDiff: 0.01,
      status: 'pass',
      sampleSize: 45000,
      confidenceInterval: [0.95, 0.99],
      lastTestDate: '2026-07-19',
      privilegedGroup: 'Male',
      unprivilegedGroup: 'Female',
      approvalRatePrivileged: 0.44,
      approvalRateUnprivileged: 0.43,
    },
    {
      id: 'race',
      protectedClass: 'Race/Ethnicity',
      icon: 'globe-alt',
      disparateImpactRatio: 0.81,
      statisticalParityDiff: 0.10,
      status: 'needs-review',
      sampleSize: 45000,
      confidenceInterval: [0.78, 0.84],
      lastTestDate: '2026-07-19',
      privilegedGroup: 'White',
      unprivilegedGroup: 'Non-White',
      approvalRatePrivileged: 0.46,
      approvalRateUnprivileged: 0.37,
      note: 'Marketing reach showing potential disparate impact. Review targeting.',
    },
    {
      id: 'marital',
      protectedClass: 'Marital Status',
      icon: 'user',
      disparateImpactRatio: 0.95,
      statisticalParityDiff: 0.02,
      status: 'pass',
      sampleSize: 45000,
      confidenceInterval: [0.93, 0.97],
      lastTestDate: '2026-07-19',
      privilegedGroup: 'Married',
      unprivilegedGroup: 'Single/Other',
      approvalRatePrivileged: 0.44,
      approvalRateUnprivileged: 0.42,
    },
    {
      id: 'geography',
      protectedClass: 'Geographic Location',
      icon: 'map-pin',
      disparateImpactRatio: 0.83,
      statisticalParityDiff: 0.09,
      status: 'pass',
      sampleSize: 45000,
      confidenceInterval: [0.80, 0.86],
      lastTestDate: '2026-07-19',
      privilegedGroup: 'Suburban',
      unprivilegedGroup: 'Urban Core',
      approvalRatePrivileged: 0.47,
      approvalRateUnprivileged: 0.39,
    },
    {
      id: 'credit',
      protectedClass: 'Credit Score (Proxy)',
      icon: 'credit-card',
      disparateImpactRatio: 0.88,
      statisticalParityDiff: 0.06,
      status: 'pass',
      sampleSize: 45000,
      confidenceInterval: [0.85, 0.91],
      lastTestDate: '2026-07-19',
      privilegedGroup: 'Score 700+',
      unprivilegedGroup: 'Score <700',
      approvalRatePrivileged: 0.48,
      approvalRateUnprivileged: 0.42,
    },
  ],
};

const PROXY_VARIABLES: ProxyVariable[] = [
  {
    feature: 'ZIP Code',
    correlatedWith: 'Race/Ethnicity',
    correlationCoeff: 0.72,
    influenceOnDecision: 0.18,
    riskLevel: 'high',
    recommendation: 'Replace with loss-experience-based territory factors; document actuarial justification.',
  },
  {
    feature: 'Education Level',
    correlatedWith: 'Race/Ethnicity, Income',
    correlationCoeff: 0.65,
    influenceOnDecision: 0.12,
    riskLevel: 'high',
    recommendation: 'Remove from model inputs unless actuarially justified for the specific line of business.',
  },
  {
    feature: 'Occupation Code',
    correlatedWith: 'Gender, Race',
    correlationCoeff: 0.48,
    influenceOnDecision: 0.09,
    riskLevel: 'medium',
    recommendation: 'Group occupations to reduce granularity; validate against loss experience.',
  },
  {
    feature: 'Credit-Based Insurance Score',
    correlatedWith: 'Race/Ethnicity',
    correlationCoeff: 0.54,
    influenceOnDecision: 0.22,
    riskLevel: 'high',
    recommendation: 'Review per state regulations; some states prohibit credit-based pricing.',
  },
  {
    feature: 'Vehicle Age',
    correlatedWith: 'Income',
    correlationCoeff: 0.41,
    influenceOnDecision: 0.08,
    riskLevel: 'low',
    recommendation: 'Actuarially justified for auto insurance; monitor for indirect effects.',
  },
  {
    feature: 'Home Ownership',
    correlatedWith: 'Race, Marital Status',
    correlationCoeff: 0.52,
    influenceOnDecision: 0.11,
    riskLevel: 'medium',
    recommendation: 'Validate loss correlation independently of demographic proxies.',
  },
];

const TEST_HISTORY: TestHistoryEntry[] = [
  { date: '2026-07-20', overallScore: 72, testsRun: 24, testsPassed: 17, failedClasses: ['Race/Ethnicity', 'Geographic Location'] },
  { date: '2026-06-20', overallScore: 68, testsRun: 24, testsPassed: 15, failedClasses: ['Race/Ethnicity', 'Geographic Location', 'Credit Score'] },
  { date: '2026-05-20', overallScore: 65, testsRun: 24, testsPassed: 14, failedClasses: ['Race/Ethnicity', 'Geographic Location', 'Credit Score', 'Age'] },
  { date: '2026-04-20', overallScore: 62, testsRun: 24, testsPassed: 13, failedClasses: ['Race/Ethnicity', 'Geographic Location', 'Credit Score', 'Age'] },
  { date: '2026-03-20', overallScore: 58, testsRun: 24, testsPassed: 12, failedClasses: ['Race/Ethnicity', 'Geographic Location', 'Credit Score', 'Age', 'Gender'] },
  { date: '2026-02-20', overallScore: 55, testsRun: 24, testsPassed: 11, failedClasses: ['Race/Ethnicity', 'Geographic Location', 'Credit Score', 'Age', 'Gender'] },
];

const REMEDIATION_RECOMMENDATIONS: RemediationRecommendation[] = [
  {
    id: 'rem-1',
    protectedClass: 'Race/Ethnicity',
    severity: 'critical',
    title: 'Address Disparate Impact in Underwriting Model',
    description: 'The underwriting model shows a disparate impact ratio of 0.76 for race/ethnicity, below the 0.80 four-fifths threshold.',
    suggestedActions: [
      'Conduct root cause analysis on feature contributions',
      'Review and potentially remove ZIP code from model inputs',
      'Implement in-processing debiasing techniques',
      'Retrain model with fairness constraints',
      'Document remediation steps for regulatory filing',
    ],
    estimatedEffort: '4-6 weeks',
    regulatoryRef: 'NAIC Model Bulletin Section 3.2',
  },
  {
    id: 'rem-2',
    protectedClass: 'Geographic Location',
    severity: 'critical',
    title: 'Review Territory Rating for Redlining Effects',
    description: 'Geographic location showing 0.73 DI ratio in underwriting and 0.71 in pricing indicates potential redlining.',
    suggestedActions: [
      'Audit territory definitions against demographic data',
      'Replace ZIP-based factors with loss-experience factors',
      'Validate actuarial justification for geographic pricing',
      'Consider state-specific regulatory requirements',
      'Implement proxy detection monitoring',
    ],
    estimatedEffort: '6-8 weeks',
    regulatoryRef: 'NAIC Model Bulletin Section 4.1, Fair Housing Act',
  },
  {
    id: 'rem-3',
    protectedClass: 'Credit Score',
    severity: 'high',
    title: 'Evaluate Credit-Based Insurance Score Usage',
    description: 'Credit score showing proxy effects for race/ethnicity with DI ratios below threshold in pricing model.',
    suggestedActions: [
      'Review state-specific credit score regulations',
      'Analyze credit score correlation with protected classes',
      'Consider alternative risk factors with lower proxy effects',
      'Document actuarial basis if credit use is retained',
      'Implement regular disparity monitoring',
    ],
    estimatedEffort: '3-4 weeks',
    regulatoryRef: 'NAIC Credit Scoring Guidelines, State-specific regs',
  },
];

// ─────────────────────────── Helper Functions ───────────────────────────

const statusConfig: Record<TestStatus, { label: string; badgeClass: string; icon: IconName }> = {
  pass: { label: 'Pass', badgeClass: 'bg-emerald-100 text-emerald-700', icon: 'check-circle' },
  fail: { label: 'Fail', badgeClass: 'bg-rose-100 text-rose-700', icon: 'x-circle' },
  'needs-review': { label: 'Needs Review', badgeClass: 'bg-amber-100 text-amber-700', icon: 'exclamation-triangle' },
};

const severityConfig: Record<string, { label: string; badgeClass: string; borderClass: string }> = {
  critical: { label: 'Critical', badgeClass: 'bg-rose-100 text-rose-700', borderClass: 'border-l-rose-500' },
  high: { label: 'High', badgeClass: 'bg-orange-100 text-orange-700', borderClass: 'border-l-orange-500' },
  medium: { label: 'Medium', badgeClass: 'bg-amber-100 text-amber-700', borderClass: 'border-l-amber-500' },
  low: { label: 'Low', badgeClass: 'bg-slate-100 text-slate-600', borderClass: 'border-l-slate-400' },
};

const riskLevelConfig: Record<string, { label: string; badgeClass: string }> = {
  high: { label: 'High', badgeClass: 'bg-rose-100 text-rose-700' },
  medium: { label: 'Medium', badgeClass: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', badgeClass: 'bg-emerald-100 text-emerald-700' },
};

function calculateOverallFairnessScore(tests: ProtectedClassTest[]): number {
  if (tests.length === 0) return 0;
  const passWeight = 1;
  const reviewWeight = 0.5;
  const failWeight = 0;

  const totalScore = tests.reduce((sum, test) => {
    const weight = test.status === 'pass' ? passWeight : test.status === 'needs-review' ? reviewWeight : failWeight;
    return sum + weight;
  }, 0);

  return Math.round((totalScore / tests.length) * 100);
}

// ─────────────────────────── Component ───────────────────────────

interface UnfairDiscriminationTestingProps {
  embedded?: boolean;
  initialUseCase?: UseCase;
}

export default function UnfairDiscriminationTesting({
  embedded = false,
  initialUseCase = 'underwriting'
}: UnfairDiscriminationTestingProps) {
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase>(initialUseCase);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [showProxyAnalysis, setShowProxyAnalysis] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showRemediation, setShowRemediation] = useState(true);

  const currentTests = useMemo(() => PROTECTED_CLASS_TESTS[selectedUseCase], [selectedUseCase]);

  const overallScore = useMemo(() => calculateOverallFairnessScore(currentTests), [currentTests]);

  const testCounts = useMemo(() => ({
    total: currentTests.length,
    pass: currentTests.filter(t => t.status === 'pass').length,
    fail: currentTests.filter(t => t.status === 'fail').length,
    review: currentTests.filter(t => t.status === 'needs-review').length,
  }), [currentTests]);

  const handleExport = useCallback(() => {
    // Create export content
    let report = `NAIC UNFAIR DISCRIMINATION TESTING REPORT\n`;
    report += `${'='.repeat(60)}\n\n`;
    report += `Use Case: ${USE_CASE_LABELS[selectedUseCase]}\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Overall Fairness Score: ${overallScore}%\n\n`;
    report += `SUMMARY\n`;
    report += `${'─'.repeat(40)}\n`;
    report += `Total Tests: ${testCounts.total}\n`;
    report += `Passed: ${testCounts.pass}\n`;
    report += `Failed: ${testCounts.fail}\n`;
    report += `Needs Review: ${testCounts.review}\n\n`;

    report += `PROTECTED CLASS RESULTS\n`;
    report += `${'─'.repeat(40)}\n`;
    currentTests.forEach(test => {
      report += `\n${test.protectedClass}\n`;
      report += `  Status: ${statusConfig[test.status].label}\n`;
      report += `  Disparate Impact Ratio: ${test.disparateImpactRatio.toFixed(2)}\n`;
      report += `  Statistical Parity Diff: ${test.statisticalParityDiff.toFixed(2)}\n`;
      report += `  Sample Size: ${test.sampleSize.toLocaleString()}\n`;
      report += `  Confidence Interval: [${test.confidenceInterval[0].toFixed(2)}, ${test.confidenceInterval[1].toFixed(2)}]\n`;
      report += `  Last Test: ${test.lastTestDate}\n`;
      if (test.note) report += `  Note: ${test.note}\n`;
    });

    report += `\n\nPROXY VARIABLE ANALYSIS\n`;
    report += `${'─'.repeat(40)}\n`;
    PROXY_VARIABLES.forEach(proxy => {
      report += `\n${proxy.feature}\n`;
      report += `  Correlated With: ${proxy.correlatedWith}\n`;
      report += `  Correlation: ${proxy.correlationCoeff.toFixed(2)}\n`;
      report += `  Decision Influence: ${(proxy.influenceOnDecision * 100).toFixed(0)}%\n`;
      report += `  Risk Level: ${proxy.riskLevel}\n`;
      report += `  Recommendation: ${proxy.recommendation}\n`;
    });

    report += `\n\nREMEDIATION RECOMMENDATIONS\n`;
    report += `${'─'.repeat(40)}\n`;
    REMEDIATION_RECOMMENDATIONS.forEach(rec => {
      report += `\n[${rec.severity.toUpperCase()}] ${rec.title}\n`;
      report += `  Protected Class: ${rec.protectedClass}\n`;
      report += `  Description: ${rec.description}\n`;
      report += `  Regulatory Reference: ${rec.regulatoryRef}\n`;
      report += `  Estimated Effort: ${rec.estimatedEffort}\n`;
      report += `  Actions:\n`;
      rec.suggestedActions.forEach(action => {
        report += `    - ${action}\n`;
      });
    });

    report += `\n${'='.repeat(60)}\n`;
    report += `Report generated for NAIC Model Bulletin compliance.\n`;

    // Download
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NAIC_Discrimination_Testing_${selectedUseCase}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedUseCase, currentTests, testCounts, overallScore]);

  const body = (
    <div className="space-y-6">
      {/* Header with Overall Score */}
      <div className="bg-gradient-to-br from-rose-50 to-orange-50/50 rounded-2xl border border-rose-200/60 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Icon name="scale" className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Unfair Discrimination Testing</h2>
                <p className="text-[11px] text-slate-600">NAIC Model Bulletin Compliance Analysis</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 max-w-2xl mt-2">
              Statistical fairness analysis for AI model outputs across protected classes. Tests for disparate impact
              using the four-fifths (80%) rule per EEOC guidelines and NAIC Model Bulletin requirements for insurers.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Overall Fairness</div>
              <div className={`text-3xl font-bold ${
                overallScore >= 80 ? 'text-emerald-600' :
                overallScore >= 60 ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {overallScore}%
              </div>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors"
            >
              <Icon name="document-arrow-down" className="w-4 h-4" />
              Export for Filing
            </button>
          </div>
        </div>
      </div>

      {/* Use Case Selector */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="folder" className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-700">AI System Use Case</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(USE_CASE_LABELS) as UseCase[]).map(uc => (
              <button
                key={uc}
                onClick={() => setSelectedUseCase(uc)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedUseCase === uc
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {USE_CASE_LABELS[uc]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tests Run" value={testCounts.total} variant="info" sub="protected classes" />
        <StatCard label="Passed" value={testCounts.pass} variant="success" sub={`${Math.round((testCounts.pass / testCounts.total) * 100)}% pass rate`} />
        <StatCard label="Failed" value={testCounts.fail} variant={testCounts.fail > 0 ? 'danger' : 'muted'} sub="require remediation" />
        <StatCard label="Needs Review" value={testCounts.review} variant={testCounts.review > 0 ? 'warning' : 'muted'} sub="borderline results" />
      </div>

      {/* Protected Class Test Results */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="beaker" className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Protected Class Test Results</h3>
            <MockDataBadge integration="Statistical fairness testing — model output analysis" />
          </div>
          <span className="text-[10px] text-slate-500">Four-fifths rule threshold: 0.80</span>
        </div>

        <div className="divide-y divide-slate-100">
          {currentTests.map(test => {
            const config = statusConfig[test.status];
            const isExpanded = expandedTest === test.id;
            const diRatio = test.disparateImpactRatio;
            const diBarWidth = Math.min(diRatio * 100, 100);
            const diBarColor = diRatio >= 0.80 ? 'bg-emerald-500' : diRatio >= 0.75 ? 'bg-amber-500' : 'bg-rose-500';

            return (
              <div key={test.id} className="group">
                <button
                  onClick={() => setExpandedTest(isExpanded ? null : test.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors text-left"
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    test.status === 'pass' ? 'bg-emerald-100' :
                    test.status === 'fail' ? 'bg-rose-100' : 'bg-amber-100'
                  }`}>
                    <Icon name={test.icon} className={`w-5 h-5 ${
                      test.status === 'pass' ? 'text-emerald-600' :
                      test.status === 'fail' ? 'text-rose-600' : 'text-amber-600'
                    }`} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{test.protectedClass}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${config.badgeClass}`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {test.privilegedGroup} vs {test.unprivilegedGroup} | n = {test.sampleSize.toLocaleString()}
                    </div>
                  </div>

                  {/* DI Ratio visual */}
                  <div className="w-40 hidden sm:block">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-slate-500">DI Ratio</span>
                      <span className={`font-semibold ${
                        diRatio >= 0.80 ? 'text-emerald-600' : diRatio >= 0.75 ? 'text-amber-600' : 'text-rose-600'
                      }`}>{diRatio.toFixed(2)}</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden relative">
                      {/* 0.80 threshold marker */}
                      <div className="absolute left-[80%] top-0 bottom-0 w-0.5 bg-slate-400 z-10" />
                      <div className={`h-full rounded-full transition-all ${diBarColor}`} style={{ width: `${diBarWidth}%` }} />
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <Icon
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    className="w-4 h-4 text-slate-400 flex-shrink-0"
                  />
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-0">
                    <div className="ml-14 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Disparate Impact</div>
                          <div className={`text-lg font-bold ${
                            diRatio >= 0.80 ? 'text-emerald-600' : 'text-rose-600'
                          }`}>{diRatio.toFixed(2)}</div>
                          <div className="text-[9px] text-slate-400">threshold: 0.80</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Statistical Parity</div>
                          <div className="text-lg font-bold text-slate-700">{test.statisticalParityDiff.toFixed(2)}</div>
                          <div className="text-[9px] text-slate-400">difference</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Confidence Interval</div>
                          <div className="text-sm font-semibold text-slate-700">
                            [{test.confidenceInterval[0].toFixed(2)}, {test.confidenceInterval[1].toFixed(2)}]
                          </div>
                          <div className="text-[9px] text-slate-400">95% CI</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Last Tested</div>
                          <div className="text-sm font-semibold text-slate-700">{test.lastTestDate}</div>
                          <div className="text-[9px] text-slate-400">date</div>
                        </div>
                      </div>

                      {/* Approval rates comparison */}
                      <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-slate-200">
                        <div className="flex-1">
                          <div className="text-[10px] text-slate-500">{test.privilegedGroup} (Privileged)</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${test.approvalRatePrivileged * 100}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{(test.approvalRatePrivileged * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-[10px] text-slate-500">{test.unprivilegedGroup} (Unprivileged)</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${test.approvalRateUnprivileged * 100}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{(test.approvalRateUnprivileged * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>

                      {test.note && (
                        <div className="mt-3 p-2 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-start gap-2">
                            <Icon name="information-circle" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <span className="text-[11px] text-amber-800">{test.note}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Proxy Variable Correlation Analysis */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowProxyAnalysis(!showProxyAnalysis)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon name="link" className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Proxy Variable Correlation Analysis</h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">
              {PROXY_VARIABLES.filter(p => p.riskLevel === 'high').length} High Risk
            </span>
          </div>
          <Icon name={showProxyAnalysis ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400" />
        </button>

        {showProxyAnalysis && (
          <div className="px-5 pb-5">
            <p className="text-[11px] text-slate-500 mb-4">
              Features that may serve as proxies for protected characteristics. High correlation with protected classes
              combined with significant decision influence indicates potential unfair discrimination risk.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                    <th scope="col" className="py-2 px-3 text-left font-medium">Feature</th>
                    <th scope="col" className="py-2 px-3 text-left font-medium">Correlated With</th>
                    <th scope="col" className="py-2 px-3 text-center font-medium">Correlation</th>
                    <th scope="col" className="py-2 px-3 text-center font-medium">Decision Influence</th>
                    <th scope="col" className="py-2 px-3 text-center font-medium">Risk</th>
                    <th scope="col" className="py-2 px-3 text-left font-medium">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {PROXY_VARIABLES.map((proxy, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="py-2.5 px-3 font-medium text-slate-800">{proxy.feature}</td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600">{proxy.correlatedWith}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[11px] font-semibold ${
                          proxy.correlationCoeff >= 0.6 ? 'text-rose-600' :
                          proxy.correlationCoeff >= 0.4 ? 'text-amber-600' : 'text-slate-600'
                        }`}>{proxy.correlationCoeff.toFixed(2)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-[11px] text-slate-600">{(proxy.influenceOnDecision * 100).toFixed(0)}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${riskLevelConfig[proxy.riskLevel].badgeClass}`}>
                          {riskLevelConfig[proxy.riskLevel].label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[10px] text-slate-500 max-w-xs">{proxy.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Remediation Recommendations */}
      {testCounts.fail > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowRemediation(!showRemediation)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Icon name="wrench" className="w-4 h-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Remediation Recommendations</h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                {REMEDIATION_RECOMMENDATIONS.filter(r => r.severity === 'critical').length} Critical
              </span>
            </div>
            <Icon name={showRemediation ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400" />
          </button>

          {showRemediation && (
            <div className="px-5 pb-5 space-y-3">
              {REMEDIATION_RECOMMENDATIONS.map(rec => {
                const sevConfig = severityConfig[rec.severity];
                return (
                  <div key={rec.id} className={`p-4 rounded-xl border border-slate-200 border-l-4 ${sevConfig.borderClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${sevConfig.badgeClass}`}>
                            {sevConfig.label}
                          </span>
                          <span className="text-[10px] text-slate-500">{rec.protectedClass}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800">{rec.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-1">{rec.description}</p>

                        <div className="mt-3">
                          <div className="text-[10px] font-medium text-slate-600 mb-1">Suggested Actions:</div>
                          <ul className="space-y-1">
                            {rec.suggestedActions.map((action, idx) => (
                              <li key={idx} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                                <Icon name="chevron-right" className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                                {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[9px] text-slate-400 uppercase">Est. Effort</div>
                        <div className="text-xs font-medium text-slate-700">{rec.estimatedEffort}</div>
                        <div className="text-[9px] text-slate-400 mt-2">{rec.regulatoryRef}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Test History Trend */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon name="chart-line" className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Test History & Trend</h3>
            <span className="text-[10px] text-emerald-600 font-medium">
              +{TEST_HISTORY[0].overallScore - TEST_HISTORY[TEST_HISTORY.length - 1].overallScore}% improvement
            </span>
          </div>
          <Icon name={showHistory ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400" />
        </button>

        {showHistory && (
          <div className="px-5 pb-5">
            {/* Simple bar chart visualization */}
            <div className="mb-4">
              <div className="flex items-end gap-2 h-32">
                {TEST_HISTORY.slice().reverse().map((entry, idx) => {
                  const height = (entry.overallScore / 100) * 100;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full rounded-t transition-all ${
                          entry.overallScore >= 80 ? 'bg-emerald-500' :
                          entry.overallScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ height: `${height}%` }}
                        title={`${entry.date}: ${entry.overallScore}%`}
                      />
                      <div className="text-[8px] text-slate-400 mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">
                        {entry.date.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-6">
                <span>{TEST_HISTORY[TEST_HISTORY.length - 1].date}</span>
                <span>Overall Fairness Score Trend</span>
                <span>{TEST_HISTORY[0].date}</span>
              </div>
            </div>

            {/* History table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                  <th scope="col" className="py-2 px-3 text-left font-medium">Date</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">Score</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">Tests</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">Passed</th>
                  <th scope="col" className="py-2 px-3 text-left font-medium">Failed Classes</th>
                </tr>
              </thead>
              <tbody>
                {TEST_HISTORY.map((entry, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-2 px-3 font-medium text-slate-700">{entry.date}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`font-semibold ${
                        entry.overallScore >= 80 ? 'text-emerald-600' :
                        entry.overallScore >= 60 ? 'text-amber-600' : 'text-rose-600'
                      }`}>{entry.overallScore}%</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-600">{entry.testsRun}</td>
                    <td className="py-2 px-3 text-center text-slate-600">{entry.testsPassed}</td>
                    <td className="py-2 px-3 text-[10px] text-slate-500">{entry.failedClasses.join(', ') || 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NAIC Model Bulletin Reference */}
      <div className="bg-rose-50 rounded-xl border border-rose-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
            <Icon name="scale" className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-rose-900">NAIC Model Bulletin Compliance</div>
            <div className="text-[11px] text-rose-800 mt-1 leading-relaxed">
              Per the 2023 NAIC Model Bulletin on the Use of AI Systems by Insurers, insurers must test for unfair
              discrimination across protected classes in underwriting, claims, pricing, and marketing decisions.
              The four-fifths (80%) rule from EEOC guidelines serves as the primary disparate impact threshold.
              Results showing ratios below 0.80 require documented remediation and may need regulatory filing.
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-[10px] text-slate-400 text-center">
        NAIC Unfair Discrimination Testing — Based on 2023 NAIC Model Bulletin and EEOC four-fifths rule guidelines.
        Export results for state insurance regulator filings.
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">NAIC Unfair Discrimination Testing</h1>
          <p className="text-sm text-slate-500">Statistical fairness analysis for insurance AI systems</p>
        </div>
        <MockDataBadge integration="Statistical fairness testing — control-plane backend (illustrative)" />
      </div>
      {body}
    </div>
  );
}
