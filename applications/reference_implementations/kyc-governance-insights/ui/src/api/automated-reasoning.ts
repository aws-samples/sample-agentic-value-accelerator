import { cfgEnv } from '../runtimeConfig';
import { notConfigured, httpFailure, errorFailure, clearLiveFailure } from './liveStatus';
const CEDAR_API = cfgEnv('cedar_api_url', import.meta.env.VITE_CEDAR_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export interface ARResult {
  verdict: 'VALID' | 'INVALID' | 'INSUFFICIENT_DATA';
  violations: Array<{ rule: string; explanation: string }>;
  checkedRules: number;
  latencyMs: number;
}

export async function checkAutomatedReasoning(text: string, sources?: string[]): Promise<ARResult | null> {
  if (!CEDAR_API) return notConfigured('automated-reasoning', 'cedar_api_url');
  try {
    const res = await fetch(`${CEDAR_API}/ar-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({ text, sources }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return httpFailure('automated-reasoning', res, await res.text().catch(() => ''));
    const body = await res.json();
    clearLiveFailure('automated-reasoning');
    return body;
  } catch (err) {
    return errorFailure('automated-reasoning', err);
  }
}
