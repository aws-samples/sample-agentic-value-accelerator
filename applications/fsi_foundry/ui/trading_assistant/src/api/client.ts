import type { RuntimeConfig } from '../config';
import type { TradingResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: TradingResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<TradingResponse> {
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
        try { parsed = JSON.parse(parsed) as TradingResponse; } catch { /* use as-is */ }
      }
      const raw = parsed as unknown as Record<string, unknown>;
      if (raw.error && !raw.market_analysis) {
        throw new Error(String(raw.error));
      }
      if (!raw.market_analysis && typeof raw.summary === 'string' && raw.summary.startsWith('{')) {
        try { parsed = JSON.parse(raw.summary as string) as TradingResponse; } catch { /* fall through */ }
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

function normalizeResponse(raw: TradingResponse): TradingResponse {
  const r = raw as unknown as Record<string, unknown>;
  const ma = (r.market_analysis || {}) as Record<string, unknown>;
  const keyLevels = Array.isArray(ma.key_levels) ? ma.key_levels : [];
  const tradeIdeas = Array.isArray(ma.trade_ideas) ? ma.trade_ideas : [];
  const recs = Array.isArray(r.recommendations) ? r.recommendations : [];

  return {
    entity_id: String(r.entity_id || r.customer_id || ''),
    research_id: String(r.research_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    market_analysis: r.market_analysis ? {
      condition: (String(ma.condition || 'NEUTRAL').toUpperCase() as 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE'),
      urgency: (String(ma.urgency || 'MEDIUM').toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW'),
      confidence_score: toNum(ma.confidence_score),
      key_levels: keyLevels.map((kl: unknown) => typeof kl === 'string'
        ? { price: kl, type: 'level', significance: 'medium' }
        : { price: String((kl as Record<string, unknown>).price || ''), type: String((kl as Record<string, unknown>).type || ''), significance: String((kl as Record<string, unknown>).significance || '') }),
      trade_ideas: tradeIdeas.map((ti: unknown) => typeof ti === 'string'
        ? { instrument: ti, direction: '', entry: '', target: '', stop_loss: '', risk_reward: '', conviction: '', rationale: ti }
        : { instrument: String((ti as Record<string, unknown>).instrument || ''), direction: String((ti as Record<string, unknown>).direction || ''), entry: String((ti as Record<string, unknown>).entry || ''), target: String((ti as Record<string, unknown>).target || ''), stop_loss: String((ti as Record<string, unknown>).stop_loss || ''), risk_reward: String((ti as Record<string, unknown>).risk_reward || ''), conviction: String((ti as Record<string, unknown>).conviction || ''), rationale: String((ti as Record<string, unknown>).rationale || '') }),
      execution_notes: Array.isArray(ma.execution_notes) ? ma.execution_notes.map(String) : [],
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
