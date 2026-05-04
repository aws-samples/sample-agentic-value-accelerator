import type { RuntimeConfig } from '../config';
import type { AdvisoryResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: AdvisoryResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<AdvisoryResponse> {
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
      let parsed = data.result;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed) as AdvisoryResponse; } catch { /* use as-is */ }
      }
      const raw = parsed as unknown as Record<string, unknown>;
      if (raw.error && !raw.portfolio_analysis && !raw.recommendations) {
        throw new Error(String(raw.error));
      }
      if (!raw.portfolio_analysis && !raw.recommendations && typeof raw.summary === 'string' && raw.summary.startsWith('{')) {
        try { parsed = JSON.parse(raw.summary as string) as AdvisoryResponse; } catch { /* fall through */ }
      }
      return normalizeResponse(parsed);
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

function normalizeResponse(raw: AdvisoryResponse): AdvisoryResponse {
  const r = raw as unknown as Record<string, unknown>;
  const pa = (r.portfolio_analysis || {}) as Record<string, unknown>;
  const recs = Array.isArray(r.recommendations) ? r.recommendations : [];

  let assetAlloc: Record<string, number> = {};
  if (Array.isArray(pa.asset_allocation)) {
    pa.asset_allocation.forEach((item: unknown, i: number) => { assetAlloc[typeof item === 'string' ? item : `asset_${i}`] = 0; });
  } else if (pa.asset_allocation && typeof pa.asset_allocation === 'object') {
    assetAlloc = Object.fromEntries(Object.entries(pa.asset_allocation as Record<string, unknown>).map(([k, v]) => [k, toNum(v)]));
  }

  return {
    client_id: String(r.client_id || r.entity_id || r.customer_id || ''),
    advisory_id: String(r.advisory_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    portfolio_analysis: r.portfolio_analysis ? {
      risk_level: (String(pa.risk_level || 'MODERATE').toUpperCase().replace(/ /g, '_') as 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'VERY_AGGRESSIVE'),
      asset_allocation: assetAlloc,
      performance_summary: typeof pa.performance_summary === 'string' ? pa.performance_summary : Array.isArray(pa.performance_summary) ? (pa.performance_summary as string[]).join('\n') : String(pa.performance_summary || ''),
      rebalancing_needed: Boolean(pa.rebalancing_needed),
      concentration_risks: Array.isArray(pa.concentration_risks) ? pa.concentration_risks.map(String) : [],
    } : null,
    recommendations: recs.length > 0 ? recs.map((rec: unknown) => typeof rec === 'string'
      ? { action: rec, rationale: rec, priority: 'MEDIUM' as const, asset_class: '' }
      : {
        action: String((rec as Record<string, unknown>).action || ''),
        rationale: String((rec as Record<string, unknown>).rationale || ''),
        priority: (String((rec as Record<string, unknown>).priority || 'MEDIUM').toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW'),
        asset_class: String((rec as Record<string, unknown>).asset_class || ''),
      }) : null,
    summary: String(r.summary || ''),
    raw_analysis: (r.raw_analysis || {}) as Record<string, { agent: string; [key: string]: unknown } | undefined>,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
