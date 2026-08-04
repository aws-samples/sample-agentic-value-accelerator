# Michelle's Use Case — Fit Assessment & Build Plan

> **Ask:** Connect M365 Copilot/Cowork + GH Copilot + Claude Code + custom agents to internally-built
> MCPs/APIs over real-time data, through a governed Gateway. Live demo later this week.

## TL;DR verdict

The demo **already covers the hard, differentiating half** of Michelle's requirements — identity,
authorization ("which identity can call which MCP/tool"), kill switch, and observability — and can
show them live today. The **other half is not built** (rate limiting, prompt PII/secret filtering,
general response filtering, automated pre-onboarding validation), and her core *narrative* — an
**external** MCP client (Claude Code / M365 / Copilot) connecting to **our** Gateway — is not
demonstrated yet even though the Gateway's `/mcp` endpoint already exists and is CUSTOM_JWT-inbound.

**Decision taken:** close all four feature gaps **and** add a real external-MCP-client beat **and**
stand up a small app on EKS exposed through the Gateway. This doc is the build plan for that.

---

## Requirement-by-requirement fit

| Requirement | Status today | Evidence |
|---|---|---|
| **Identity + authentication** | ✅ Live | Cognito CUSTOM_JWT inbound on Gateway + runtime re-verifies JWT (`agent/main.py:1631`); outbound 3LO/M2M/API-key vending |
| **Authorization (identity → MCP/tool)** | ✅ Live (crown jewel) | 4 dims (tools/desks/agents/creds) × 4 enforcement points; `agent/entitlements.py`, `lambda/gateway-interceptor/index.py` |
| **Kill switch (client/agent)** | ✅ Live | Cedar tool-forbid + IAM secret-deny (global) + per-user instant revoke + break-glass; `lambda/admin-api/{cedar,iam_creds}.py` |
| **Observability across prompts/tools/responses** | ✅ Live | ADOT spans (`enable-observability.sh`) + audit-trail viewer (`lambda/admin-api/audit.py`) |
| **External MCP clients (Claude Code / M365 / Copilot)** | ⚠️ Endpoint exists, not shown | Gateway `/mcp` is CUSTOM_JWT (`deploy.sh:709`); only client wired today is the React SPA |
| **Data sources (on-prem / EKS / Azure / Beacon)** | ⚠️ Pattern exists, not wired | Lambda + one OpenAPI/Aurora target; OpenAPI target is the reusable pattern for any HTTP API |
| **Rate limiting (per user / app / tool)** | ❌ Absent | Only flat 50 rps/API + per-run agent budgets; `TODO(prod)` for WAF at `lib/agent_core-stack.ts:1966` |
| **Request content filtering (secrets/PII in prompts)** | ❌ Absent | No Bedrock Guardrails anywhere; `_redact()` only scrubs log lines |
| **Response filtering** | ⚠️ Narrow | Aurora column-masking on `query_holdings` only; no general output guardrail |
| **Pre-onboarding validation ("MCP must follow this auth pattern")** | ⚠️ Lifecycle only | Registry has manual approve/reject; no automated admission check (`lambda/agentcore-primitives/registry.py:87`) |

## Answer to Michelle's explicit question — "where should authorization live?"

AWS's recommended multi-team MCP pattern, and exactly what this demo shows: **authorize at the
Gateway (the MCP boundary), from a centralized decision store, with defense-in-depth.**

- **Centralize the identity** at the Gateway (inbound OAuth2/JWT). One trust boundary for every
  client — Claude Code, M365, Copilot, custom agents — instead of per-MCP auth.
- **Centralize the *decision data*** (who-can-call-what) in one entitlements store, but **enforce at
  the boundary closest to the tool** — the Gateway request interceptor + Cedar policy — so a team's
  MCP can't be reached even if a caller goes around the app.
- **Keep tool teams out of the authz business.** A team publishes an MCP/API; the platform team owns
  identity, entitlements, rate limits, and kill switch centrally. That's the multi-team win.

This demo is a working reference implementation of that pattern (4 enforcement points, single-sourced
catalog `agent/entitlements.py`).

---

## Build plan (5 workstreams)

Ordered by demo payoff ÷ risk. Effort assumes reuse of existing patterns.

### WS1 — External MCP client → live Gateway  *(effort: LOW, payoff: HIGHEST)*
Point **Claude Code** (and MCP Inspector as a neutral fallback) at the existing Gateway `/mcp`
endpoint with a Cognito bearer token, so we literally demonstrate *her* use case: an external agent
authenticating and calling governed tools through the Gateway, and getting **denied** on an
un-entitled tool at the MCP boundary.
- Endpoint already exists: `https://<GATEWAY_ID>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp`.
- Deliverable: a short `docs/EXTERNAL_MCP_CLIENT.md` + a token-mint helper (reuse Cognito client from
  `lib/agent_core-stack.ts`) + `.mcp.json` snippet. No app-code change.
- Demo beat: same Cognito user, allowed tool succeeds / revoked tool denied at Gateway — from *Claude
  Code*, not our UI.

### WS2 — Small app on EKS, exposed via OpenAPI Gateway target  *(effort: MEDIUM, payoff: HIGH — hits "EKS" + "internal MCP/API")*
Build a small containerized REST service (a "real-time data" API — e.g. a positions/quotes feed),
deploy to EKS, expose via LoadBalancer/Ingress, describe it with an OpenAPI spec, and register it as
a **Gateway OpenAPI target** — reusing the exact `query_holdings` pattern
(`scripts/positions_db_openapi.json` + `deploy.sh:955`). The Gateway turns it into a governed MCP
tool; the interceptor injects the verified identity; entitlements gate it.
- Reuses: OpenAPI-target block in `deploy.sh`, API-key credential-provider injection, interceptor
  identity re-assertion (`GOVERNED_DB_TARGET` pattern).
- New: `eks/` (Dockerfile + Deployment/Service/Ingress manifests), an OpenAPI spec, a new
  `TOOL_CATALOG` + `AGENT_CATALOG` entry in `agent/entitlements.py`, deploy.sh registration step.
- **Blocking question:** do we have an EKS cluster to target, should I create one, or simulate?

### WS3 — Rate limiting (per user / per app / per tool)  *(effort: MEDIUM, payoff: HIGH)*
Add a token-bucket / fixed-window quota check in `lambda/gateway-interceptor/index.py` keyed on
`(principal, tool)` and `(app/client_id)`, backed by a DynamoDB table with atomic counters + TTL
windows. Deny with a clean MCP error when over-limit (reuse `_deny()`). Limits declared alongside the
entitlements catalog so they're per-user / per-app / per-tool.
- Reuses: interceptor principal resolution, `_deny()`, entitlements table access pattern.
- New: `RateLimit` DynamoDB table (CDK), limit config in `entitlements.py`, counter logic + admin
  override surface.

### WS4 — PII/secret filtering on prompts + responses  *(effort: MEDIUM, payoff: HIGH)*
Create a **Bedrock Guardrail** (CDK `CfnGuardrail`: PII entities + regex for secrets/keys) and call
`ApplyGuardrail` on the inbound prompt in `agent/main.py` **before** the model runs, and on the
outbound response. Flag/redact/block per policy. Emit an audit event on a hit (reuse `_audit()`).
- Reuses: `_audit()` event taxonomy, existing `_redact()` for logs.
- New: `CfnGuardrail` in `lib/agent_core-stack.ts`, guardrail apply + block/redact path in
  `agent/main.py`, IAM `bedrock:ApplyGuardrail`.

### WS5 — Pre-onboarding validation (Registry admission)  *(effort: LOW–MEDIUM, payoff: MEDIUM)*
Add automated validation to the Registry `submit` path (`lambda/agentcore-primitives/registry.py`):
inspect the descriptor and **reject** anything that doesn't follow the required auth pattern (e.g.
must declare OAuth2/JWT inbound, must ship an `inputSchema`, must name an owning team). Directly
answers her "MCP must follow this auth pattern" line.
- Reuses: `curate()` lifecycle, admin gate in `index.py`.
- New: a `_validate_descriptor()` gate that runs on `submit`, returns structured pass/fail reasons.

---

## Realistic sequencing for "later this week"

- **Must-show live (day 1–2):** WS1 (external client) + WS5 (validation) — both low-risk, high signal,
  and WS1 *is* her headline use case.
- **Strong adds (day 2–3):** WS3 (rate limiting) + WS4 (guardrails) — both visible, self-contained.
- **Marquee if cluster is available (day 3–4):** WS2 (EKS) — highest infra risk; needs the cluster
  question answered before it can start.
- Anything not live by demo day is positioned as reference-architecture / roadmap, honestly.

## Verification (per workstream)
- WS1: from Claude Code, call an allowed tool (succeeds) and a revoked tool (Gateway `isError` deny).
- WS2: `kubectl` app healthy → Gateway `tools/list` shows the new tool → allowed user gets data,
  un-entitled user denied at interceptor.
- WS3: hammer one tool past its limit as one user → `_deny` rate-limit error; a second user unaffected.
- WS4: prompt containing a fake secret/PII → blocked/redacted + audit event visible in the viewer.
- WS5: submit a descriptor missing JWT inbound → rejected with reasons; a compliant one → PENDING.
- End-to-end: re-run the pre-demo checklist in `docs/DEMO_NARRATIVE.md:220`.

---

## BUILD STATUS (delivered on branch `feat/michelle-usecase-gateway-mcp`)

| WS | What | State | Key files |
|---|---|---|---|
| WS1 | External MCP client → Gateway | ✅ Built + **proven live** on `agentcoreinabox` | `scripts/mcp_token.sh`, `scripts/mcp.json.example`, `docs/EXTERNAL_MCP_CLIENT.md` |
| WS5 | Registry pre-onboarding validation | ✅ Code complete (backend gate + UI checklist) | `lambda/agentcore-primitives/registry.py` (`_validate_descriptor`), `frontend-react/src/Registry.tsx`, `registryApi.ts` |
| WS3 | Rate limiting (per user/app/tool) | ✅ Code complete (fixed-window counter + CDK table); unit-tested | `agent/entitlements.py` (`RATE_LIMITS`/`rate_limit_for`), `lambda/gateway-interceptor/index.py` (`_rate_limited`), `lib/agent_core-stack.ts` (RateLimitTable) |
| WS4 | Bedrock Guardrails (PII/secret) | ✅ Code complete (CfnGuardrail + IAM + input scan wired) | `lib/agent_core-stack.ts` (ContentGuardrail), `agent/guardrail.py`, `agent/main.py` (INPUT scan), `deploy.sh` (env inject) |
| WS2 | EKS app → OpenAPI Gateway target | ✅ Built; cluster provisioned; app image validated locally | `eks/` (app, Dockerfile, k8s, openapi.json, deploy_eks.sh, verify_eks.sh) |

**WS1 was verified live** (2026-07-22): from a plain external client (curl, standing in for Claude
Code) with alice's Cognito bearer token — `initialize` + `tools/list` (26 tools) succeeded, an
allowed `query_holdings` returned identity-**masked** rows, and after revoking the grant the SAME
call was **denied at the Gateway** ("Access denied by AgentCore Gateway policy…"). Grant restored.

**Notes / honest scope:**
- WS4 scans the **inbound prompt** (the "flag secrets/PII in prompts" ask) and blocks/masks with an
  audit line. General **response** filtering on the streamed answer is not retrofitted (would break
  token streaming); `guardrail.check(..., 'OUTPUT')` exists for non-streamed use, and the demo's
  real response filtering is the Aurora column-masking on `query_holdings`.
- WS2 fronts the EKS Classic ELB (HTTP) with an API Gateway HTTP API to get the HTTPS + valid cert
  the Gateway OpenAPI target requires — same "API Gateway fronts the backend" shape as positions-db.
- Rate-limit caps are dialable live via the `RATE_LIMITS_JSON` env on the interceptor (dial a tool
  to 2/min to trigger a throttle on stage without a redeploy).

## Demo-day talk track (suggested order, ~15 min)

1. **The pattern** (1 min). "Authorize at the Gateway. One JWT trust boundary for every client;
   one central entitlements store; enforce at the boundary closest to the tool." → `GOVERNANCE_MODEL.md`.
2. **Her use case, live** (3 min · WS1). Point **Claude Code** at the Gateway `/mcp` with a token
   from `scripts/mcp_token.sh`. List tools, call `query_holdings` → masked rows. This is "connect an
   external agent to our MCPs," verbatim.
3. **Authorization + kill switch** (3 min). In the Access Control console, revoke a tool for the
   user → re-run the Claude Code call → **denied at the Gateway**. Restore → works again.
4. **Rate limiting** (2 min · WS3). Hammer `market_quote`/`trade_execute` past its per-tool cap →
   Gateway throttle deny naming the dimension; a second user is unaffected.
5. **EKS internal API as a governed tool** (3 min · WS2). Show `kubectl get pods`, then call
   `market-data___market_quote` through the Gateway → live quotes served by an EKS pod, governed by
   the same interceptor + rate limit. This is "our internal API on our compute, no bespoke auth."
6. **Guardrails** (2 min · WS4). Paste a prompt containing a fake AWS secret → blocked with an audit
   event in the Access-history viewer. Paste one with an email → masked before the model sees it.
7. **Onboarding governance** (1 min · WS5). In the Registry, `Validate` an MCP record whose endpoint
   isn't behind the Gateway → the admission checklist fails "endpoints behind governed JWT boundary";
   a conforming one passes and can be submitted. This is "an MCP must follow this auth pattern."
