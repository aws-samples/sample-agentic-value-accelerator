/**
 * useLiveSecurityRisk — hook to fetch live security findings from AWS
 *
 * Combines Security Hub findings (governRiskPostureApi) and unified security
 * posture from GuardDuty/Macie/Inspector/Access Analyzer (governSecurityApi).
 * Maps findings to risk register format for unified display.
 *
 * Pattern: try live API -> fall back to empty/mock when no data
 */
import { useEffect, useState, useMemo } from 'react';
import {
  governRiskPostureApi,
  governSecurityApi,
  type AwsRiskPostureResponse,
  type AwsSecurityPostureResponse,
  type AwsSecurityFinding,
} from '../../../api/client';
import { usePollingKey } from '../usePollingKey';
import type { Risk, RiskCategory, RiskStatus, Likelihood, Severity } from './riskData';

// Extended risk type for live security findings
export interface LiveSecurityRisk extends Risk {
  isLive: true;
  source: 'security-hub' | 'guardduty' | 'macie' | 'inspector' | 'access-analyzer';
  findingId?: string;
  awsProduct?: string;
  complianceStatus?: string;
  resourceType?: string;
  lastUpdated?: string;
}

// Severity mapping from AWS to risk likelihood/severity
const SEVERITY_MAP: Record<string, { likelihood: Likelihood; severity: Severity }> = {
  CRITICAL: { likelihood: 5, severity: 5 },
  HIGH: { likelihood: 4, severity: 4 },
  MEDIUM: { likelihood: 3, severity: 3 },
  LOW: { likelihood: 2, severity: 2 },
  INFORMATIONAL: { likelihood: 1, severity: 1 },
};

// Map AWS product to risk category
const PRODUCT_CATEGORY_MAP: Record<string, RiskCategory> = {
  'GuardDuty': 'security',
  'Macie': 'privacy',
  'Inspector': 'security',
  'Inspector2': 'security',
  'Access Analyzer': 'compliance',
  'IAM Access Analyzer': 'compliance',
  'Security Hub': 'security',
  'Config': 'compliance',
};

// Map security source to category
const SOURCE_CATEGORY_MAP: Record<string, RiskCategory> = {
  guardduty: 'security',
  macie: 'privacy',
  inspector: 'security',
  'access-analyzer': 'compliance',
};

/**
 * Convert an AWS Security Hub finding to a Risk register entry
 */
function securityHubFindingToRisk(
  finding: AwsSecurityFinding,
  index: number
): LiveSecurityRisk {
  const sevMap = SEVERITY_MAP[finding.severity] ?? SEVERITY_MAP.MEDIUM;
  const category = PRODUCT_CATEGORY_MAP[finding.product] ?? 'security';
  const inherentScore = sevMap.likelihood * sevMap.severity;
  // Residual = inherent * 0.8 (assume some controls in place)
  const residualLikelihood = Math.max(1, sevMap.likelihood - 1) as Likelihood;
  const residualSeverity = sevMap.severity;
  const residualScore = residualLikelihood * residualSeverity;

  // Determine status based on compliance
  let status: RiskStatus = 'open';
  if (finding.compliance_status === 'PASSED') {
    status = 'mitigated';
  } else if (finding.compliance_status === 'NOT_AVAILABLE') {
    status = 'open';
  }

  return {
    id: `SHF-${String(index + 1).padStart(3, '0')}`,
    title: finding.title,
    description: `Security Hub finding from ${finding.product}. ${finding.compliance_status ? `Compliance: ${finding.compliance_status}` : ''}`,
    category,
    status,
    owner: 'Security Team',
    ownerRole: 'Security Operations',
    inherentLikelihood: sevMap.likelihood,
    inherentSeverity: sevMap.severity,
    inherentScore,
    residualLikelihood,
    residualSeverity,
    residualScore,
    trend: 'stable',
    controlIds: [],
    affectedAssets: finding.resource_type ? [finding.resource_type] : ['AWS Resources'],
    dateIdentified: finding.updated_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
    lastReviewed: finding.updated_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
    nextReview: '',
    notes: `AWS Security Hub: ${finding.id}`,
    isLive: true,
    source: 'security-hub',
    findingId: finding.id,
    awsProduct: finding.product,
    complianceStatus: finding.compliance_status ?? undefined,
    resourceType: finding.resource_type ?? undefined,
    lastUpdated: finding.updated_at ?? undefined,
  };
}

export interface LiveSecurityRiskData {
  // Raw API responses
  securityHub: AwsRiskPostureResponse | null;
  securityPosture: AwsSecurityPostureResponse | null;

  // Converted risks for the register
  liveRisks: LiveSecurityRisk[];

  // Summary stats
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;

  // Source breakdown
  bySource: {
    securityHub: number;
    guardDuty: number;
    macie: number;
    inspector: number;
    accessAnalyzer: number;
  };

  // Data state
  loading: boolean;
  isLive: boolean;
  error: string | null;
}

/**
 * Hook to fetch and combine live security risk data from AWS services
 */
export function useLiveSecurityRisk(pollIntervalMs = 60_000): LiveSecurityRiskData {
  const [loading, setLoading] = useState(true);
  const [securityHub, setSecurityHub] = useState<AwsRiskPostureResponse | null>(null);
  const [securityPosture, setSecurityPosture] = useState<AwsSecurityPostureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollKey = usePollingKey(pollIntervalMs);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        // Fetch both APIs in parallel
        const [hubData, postureData] = await Promise.all([
          governRiskPostureApi.securityHub(200).catch(() => null),
          governSecurityApi.posture().catch(() => null),
        ]);

        if (!cancelled) {
          setSecurityHub(hubData);
          setSecurityPosture(postureData);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch security data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [pollKey]);

  // Convert findings to risks
  const liveRisks = useMemo<LiveSecurityRisk[]>(() => {
    const risks: LiveSecurityRisk[] = [];

    // Add Security Hub findings
    if (securityHub?.live && securityHub.top_findings) {
      securityHub.top_findings.forEach((finding, idx) => {
        risks.push(securityHubFindingToRisk(finding, idx));
      });
    }

    // Add summary risks from security posture sources
    if (securityPosture?.live && securityPosture.sources) {
      securityPosture.sources.forEach((source) => {
        if (!source.live || source.total === 0) return;

        // Create a summary risk for each source with high+ findings
        const criticalHigh = source.critical + (source.by_severity.find(s => s.severity === 'HIGH')?.count ?? 0);
        if (criticalHigh > 0) {
          const sourceKey = source.source.toLowerCase().replace(/ /g, '-') as LiveSecurityRisk['source'];
          const category = SOURCE_CATEGORY_MAP[sourceKey] ?? 'security';

          // Determine severity level based on critical count
          const sevMap = source.critical > 0 ? SEVERITY_MAP.CRITICAL : SEVERITY_MAP.HIGH;

          risks.push({
            id: `AWS-${source.source.toUpperCase().replace(/ /g, '-')}-001`,
            title: `${source.label}: ${criticalHigh} critical/high findings`,
            description: `${source.total} total findings from ${source.label} (${source.dimension}). ${source.top_types.slice(0, 3).join(', ')}`,
            category,
            status: 'open',
            owner: 'Security Team',
            ownerRole: source.dimension,
            inherentLikelihood: sevMap.likelihood,
            inherentSeverity: sevMap.severity,
            inherentScore: sevMap.likelihood * sevMap.severity,
            residualLikelihood: Math.max(1, sevMap.likelihood - 1) as Likelihood,
            residualSeverity: sevMap.severity,
            residualScore: Math.max(1, sevMap.likelihood - 1) * sevMap.severity,
            trend: 'stable',
            controlIds: [],
            affectedAssets: source.top_types.slice(0, 5),
            dateIdentified: new Date().toISOString().split('T')[0],
            lastReviewed: new Date().toISOString().split('T')[0],
            nextReview: '',
            notes: `Live from AWS ${source.label}`,
            isLive: true,
            source: sourceKey,
          });
        }
      });
    }

    return risks;
  }, [securityHub, securityPosture]);

  // Calculate stats
  const stats = useMemo(() => {
    let totalFindings = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    const bySource = {
      securityHub: 0,
      guardDuty: 0,
      macie: 0,
      inspector: 0,
      accessAnalyzer: 0,
    };

    // Count from Security Hub
    if (securityHub?.live) {
      totalFindings += securityHub.total;
      criticalCount += securityHub.critical;
      highCount += securityHub.high;
      securityHub.by_severity.forEach(s => {
        if (s.severity === 'MEDIUM') mediumCount += s.count;
        if (s.severity === 'LOW') lowCount += s.count;
      });
      bySource.securityHub = securityHub.total;
    }

    // Count from security posture sources
    if (securityPosture?.live && securityPosture.sources) {
      securityPosture.sources.forEach(source => {
        if (!source.live) return;

        const sourceKey = source.source.toLowerCase();
        if (sourceKey.includes('guardduty')) {
          bySource.guardDuty = source.total;
        } else if (sourceKey.includes('macie')) {
          bySource.macie = source.total;
        } else if (sourceKey.includes('inspector')) {
          bySource.inspector = source.total;
        } else if (sourceKey.includes('access')) {
          bySource.accessAnalyzer = source.total;
        }

        // Note: We don't double-count totals as Security Hub aggregates these
      });
    }

    return {
      totalFindings,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      bySource,
    };
  }, [securityHub, securityPosture]);

  const isLive = !!(securityHub?.live || securityPosture?.live);

  return {
    securityHub,
    securityPosture,
    liveRisks,
    ...stats,
    loading,
    isLive,
    error,
  };
}

export default useLiveSecurityRisk;
