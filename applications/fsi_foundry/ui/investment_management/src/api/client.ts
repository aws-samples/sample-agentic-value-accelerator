import type { RuntimeConfig } from '../config';
import type { ManagementResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: ManagementResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<ManagementResponse> {
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
        try { parsed = JSON.parse(parsed) as ManagementResponse; } catch { /* use as-is */ }
      }
      const raw = parsed as unknown as Record<string, unknown>;
      if (raw.error && !raw.portfolio_analysis) {
        throw new Error(String(raw.error));
      }
      if (!raw.portfolio_analysis && typeof raw.summary === 'string' && raw.summary.startsWith('{')) {
        try { parsed = JSON.parse(raw.summary as string) as ManagementResponse; } catch { /* fall through */ }
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

function normalizeResponse(raw: ManagementResponse): ManagementResponse {
  const r = raw as unknown as Record<string, unknown>;
  const pa = (r.portfolio_analysis || {}) as Record<string, unknown>;
  const trades = Array.isArray(pa.trade_recommendations) ? pa.trade_recommendations : [];
  let attrFactors: Record<string, number> = {};
  if (Array.isArray(pa.attribution_factors)) {
    pa.attribution_factors.forEach((item: unknown, i: number) => { attrFactors[typeof item === 'string' ? item : `factor_${i}`] = 0; });
  } else if (pa.attribution_factors && typeof pa.attribution_factors === 'object') {
    attrFactors = Object.fromEntries(Object.entries(pa.attribution_factors as Record<string, unknown>).map(([k, v]) => [k, toNum(v)]));
  }
  const recs = Array.isArray(r.recommendations) ? r.recommendations : [];

  return {
    entity_id: String(r.entity_id || r.customer_id || ''),
    assessment_id: String(r.assessment_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    portfolio_analysis: r.portfolio_analysis ? {
      risk_profile: (String(pa.risk_profile || 'MODERATE').toUpperCase() as 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'ULTRA_AGGRESSIVE'),
      rebalance_urgency: (String(pa.rebalance_urgency || 'LOW').toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'),
      drift_pct: toNum(pa.drift_pct),
      allocation_score: toNum(pa.allocation_score),
      attribution_factors: attrFactors,
      trade_recommendations: trades.map((t: unknown) => typeof t === 'string'
        ? { action: 'HOLD' as const, asset: t, weight_current: 0, weight_target: 0, rationale: t }
        : { action: (String((t as Record<string, unknown>).action || 'HOLD').toUpperCase() as 'BUY' | 'SELL' | 'HOLD'), asset: String((t as Record<string, unknown>).asset || ''), weight_current: toNum((t as Record<string, unknown>).weight_current), weight_target: toNum((t as Record<string, unknown>).weight_target), rationale: String((t as Record<string, unknown>).rationale || '') }),
    } : null,
    recommendations: recs.length > 0 ? recs.map((rec: unknown) => typeof rec === 'string'
      ? { title: rec, rationale: rec, confidence: 0.5, timeframe: '' }
      : { title: String((rec as Record<string, unknown>).title || ''), rationale: String((rec as Record<string, unknown>).rationale || ''), confidence: toNum((rec as Record<string, unknown>).confidence), timeframe: String((rec as Record<string, unknown>).timeframe || '') }) : null,
    summary: String(r.summary || ''),
    raw_analysis: (r.raw_analysis || {}) as Record<string, { agent: string; [key: string]: unknown } | undefined>,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
