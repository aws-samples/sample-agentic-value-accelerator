/**
 * useGuardDutyAIFindings — Hook for GuardDuty AI Protection findings
 *
 * Fetches AI-related threat detection findings from Amazon GuardDuty AI Protection.
 * Falls back to mock data when the API is unavailable.
 *
 * GuardDuty AI Protection detects:
 * - Prompt injection attacks against AI models
 * - Unauthorized AI model access
 * - Data exfiltration via AI services
 * - Anomalous AI usage patterns
 * - Credential misuse targeting AI resources
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  guardDutyAIApi,
  type GuardDutyAIFinding,
  type GuardDutyAIFindingsResponse,
  type GuardDutyAISeverity,
} from '../../api/client';

// ─────────────────────────── Types ───────────────────────────

export interface GuardDutyAISummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byCategory: Record<string, number>;
}

export interface GuardDutyAIFindingsResult {
  findings: GuardDutyAIFinding[];
  summary: GuardDutyAISummary;
  loading: boolean;
  isLive: boolean;
  source: string;
  error: string | null;
  refresh: () => void;
}

// ─────────────────────────── Mock Data ───────────────────────────

const MOCK_FINDINGS: GuardDutyAIFinding[] = [
  {
    id: 'gd-ai-001',
    type: 'UnauthorizedAccess:IAMUser/AnomalousBehavior',
    title: 'Anomalous Bedrock API access pattern detected',
    description: 'Unusual invocation pattern for Bedrock models from IAM user. High volume of requests outside normal business hours with elevated token consumption.',
    severity: 'HIGH',
    resource_type: 'AWS::Bedrock::Model',
    resource_id: 'anthropic.claude-3-sonnet-20240229-v1:0',
    region: 'us-east-1',
    service: 'bedrock',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    ai_category: 'anomalous_behavior',
    confidence: 85,
    account_id: '123456789012',
    investigate_url: 'https://console.aws.amazon.com/guardduty/home?region=us-east-1#/findings/gd-ai-001',
  },
  {
    id: 'gd-ai-002',
    type: 'Exfiltration:S3/AnomalousBehavior',
    title: 'Potential data exfiltration via AI model prompts',
    description: 'Large volumes of sensitive data detected in prompts sent to external AI model endpoint. Pattern consistent with data exfiltration through AI prompt injection.',
    severity: 'CRITICAL',
    resource_type: 'AWS::Bedrock::AgentRuntime',
    resource_id: 'agent-runtime-arn-12345',
    region: 'us-east-1',
    service: 'bedrock-agent-runtime',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    ai_category: 'data_exfiltration',
    confidence: 92,
    account_id: '123456789012',
    investigate_url: 'https://console.aws.amazon.com/guardduty/home?region=us-east-1#/findings/gd-ai-002',
  },
  {
    id: 'gd-ai-003',
    type: 'Impact:CredentialAccess/AnomalousBehavior',
    title: 'Attempted credential extraction via prompt injection',
    description: 'Model responses contained patterns indicating attempted extraction of AWS credentials or API keys. Blocked by guardrail but investigation recommended.',
    severity: 'HIGH',
    resource_type: 'AWS::Bedrock::Guardrail',
    resource_id: 'guardrail-fsi-standard',
    region: 'us-east-1',
    service: 'bedrock',
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 170).toISOString(),
    ai_category: 'prompt_injection',
    confidence: 78,
    account_id: '123456789012',
    investigate_url: 'https://console.aws.amazon.com/guardduty/home?region=us-east-1#/findings/gd-ai-003',
  },
  {
    id: 'gd-ai-004',
    type: 'UnauthorizedAccess:IAMRole/MaliciousIPCaller',
    title: 'SageMaker endpoint invoked from suspicious IP',
    description: 'SageMaker inference endpoint was invoked from an IP address associated with known malicious activity. Role session indicates potential credential compromise.',
    severity: 'MEDIUM',
    resource_type: 'AWS::SageMaker::Endpoint',
    resource_id: 'endpoint-fraud-detection-v2',
    region: 'us-west-2',
    service: 'sagemaker',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    ai_category: 'unauthorized_access',
    confidence: 72,
    account_id: '123456789012',
    investigate_url: 'https://console.aws.amazon.com/guardduty/home?region=us-west-2#/findings/gd-ai-004',
  },
  {
    id: 'gd-ai-005',
    type: 'Policy:IAMUser/RootCredentialUsage',
    title: 'Root credentials used for AI service access',
    description: 'AWS root account credentials were used to access Amazon Bedrock. Root credentials should not be used for day-to-day operations.',
    severity: 'MEDIUM',
    resource_type: 'AWS::IAM::Root',
    resource_id: 'root',
    region: 'us-east-1',
    service: 'bedrock',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
    ai_category: 'credential_access',
    confidence: 100,
    account_id: '123456789012',
    investigate_url: 'https://console.aws.amazon.com/guardduty/home?region=us-east-1#/findings/gd-ai-005',
  },
  {
    id: 'gd-ai-006',
    type: 'Behavior:EC2/Cryptomining.DNSRequest',
    title: 'AI workload EC2 instance contacting crypto mining pool',
    description: 'EC2 instance running ML training job made DNS requests to known cryptocurrency mining pools. Potential resource hijacking or compromised instance.',
    severity: 'LOW',
    resource_type: 'AWS::EC2::Instance',
    resource_id: 'i-0abc123def456',
    region: 'us-east-1',
    service: 'ec2',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString(),
    ai_category: 'model_abuse',
    confidence: 65,
    account_id: '123456789012',
    investigate_url: 'https://console.aws.amazon.com/guardduty/home?region=us-east-1#/findings/gd-ai-006',
  },
];

const MOCK_RESPONSE: GuardDutyAIFindingsResponse = {
  findings: MOCK_FINDINGS,
  total: MOCK_FINDINGS.length,
  by_severity: [
    { severity: 'CRITICAL', count: 1 },
    { severity: 'HIGH', count: 2 },
    { severity: 'MEDIUM', count: 2 },
    { severity: 'LOW', count: 1 },
  ],
  by_category: [
    { category: 'prompt_injection', count: 1 },
    { category: 'data_exfiltration', count: 1 },
    { category: 'anomalous_behavior', count: 1 },
    { category: 'unauthorized_access', count: 1 },
    { category: 'credential_access', count: 1 },
    { category: 'model_abuse', count: 1 },
  ],
  live: false,
  source: 'mock',
  note: 'Demo data - enable GuardDuty AI Protection for live findings',
};

// ─────────────────────────── Hook ───────────────────────────

export function useGuardDutyAIFindings(limit = 50): GuardDutyAIFindingsResult {
  const [data, setData] = useState<GuardDutyAIFindingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    guardDutyAIApi
      .findings(limit)
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      })
      .catch((err) => {
        // Fall back to mock data when API is unavailable
        if (!cancelled) {
          console.warn('GuardDuty AI API unavailable, using mock data:', err?.message);
          setData(MOCK_RESPONSE);
          setError(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [limit, refreshKey]);

  const summary = useMemo<GuardDutyAISummary>(() => {
    if (!data) {
      return { total: 0, critical: 0, high: 0, medium: 0, low: 0, byCategory: {} };
    }

    const bySeverity = data.by_severity.reduce(
      (acc, { severity, count }) => {
        const key = severity.toLowerCase() as keyof Omit<GuardDutyAISummary, 'total' | 'byCategory'>;
        if (key in acc) {
          acc[key] = count;
        }
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );

    const byCategory = data.by_category.reduce(
      (acc, { category, count }) => {
        acc[category] = count;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      total: data.total,
      ...bySeverity,
      byCategory,
    };
  }, [data]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    findings: data?.findings ?? [],
    summary,
    loading,
    isLive: data?.live ?? false,
    source: data?.source ?? 'unknown',
    error,
    refresh,
  };
}

export default useGuardDutyAIFindings;
