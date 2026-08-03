/**
 * useDataReadiness — Compute AI Data Readiness scores from live AWS data
 *
 * Pulls from multiple live sources to compute 7-dimension readiness:
 * 1. Data Protection - Guardrails active count
 * 2. PII Coverage - Unique PII types protected
 * 3. Audit Trail - Invocation logs and CloudTrail activity
 * 4. Compliance - AWS Config rule compliance
 * 5. Security - Security findings (GuardDuty, Macie, Inspector)
 * 6. Access Governance - Service approvals
 * 7. Data Quality - Guardrail block/allow rates as proxy
 *
 * No user deployment required - uses existing AWS data.
 */

import { useState, useEffect, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

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
  live: boolean;
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
  guardrails: { total: number; active: number; piiTypes: string[]; metrics: { blocked: number; allowed: number; total: number } };
  invocationLogs: { totalCalls: number; live: boolean };
  cloudTrail: { totalCallers: number; live: boolean };
  configCompliance: { totalRules: number; compliantRules: number; live: boolean };
  security: { totalFindings: number; critical: number; high: number; live: boolean };
  serviceApprovals: { total: number; completed: number };
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
        ] = await Promise.allSettled([
          fetchJson(`${API_BASE}/api/v1/guardrails`),
          fetchJson(`${API_BASE}/api/v1/govern/invocation-safety/telemetry`),
          fetchJson(`${API_BASE}/api/v1/govern/trail/ai-callers`),
          fetchJson(`${API_BASE}/api/v1/govern/posture/config-compliance`),
          fetchJson(`${API_BASE}/api/v1/govern/security/posture`),
          fetchJson(`${API_BASE}/api/v1/service-approvals`),
        ]);

        // Parse guardrails
        const guardrails = (() => {
          const defaults = { total: 0, active: 0, piiTypes: [] as string[], metrics: { blocked: 0, allowed: 0, total: 0 } };
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
              compliantRules: configRes.value.compliant_rules || 0,
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
            }
          : { total: 0, completed: 0 };

        if (!cancelled) {
          setRawData({
            guardrails,
            invocationLogs,
            cloudTrail,
            configCompliance,
            security,
            serviceApprovals,
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

    const { guardrails, invocationLogs, cloudTrail, configCompliance, security, serviceApprovals } = rawData;

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
        live: true,
      },
      {
        id: 'pii',
        name: 'PII Coverage',
        score: Math.min(100, guardrails.piiTypes.length * 5),
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
        live: true,
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
        score: security.totalFindings === 0 ? 100
          : security.critical > 0 ? 30
          : security.high > 5 ? 50
          : security.high > 0 ? 70
          : 85,
        maxScore: 100,
        target: 80,
        status: security.critical === 0 && security.high <= 5 ? 'met'
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
        live: true,
      },
      {
        id: 'quality',
        name: 'Data Quality',
        score: guardrails.active > 0 ? 75 : 30,
        maxScore: 100,
        target: 80,
        status: guardrails.active > 0 ? 'at-risk' : 'not-met',
        description: 'Data quality validation through guardrail enforcement.',
        source: 'Guardrail Metrics',
        sourceDetail: guardrails.active > 0 ? 'Proxy from guardrail activity' : 'No quality signals',
        findings: guardrails.active > 0
          ? ['Using guardrail enforcement as quality proxy', 'For full DQ, enable Glue Data Quality']
          : ['No data quality monitoring', 'Enable Glue Data Quality for validation'],
        actions: ['Enable AWS Glue Data Quality', 'Define quality rules for AI datasets'],
        live: guardrails.active > 0,
      },
    ];

    // Calculate overall score
    const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
    const maxTotal = dimensions.reduce((sum, d) => sum + d.maxScore, 0);
    const overallScore = Math.round((totalScore / maxTotal) * 100);

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
