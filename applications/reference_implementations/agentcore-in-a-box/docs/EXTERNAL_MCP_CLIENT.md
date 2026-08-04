# Connecting an external MCP client to the AgentCore Gateway

> **This is Michelle's headline use case.** Her ask is to connect M365 Copilot, GitHub Copilot,
> Claude Code, and custom agents to internally-built MCPs/APIs through a governed Gateway. This doc
> shows a real external MCP client (Claude Code, MCP Inspector, or plain `curl`) authenticating to
> **this demo's** AgentCore Gateway with a Cognito bearer token and calling governed tools — with
> per-user authorization and identity-scoped data governance enforced at the Gateway (MCP) boundary.
>
> Nothing new is deployed for this: the Gateway's `/mcp` endpoint already exists, is CUSTOM_JWT
> inbound, and exposes 26 governed tools. An external client is simply another Cognito principal.

## The one idea to land in the demo

> **A team publishes an MCP/API. The platform owns identity, authorization, and the kill switch —
> centrally, at the Gateway.** Any client (Claude Code, M365, Copilot, a custom agent) hits the same
> `/mcp` endpoint with the same JWT and is subject to the same per-user policy. That is AWS's
> recommended multi-team MCP pattern, and it is what this endpoint demonstrates.

## Endpoint & auth

| | |
|---|---|
| MCP endpoint | `https://<GATEWAY_ID>.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp` |
| Transport | streamable-HTTP MCP (JSON-RPC: `initialize`, `tools/list`, `tools/call`) |
| Inbound auth | Cognito **CUSTOM_JWT** — `Authorization: Bearer <access_token>` |
| Authorization | per-user entitlements, enforced by the Gateway REQUEST interceptor (`lambda/gateway-interceptor`) |

Resolve `<GATEWAY_ID>` from `.deployment-outputs-<env>.json` (`.gateway_id`). For the current live
env (`agentcoreinabox`) it is `agentcore-demo-gateway-agentcoreinabox-ztizzy9stk`.

## Step 1 — mint a bearer token

```bash
export DEMO_ENV=agentcoreinabox          # or rely on .demo-env if present
TOKEN=$(scripts/mcp_token.sh alice@demo.com)
```

`scripts/mcp_token.sh` uses Cognito `USER_PASSWORD_AUTH` on the web app client (enabled in
`lib/agent_core-stack.ts` for exactly this headless case) and prints the bare access token to stdout
(endpoint URL + claims go to stderr). Tokens live 60 min. A real external deployment would run the
OAuth code+PKCE flow against the same client instead — the token is identical either way.

## Step 2a — Claude Code

```bash
GW=$(jq -r .gateway_id .deployment-outputs-agentcoreinabox.json)
claude mcp add --transport http agentcore-gateway \
  "https://${GW}.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp" \
  --header "Authorization: Bearer $(DEMO_ENV=agentcoreinabox scripts/mcp_token.sh alice@demo.com)"
```

Then in Claude Code the 26 governed tools appear as `agentcore-gateway` tools. Ask it to *"list my
client holdings"* → it calls `positions-db___query_holdings` through the Gateway and gets back
**identity-masked** rows. (Token expired? Re-run the same `claude mcp add` to refresh the header.)

`scripts/mcp.json.example` is the equivalent static `.mcp.json` form if you prefer file config.

## Step 2b — MCP Inspector (neutral, vendor-agnostic demo)

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL:    https://<GATEWAY_ID>.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp
# Header: Authorization: Bearer <paste $TOKEN>
```
Inspector's "List Tools" / "Call Tool" panels are a clean, client-neutral way to show the same
thing without tying the story to one vendor's agent.

## Step 2c — plain `curl` (proven live — copy/paste)

```bash
GW=$(jq -r .gateway_id .deployment-outputs-agentcoreinabox.json)
MCP="https://${GW}.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp"
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')

# list the governed tools (26 of them)
curl -sS -X POST "$MCP" "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# call one — governed + identity-masked
curl -sS -X POST "$MCP" "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"positions-db___query_holdings","arguments":{"limit":3}}}'
```

## The demo beat: allowed → denied at the Gateway

This is the sequence to run live (all three steps verified against the `agentcoreinabox` env):

1. **Allowed.** As `alice`, call `positions-db___query_holdings` → returns rows, but `client_name`
   is `••• REDACTED (PII) •••` and `notional` is `null` — alice's tier isn't senior, so Postgres
   RLS + the masking view redact server-side. *Identity governs not just tool access but row/column
   visibility.*
2. **Revoke.** In the Access Control admin console (or, for a scripted demo, flip the grant in the
   `agentcore-demo-entitlements-<env>` table: `grants.query_holdings = false` on
   `user#<alice-sub>` / `dataType=tools`).
3. **Denied.** Re-run the exact same MCP call → the Gateway returns an MCP tool error **before the
   tool runs**:
   > *Access denied by AgentCore Gateway policy: you are not granted the 'Client Holdings (governed
   > DB)' tool. This denial is enforced at the Gateway (MCP) boundary.*

   Restore the grant (`= true`) and it succeeds again on the very next call (lazy expiry — no
   redeploy, no restart).

The denial is enforced in `lambda/gateway-interceptor/index.py` (`handler` → `_deny`), keyed on the
**cryptographically verified** JWT `sub` — a client cannot spoof identity by editing the request
body (`__principal` mismatch → impersonation deny).

## Why this answers "where should authorization live?"

- **Identity is centralized at the Gateway** (one OAuth2/JWT trust boundary for every client).
- **The authorization decision data is centralized** (`agent/entitlements.py`, one catalog copied to
  every enforcement point) but **enforced at the boundary closest to the tool** (the Gateway
  interceptor + Cedar), so a team's MCP is unreachable even if a caller bypasses the app.
- **Tool teams stay out of the authz business** — they publish an MCP/API; the platform team owns
  identity, entitlements, rate limits, and the kill switch. That is the multi-team win.

## Notes / limits for a real external rollout

- **Token lifetime is 60 min** (demo setting). Production clients refresh via the OAuth flow.
- **`USER_PASSWORD_AUTH`** is a demo convenience on the web client; a hardened deployment would use
  code+PKCE (interactive clients) or `client_credentials` (service principals) and disable
  password auth.
- **M365 Copilot / GitHub Copilot** connect the same way (streamable-HTTP MCP + a bearer token from
  their configured IdP); wiring their specific connector UIs is a client-side config task, not a
  Gateway change. The Gateway does not care which client presents the JWT.
