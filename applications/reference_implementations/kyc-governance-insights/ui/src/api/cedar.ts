import { cfgEnv } from '../runtimeConfig';
import { notConfigured, httpFailure, errorFailure, clearLiveFailure } from './liveStatus';
const CEDAR_API = cfgEnv('cedar_api_url', import.meta.env.VITE_CEDAR_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export interface CedarPolicyLive {
  policyId: string;
  policyType: string;
  principal: string;
  action: string;
  resource: string;
  effect: string;
  description?: string;
  createdDate?: string;
}

export interface EvalResult {
  decision: 'ALLOW' | 'DENY';
  reasons: string[];
}

export interface PolicyEvalTrace {
  requestId: string;
  timestamp: string;
  principal: string;
  action: string;
  decision: string;
  policyIds: string[];
}

export async function fetchLivePolicies(): Promise<CedarPolicyLive[] | null> {
  if (!CEDAR_API) return null;
  const res = await fetch(`${CEDAR_API}/policies`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}

export async function evaluatePolicy(principal: string, action: string, resource: object): Promise<EvalResult | null> {
  if (!CEDAR_API) return null;
  const res = await fetch(`${CEDAR_API}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID },
    body: JSON.stringify({ principal, action, resource }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  return res.json();
}

export interface AuthzResult {
  decision: 'ALLOW' | 'DENY';
  reasons: string[];
}

/**
 * Live Cedar authorization via the cedar-proxy /evaluate passthrough to AVP is-authorized.
 * Send the full is-authorized shape ({ principal, action, resource, entities, context }).
 * Returns null on missing config, non-2xx, or timeout — callers fall back to staged values.
 *
 * SHADOW / display-only (deliberate): the result drives UI badges + the Cedar what-if;
 * it NEVER gates or aborts the agent response. Runtime decision-enforcement lives in the
 * backend governance cascade (governance.py), not here. Do not make a DENY block the flow.
 * See docs/DESIGN_DECISION_CEDAR_SHADOW_MODE.md.
 */
export async function evaluateAuthorization(payload: object): Promise<AuthzResult | null> {
  if (!CEDAR_API) return notConfigured('cedar', 'cedar_api_url');
  try {
    const res = await fetch(`${CEDAR_API}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return httpFailure('cedar', res, await res.text().catch(() => ''));
    const body = await res.json();
    clearLiveFailure('cedar');
    return body;
  } catch (err) {
    return errorFailure('cedar', err);
  }
}

export async function fetchPolicyTraces(limit = 50): Promise<PolicyEvalTrace[] | null> {
  if (!CEDAR_API) return null;
  const res = await fetch(`${CEDAR_API}/traces?limit=${limit}`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}
