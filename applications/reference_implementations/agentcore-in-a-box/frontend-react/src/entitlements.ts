/**
 * Frontend entitlements client + types for the admin-managed RBAC layer.
 *
 * The catalog (tool/desk/cred definitions) is fetched from the backend (/admin/catalog) so
 * this file never duplicates agent/entitlements.py — the backend is the single source of truth.
 * This module only owns the HTTP calls, the WS push subscription, and the small React hook that
 * gives every screen the caller's live effective entitlements.
 */
import type { Auth, AppConfig } from './auth';

export type Grants = Record<string, boolean>;
/** {key: epoch-seconds} for still-live time-boxed grants (JIT access), per dimension. A key
 * absent here is a STANDING grant (never lapses). Surfaced by the backend for UI countdowns. */
export type Expiries = Record<string, number>;

export interface Effective {
  managed: boolean;
  /** The `agents` dimension has its OWN managed flag: fail-open (all specialists) until an admin
   * first scopes it, so deploying per-agent access never strips specialists from existing users. */
  agents_managed?: boolean;
  tools: Grants;
  desks: Grants;
  creds: Grants;
  agents: Grants;
  /** Per-dimension still-live expiries (for "expires in Xm" countdowns). */
  expiries?: { tools?: Expiries; desks?: Expiries; creds?: Expiries; agents?: Expiries };
}

export interface ToolDef {
  label: string; group: string; gateway_action: string | null; sensitive: boolean; pillar: string;
}
export interface DeskDef { label: string; firm: string; }
export interface CredDef { label: string; flow: string; provider_env: string; tools: string[]; }
/** A per-desk specialist the admin may grant a user to invoke. Key is compound `desk::rosterKey`. */
export interface AgentDef { desk: string; key: string; label: string; sensitive: boolean; }

export interface Catalog {
  tools: Record<string, ToolDef>;
  desks: Record<string, DeskDef>;
  creds: Record<string, CredDef>;
  agents: Record<string, AgentDef>;
  admin_group: string;
  grant_ttl?: { default: number; max: number; break_glass: number };
}

export interface UserPrincipal {
  principal: string; sub: string; email: string; groups: string[];
  is_admin: boolean; entitlements: Effective;
}
export interface AgentPrincipal {
  principal: string; name: string; entitlements: Effective;
}

export interface MeResponse {
  principal: string; email: string; is_admin: boolean; entitlements: Effective;
}

export type GrantKind = 'tools' | 'desks' | 'creds' | 'agents';

/** True if the effective view allows a key of the given kind (mirrors entitlements.allows).
 * The backend already collapses expired grants to false in the effective view, so this trusts
 * eff[kind][key]; it only re-implements the two fail-open rules the backend uses. */
export function allows(eff: Effective | null | undefined, kind: GrantKind, key: string): boolean {
  if (!eff) return true;
  if (kind === 'agents') {
    if (!eff.agents_managed) return true; // agents dimension not yet scoped → fail-open
    return !!eff.agents?.[key];
  }
  if (!eff.managed) return true; // unmanaged principal → fail-open (matches backend)
  return !!eff[kind]?.[key];
}

/** The still-live expiry epoch (seconds) for a grant, or null for a standing grant / no grant. */
export function expiresAt(eff: Effective | null | undefined, kind: GrantKind, key: string): number | null {
  const e = eff?.expiries?.[kind]?.[key];
  return typeof e === 'number' && e > 0 ? e : null;
}

/** A short human "expires in 2h 14m" / "expires in 45s" from an epoch-seconds timestamp. */
export function formatExpiresIn(epochSeconds: number, nowMs = Date.now()): string {
  let secs = Math.max(0, Math.round(epochSeconds - nowMs / 1000));
  if (secs <= 0) return 'expired';
  const d = Math.floor(secs / 86400); secs -= d * 86400;
  const h = Math.floor(secs / 3600); secs -= h * 3600;
  const m = Math.floor(secs / 60); const s = secs - m * 60;
  if (d > 0) return `expires in ${d}d ${h}h`;
  if (h > 0) return `expires in ${h}h ${m}m`;
  if (m > 0) return `expires in ${m}m`;
  return `expires in ${s}s`;
}

async function authedFetch(auth: Auth, cfg: AppConfig, path: string, init?: RequestInit): Promise<any> {
  const resp = await fetch(`${cfg.API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.getIdToken()}`, // ID token carries cognito:groups + email
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!resp.ok) {
    const msg = body?.error || `${resp.status} ${resp.statusText}`;
    throw new Error(msg);
  }
  return body;
}

export const entitlementsApi = {
  me: (auth: Auth, cfg: AppConfig): Promise<MeResponse> =>
    authedFetch(auth, cfg, '/me/entitlements'),
  catalog: (auth: Auth, cfg: AppConfig): Promise<Catalog> =>
    authedFetch(auth, cfg, '/admin/catalog'),
  principals: (auth: Auth, cfg: AppConfig): Promise<{ users: UserPrincipal[]; agents: AgentPrincipal[] }> =>
    authedFetch(auth, cfg, '/admin/principals'),
  grant: (
    auth: Auth, cfg: AppConfig,
    body: {
      principal: string; kind: GrantKind; key?: string; value?: boolean; grants?: Grants; label?: string;
      // Just-in-time time-boxing: ttl_seconds from now, or an absolute expires_at epoch. Omit both
      // for a STANDING grant (the admin-grid default, unchanged behavior).
      ttl_seconds?: number; expires_at?: number;
    },
  ): Promise<{ principal: string; entitlements: Effective; cedar: any }> =>
    authedFetch(auth, cfg, '/admin/grant', { method: 'POST', body: JSON.stringify(body) }),
};

/** Decode the admins-group flag from the current ID token WITHOUT a network call, for the
 * initial render (the backend still enforces authority server-side regardless). */
export function isAdminFromToken(auth: Auth, adminGroup = 'admins'): boolean {
  try {
    const u = auth.getUser();
    const g = u?.['cognito:groups'];
    if (Array.isArray(g)) return g.includes(adminGroup);
    if (typeof g === 'string') return g.split(/[\s,]+/).includes(adminGroup);
  } catch { /* ignore */ }
  return false;
}
