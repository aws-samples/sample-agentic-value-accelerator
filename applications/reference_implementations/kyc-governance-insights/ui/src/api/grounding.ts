import { cfgEnv } from '../runtimeConfig';
import { notConfigured, httpFailure, errorFailure, clearLiveFailure } from './liveStatus';
const GROUNDING_API_URL = cfgEnv('grounding_api_url', import.meta.env.VITE_GROUNDING_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export interface GroundingResult {
  action: 'NONE' | 'GUARDRAIL_INTERVENED';
  grounding_score: number | null;
  relevance_score: number | null;
  grounded: boolean;
  thresholds: { grounding: number; relevance: number };
}

export async function checkGrounding(
  groundingSource: string,
  query: string,
  responseText: string
): Promise<GroundingResult | null> {
  if (!GROUNDING_API_URL) return notConfigured('grounding', 'grounding_api_url');

  try {
    const res = await fetch(`${GROUNDING_API_URL}/check-grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({
        grounding_source: groundingSource,
        query: query,
        response_text: responseText,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return httpFailure('grounding', res, await res.text().catch(() => ''));
    const body = await res.json();
    clearLiveFailure('grounding');
    return body;
  } catch (err) {
    return errorFailure('grounding', err);
  }
}
