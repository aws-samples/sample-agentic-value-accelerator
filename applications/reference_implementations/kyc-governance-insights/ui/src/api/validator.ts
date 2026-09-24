import { cfgEnv } from '../runtimeConfig';
import { notConfigured, httpFailure, errorFailure, clearLiveFailure } from './liveStatus';

const VALIDATOR_API = cfgEnv('validator_api_url', import.meta.env.VITE_VALIDATOR_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export interface ValidatorCheck {
  name: string;
  recomputed: number;
  threshold: string | null;
  passed: boolean;
  claim_matches: boolean;
}

export interface ValidatorResult {
  verdict: 'PASS' | 'FAIL';
  recomputed: Record<string, number>;
  checks: ValidatorCheck[];
  mismatches: { metric: string; claimed: number; recomputed: number }[];
  checked: number;
  engine?: string;
}

/**
 * Deterministic financial validator — a real, non-AI Lambda that RECOMPUTES the
 * ratios from raw inputs and independently checks them against the agent's claimed
 * figures. Not a stored verdict: identical inputs always give identical output, so
 * it matches the scripted numbers while genuinely computing them. Returns null on
 * missing config / non-2xx / timeout → callers fall back to the scripted story. The reason is
 * recorded via liveStatus so the caller can show that the figures on screen are scripted
 * rather than verified — a null must never pass for a successful check.
 */
export async function checkDeterministic(raw: object, claimed: object): Promise<ValidatorResult | null> {
  if (!VALIDATOR_API) return notConfigured('validator', 'validator_api_url');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${VALIDATOR_API}/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw, claimed }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return httpFailure('validator', res, await res.text().catch(() => ''));
    const body = await res.json();
    clearLiveFailure('validator');
    return body;
  } catch (err) {
    return errorFailure('validator', err);
  }
}
