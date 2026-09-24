import type { PolicyParams } from '../data/autonomyProfiles';
import { PROFILES, DEFAULT_PROFILE } from '../data/autonomyProfiles';
import { cfgEnv } from '../runtimeConfig';

export interface ChangeLogEntry {
  timestamp: string;
  user: string;
  action: 'profile_switch' | 'param_update' | 'intervention';
  from: string;
  to: string;
}

// Server-side policy-config endpoint (DDB-backed, via the origin-verify-authed
// policy-config proxy). Same-origin `/svc/policy-config` through CloudFront by
// default; overridable via runtime-config / VITE for standalone dev.
const POLICY_CONFIG_API = cfgEnv('policy_config_api_url', import.meta.env.VITE_POLICY_CONFIG_API_URL) || '/svc/policy-config';
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

// The source of truth is the policy-config service (DynamoDB). This module keeps
// ONLY an in-memory cache — never localStorage (invariant #4: governance/policy
// state must not live in the browser). The cache backs the synchronous getters
// the context uses for first render; `refresh()` populates it from the server and
// it is discarded on reload (server is re-read).
let _cache: { profileId: string; params: PolicyParams } = {
  profileId: DEFAULT_PROFILE.id,
  params: { ...DEFAULT_PROFILE.params },
};
let _changeLog: ChangeLogEntry[] = [];

function isOffline(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('offline');
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
  };
}

function appendLog(entry: Omit<ChangeLogEntry, 'timestamp' | 'user'>) {
  _changeLog = [{ ...entry, timestamp: new Date().toISOString(), user: 'presenter' }, ..._changeLog].slice(0, 50);
}

/** Load the active config from the server into the in-memory cache. Safe to call
 *  on mount; never throws (an unreachable server leaves the current cache intact). */
export async function refresh(): Promise<void> {
  if (isOffline()) return;
  try {
    const res = await fetch(POLICY_CONFIG_API, { headers: headers(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.params) {
      _cache = { profileId: data.profileId || 'custom', params: data.params as PolicyParams };
    }
  } catch {
    /* keep in-memory cache; server is source of truth only when reachable */
  }
}

export async function applyProfile(profileId: string): Promise<{ success: boolean; latencyMs: number }> {
  const profile = PROFILES.find(p => p.id === profileId);
  if (!profile) return { success: false, latencyMs: 0 };
  const prev = _cache.profileId;
  const t0 = Date.now();
  if (!isOffline()) {
    try {
      const res = await fetch(POLICY_CONFIG_API, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ profileId, params: profile.params, user: 'presenter' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { success: false, latencyMs: Date.now() - t0 };
    } catch {
      return { success: false, latencyMs: Date.now() - t0 };
    }
  }
  _cache = { profileId: profile.id, params: { ...profile.params } };
  appendLog({ action: 'profile_switch', from: prev, to: profileId });
  return { success: true, latencyMs: Date.now() - t0 };
}

export async function updateParam(key: keyof PolicyParams, value: number | boolean): Promise<{ success: boolean }> {
  const prev = String(_cache.params[key]);
  const params = { ...(_cache.params as unknown as Record<string, unknown>), [key]: value } as unknown as PolicyParams;
  if (!isOffline()) {
    try {
      const res = await fetch(POLICY_CONFIG_API, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ profileId: 'custom', params, user: 'presenter' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { success: false };
    } catch {
      return { success: false };
    }
  }
  _cache = { profileId: 'custom', params };
  appendLog({ action: 'param_update', from: `${key}=${prev}`, to: `${key}=${value}` });
  return { success: true };
}

export function getActiveConfig(): { profileId: string; params: PolicyParams } {
  return _cache;
}

export function getChangeLog(): ChangeLogEntry[] {
  return _changeLog;
}
