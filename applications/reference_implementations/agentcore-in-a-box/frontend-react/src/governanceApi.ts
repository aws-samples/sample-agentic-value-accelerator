/**
 * Frontend client + types for the two Tier-1 governance surfaces:
 *   1. the governance-graph READ model (GET /admin/graph) — the who-can-reach-what data
 *      the GovernanceGraph panel visualizes;
 *   2. the self-service request → admin-approve WRITE workflow (/me/access-requests +
 *      /admin/access-requests/{id}/(approve|deny)).
 *
 * Mirrors entitlements.ts exactly: a private authedFetch sending the Cognito ID token, and a
 * single exported api object. The backend (lambda/admin-api) is the source of truth; this file
 * only owns the HTTP calls + wire types.
 */
import type { Auth, AppConfig } from './auth';
import type { Catalog, ToolDef, DeskDef, CredDef, AgentDef, UserPrincipal, AgentPrincipal } from './entitlements';

// ── Governance graph ────────────────────────────────────────────────────────
export interface GraphCatalog {
  tools: Record<string, ToolDef>;
  desks: Record<string, DeskDef>;
  creds: Record<string, CredDef>;
  groups: string[];                       // stable tool-group order (for the group lane)
  desk_groups: Record<string, string[]>;  // desk → reachable tool groups (structural edges)
}

export interface GlobalBlocks {
  tools: string[]; // tool NAMES globally Cedar-forbidden (the kill-switch is engaged)
  creds: string[]; // cred keys globally IAM-denied
}

export interface GraphResponse {
  generated_at: number;
  catalog: GraphCatalog;
  users: UserPrincipal[];
  agents: AgentPrincipal[];
  global_blocks: GlobalBlocks;
  /** The subset of global_blocks an admin engaged DIRECTLY (kill-switch), vs. blocks that emerged
   * because no principal holds the tool/cred. Only forced entries can be disengaged in one tap. */
  forced_blocks?: GlobalBlocks;
}

// ── Access requests ───────────────────────────────────────────────────────────
// desks + agents (per-specialist) + tools are user-requestable; creds are agent-scoped (admin-only).
export type RequestKind = 'tools' | 'desks' | 'agents';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface AccessRequest {
  requestId: string;
  requesterSub: string;
  requesterEmail: string;
  kind: RequestKind;
  key: string;
  label: string;
  reason: string;
  status: RequestStatus;
  createdAt: number;
  decidedBy: string;
  decidedAt: number;
  /** JIT: a requester's asked-for TTL (0 = admin decides), and the granted expiry once approved. */
  ttlSeconds?: number;
  expiresAt?: number;
  /** True when this was an emergency break-glass self-grant (auto-approved, short-TTL, audited). */
  breakGlass?: boolean;
}

export interface MyRequestsResponse {
  requests: AccessRequest[];
  catalog: {
    tools: Record<string, ToolDef>;
    desks: Record<string, DeskDef>;
    agents: Record<string, AgentDef>;
  };
  break_glass_ttl?: number;
}

// ── Audit trail ─────────────────────────────────────────────────────────────
// The READ side of governance: the runtime's security-audit lines (identity decisions, RBAC
// denials, tool/agent scoping, trade/vault access, break-glass) read back from CloudWatch Logs
// Insights by the admin-gated GET /admin/audit route (see lambda/admin-api/audit.py).
export type AuditSeverity = 'info' | 'warn' | 'alert';
export type AuditLens = 'security' | 'all';

export interface AuditEvent {
  type: string;                     // e.g. 'rbac_deny', 'vault_access', 'identity_rejected'
  label: string;                    // human label for the type
  severity: AuditSeverity;          // governance-attention level (colour)
  category: string;                 // 'identity' | 'access' | 'privileged' | 'tool' | 'other'
  ts: number;                       // epoch seconds
  actor_sub: string;                // the verified caller sub the runtime acted for
  actor_email: string;              // resolved from Cognito (falls back to '' → show the sub)
  session?: string;                 // the turn's session id → click through to its /trace (may be '')
  detail: Record<string, any>;      // event-specific fields (tool/desk/scope/withheld/reason…)
}

export interface AuditResponse {
  events: AuditEvent[];
  summary: Record<string, number>; // per-type counts in the window
  window_minutes: number;
  lens: AuditLens;
  log_group: string;
  source: string;                  // 'cloudwatch-logs-insights' | 'unconfigured'
  generated_at?: number;
  error?: string;                  // set when CloudWatch couldn't be reached / not configured
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

export const governanceApi = {
  /** The full governance-graph read model (admin-only). */
  graph: (auth: Auth, cfg: AppConfig): Promise<GraphResponse> =>
    authedFetch(auth, cfg, '/admin/graph'),

  /** A non-admin's own requests + the requestable catalog subset (desks/agents/tools). */
  myRequests: (auth: Auth, cfg: AppConfig): Promise<MyRequestsResponse> =>
    authedFetch(auth, cfg, '/me/access-requests'),

  /** Create a self-service request for a desk/specialist/tool the caller lacks. `ttlSeconds`
   * lets the requester ask for time-boxed access ("just for today"); the admin can override. */
  createRequest: (
    auth: Auth, cfg: AppConfig, body: { kind: RequestKind; key: string; reason?: string; ttlSeconds?: number },
  ): Promise<{ request: AccessRequest; deduped?: boolean }> =>
    authedFetch(auth, cfg, '/me/access-requests', {
      method: 'POST',
      body: JSON.stringify({ kind: body.kind, key: body.key, reason: body.reason, ttl_seconds: body.ttlSeconds }),
    }),

  /** Break-glass emergency self-grant: short-TTL, mandatory reason, auto-approved + admin-alerted. */
  breakGlass: (
    auth: Auth, cfg: AppConfig, body: { kind: RequestKind; key: string; reason: string },
  ): Promise<{ request: AccessRequest; expiresAt: number }> =>
    authedFetch(auth, cfg, '/me/access-requests/break-glass', { method: 'POST', body: JSON.stringify(body) }),

  /** Admin: list requests by status (default PENDING). */
  adminRequests: (auth: Auth, cfg: AppConfig, status: RequestStatus = 'PENDING'): Promise<{ requests: AccessRequest[]; status: RequestStatus }> =>
    authedFetch(auth, cfg, `/admin/access-requests?status=${status}`),

  /** Admin: approve a request (runs the real grant path + notifies the requester). Optionally
   * time-box the approval (ttlSeconds) or grant it standing (no expiry). */
  approve: (
    auth: Auth, cfg: AppConfig, requestId: string, opts?: { ttlSeconds?: number; standing?: boolean },
  ): Promise<{ request: AccessRequest; cedar?: any; iam_creds?: any }> =>
    authedFetch(auth, cfg, `/admin/access-requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ ttl_seconds: opts?.ttlSeconds, standing: opts?.standing }),
    }),

  /** Admin: deny a request. */
  deny: (auth: Auth, cfg: AppConfig, requestId: string): Promise<{ request: AccessRequest }> =>
    authedFetch(auth, cfg, `/admin/access-requests/${encodeURIComponent(requestId)}/deny`, { method: 'POST' }),

  /** Admin kill-switch: engage/disengage a GLOBAL block on one Gateway MCP tool (or agent cred),
   * without revoking it per-user first. Writes the forced overlay + re-materializes the Cedar
   * forbid / IAM Deny backstop. Returns the new forced set + backstop result. */
  globalBlock: (
    auth: Auth, cfg: AppConfig, body: { kind: 'tools' | 'creds'; key: string; engaged: boolean },
  ): Promise<{ kind: string; key: string; engaged: boolean; forced_blocks: GlobalBlocks; backstop: any }> =>
    authedFetch(auth, cfg, '/admin/global-block', { method: 'POST', body: JSON.stringify(body) }),

  /** Admin: the runtime's security-audit trail over the last `windowMinutes`. `lens='security'`
   * (default) hides the noisy identity_verified/tool_invoke allow-stream; `type` pins one event
   * type for drill-down. */
  adminAudit: (
    auth: Auth, cfg: AppConfig,
    opts?: { windowMinutes?: number; lens?: AuditLens; type?: string },
  ): Promise<AuditResponse> => {
    const p = new URLSearchParams();
    p.set('window', String(opts?.windowMinutes ?? 720));
    p.set('lens', opts?.lens ?? 'security');
    if (opts?.type) p.set('type', opts.type);
    return authedFetch(auth, cfg, `/admin/audit?${p.toString()}`);
  },
};

// Re-export Catalog for consumers that want the graph + catalog types from one module.
export type { Catalog };
