/**
 * useDataReadiness — Compute an AI Data Readiness DERIVED SCORECARD from live AWS signals
 *
 * IMPORTANT: The dimension scores below are heuristic step-ladders derived from live
 * AWS signals (guardrail counts, invocation totals, Config compliance, etc.). The
 * underlying signals are live, but the resulting 0-100 scores are DERIVED estimates,
 * not direct measurements — the UI must badge them as "Derived", never as "Live".
 *
 * Signal sources:
 * 1. Data Protection - Guardrails active count
 * 2. PII Coverage - Unique PII types protected
 * 3. Audit Trail - Invocation logs and CloudTrail activity
 * 4. Compliance - AWS Config rule compliance
 * 5. Security - Security findings (GuardDuty, Macie, Inspector)
 * 6. Access Governance - Service approvals
 * 7. Data Quality - AWS Glue Data Quality rule pass-rate (governDataCatalogApi.quality()).
 *    When Glue DQ is integrated (live) the dimension is scored from the real pass-rate
 *    and contributes to the radar / overall score. When it is not integrated (live=false)
 *    it stays "not measured" — informational only, excluded from the scored score.
 *
 * No user deployment required - uses existing AWS data.
 *
 * This is the module's ONLY control-readiness ladder. Both the AI Data Readiness page
 * and the Data Governance landing dashboard read it, so there is one readiness number
 * on one 0-100 scale. `useDataGovernance` owns a separate ADOPTION MATURITY ladder
 * (0-5 levels, self-reported + inventory) which measures a different thing and must
 * never be rescaled into these units.
 */

import { useState, useEffect, useMemo } from 'react';
import { governDataCatalogApi } from '../../../api/client';
import { PII_COVERAGE_TARGET, pooledScore } from './dataReadinessEngine';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Re-exported for backward compatibility: the canonical single denominator and the
 * pooled scoring math now live in ONE shared engine (./dataReadinessEngine). Still
 * load-bearing — `useDataQuality` imports PII_COVERAGE_TARGET from here.
 */
export { PII_COVERAGE_TARGET };

export interface ReadinessDimension {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  target: number;
  status: 'met' | 'at-risk' | 'not-met';
  description: string;
  source: string;
  sourceDetail: string;
  findings: string[];
  actions: string[];
  /** Whether the underlying signal for this dimension was fetched live (drives the status dot). */
  live: boolean;
  /**
   * Whether this dimension contributes a real derived score to the radar / overall.
   * `false` marks a dimension as "not measured" (e.g. Data Quality without Glue DQ),
   * so it is shown as informational only and excluded from scored visualizations.
   * Defaults to scored when omitted.
   */
  scored?: boolean;
}

export interface DataReadinessResult {
  loading: boolean;
  error: string | null;
  overallScore: number;
  overallTarget: number;
  dimensions: ReadinessDimension[];
  status: 'ai-ready' | 'partially-ready' | 'not-ready';
  liveSourcesCount: number;
  totalSourcesCount: number;
  refresh: () => void;
}

interface RawData {
  guardrails: { total: number; active: number; piiTypes: string[]; metrics: { blocked: number; allowed: number; total: number }; live: boolean };
  invocationLogs: { totalCalls: number; live: boolean };
  cloudTrail: { totalCallers: number; live: boolean };
  configCompliance: { totalRules: number; compliantRules: number; live: boolean };
  security: { totalFindings: number; critical: number; high: number; live: boolean };
  serviceApprovals: { total: number; completed: number; live: boolean };
  dataQuality: { live: boolean; passRate: number | null; totalRules: number; passing: number };
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useDataReadiness(): DataReadinessResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rawData, setRawData] = useState<RawData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchAll = async () => {
      try {
        const [
          guardrailsRes,
          invocationRes,
          trailRes,
          configRes,
          securityRes,
          approvalsRes,
          qualityRes,
        ] = await Promise.allSettled([
          fetchJson(`${API_BASE}/api/v1/guardrails`),
          fetchJson(`${API_BASE}/api/v1/govern/invocation-safety/telemetry`),
          fetchJson(`${API_BASE}/api/v1/govern/trail/ai-callers`),
          fetchJson(`${API_BASE}/api/v1/govern/posture/config-compliance`),
          fetchJson(`${API_BASE}/api/v1/govern/security/posture`),
          fetchJson(`${API_BASE}/api/v1/service-approval/runs`),
          governDataCatalogApi.quality(),
        ]);

        // Parse guardrails
        const guardrails = (() => {
          const defaults = { total: 0, active: 0, piiTypes: [] as string[], metrics: { blocked: 0, allowed: 0, total: 0 }, live: false };
          if (guardrailsRes.status === 'fulfilled' && Array.isArray(guardrailsRes.value)) {
            const gList = guardrailsRes.value;
            const piiSet = new Set<string>();
            gList.forEach((g: any) => {
              (g.pii_entities || []).forEach((p: any) => piiSet.add(p.type));
            });
            return {
              ...defaults,
              total: gList.length,
              active: gList.filter((g: any) => g.status === 'active').length,
              piiTypes: Array.from(piiSet),
              live: true,
            };
          }
          return defaults;
        })();

        // Parse invocation logs
        const invocationLogs = invocationRes.status === 'fulfilled'
          ? { totalCalls: invocationRes.value.total_calls || 0, live: invocationRes.value.live ?? true }
          : { totalCalls: 0, live: false };

        // Parse CloudTrail
        const cloudTrail = trailRes.status === 'fulfilled'
          ? { totalCallers: trailRes.value.total_callers || 0, live: trailRes.value.live ?? true }
          : { totalCallers: 0, live: false };

        // Parse Config compliance
        const configCompliance = configRes.status === 'fulfilled'
          ? {
              totalRules: configRes.value.total_rules || 0,
              compliantRules: configRes.value.compliant || 0,
              live: configRes.value.live ?? true,
            }
          : { totalRules: 0, compliantRules: 0, live: false };

        // Parse Security
        const security = securityRes.status === 'fulfilled'
          ? {
              totalFindings: securityRes.value.total_findings || 0,
              critical: securityRes.value.critical || 0,
              high: securityRes.value.high || 0,
              live: securityRes.value.live ?? true,
            }
          : { totalFindings: 0, critical: 0, high: 0, live: false };

        // Parse Service Approvals
        const serviceApprovals = (approvalsRes.status === 'fulfilled' && Array.isArray(approvalsRes.value))
          ? {
              total: approvalsRes.value.length,
              completed: approvalsRes.value.filter((a: any) => a.status === 'completed').length,
              live: true,
            }
          : { total: 0, completed: 0, live: false };

        // Parse Glue Data Quality — `live` is true only when the catalog is live AND
        // has quality rules (see govern_data_catalog route), so pass_rate is a real
        // Glue DQ measurement when present.
        const dataQuality = qualityRes.status === 'fulfilled'
          ? {
              live: !!qualityRes.value?.live,
              passRate: typeof qualityRes.value?.pass_rate === 'number' ? qualityRes.value.pass_rate : null,
              totalRules: qualityRes.value?.total_rules || 0,
              passing: qualityRes.value?.passing || 0,
            }
          : { live: false, passRate: null, totalRules: 0, passing: 0 };

        if (!cancelled) {
          setRawData({
            guardrails,
            invocationLogs,
            cloudTrail,
            configCompliance,
            security,
            serviceApprovals,
            dataQuality,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load readiness data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const result = useMemo<Omit<DataReadinessResult, 'refresh'>>(() => {
    if (!rawData) {
      return {
        loading,
        error,
        overallScore: 0,
        overallTarget: 85,
        dimensions: [],
        status: 'not-ready',
        liveSourcesCount: 0,
        totalSourcesCount: 7,
      };
    }

    const { guardrails, invocationLogs, cloudTrail, configCompliance, security, serviceApprovals, dataQuality } = rawData;
    const qualityMeasured = dataQuality.live && dataQuality.passRate != null;
    const qualityPct = qualityMeasured ? Math.round(dataQuality.passRate as number) : 0;

    // Build dimensions from live data
    const dimensions: ReadinessDimension[] = [
      {
        id: 'protection',
        name: 'Data Protection',
        score: guardrails.active >= 3 ? 95 : guardrails.active >= 1 ? 70 : 20,
        maxScore: 100,
        target: 80,
        status: guardrails.active >= 3 ? 'met' : guardrails.active >= 1 ? 'at-risk' : 'not-met',
        description: 'Bedrock Guardrails protecting AI inputs/outputs from sensitive data exposure.',
        source: 'Bedrock Guardrails',
        sourceDetail: `${guardrails.active} active guardrails`,
        findings: guardrails.active > 0
          ? [`${guardrails.active} guardrails actively protecting data`, `${guardrails.total} total configured`]
          : ['No active guardrails configured', 'AI inputs/outputs are unprotected'],
        actions: guardrails.active >= 3
          ? ['Maintain current coverage', 'Review guardrail metrics regularly']
          : ['Create Bedrock Guardrails for each agent', 'Configure PII/PHI filters'],
        live: guardrails.live,
      },
      {
        id: 'pii',
        name: 'PII Coverage',
        score: Math.min(100, Math.round((guardrails.piiTypes.length / PII_COVERAGE_TARGET) * 100)),
        maxScore: 100,
        target: 80,
        status: guardrails.piiTypes.length >= 15 ? 'met' : guardrails.piiTypes.length >= 8 ? 'at-risk' : 'not-met',
        description: 'Coverage of personally identifiable information types in guardrail configurations.',
        source: 'Guardrail PII Entities',
        sourceDetail: `${guardrails.piiTypes.length} PII types protected`,
        findings: guardrails.piiTypes.length > 0
          ? [`Protecting ${guardrails.piiTypes.length} PII types`, `Includes: ${guardrails.piiTypes.slice(0, 4).join(', ')}${guardrails.piiTypes.length > 4 ? '...' : ''}`]
          : ['No PII types configured', 'Sensitive data may be exposed'],
        actions: guardrails.piiTypes.length >= 15
          ? ['Review for missing PII types', 'Add domain-specific patterns']
          : ['Add common PII types (SSN, email, phone)', 'Configure PHI types for healthcare data'],
        live: guardrails.live,
      },
      {
        id: 'audit',
        name: 'Audit Trail',
        score: invocationLogs.totalCalls > 1000 ? 95 : invocationLogs.totalCalls > 100 ? 75 : invocationLogs.totalCalls > 0 ? 50 : 20,
        maxScore: 100,
        target: 80,
        status: invocationLogs.totalCalls > 1000 ? 'met' : invocationLogs.totalCalls > 100 ? 'at-risk' : 'not-met',
        description: 'Model invocation logging for compliance and audit requirements.',
        source: 'Bedrock Invocation Logs',
        sourceDetail: `${invocationLogs.totalCalls.toLocaleString()} invocations logged`,
        findings: invocationLogs.totalCalls > 0
          ? [`${invocationLogs.totalCalls.toLocaleString()} invocations tracked`, `CloudTrail tracking ${cloudTrail.totalCallers} AI callers`]
          : ['Invocation logging not enabled', 'No audit trail for AI usage'],
        actions: invocationLogs.totalCalls > 1000
          ? ['Set up log retention policies', 'Configure alerts for anomalies']
          : ['Enable Bedrock model invocation logging', 'Configure CloudTrail for Bedrock events'],
        live: invocationLogs.live,
      },
      {
        id: 'compliance',
        name: 'Compliance Posture',
        score: configCompliance.totalRules > 0
          ? Math.round((configCompliance.compliantRules / configCompliance.totalRules) * 100)
          : 0,
        maxScore: 100,
        target: 90,
        status: configCompliance.totalRules > 0 && (configCompliance.compliantRules / configCompliance.totalRules) >= 0.9
          ? 'met'
          : configCompliance.totalRules > 0 && (configCompliance.compliantRules / configCompliance.totalRules) >= 0.7
            ? 'at-risk'
            : 'not-met',
        description: 'AWS Config rule compliance for infrastructure governance.',
        source: 'AWS Config',
        sourceDetail: `${configCompliance.compliantRules}/${configCompliance.totalRules} rules compliant`,
        findings: configCompliance.totalRules > 0
          ? [`${configCompliance.compliantRules} of ${configCompliance.totalRules} rules compliant`, `${configCompliance.totalRules - configCompliance.compliantRules} rules non-compliant`]
          : ['AWS Config not configured', 'No compliance rules evaluated'],
        actions: configCompliance.compliantRules === configCompliance.totalRules
          ? ['Maintain compliance posture', 'Add AI-specific config rules']
          : ['Review non-compliant resources', 'Remediate configuration drift'],
        live: configCompliance.live,
      },
      {
        id: 'security',
        name: 'Security Posture',
        // Gated on security.live: a non-live/empty feed defaults to {totalFindings:0}
        // which would otherwise score a perfect 100 and inflate overallScore. When the
        // feed is not live we treat it as "not measured" (score 0, scored:false) so it
        // is excluded from the scored radar / overall — mirroring the Data Quality dimension.
        score: !security.live ? 0
          : security.totalFindings === 0 ? 100
          : security.critical > 0 ? 30
          : security.high > 5 ? 50
          : security.high > 0 ? 70
          : 85,
        maxScore: 100,
        target: 80,
        status: !security.live ? 'not-met'
          : security.critical === 0 && security.high <= 5 ? 'met'
          : security.critical === 0 ? 'at-risk'
          : 'not-met',
        description: 'Security findings from GuardDuty, Macie, and Inspector.',
        source: 'Security Hub',
        sourceDetail: `${security.totalFindings} findings (${security.critical} critical, ${security.high} high)`,
        findings: security.totalFindings > 0
          ? [`${security.totalFindings} total security findings`, `${security.critical} critical, ${security.high} high severity`]
          : ['No security findings detected', 'Security services may not be enabled'],
        actions: security.critical > 0
          ? ['Address critical findings immediately', 'Review high-severity findings']
          : ['Maintain security monitoring', 'Enable GuardDuty if not active'],
        live: security.live,
        scored: security.live,
      },
      {
        id: 'access',
        name: 'Access Governance',
        score: serviceApprovals.completed > 3 ? 90 : serviceApprovals.completed > 0 ? 70 : serviceApprovals.total > 0 ? 40 : 20,
        maxScore: 100,
        target: 75,
        status: serviceApprovals.completed > 3 ? 'met' : serviceApprovals.completed > 0 ? 'at-risk' : 'not-met',
        description: 'Service approval workflows for controlled access to AI resources.',
        source: 'Service Approvals',
        sourceDetail: `${serviceApprovals.completed} approvals completed`,
        findings: serviceApprovals.total > 0
          ? [`${serviceApprovals.completed} of ${serviceApprovals.total} approvals completed`, 'Access governance workflows in place']
          : ['No service approval workflows', 'Ad-hoc access to AI resources'],
        actions: serviceApprovals.completed > 3
          ? ['Review pending approvals', 'Audit completed approvals quarterly']
          : ['Implement service approval process', 'Define approval gates for AI access'],
        live: serviceApprovals.live,
      },
      {
        id: 'quality',
        name: 'Data Quality',
        // Scored from the REAL AWS Glue Data Quality pass-rate when Glue DQ is integrated
        // (dataQuality.live). Until then it stays "not measured" (score 0, scored:false) so
        // a placeholder can't inflate readiness — presence of a guardrail is NOT a
        // data-quality measurement.
        score: qualityPct,
        maxScore: 100,
        target: 80,
        status: qualityMeasured
          ? (qualityPct >= 90 ? 'met' : qualityPct >= 70 ? 'at-risk' : 'not-met')
          : 'not-met',
        description: qualityMeasured
          ? 'Dataset quality validation from AWS Glue Data Quality rule results.'
          : 'Dataset quality validation. Not measured here — requires AWS Glue Data Quality.',
        source: 'AWS Glue Data Quality',
        sourceDetail: qualityMeasured
          ? `${dataQuality.passing}/${dataQuality.totalRules} rules passing (${qualityPct}%)`
          : 'Not measured (Glue Data Quality not integrated)',
        findings: qualityMeasured
          ? [
              `${dataQuality.passing} of ${dataQuality.totalRules} Glue quality rules passing`,
              `${qualityPct}% pass rate across evaluated datasets`,
            ]
          : [
              'Data-quality is not measured from the current live signals',
              'A guardrail existing is not a measure of dataset quality',
              'Enable AWS Glue Data Quality for real dataset validation scores',
            ],
        actions: qualityMeasured
          ? (qualityPct >= 90
              ? ['Maintain quality rulesets', 'Add rules for new AI datasets']
              : ['Investigate failing quality rules', 'Remediate datasets below threshold'])
          : ['Enable AWS Glue Data Quality', 'Define quality rules for AI datasets'],
        live: dataQuality.live,
        scored: qualityMeasured,
      },
    ];

    // Calculate overall score from SCORED dimensions only (exclude "not measured" ones
    // like Data Quality so a heuristic/placeholder value can't inflate readiness).
    // pooledScore applies the ONE pooled Sum(score)/Sum(maxScore) denominator.
    const scoredDimensions = dimensions.filter(d => d.scored !== false);
    const overallScore = pooledScore(scoredDimensions);

    const liveCount = dimensions.filter(d => d.live).length;

    return {
      loading,
      error,
      overallScore,
      overallTarget: 85,
      dimensions,
      status: overallScore >= 85 ? 'ai-ready' : overallScore >= 60 ? 'partially-ready' : 'not-ready',
      liveSourcesCount: liveCount,
      totalSourcesCount: dimensions.length,
    };
  }, [rawData, loading, error]);

  return {
    ...result,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
