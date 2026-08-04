/**
 * useCostAnomalies — specialized hook for Cost Explorer anomaly detection
 * focused on shadow AI spend detection.
 *
 * Extends useAwsCostDetail with:
 * - AI service filtering (Bedrock, SageMaker, etc.)
 * - Severity classification
 * - Alert thresholds
 * - Shadow AI correlation signals
 */
import { useMemo } from 'react';
import { useAwsCostDetail } from './useAwsCost';
import type { AwsCostAnomaly } from '../../api/client';

// AI services monitored for shadow AI detection
export const AI_SERVICES = [
  'Bedrock',
  'SageMaker',
  'Amazon Q',
  'Comprehend',
  'Rekognition',
  'Textract',
  'Polly',
  'Transcribe',
  'Translate',
  'Lex',
] as const;

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ClassifiedAnomaly extends AwsCostAnomaly {
  id: string;
  severity: AnomalySeverity;
  isAiService: boolean;
}

/**
 * Classify anomaly severity based on score and dollar impact.
 * Higher scores indicate stronger statistical confidence.
 */
export function classifyAnomaly(score: number, impact: number): AnomalySeverity {
  // Critical: very high confidence (>90%) OR very high dollar impact (>$5000)
  if (score >= 0.9 || impact >= 5000) return 'critical';
  // High: high confidence (>75%) OR significant dollar impact (>$1000)
  if (score >= 0.75 || impact >= 1000) return 'high';
  // Medium: moderate confidence (>50%) OR notable dollar impact (>$200)
  if (score >= 0.5 || impact >= 200) return 'medium';
  // Low: lower confidence anomalies
  return 'low';
}

/**
 * Check if a service name matches any known AI service.
 */
export function isAiService(serviceName: string | undefined | null): boolean {
  if (!serviceName) return false;
  const lower = serviceName.toLowerCase();
  return AI_SERVICES.some(svc => lower.includes(svc.toLowerCase()));
}

export interface UseCostAnomaliesResult {
  /** Loading state */
  loading: boolean;
  /** Whether anomaly data is live from Cost Explorer */
  live: boolean;
  /** All anomalies with classification */
  anomalies: ClassifiedAnomaly[];
  /** Anomalies filtered to AI services only */
  aiAnomalies: ClassifiedAnomaly[];
  /** Critical and high severity anomalies (need investigation) */
  alertAnomalies: ClassifiedAnomaly[];
  /** Total count of AI anomalies */
  count: number;
  /** Total dollar impact of AI anomalies */
  totalImpact: number;
  /** Count by severity */
  bySeverity: Record<AnomalySeverity, number>;
  /** Whether there are active alerts (critical or high severity) */
  hasAlerts: boolean;
  /** Average anomaly score */
  avgScore: number;
}

/**
 * Hook for fetching and analyzing cost anomalies with shadow AI focus.
 *
 * @param days - Number of days to look back (default 60)
 * @param aiOnly - If true, only return AI service anomalies (default true)
 */
export function useCostAnomalies(days = 60, aiOnly = true): UseCostAnomaliesResult {
  const { loading, anomalies: rawAnomalies } = useAwsCostDetail(30, 3, days, 6);

  // Classify and enrich all anomalies
  const anomalies: ClassifiedAnomaly[] = useMemo(() => {
    const raw = rawAnomalies?.anomalies ?? [];
    return raw.map((a, i) => ({
      ...a,
      id: `anom-${i}-${a.start}`,
      severity: classifyAnomaly(a.score, a.impact),
      isAiService: isAiService(a.service),
    }));
  }, [rawAnomalies]);

  // Filter to AI services
  const aiAnomalies = useMemo(
    () => anomalies.filter(a => a.isAiService).sort((a, b) => b.impact - a.impact),
    [anomalies],
  );

  // Alert-level anomalies (critical + high)
  const alertAnomalies = useMemo(
    () => aiAnomalies.filter(a => a.severity === 'critical' || a.severity === 'high'),
    [aiAnomalies],
  );

  // Count by severity
  const bySeverity = useMemo(() => {
    const result: Record<AnomalySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const source = aiOnly ? aiAnomalies : anomalies;
    source.forEach(a => { result[a.severity]++; });
    return result;
  }, [anomalies, aiAnomalies, aiOnly]);

  // Aggregates
  const source = aiOnly ? aiAnomalies : anomalies;
  const totalImpact = source.reduce((sum, a) => sum + a.impact, 0);
  const avgScore = source.length > 0
    ? source.reduce((sum, a) => sum + a.score, 0) / source.length
    : 0;

  return {
    loading,
    live: !!rawAnomalies?.live,
    anomalies,
    aiAnomalies,
    alertAnomalies,
    count: source.length,
    totalImpact,
    bySeverity,
    hasAlerts: alertAnomalies.length > 0,
    avgScore,
  };
}

export default useCostAnomalies;
