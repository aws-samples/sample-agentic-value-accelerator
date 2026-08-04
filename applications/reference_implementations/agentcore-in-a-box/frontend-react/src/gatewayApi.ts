/**
 * Frontend client for the admin-only "Gateway" console (lambda/admin-api/gateway_console.py).
 *
 * These are the live backends behind Michelle's Gateway-requirement checklist, made interactive:
 *   • console()      — bootstrap: the real MCP endpoint, governed targets, rate-limit caps, guardrail meta
 *   • scanGuardrail() — a LIVE Bedrock ApplyGuardrail on pasted text (Content Firewall tester)
 *   • burstRateLimit()— fires N calls through the SAME fixed-window limiter the interceptor enforces
 *   • mcp()          — proxies a JSON-RPC to the real Gateway /mcp with the caller's OWN access token
 *                      (the exact external-client path: Claude Code / M365 Copilot / a custom agent)
 *
 * Every route is admin-gated server-side on the verified ID token. mcp() additionally forwards the
 * caller's Cognito ACCESS token as the Gateway credential (the ID token authenticates the admin
 * route; the access token is what an external MCP client would present to the Gateway).
 */
import type { Auth, AppConfig } from './auth';

// ── Wire types (mirror gateway_console.py return shapes) ─────────────────────
export interface RateLimitSpec { count: number; window_seconds: number; }
export interface GatewayTarget {
  key: string;
  label: string;
  group: string;
  pillar: string;
  gateway_action: string;
  sensitive: boolean;
}
export interface GatewayConsole {
  mcp_url: string;
  gateway_id: string;
  region: string;
  targets: GatewayTarget[];
  target_count: number;
  rate_limits: {
    window_seconds: number;
    per_user: RateLimitSpec | null;
    per_app: RateLimitSpec | null;
    per_tool_default: RateLimitSpec | null;
    per_tool: Record<string, RateLimitSpec>;
  };
  guardrail: {
    enabled: boolean;
    id: string;
    version: string;
    blocks: string[];
    masks: string[];
  };
  generated_at: number;
}

export interface GuardrailScan {
  enabled: boolean;
  enforced: boolean;
  passed: boolean;
  blocked: boolean;
  masked: boolean;
  action: string;
  text: string;        // the (possibly PII-masked) text the model would have seen
  reasons: string[];
  message: string;
  guardrail_id?: string;
  guardrail_version?: string;
}

export interface BurstCall { n: number; allowed: boolean; dimension: string | null; limit: number | null; }
export interface BurstResult {
  tool: string;
  tool_label: string;
  count: number;
  window_seconds: number;
  dimensions: Record<string, RateLimitSpec>;
  first_denied_at: number | null;
  calls: BurstCall[];
  note?: string;
  error?: string;
}

// A minimal shape of what the Gateway's MCP JSON-RPC returns (tools/list, tools/call).
export interface McpResult {
  jsonrpc?: string;
  id?: number | string;
  result?: any;
  error?: any;
  // Fields the proxy adds on a transport-level failure (fail-soft):
  status?: number;
  body?: string;
  raw?: string;
}

async function authedFetch(auth: Auth, cfg: AppConfig, path: string, init?: RequestInit): Promise<any> {
  const resp = await fetch(`${cfg.API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.getIdToken()}`, // ID token → admin gate on the route
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!resp.ok) throw new Error(body?.error || `${resp.status} ${resp.statusText}`);
  return body;
}

export const gatewayApi = {
  /** Console bootstrap: MCP endpoint, governed targets, rate-limit caps, guardrail meta. */
  console: (auth: Auth, cfg: AppConfig): Promise<GatewayConsole> =>
    authedFetch(auth, cfg, '/admin/gateway/console'),

  /** Live ApplyGuardrail on pasted text. source='OUTPUT' blocks secrets AND masks PII. */
  scanGuardrail: (auth: Auth, cfg: AppConfig, text: string, source: 'INPUT' | 'OUTPUT' = 'OUTPUT'): Promise<GuardrailScan> =>
    authedFetch(auth, cfg, '/admin/guardrail/scan', { method: 'POST', body: JSON.stringify({ text, source }) }),

  /** Fire `count` calls through the real fixed-window limiter for `tool` (isolated test principal). */
  burstRateLimit: (auth: Auth, cfg: AppConfig, tool: string, count: number): Promise<BurstResult> =>
    authedFetch(auth, cfg, '/admin/ratelimits/test', { method: 'POST', body: JSON.stringify({ tool, count }) }),

  /** Proxy a JSON-RPC to the real Gateway /mcp with the caller's OWN access token (external-client path). */
  mcp: (auth: Auth, cfg: AppConfig, method: string, params: any = {}): Promise<McpResult> =>
    authedFetch(auth, cfg, '/admin/gateway/mcp', {
      method: 'POST',
      body: JSON.stringify({ access_token: auth.getAccessToken(), rpc: { method, params, id: 1 } }),
    }),
};
