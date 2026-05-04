import type { RuntimeConfig } from '../config';
import type { AnalyticsResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: AnalyticsResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<AnalyticsResponse> {
  const invokeRes = await fetch(config.api_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!invokeRes.ok) {
    const text = await invokeRes.text();
    throw new Error(text || `Request failed with status ${invokeRes.status}`);
  }

  const { session_id } = (await invokeRes.json()) as InvokeResponse;

  const baseUrl = config.api_endpoint.replace(/\/invoke$/, '');
  const statusUrl = `${baseUrl}/status/${session_id}`;

  while (true) {
    await sleep(2000);

    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) {
      throw new Error(`Status check failed with ${statusRes.status}`);
    }

    const data = (await statusRes.json()) as StatusResponse;

    if (data.status === 'COMPLETE' && data.result) {
      const result = data.result as unknown as Record<string, unknown>;
      if (result.error && !result.call_monitoring) {
        throw new Error(String(result.error));
      }
      return normalizeResponse(data.result);
    }

    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Agent invocation failed');
    }
  }
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

const qualityMap: Record<string, number> = {
  excellent: 0.95, good: 0.8, fair: 0.6, poor: 0.35, very_poor: 0.15,
};
const sentimentMap: Record<string, number> = {
  very_positive: 0.9, positive: 0.6, neutral: 0.0, negative: -0.5, very_negative: -0.9,
};

function normalizeResponse(raw: AnalyticsResponse): AnalyticsResponse {
  const r = { ...raw };

  if (r.call_monitoring) {
    const cm = r.call_monitoring as unknown as Record<string, unknown>;
    r.call_monitoring = {
      overall_quality: typeof cm.overall_quality === 'string' && cm.overall_quality in qualityMap
        ? qualityMap[cm.overall_quality]
        : toNumber(cm.overall_quality),
      average_sentiment: typeof cm.average_sentiment === 'string' && cm.average_sentiment in sentimentMap
        ? sentimentMap[cm.average_sentiment]
        : toNumber(cm.average_sentiment),
      compliance_score: toNumber(cm.compliance_score),
      calls_reviewed: toNumber(cm.calls_reviewed),
      quality_issues: Array.isArray(cm.quality_issues)
        ? cm.quality_issues.map((q: unknown) => typeof q === 'string' ? { severity: 'medium', description: q, call_id: '' } : q as { severity: string; description: string; call_id: string })
        : [],
      compliance_violations: Array.isArray(cm.compliance_violations)
        ? cm.compliance_violations.map((v: unknown) => typeof v === 'string' ? { regulation: 'Policy', description: v, call_id: '' } : v as { regulation: string; description: string; call_id: string })
        : [],
      notes: Array.isArray(cm.notes) ? (cm.notes as string[]).join('\n') : String(cm.notes || ''),
    };
  }

  if (r.performance_metrics) {
    const pm = r.performance_metrics as unknown as Record<string, unknown>;
    r.performance_metrics = {
      ...r.performance_metrics,
      average_handle_time: toNumber(pm.average_handle_time),
      first_call_resolution_rate: toNumber(pm.first_call_resolution_rate),
      customer_satisfaction_score: toNumber(pm.customer_satisfaction_score),
      notes: Array.isArray(pm.notes) ? (pm.notes as string[]).join('\n') : String(pm.notes || ''),
    };
  }

  if (r.operational_insights) {
    const oi = r.operational_insights as unknown as Record<string, unknown>;
    r.operational_insights = {
      ...r.operational_insights,
      notes: Array.isArray(oi.notes) ? (oi.notes as string[]).join('\n') : String(oi.notes || ''),
    };
  }

  return r;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
