export interface RegistryAgent {
  agent_id: string;
  name: string;
  tier: number;
  status: string;
  last_evaluation_score: number;
  total_sessions: number;
  owner: string;
  escalation_to: string;
}

import { cfgEnv } from '../runtimeConfig';
import { notConfigured, httpFailure, errorFailure, clearLiveFailure } from './liveStatus';
const REGISTRY_API = cfgEnv('registry_api_url', import.meta.env.VITE_REGISTRY_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export async function fetchAgentRegistry(): Promise<RegistryAgent[] | null> {
  if (!REGISTRY_API) return notConfigured('registry', 'registry_api_url');
  try {
    // Registry proxy exposes /agents (there is no /registry route). Requires api key + tenant.
    const headers: Record<string, string> = { 'x-tenant-id': TENANT_ID };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${REGISTRY_API}/agents`, { signal: AbortSignal.timeout(8000), headers });
    if (!res.ok) return httpFailure('registry', res, await res.text().catch(() => ''));
    const data = await res.json();
    clearLiveFailure('registry');
    return (data.agents ?? data) as RegistryAgent[];
  } catch (err) {
    return errorFailure('registry', err);
  }
}
