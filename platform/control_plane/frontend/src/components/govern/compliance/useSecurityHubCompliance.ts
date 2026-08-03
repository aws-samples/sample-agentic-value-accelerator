/**
 * useSecurityHubCompliance — hook to fetch Security Hub findings filtered to AI workloads
 *
 * Filters Security Hub findings to Bedrock/SageMaker resources and groups them by:
 * - Compliance standard (CIS, NIST, AWS Foundational, PCI-DSS, etc.)
 * - Severity (CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL)
 *
 * Returns findings with remediation guidance for compliance posture integration.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  governRiskPostureApi,
  type AwsRiskPostureResponse,
  type AwsSecurityFinding,
} from '../../../api/client';
import { usePollingKey } from '../usePollingKey';

// ─────────────────────────── Types ───────────────────────────

export type ComplianceStandard =
  | 'CIS'
  | 'NIST'
  | 'AWS-Foundational'
  | 'PCI-DSS'
  | 'SOC2'
  | 'HIPAA'
  | 'AI-Governance'
  | 'Unknown';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type RemediationStatus = 'not-started' | 'in-progress' | 'remediated' | 'accepted-risk';

export interface AISecurityFinding extends AwsSecurityFinding {
  /** Whether this finding relates to AI workloads (Bedrock/SageMaker) */
  isAIRelated: boolean;
  /** AI service type if applicable */
  aiService?: 'bedrock' | 'sagemaker' | 'comprehend' | 'rekognition' | 'textract' | 'other';
  /** Detected compliance standard */
  complianceStandard: ComplianceStandard;
  /** Remediation guidance */
  remediation: {
    guidance: string;
    effort: 'low' | 'medium' | 'high';
    automatable: boolean;
    consoleLink?: string;
  };
  /** Tracking status */
  remediationStatus: RemediationStatus;
  /** Days since finding was created */
  ageInDays: number;
}

export interface ComplianceStandardBreakdown {
  standard: ComplianceStandard;
  label: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  findings: AISecurityFinding[];
}

export interface SeverityBreakdown {
  severity: SeverityLevel;
  count: number;
  aiRelatedCount: number;
  pctOfTotal: number;
}

export interface SecurityHubComplianceData {
  // Raw API response
  raw: AwsRiskPostureResponse | null;

  // AI-filtered findings
  allFindings: AISecurityFinding[];
  aiFindings: AISecurityFinding[];

  // Aggregations
  byStandard: ComplianceStandardBreakdown[];
  bySeverity: SeverityBreakdown[];

  // Summary stats
  totalFindings: number;
  aiRelatedFindings: number;
  criticalCount: number;
  highCount: number;
  remediatedLast30d: number;

  // Recent critical/high for attention
  recentCriticalHigh: AISecurityFinding[];

  // Data state
  loading: boolean;
  isLive: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

// ─────────────────────────── Constants ───────────────────────────

/** AI service resource patterns for filtering */
const AI_RESOURCE_PATTERNS = [
  { pattern: /bedrock/i, service: 'bedrock' as const },
  { pattern: /sagemaker/i, service: 'sagemaker' as const },
  { pattern: /comprehend/i, service: 'comprehend' as const },
  { pattern: /rekognition/i, service: 'rekognition' as const },
  { pattern: /textract/i, service: 'textract' as const },
];

/** Product to compliance standard mapping */
const PRODUCT_STANDARD_MAP: Record<string, ComplianceStandard> = {
  'Security Hub': 'AWS-Foundational',
  'Config': 'AWS-Foundational',
  'GuardDuty': 'AWS-Foundational',
  'Inspector': 'AWS-Foundational',
  'Inspector2': 'AWS-Foundational',
  'Macie': 'AWS-Foundational',
  'IAM Access Analyzer': 'AWS-Foundational',
  'Access Analyzer': 'AWS-Foundational',
};

/** Compliance standard labels */
const STANDARD_LABELS: Record<ComplianceStandard, string> = {
  CIS: 'CIS AWS Foundations',
  NIST: 'NIST 800-53',
  'AWS-Foundational': 'AWS Foundational Security',
  'PCI-DSS': 'PCI DSS',
  SOC2: 'SOC 2',
  HIPAA: 'HIPAA',
  'AI-Governance': 'AI Governance Controls',
  Unknown: 'Other Controls',
};

/** Remediation guidance templates by finding type */
const REMEDIATION_TEMPLATES: Record<string, { guidance: string; effort: 'low' | 'medium' | 'high'; automatable: boolean }> = {
  encryption: {
    guidance: 'Enable encryption at rest using AWS KMS. For Bedrock, ensure model invocation data is encrypted.',
    effort: 'low',
    automatable: true,
  },
  logging: {
    guidance: 'Enable CloudWatch logging for AI service invocations. Configure log retention and alerting.',
    effort: 'low',
    automatable: true,
  },
  access: {
    guidance: 'Review IAM policies and apply least-privilege access. Use service control policies for organization-wide controls.',
    effort: 'medium',
    automatable: false,
  },
  network: {
    guidance: 'Configure VPC endpoints for private connectivity. Review security group rules.',
    effort: 'medium',
    automatable: true,
  },
  guardrail: {
    guidance: 'Deploy Bedrock Guardrails to enforce content policies. Configure denied topics and PII filters.',
    effort: 'medium',
    automatable: true,
  },
  default: {
    guidance: 'Review the finding details and apply recommended security controls.',
    effort: 'medium',
    automatable: false,
  },
};

// ─────────────────────────── Helpers ───────────────────────────

/**
 * Detect if a finding relates to AI workloads
 */
function detectAIService(finding: AwsSecurityFinding): { isAIRelated: boolean; service?: AISecurityFinding['aiService'] } {
  const searchText = `${finding.title} ${finding.product} ${finding.resource_type ?? ''}`.toLowerCase();

  for (const { pattern, service } of AI_RESOURCE_PATTERNS) {
    if (pattern.test(searchText)) {
      return { isAIRelated: true, service };
    }
  }

  return { isAIRelated: false };
}

/**
 * Detect compliance standard from finding
 */
function detectComplianceStandard(finding: AwsSecurityFinding): ComplianceStandard {
  const titleLower = finding.title.toLowerCase();
  const idLower = finding.id.toLowerCase();

  if (titleLower.includes('cis') || idLower.includes('cis')) return 'CIS';
  if (titleLower.includes('nist') || idLower.includes('nist')) return 'NIST';
  if (titleLower.includes('pci') || idLower.includes('pci')) return 'PCI-DSS';
  if (titleLower.includes('soc') || idLower.includes('soc')) return 'SOC2';
  if (titleLower.includes('hipaa') || idLower.includes('hipaa')) return 'HIPAA';

  // Check if it's an AI-specific governance control
  if (
    titleLower.includes('guardrail') ||
    titleLower.includes('model') ||
    titleLower.includes('inference') ||
    titleLower.includes('agent')
  ) {
    return 'AI-Governance';
  }

  return PRODUCT_STANDARD_MAP[finding.product] ?? 'Unknown';
}

/**
 * Generate remediation guidance based on finding
 */
function generateRemediation(finding: AwsSecurityFinding): AISecurityFinding['remediation'] {
  const titleLower = finding.title.toLowerCase();

  let template = REMEDIATION_TEMPLATES.default;

  if (titleLower.includes('encrypt')) {
    template = REMEDIATION_TEMPLATES.encryption;
  } else if (titleLower.includes('log') || titleLower.includes('audit') || titleLower.includes('trail')) {
    template = REMEDIATION_TEMPLATES.logging;
  } else if (titleLower.includes('iam') || titleLower.includes('access') || titleLower.includes('permission')) {
    template = REMEDIATION_TEMPLATES.access;
  } else if (titleLower.includes('vpc') || titleLower.includes('network') || titleLower.includes('security group')) {
    template = REMEDIATION_TEMPLATES.network;
  } else if (titleLower.includes('guardrail') || titleLower.includes('content') || titleLower.includes('filter')) {
    template = REMEDIATION_TEMPLATES.guardrail;
  }

  return {
    ...template,
    consoleLink: `https://console.aws.amazon.com/securityhub/home#/findings?search=Id%3D${encodeURIComponent(finding.id)}`,
  };
}

/**
 * Calculate age in days from updated_at
 */
function calculateAgeInDays(updatedAt?: string | null): number {
  if (!updatedAt) return 0;
  const updated = new Date(updatedAt);
  const now = new Date();
  return Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Enrich a raw finding with AI-specific metadata
 */
function enrichFinding(finding: AwsSecurityFinding, index: number): AISecurityFinding {
  const { isAIRelated, service } = detectAIService(finding);

  return {
    ...finding,
    isAIRelated,
    aiService: service,
    complianceStandard: detectComplianceStandard(finding),
    remediation: generateRemediation(finding),
    remediationStatus: finding.compliance_status === 'PASSED' ? 'remediated' : 'not-started',
    ageInDays: calculateAgeInDays(finding.updated_at),
  };
}

// ─────────────────────────── Hook ───────────────────────────

/**
 * Hook to fetch and process Security Hub findings for AI compliance
 */
export function useSecurityHubCompliance(
  pollIntervalMs = 60_000,
  options: { aiOnly?: boolean; maxFindings?: number } = {}
): SecurityHubComplianceData {
  const { aiOnly = false, maxFindings = 200 } = options;

  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<AwsRiskPostureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const pollKey = usePollingKey(pollIntervalMs);

  // Fetch data
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const data = await governRiskPostureApi.securityHub(maxFindings);
        if (!cancelled) {
          setRaw(data);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch Security Hub findings');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [pollKey, maxFindings]);

  // Process findings
  const processedData = useMemo(() => {
    if (!raw?.live || !raw.top_findings) {
      return {
        allFindings: [],
        aiFindings: [],
        byStandard: [],
        bySeverity: [],
        totalFindings: 0,
        aiRelatedFindings: 0,
        criticalCount: 0,
        highCount: 0,
        remediatedLast30d: 0,
        recentCriticalHigh: [],
      };
    }

    // Enrich all findings
    const allFindings = raw.top_findings.map((f, idx) => enrichFinding(f, idx));
    const aiFindings = allFindings.filter(f => f.isAIRelated);

    const targetFindings = aiOnly ? aiFindings : allFindings;

    // Group by compliance standard
    const standardMap = new Map<ComplianceStandard, AISecurityFinding[]>();
    targetFindings.forEach(f => {
      const existing = standardMap.get(f.complianceStandard) ?? [];
      existing.push(f);
      standardMap.set(f.complianceStandard, existing);
    });

    const byStandard: ComplianceStandardBreakdown[] = Array.from(standardMap.entries())
      .map(([standard, findings]) => ({
        standard,
        label: STANDARD_LABELS[standard],
        total: findings.length,
        critical: findings.filter(f => f.severity === 'CRITICAL').length,
        high: findings.filter(f => f.severity === 'HIGH').length,
        medium: findings.filter(f => f.severity === 'MEDIUM').length,
        low: findings.filter(f => f.severity === 'LOW').length,
        informational: findings.filter(f => f.severity === 'INFORMATIONAL').length,
        findings,
      }))
      .sort((a, b) => b.total - a.total);

    // Group by severity
    const severities: SeverityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
    const bySeverity: SeverityBreakdown[] = severities.map(severity => {
      const count = targetFindings.filter(f => f.severity === severity).length;
      const aiRelatedCount = aiFindings.filter(f => f.severity === severity).length;
      return {
        severity,
        count,
        aiRelatedCount,
        pctOfTotal: targetFindings.length > 0 ? Math.round((count / targetFindings.length) * 100) : 0,
      };
    });

    // Recent critical/high findings (last 30 days)
    const recentCriticalHigh = targetFindings
      .filter(f => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.ageInDays <= 30)
      .slice(0, 10);

    // Count remediated in last 30 days (simplified: compliance_status === 'PASSED')
    const remediatedLast30d = targetFindings.filter(
      f => f.remediationStatus === 'remediated' && f.ageInDays <= 30
    ).length;

    return {
      allFindings,
      aiFindings,
      byStandard,
      bySeverity,
      totalFindings: targetFindings.length,
      aiRelatedFindings: aiFindings.length,
      criticalCount: raw.critical,
      highCount: raw.high,
      remediatedLast30d,
      recentCriticalHigh,
    };
  }, [raw, aiOnly]);

  const isLive = !!raw?.live;

  return {
    raw,
    ...processedData,
    loading,
    isLive,
    error,
    lastUpdated,
  };
}

export default useSecurityHubCompliance;
