import type { RuntimeConfig } from '../config';
import type { InsuranceResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: InsuranceResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<InsuranceResponse> {
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
      if (raw.error && !raw.needs_analysis && !raw.product_recommendations) {
        throw new Error(String(raw.error));
      }
      return normalizeResponse(data.result);
    }

    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Agent invocation failed');
    }
  }
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function toStr(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.join('\n');
  return String(val || '');
}

function normalizeResponse(raw: InsuranceResponse): InsuranceResponse {
  const r = raw as unknown as Record<string, unknown>;

  const na = (r.needs_analysis || {}) as Record<string, unknown>;
  const pr = (r.product_recommendations || {}) as Record<string, unknown>;
  const ua = (r.underwriting_assessment || {}) as Record<string, unknown>;

  return {
    entity_id: String(r.entity_id || r.customer_id || ''),
    assessment_id: String(r.assessment_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    needs_analysis: r.needs_analysis ? {
      life_stage: String(na.life_stage || ''),
      recommended_coverage: toNum(na.recommended_coverage),
      coverage_gap: toNum(na.coverage_gap),
      income_replacement_years: toNum(na.income_replacement_years),
      key_needs: Array.isArray(na.key_needs) ? na.key_needs.map(String) : [],
      notes: toStr(na.notes),
    } : null,
    product_recommendations: r.product_recommendations ? {
      primary_product: String(pr.primary_product || ''),
      recommended_products: Array.isArray(pr.recommended_products) ? pr.recommended_products.map(String) : [],
      coverage_amount: toNum(pr.coverage_amount),
      estimated_premium: toNum(pr.estimated_premium),
      comparison_notes: toStr(pr.comparison_notes),
      notes: toStr(pr.notes),
    } : null,
    underwriting_assessment: r.underwriting_assessment ? {
      risk_category: String(ua.risk_category || ''),
      confidence_score: toNum(ua.confidence_score),
      health_factors: Array.isArray(ua.health_factors) ? ua.health_factors.map(String) : [],
      lifestyle_factors: Array.isArray(ua.lifestyle_factors) ? ua.lifestyle_factors.map(String) : [],
      recommended_actions: Array.isArray(ua.recommended_actions) ? ua.recommended_actions.map(String) : [],
      notes: toStr(ua.notes),
    } : null,
    summary: String(r.summary || ''),
    raw_analysis: (r.raw_analysis || {}) as Record<string, { agent: string; [key: string]: unknown } | undefined>,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
