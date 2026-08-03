/**
 * Frontend client for AWS Agent Registry (the governed catalog of desk agents + MCP tools).
 *
 * All calls hit the ops-plane Lambda on the shared API Gateway, Cognito-authorized with the ID
 * token (carries cognito:groups so the backend can enforce the admin gate on curation). Search
 * is open to any authenticated user; curate (submit/approve/reject/deprecate) is admin-only and
 * rejected server-side for non-admins.
 */
import type { Auth, AppConfig } from './auth';

export interface RegistryRecord {
  record_id: string;
  name: string;
  description: string;
  descriptor_type: string;
  version: string;
  status: string; // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | DEPRECATED | CREATING
  updated_at?: string;
}

export interface RegistryList {
  configured: boolean;
  registry_id?: string;
  records: RegistryRecord[];
  error?: string;
  note?: string;
}

export interface SearchResponse {
  configured: boolean;
  query: string;
  results: RegistryRecord[];
  error?: string;
}

// `validate` is a read-only dry-run of the pre-onboarding admission checks; `submit` runs the
// SAME checks as a hard gate (a non-conforming descriptor can't leave DRAFT).
export type CurateAction = 'validate' | 'submit' | 'approve' | 'reject' | 'deprecate';

// One pre-onboarding admission check + the overall verdict (see registry.py _validate_descriptor).
export interface ValidationCheck { name: string; pass: boolean; detail: string; }
export interface Validation {
  ok: boolean;
  descriptor_type: string;
  checks: ValidationCheck[];
  reasons: string[];
}
export interface CurateResult {
  configured?: boolean;
  record_id?: string;
  action?: string;
  status?: string;
  by?: string;
  error?: string;
  validation?: Validation; // present on validate, a successful submit, AND a 422-blocked submit
}

async function authedFetch(auth: Auth, cfg: AppConfig, path: string, init?: RequestInit): Promise<any> {
  const resp = await fetch(`${cfg.API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.getIdToken()}`,
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!resp.ok) throw new Error(body?.error || `${resp.status} ${resp.statusText}`);
  return body;
}

export const registryApi = {
  list: (auth: Auth, cfg: AppConfig, status?: string): Promise<RegistryList> =>
    authedFetch(auth, cfg, `/registry${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  search: (auth: Auth, cfg: AppConfig, query: string): Promise<SearchResponse> =>
    authedFetch(auth, cfg, '/registry/search', { method: 'POST', body: JSON.stringify({ query }) }),
  // curate returns the parsed body even on a 422 (blocked submit) so the caller can render the
  // failed admission checks instead of a bare error string. Other non-2xx still throw.
  curate: async (auth: Auth, cfg: AppConfig, record_id: string, action: CurateAction, reason?: string): Promise<CurateResult> => {
    const resp = await fetch(`${cfg.API_URL}/registry/curate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.getIdToken()}` },
      body: JSON.stringify({ record_id, action, reason }),
    });
    const text = await resp.text();
    let body: CurateResult = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    // 422 = validation gate rejected the submit; return the body (has .validation) rather than throw.
    if (!resp.ok && resp.status !== 422) throw new Error(body?.error || `${resp.status} ${resp.statusText}`);
    return body;
  },
};
