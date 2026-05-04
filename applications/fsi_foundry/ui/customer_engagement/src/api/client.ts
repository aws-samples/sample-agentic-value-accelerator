import type { RuntimeConfig } from '../config';
import type { EngagementResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: EngagementResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<EngagementResponse> {
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
      const raw = data.result as unknown as Record<string, unknown>;
      if (raw.error && !raw.churn_prediction) {
        throw new Error(String(raw.error));
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

function toStr(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.join('\n');
  return String(val || '');
}

function normalizeResponse(raw: EngagementResponse): EngagementResponse {
  const r = { ...raw } as unknown as Record<string, unknown>;

  const cp = (r.churn_prediction || {}) as Record<string, unknown>;
  const op = (r.outreach_plan || {}) as Record<string, unknown>;
  const pr = (r.policy_recommendations || {}) as Record<string, unknown>;

  const riskMap: Record<string, string> = { low: 'LOW', moderate: 'MEDIUM', medium: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL' };

  return {
    customer_id: String(r.customer_id || ''),
    engagement_id: String(r.engagement_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    churn_prediction: {
      risk_level: riskMap[String(cp.risk_level || '').toLowerCase()] || String(cp.risk_level || 'UNKNOWN'),
      churn_probability: toNumber(cp.churn_probability),
      risk_factors: Array.isArray(cp.risk_factors) ? cp.risk_factors.map(String) : [],
      behavioral_signals: Array.isArray(cp.behavioral_signals) ? cp.behavioral_signals.map(String) : [],
      retention_window_days: toNumber(cp.retention_window_days),
      notes: toStr(cp.notes),
    },
    outreach_plan: {
      recommended_channel: String(op.recommended_channel || ''),
      secondary_channels: Array.isArray(op.secondary_channels) ? op.secondary_channels.map(String) : [],
      messaging_theme: String(op.messaging_theme || ''),
      talking_points: Array.isArray(op.talking_points) ? op.talking_points.map(String) : [],
      optimal_timing: String(op.optimal_timing || ''),
      personalization_elements: Array.isArray(op.personalization_elements) ? op.personalization_elements.map(String) : [],
      notes: toStr(op.notes),
    },
    policy_recommendations: {
      recommended_actions: Array.isArray(pr.recommended_actions) ? pr.recommended_actions.map((a: unknown) => String(a).replace(/_/g, ' ')) : [],
      coverage_adjustments: Array.isArray(pr.coverage_adjustments) ? pr.coverage_adjustments.map(String) : [],
      bundling_opportunities: Array.isArray(pr.bundling_opportunities) ? pr.bundling_opportunities.map(String) : [],
      estimated_savings: typeof pr.estimated_savings === 'number' ? `$${pr.estimated_savings.toFixed(2)}/yr` : String(pr.estimated_savings || ''),
      value_improvements: Array.isArray(pr.value_improvements) ? pr.value_improvements.map(String) : [],
      notes: toStr(pr.notes),
    },
    summary: String(r.summary || ''),
    raw_analysis: (r.raw_analysis || {}) as Record<string, { agent: string; customer_id?: string; analysis?: string; assessment?: string; [key: string]: unknown } | undefined>,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
