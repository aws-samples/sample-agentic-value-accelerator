import type { RuntimeConfig } from '../config';
import type { ScreeningResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: ScreeningResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<ScreeningResponse> {
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
        try { parsed = JSON.parse(parsed) as ScreeningResponse; } catch { /* use as-is */ }
      }
      const raw = parsed as unknown as Record<string, unknown>;
      if (raw.error && !raw.media_findings && !raw.risk_signals) {
        throw new Error(String(raw.error));
      }
      if (!raw.media_findings && !raw.risk_signals && typeof raw.summary === 'string' && raw.summary.startsWith('{')) {
        try { parsed = JSON.parse(raw.summary as string) as ScreeningResponse; } catch { /* fall through */ }
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

function normalizeResponse(raw: ScreeningResponse): ScreeningResponse {
  const r = raw as unknown as Record<string, unknown>;
  const mf = (r.media_findings || {}) as Record<string, unknown>;
  const signals = Array.isArray(r.risk_signals) ? r.risk_signals : [];

  return {
    entity_id: String(r.entity_id || r.customer_id || ''),
    screening_id: String(r.screening_id || r.session_id || ''),
    timestamp: String(r.timestamp || ''),
    media_findings: r.media_findings ? {
      articles_screened: toNum(mf.articles_screened),
      adverse_mentions: toNum(mf.adverse_mentions),
      sentiment: (String(mf.sentiment || 'NEUTRAL').toUpperCase() as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED'),
      categories: Array.isArray(mf.categories) ? mf.categories.map(String) : [],
      key_findings: Array.isArray(mf.key_findings) ? mf.key_findings.map(String) : [],
      sources: Array.isArray(mf.sources) ? mf.sources.map(String) : [],
    } : null,
    risk_signals: signals.length > 0 ? signals.map((s: unknown) => typeof s === 'string'
      ? { signal_type: s, severity: 'MEDIUM' as const, confidence: 0.5, description: s, source_references: [], entity_linkage: '' }
      : {
        signal_type: String((s as Record<string, unknown>).signal_type || ''),
        severity: (String((s as Record<string, unknown>).severity || 'MEDIUM').toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'),
        confidence: toNum((s as Record<string, unknown>).confidence),
        description: String((s as Record<string, unknown>).description || ''),
        source_references: Array.isArray((s as Record<string, unknown>).source_references) ? ((s as Record<string, unknown>).source_references as unknown[]).map(String) : [],
        entity_linkage: String((s as Record<string, unknown>).entity_linkage || ''),
      }) : null,
    summary: String(r.summary || ''),
    raw_analysis: (r.raw_analysis || {}) as Record<string, { agent: string; [key: string]: unknown } | undefined>,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
