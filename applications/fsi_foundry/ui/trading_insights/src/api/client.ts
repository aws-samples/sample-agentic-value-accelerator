import type { RuntimeConfig } from '../config';
import type { InsightsResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: InsightsResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<InsightsResponse> {
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
        try { parsed = JSON.parse(parsed) as InsightsResponse; } catch { /* use as-is */ }
      }
      const raw = parsed as unknown as Record<string, unknown>;
      if (raw.error && !raw.insights_detail) {
        throw new Error(String(raw.error));
      }
      // Handle case where response is stuffed inside summary as JSON string
      if (!raw.insights_detail && typeof raw.summary === 'string' && raw.summary.startsWith('{')) {
        try { parsed = JSON.parse(raw.summary as string) as InsightsResponse; } catch { /* fall through */ }
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
  if (!isNaN(n)) return n;
  // Map qualitative strings
  const map: Record<string, number> = { strong_buy: 0.9, buy: 0.7, bullish: 0.7, neutral: 0.5, bearish: 0.3, sell: 0.3, strong_sell: 0.1, high: 0.8, medium: 0.5, low: 0.2 };
  return map[String(val).toLowerCase()] ?? 0;
}

function normalizeResponse(raw: InsightsResponse): InsightsResponse {
  const r = raw as unknown as Record<string, unknown>;
  const id = (r.insights_detail || {}) as Record<string, unknown>;
  const signals = Array.isArray(id.signals_identified) ? id.signals_identified : [];
  const opps = Array.isArray(id.cross_asset_opportunities) ? id.cross_asset_opportunities : [];
  const scenarios = Array.isArray(id.scenario_outcomes) ? id.scenario_outcomes : [];
  const recs = Array.isArray(r.recommendations) ? r.recommendations : [];

  return {
    entity_id: String(r.entity_id || r.customer_id || ''),
    assessment_id: String(r.assessment_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    insights_detail: r.insights_detail ? {
      signal_strength: toNum(id.signal_strength),
      scenario_likelihood: toNum(id.scenario_likelihood),
      confidence_score: toNum(id.confidence_score),
      signals_identified: signals.map((s: unknown) => typeof s === 'string'
        ? { name: s, type: 'NEUTRAL' as const, asset_class: '', strength: 0.5, description: s }
        : { name: String((s as Record<string, unknown>).name || ''), type: (String((s as Record<string, unknown>).type || 'NEUTRAL').toUpperCase() as 'BULLISH' | 'BEARISH' | 'NEUTRAL'), asset_class: String((s as Record<string, unknown>).asset_class || ''), strength: toNum((s as Record<string, unknown>).strength), description: String((s as Record<string, unknown>).description || '') }),
      cross_asset_opportunities: opps.map((o: unknown) => typeof o === 'string'
        ? { pair: o, correlation: 0, direction: 'LONG' as const, expected_return: 0, rationale: o }
        : { pair: String((o as Record<string, unknown>).pair || ''), correlation: toNum((o as Record<string, unknown>).correlation), direction: (String((o as Record<string, unknown>).direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT' | 'PAIR'), expected_return: toNum((o as Record<string, unknown>).expected_return), rationale: String((o as Record<string, unknown>).rationale || '') }),
      scenario_outcomes: scenarios.map((sc: unknown) => typeof sc === 'string'
        ? { scenario: sc, likelihood: 0.5, impact: 'MEDIUM' as const, expected_move: 0, description: sc }
        : { scenario: String((sc as Record<string, unknown>).scenario || ''), likelihood: toNum((sc as Record<string, unknown>).likelihood), impact: (String((sc as Record<string, unknown>).impact || 'MEDIUM').toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW'), expected_move: toNum((sc as Record<string, unknown>).expected_move), description: String((sc as Record<string, unknown>).description || '') }),
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
