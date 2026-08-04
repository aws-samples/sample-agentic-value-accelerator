# Meridian Asset Management — AgentCore Demo: Architecture & Design

This document describes the architecture of the AgentCore feature demo, the rationale behind key design decisions, and the trade-offs that were consciously accepted. It is written for engineers who want to understand how the pieces fit together before extending or adapting the demo.

The demo presents an AI assistant for portfolio managers at Meridian Asset Management, a fixed-income investment firm. A signed-in portfolio manager (PM) can view the positions in their funds and, with a separate explicit consent, execute trades against those funds.

---

## 1. System Overview

The demo has three logical tiers:

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT TIER                                                    │
│  S3 + CloudFront — React/AG-UI SPA (frontend-react/)          │
│  Cognito Hosted UI — OAuth code+PKCE login (auth.ts)           │
└─────────────────────────┬───────────────────────────────────────┘
                          │  WSS (bearer token)
                          │  HTTPS (bearer token — policy toggle)
┌─────────────────────────▼───────────────────────────────────────┐
│  APPLICATION LAYER (CDK-provisioned, lib/agent_core-stack.ts)  │
│                                                                  │
│  Cognito User Pool                                              │
│  ├─ web client (PKCE, openid/email/profile scopes)             │
│  ├─ portfolio OAuth client (confidential, portfolio-api/*)     │
│  └─ portfolio resource server (portfolio-api/read, /trade)     │
│                                                                  │
│  API Gateway (WebSocket)  ──────→  Lambda: websocket/          │
│  API Gateway (HTTP)                                             │
│  ├─ POST /policy/toggle   ──────→  Lambda: policy-toggle/      │
│  ├─ GET  /oauth/callback  ──────→  Lambda: oauth-callback/     │
│  ├─ GET  /grades          ──────→  Lambda: grades-api/         │
│  └─ PUT  /grades/{category} ─────→  Lambda: grades-api/        │
│                                                                  │
│  DynamoDB tables:                                               │
│  ├─ agentcore-demo-connections  (WebSocket connection state)   │
│  ├─ agentcore-demo-userdata     (per-PM directory profile)     │
│  └─ agentcore-demo-grades       (per-PM fund positions)        │
│                                                                  │
│  ECR repo (arm64 container image)                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │  HTTPS bearer invoke (data plane)
┌─────────────────────────▼───────────────────────────────────────┐
│  AGENTCORE TIER (deploy.sh-provisioned)                         │
│                                                                  │
│  Runtime ── customJWTAuthorizer (Cognito JWKS) ──► agent       │
│  (arm64 container, Haiku 4.5, ADOT → CloudWatch)               │
│                                                                  │
│  Gateway ── Policy Engine (Cedar) ── SigV4 ──► Lambda targets  │
│  ├─ Target: secure-vault   ──────────────────► vault-tool/     │
│  └─ Target: user-data-lookup ────────────────► userdata-tool/  │
│                                                                  │
│  Memory (semantic + summary strategies)                         │
│  Browser (Playwright/CDP, recording enabled)                    │
│  Code Interpreter (Python sandbox)                              │
│  Identity (OAuth2 cred provider → Cognito 3LO)                 │
└─────────────────────────────────────────────────────────────────┘

      ▼ user-delegated OAuth token (portfolio-api/* scopes)

┌─────────────────────────────────────────────────────────────────┐
│  DOWNSTREAM RESOURCE SERVER                                     │
│  Portfolio API (HTTP API + JWT authorizer, scope enforcement)   │
│  DynamoDB: agentcore-demo-grades                               │
└─────────────────────────────────────────────────────────────────┘
```

### Client tier

A static single-page application served from S3 behind CloudFront. The frontend authenticates users via the Cognito Hosted UI (OAuth authorization code + PKCE). On successful login the browser holds a Cognito access token (JWT). All subsequent communication uses that token as a bearer credential.

### Application layer

Provisioned by the CDK stack (`lib/agent_core-stack.ts`) using mature CDK L2 constructs. It contains:

- **Cognito User Pool** — identity store, Hosted UI domain, SPA client, and confidential OAuth client for the downstream Portfolio flow.
- **WebSocket API Gateway** — persistent bidirectional channel between the browser and the `websocket` Lambda.
- **HTTP API Gateway** — synchronous endpoints for policy toggle, 3LO OAuth callback, and the Portfolio resource server.
- **Lambda functions** — `websocket`, `policy-toggle`, `oauth-callback`, `grades-api`, `market-data-api`, `vault-tool`, `userdata-tool`.
- **DynamoDB tables** — three tables described above; the connections table is the only one written by a Lambda that also talks to AgentCore.

### AgentCore tier

Provisioned by `deploy.sh` via the `bedrock-agentcore-control` CLI (no mature CDK L2 constructs exist yet). Covers the Runtime, Gateway + targets, Policy Engine, Memory, Browser, Code Interpreter, and Identity credential provider.

The agent itself runs as an arm64 container image built from `agent/Dockerfile` (base `python:3.12-slim`, entry point `opentelemetry-instrument python main.py`). The runtime is configured to listen on port 8080 and is addressed via the AgentCore data plane (`bedrock-agentcore.<region>.amazonaws.com/runtimes/<arn>/invocations`).

### Downstream Portfolio API

A separate HTTP API (`agentcore-demo-grades-api`) with its own JWT authorizer that validates Cognito access tokens and enforces `portfolio-api/read` or `portfolio-api/trade` scopes per route. It stores per-PM fund positions in DynamoDB (`agentcore-demo-grades`): the partition key `userId` is the PM's Cognito `sub`, the sort key `dataType` is the fund name (e.g. "Core Bond Fund"), and each item holds a `positions` map attribute of ticker → target allocation (e.g. `{"AGG": "30%", "TLT": "15%"}`). Identity is derived from the JWT claims injected by the API Gateway authorizer (`requestContext.authorizer.jwt.claims`), never from the request body. This separation is structural — see Section 4 for the design rationale.

The internal route paths (`GET /grades`, `PUT /grades/{category}`) and the `GRADES_API_URL` environment variable retain their original wiring names; they are never user-visible. The `read` scope authorizes viewing positions; the `trade` scope authorizes executing a trade, and is requested only as a separate, explicit consent.

---

## 2. The CDK / deploy.sh Split

CDK owns everything it has stable L2 constructs for: Cognito, DynamoDB, IAM roles, all API Gateway resources, all Lambdas, ECR, S3, and CloudFront. These are repeatable, reviewable infrastructure-as-code.

`deploy.sh` owns the AgentCore primitives. There are no CDK L2 constructs yet for `create-agent-runtime`, `create-gateway`, `create-memory`, `create-policy-engine`, `create-browser`, `create-code-interpreter`, or `create-oauth2-credential-provider`. Using L1 `CfnResource` constructs for these would be brittle (CloudFormation has limited knowledge of the AgentCore lifecycle states and cannot express the inter-resource wiring). The CLI approach is more explicit and more debuggable.

The operational consequence is a two-phase deploy:

1. **`npx cdk deploy`** — provisions the CDK stack, emits outputs (ARNs, pool IDs, URLs) to `cdk-outputs.json`.
2. **`deploy.sh` steps 2–8** — reads those outputs, creates the AgentCore resources in dependency order, wires the resulting resource IDs back into Lambda environment variables (`AGENT_RUNTIME_ARN`, `MEMORY_ID`, etc.) and into the runtime's own environment variables (`GATEWAY_ID`, `BROWSER_ID`, `CODE_INTERPRETER_ID`, `GRADES_API_URL`, `CREDENTIAL_PROVIDER_NAME`, `OAUTH_RETURN_URL`).

A second `cdk deploy` at the end of step 8 redeploys the frontend with the generated `frontend-react/dist/config.js`.

---

## 3. Authentication and Identity

There are two distinct auth directions in the system: **inbound** (who is calling the agent) and **outbound** (what the agent is authorized to do on behalf of that caller).

### 3.1 Inbound: Cognito JWT Bearer Invocation

The runtime is configured with a `customJWTAuthorizer` pointing at the Cognito User Pool's OIDC discovery URL and restricting `allowedClients` to the SPA client ID. This authorizer validates the token's RS256 signature, issuer, expiry, and client_id on every invocation, and is the **authoritative cryptographic security boundary** for the entire chat path.

The websocket Lambda (`lambda/websocket/index.py`) invokes the runtime over plain HTTPS (not SigV4) because boto3 does not support JWT bearer invocation:

```python
# lambda/websocket/index.py – invoke_runtime_bearer()
url = f'{DATAPLANE_HOST}/runtimes/{escaped_arn}/invocations?qualifier=DEFAULT'
req = urllib.request.Request(url, ..., headers={
    'Authorization': f'Bearer {access_token}',
    'Content-Type': 'application/json',
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': session_id,
})
```

The access token is stored in DynamoDB at `$connect` time (keyed by `connectionId`) and replayed on every `sendMessage`. Connect time also performs a lightweight token check — expiry, issuer, and client_id — but this check intentionally does not verify the RS256 signature (no native crypto wheel in a dependency-free Lambda asset). The code documents this explicitly:

> "This is deliberately NOT the cryptographic trust boundary... The AUTHORITATIVE validation... is performed by the runtime's customJWTAuthorizer on EVERY bearer invoke."

Inside the runtime, identity is **re-verified cryptographically** — it is not merely decoded on the authorizer's word. Once RBAC became a security boundary (per-user tool/desk/credential grants), a self-asserted `payload['user_id']` or an unverified `sub` would let any caller impersonate another user, so `_verify_cognito_token()` independently checks the in-band token's RS256 signature (against the pool JWKS, cached per-kid with a TTL), issuer, expiry, `client_id` binding, and `token_use=access`, and derives `sub` **only** from the verified claims. It fails **closed** on missing pool config and never falls back to a self-asserted identity:

```python
# agent/main.py – _verify_cognito_token() / _identity_from_context()
claims = jwt.decode(token, key, algorithms=['RS256'], issuer=issuer, options={'verify_aud': False})
if (claims.get('client_id') or claims.get('aud')) != USER_POOL_CLIENT_ID:  return None
if claims.get('token_use') != 'access':                                    return None
sub = claims['sub']            # ONLY from verified claims; a bad/absent token → 'anon', never user_id
```

The `sub` is the stable, non-guessable user identity used throughout: as the DynamoDB partition key in both the userdata and grades (positions) tables, as the namespace for Memory, and (indirectly) in the 3LO flow. This runtime verification mirrors the Gateway interceptor's own RS256 check (§4.7), so both enforcement points trust identity identically. An unauthenticated caller (no verified token) collapses to the `anon` principal, which is barred from sensitive tools unconditionally (§4.7).

The runtime also auto-vends a **workload access token** (`GetWorkloadAccessTokenForJWT`) bound to the caller's identity. This is the token passed to `IdentityClient.get_token()` for the outbound 3LO flow described next.

### 3.2 Outbound: 3-Legged OAuth (USER_FEDERATION)

The agent calls the downstream Portfolio API on behalf of the signed-in PM using AgentCore Identity's `USER_FEDERATION` auth flow. The full sequence (shown here for a trade, which requests the `portfolio-api/trade` scope; a read-only "show me the positions in my Core Bond Fund" follows the same shape but requests only `portfolio-api/read`) is:

```
PM asks "buy and increase TLT to a 20% target allocation in my Core Bond Fund"
    │
    ▼
agent/main.py: _vend_grades_token()
    │  workload_token = BedrockAgentCoreContext.get_workload_access_token()
    │  IdentityClient.get_token(
    │      provider_name='agentcore-demo-grades-oauth2',
    │      scopes=['portfolio-api/read', 'portfolio-api/trade'],
    │      agent_identity_token=workload_token,
    │      auth_flow='USER_FEDERATION',
    │      on_auth_url=on_auth_url,          # raises AuthRequiredException
    │      token_poller=_NoPoll(),           # returns immediately on no grant
    │      custom_state=user_id,
    │      callback_url=OAUTH_RETURN_URL,    # /oauth/callback HTTP endpoint
    │  )
    │
    ├─► First call (no cached grant):
    │       AgentCore Identity returns authorization URL
    │       on_auth_url raises AuthRequiredException(url)
    │       invoke() catches it → returns {type: 'auth_required', auth_url: ...}
    │       websocket Lambda forwards auth_url to browser
    │       Frontend shows consent link
    │
    │   PM clicks link → Cognito Hosted UI (consent page)
    │   PM approves → IdP redirects browser to
    │       /oauth/callback?session_id=<session_uri>&state=<user_id>
    │
    ├─► oauth-callback Lambda (lambda/oauth-callback/index.py):
    │       client.complete_resource_token_auth(
    │           sessionUri=session_uri,
    │           userIdentifier={'userId': state},
    │       )
    │       → AgentCore fetches + stores delegated token in token vault
    │       → Returns HTML "Authorization complete ✅"
    │
    │   PM clicks "I've approved — continue" in the chat UI
    │
    └─► Second call (grant now cached):
            IdentityClient.get_token() returns the delegated token directly
            agent calls Portfolio API with Bearer <token>
            Portfolio API authorizer validates token, enforces scope
            identity taken from JWT claims → the PM's own fund returned
```

A read-only view (the `positions_view` tool) requests only `scopes=['portfolio-api/read']`; a trade (the `trade_execute` tool) requests `scopes=['portfolio-api/read', 'portfolio-api/trade']`. Because the two scopes are granted by distinct consents, viewing positions can never silently escalate into the authority to trade.

Key implementation details:

- `_NoPoll` is a custom token poller that raises `AuthRequiredException` immediately rather than blocking for the SDK's default 600-second poll. The WebSocket channel cannot be held open that long.
- The conversation history is copied at the start of `process_message` and only committed to `_sessions` on a successful final answer. This prevents a dangling `tool_use` turn from corrupting the session state during the consent round-trip.
- `OAUTH_RETURN_URL` is the `/oauth/callback` route on the HTTP API. It is registered on both the Cognito portfolio OAuth client (as an allowed `callbackUrl`) and on the runtime's workload identity (`update-workload-identity --allowed-resource-oauth2-return-urls`) by `deploy.sh`. Both registrations are required.
- The callback Lambda is deliberately unauthenticated (`GET /oauth/callback` has no authorizer in the CDK stack). The browser arrives there via a redirect from the identity provider with no app JWT. Security comes from the `session_uri` + `custom_state` presented to `CompleteResourceTokenAuth`.

### 3.3 Outbound: Machine-to-Machine (M2M / client_credentials)

Not every downstream is a per-user resource. A market-data vendor licenses the **firm's application**, not the individual PM — so the correct credential there carries the *app's* identity, with no user subject. This is the mirror image of the 3LO flow, and the demo shows both.

The `market_data` tool calls a separate downstream (`lambda/market-data-api`, HTTP API with a Cognito JWT authorizer requiring the `market-data/read` scope) using a **client_credentials** token minted by AgentCore Identity for a dedicated confidential Cognito client (`agentcore-demo-marketdata-m2m`, `flows.clientCredentials: true`). Unlike 3LO, this uses the idiomatic SDK decorator, because the flow needs no per-request state:

```python
# agent/main.py
@requires_access_token(provider_name=M2M_PROVIDER_NAME, scopes=['market-data/read'],
                       auth_flow='M2M', into='access_token')
async def _fetch_market_data(dataset, *, access_token=''):
    ...  # access_token is a client_credentials token for the FIRM's app identity
```

There is no consent, no `on_auth_url`, no `AuthRequiredException` — the token returns directly on the first call. The market-data Lambda reads `client_id` (the app) from the validated JWT claims, not a user `sub`, and audit-logs the application as the acting principal. That the token carries no user identity is exactly right here: the data entitlement belongs to Meridian, not to Alice.

### 3.4 Outbound: API-key vault

Some services authenticate with a plain shared secret (an API key), not OAuth. AgentCore Identity provides an API-key vault so the key never lives as a plaintext credential in the agent. The `macro_indicator` tool fetches live FRED economic series (CPI, unemployment, fed funds, core PCE, 10Y) with the key pulled from the vault at call time via the idiomatic decorator:

```python
# agent/main.py
@requires_api_key(provider_name=FRED_APIKEY_PROVIDER_NAME, into='api_key')
async def _fetch_fred_series(series_id, *, api_key=''):
    ...  # api_key retrieved from the Identity vault, injected as a kwarg
```

Contrast this with the `bond-ingest` batch Lambda, which still receives the same FRED key as a plaintext `FRED_API_KEY` environment variable (`deploy.sh` → Lambda config). That is deliberately left as the "before": the agent tool is the best-practice "after". The runtime role's Secrets Manager grant is scoped to both `bedrock-agentcore-identity!default/oauth2/*` (3LO + M2M providers) and `.../apikey/*` (the FRED vault) — the apikey path is load-bearing; without it `GetResourceApiKey` fails.

**The decorator vs. direct-call split.** 3LO stays on the direct `IdentityClient.get_token` call because it needs a per-request `custom_state=user_id` (for session binding), which the `@requires_access_token` decorator binds at decoration time and cannot vary. M2M and API-key carry no per-user state, so the decorators fit cleanly — the demo shows both the manual and the ergonomic path, each where it belongs.

---

## 4. Key Design Decisions and Trade-offs

### 4.1 Separate downstream Portfolio API vs. reusing user_data_lookup

The `user_data_lookup` tool is also backed by DynamoDB and also returns per-user data (the PM's firm-directory profile). The question naturally arises: why not add the fund positions to the same table and the same gateway target?

The answer is that the delegated OAuth token would be meaningless if the downstream it calls is the same system the user just logged into. For the 3LO flow to demonstrate genuine per-user, per-action authorization, the downstream must be a **separate audience** with its own OAuth resource server scopes (`portfolio-api/read`, `portfolio-api/trade`). The Cognito access token the PM logs in with does not carry those scopes; only a token specifically issued for the `agentcore-demo-grades-oauth` client, after the PM explicitly consents, will. The JWT authorizer on the Portfolio API enforces those scopes per-route:

```typescript
// lib/agent_core-stack.ts
gradesApi.addRoutes({
    path: '/grades',
    methods: [apigateway.HttpMethod.GET],
    integration: gradesIntegration,
    authorizer: gradesJwtAuthorizer,
    authorizationScopes: ['portfolio-api/read'],  // enforced by API GW
});
```

If the same token that authenticates the WebSocket session also authorized the portfolio call, the demo would be circular: it would be "the user asked their own session to do something" rather than "the agent was delegated authority to act on a separate system."

### 4.2 USER_FEDERATION vs. machine-to-machine vs. token exchange

Three alternatives were considered for the portfolio call:

**M2M (client_credentials grant):** The runtime would use a static client credential to call the Portfolio API. Simple, but the token carries no user identity. The Portfolio API could not know which PM's positions to return or whose fund to trade against from the token claims alone; it would have to trust a `user_id` in the request body, which is forgeable. Audit logs would show the workload identity, not the acting PM. So M2M is the *wrong* shape for the Portfolio API — but the *right* shape for a downstream that genuinely licenses the application rather than the user. Meridian therefore uses M2M too, just elsewhere: the market-data vendor (§3.3), where "the token carries the app identity, not a user" is exactly what you want. The lesson is not "M2M is bad" but "match the credential shape to who the downstream actually trusts."

**OBO / token exchange:** Microsoft-style token exchange (RFC 8693) lets a service present an inbound user token to get a new token scoped to a downstream audience. Cognito does not implement the `urn:ietf:params:oauth:grant-type:token-exchange` grant, so this option is simply unavailable.

**USER_FEDERATION (3LO):** The PM explicitly consents via the Cognito Hosted UI. The resulting token is issued by Cognito under the `portfolio-api/*` scopes and carries the PM's `sub` in its claims. The Portfolio API reads identity from `requestContext.authorizer.jwt.claims` — the JWT authorizer's validated output, not a self-asserted request parameter. The trade handler executes the trade (request body: `ticker`, `side` of `buy`|`sell`, `target_allocation`) and writes an audit line in `lambda/grades-api/index.py` recording the PM identity and the before/after allocation taken from those claims and the stored position:

```python
# lambda/grades-api/index.py
print(json.dumps({
    'audit': 'trade_execute',
    'user_id': user_id,
    'portfolio_manager': username,
    'fund': fund,
    'ticker': ticker,
    'side': side,
    'before_allocation': before.get(ticker) if ticker else before,
    'after_allocation': target_allocation,
}, default=str), flush=True)
```

Under concurrent sessions (Alice and Bob using the chat simultaneously), each PM's token carries only that PM's `sub`. There is no shared credential that could leak cross-user, and no PM can trade against another PM's fund.

### 4.3 Cognito Hosted UI for the demo login

The demo frontend was switched to Cognito Hosted UI (OAuth authorization code + PKCE) from a direct `InitiateAuth` / `USER_PASSWORD_AUTH` call. The direct call was simpler but created a problem for the 3LO consent step: the consent page is also served by the Cognito Hosted UI, so a second login prompt would appear there unless the user already had a Hosted UI session cookie.

When the demo uses the Hosted UI for initial login, the browser acquires the Cognito Hosted UI session cookie. When AgentCore Identity later redirects the browser to the consent page, Cognito recognizes the cookie and shows the consent UI without prompting for credentials again. This makes the 3LO flow seamless from the user's perspective.

`deploy.sh` step 8 registers the real CloudFront callback URL on the web client after the distribution is provisioned (the domain is not known at CDK synth time). It also explicitly sets `ALLOW_USER_PASSWORD_AUTH` in `explicit-auth-flows` because CDK's `authFlows.userPassword: true` maps to that flow name.

### 4.4 Policy isolation for the toggle

The Cedar policy toggle is exposed via a dedicated `POST /policy/toggle` HTTP endpoint backed by the `agentcore-demo-policy-toggle` Lambda. This Lambda's IAM role holds `bedrock-agentcore:*` (which covers the undocumented `bedrock-agentcore:ManageAdminPolicy` action that `UpdatePolicy` requires in addition to itself).

The original design bolted the toggle into the WebSocket Lambda. That would have placed admin-plane policy permissions on the internet-facing, every-user handler. Moving the toggle to an isolated Lambda with its own role means the WebSocket Lambda's role never needs those admin actions. The HTTP endpoint is still Cognito-authorized (JWT), so it is not publicly accessible without a valid user token.

### 4.5 Vault tool has no direct-Lambda fallback

The `secure_vault` tool calls the Gateway (MCP endpoint) and does not fall back to a direct Lambda invocation if the Cedar policy blocks it. This is deliberate:

```python
# agent/main.py – execute_tool()
elif name == 'secure_vault':
    # Intentionally NO direct-Lambda fallback. If the Cedar policy blocks
    # the gateway, the agent must be unable to retrieve the secret — that
    # is the whole point of the policy demo.
    result = call_gateway_tool('secure-vault___secure_vault', inp)
```

In contrast, `user_data_lookup` does have a direct-Lambda fallback because blocking identity data would break unrelated demo scenarios. The vault's value as a policy demo depends entirely on the model being unable to produce the secret without the tool — a math problem is a bad policy demo because the model can compute the answer unaided.

### 4.6 Tool schema and Gateway naming conventions

Two findings worth noting for anyone extending the gateway targets:

- `toolSchema.inlinePayload` must be a JSON array of `{name, description, inputSchema}` objects, not a JSON string.
- `inputSchema` properties do not support `enum` (the Gateway validator rejects it). Valid values are listed in the `description` field instead.
- MCP tool names in the agent code use the format `{target-name}___{tool-name}` (three underscores), e.g., `secure-vault___secure_vault`.
- `create-gateway-target` requires `--credential-provider-configurations '[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]'`; omitting it causes an error.

### 4.7 Two enforcement points, one verified identity (and the impersonation guard)

Per-user authorization is enforced at **two** points, and both derive identity the same way — from a cryptographically verified Cognito token, never from a self-asserted body value:

1. **Runtime (primary).** `execute_tool()` funnels every governed tool through `_tool_allowed()`, which reads the caller's (and the agent workload's) entitlements. Two postures worth calling out:
   - **`anon` is barred from sensitive tools unconditionally.** An unauthenticated caller (no verified token → `anon`) can never reach `trade_execute`, `secure_vault`, `positions_view`, or `query_holdings` — this guard runs *before* any "RBAC feature off → allow" early-return, so it holds even on a deploy with no entitlements table.
   - **`RBAC_REQUIRED` opt-in.** By default an unwired entitlements table means "feature off → allow" (demo convenience). Setting `RBAC_REQUIRED=true` flips a missing table to **fail-closed** for any catalog (governed) tool.

2. **Gateway REQUEST interceptor (defense in depth).** The Gateway is CUSTOM_JWT-inbound, so the interceptor derives the principal from the **verified** `Authorization: Bearer` sub (its own RS256/JWKS check). The runtime also injects a `__principal` in the tool body — but this is **no longer an identity source**. It is a *tamper cross-check*: if it disagrees with the verified JWT sub, the call is **denied as impersonation**. This closes a real hole — because the Gateway is CUSTOM_JWT, an authenticated user could otherwise call it directly with their own valid token but a forged `__principal=user#<someone-else>` and impersonate the victim at the boundary the design calls "strongest." (The dormant, never-set `X-Meridian-Principal` header channel was removed.) A pool-less local-dev deploy that *cannot* verify tokens is the only case that still trusts `__principal`, and there the Gateway can't be CUSTOM_JWT anyway.

### 4.8 Identity-governed data: the `query_holdings` Aurora tool

`query_holdings` is the first **non-Lambda** Gateway target — an OpenAPI/HTTP endpoint over an Aurora PostgreSQL "client holdings ledger." It demonstrates identity governing **data**, not just tool access, in two layers stacked under the tool-level grant:

- **Row-level (RLS).** A Postgres row-level-security policy scopes rows to the caller's **desk** (a capital-markets PM never sees banking rows), keyed off a session GUC the resolver sets inside its Data-API transaction. `FORCE ROW LEVEL SECURITY` makes the policy apply to the table owner too (the Data API connects as owner) — the linchpin, or all row governance would be silently bypassed.
- **Column-level (masking view).** A governed view masks `client_name` (PII → `REDACTED`) and `notional` (→ NULL) unless the caller's **tier** is `senior`. The resolver only ever selects the view, never the base table.

The identity that keys all of this is `principal_sub`, and it can't be spoofed by the model: the runtime injects the verified caller sub (clobbering any model value), and the Gateway interceptor **re-asserts** it from the verified principal before forwarding (the `GOVERNED_DB_TARGET` injection in §4.7's interceptor). A missing/malformed `principal_sub` is a hard 400 in the resolver — never an unscoped scan.

---

## 5. Observability

### ADOT in the container

The agent container's CMD is:

```
opentelemetry-instrument python main.py
```

`opentelemetry-instrument` is the AWS Distro for OpenTelemetry (ADOT) auto-instrumentation launcher installed via `aws-opentelemetry-distro` in `agent/requirements.txt`. The runtime injects most OTEL environment variables automatically when `AGENT_OBSERVABILITY_ENABLED=true`; `deploy.sh` also sets `OTEL_PYTHON_DISTRO=aws_distro`, `OTEL_PYTHON_CONFIGURATOR=aws_configurator`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, and `OTEL_TRACES_EXPORTER=otlp` to be explicit.

Spans export to CloudWatch (`aws/spans` log group) and X-Ray. The CloudWatch GenAI Observability console (`CloudWatch → GenAI Observability → Bedrock AgentCore`) provides a trace view per session. CloudWatch Transaction Search must be enabled in the account once before spans land there.

Additional per-resource delivery (gateway invocations, memory operations, code interpreter executions) is configured separately by `enable-observability.sh` after deploy.

### Identity spans and what they prove

The 3LO flow produces two categories of spans in `aws/spans`:

- **`GetWorkloadAccessTokenForJWT`** — carries `user_sub` from the inbound Cognito token. This proves the runtime knew which user was calling and issued a workload token bound to that user.
- **`GetResourceOauth2Token`** — carries `workload.identity.id` and `oauth2.flow`. With `oauth2.flow=USER_FEDERATION` this proves the agent called the token-vending endpoint as a specific workload acting on a specific user's behalf; the same span appears with `oauth2.flow=M2M` (and **no** user subject) for the `market_data` machine-to-machine call, proving the agent acted as the firm's application rather than on any user's behalf.
- **`GetResourceApiKey`** — appears for the `macro_indicator` FRED call, proving the outbound key was fetched from the AgentCore Identity vault at call time rather than held as a plaintext credential.

Together with the Portfolio API's own audit log (CloudWatch log group for `agentcore-demo-grades-api`), these spans allow an auditor to answer: "Did alice@demo.com specifically authorize this agent invocation to execute a trade in her Core Bond Fund?" The answer is yes, and it is verifiable across three independent log sources without any app-layer claim-forwarding.

---

## 6. Security Notes and Known Simplifications

These are the gaps the demo accepts in exchange for clarity and deployability. They are documented in code comments and the `README.md`, and are repeated here for completeness.

### 6.1 OAuth callback binding — hardened (no longer trusts an echoed identifier)

**This was previously a gap and has been closed.** The 3LO `custom_state` used to be the originating user's `sub` — a *guessable* value that the callback then trusted verbatim (`userIdentifier={'userId': state}`), so an attacker racing the consent window could bind the grant to another user. Now:

- `custom_state` is an **unguessable, single-use 256-bit nonce** (`secrets.token_urlsafe`), meaningless on its own — it only keys a server-side `oauth-sessions` row.
- At request time the runtime stashes the caller's **already-verified** inbound JWT under that nonce (the token whose RS256 signature it verified in §3.1).
- The callback (`lambda/oauth-callback/index.py`) dereferences the nonce, binds with `userIdentifier={'userToken': <verified JWT>}` — never a redirect-supplied identifier — and **consumes** the row (`delete_item` with `ReturnValues=ALL_OLD`) so a replay finds nothing.
- If the nonce doesn't resolve (unknown / expired / already used), the callback **fails closed** with HTTP 403 — there is no `userId` fallback.

The residual limitation is that the callback is still not tied to a first-party browser session cookie (the callback Lambda has no app session to compare against); the nonce's unguessability + single-use + fail-closed posture is what removes the practical CSRF/racing vector for the demo.

### 6.2 IAM breadth

The runtime role uses `bedrock-agentcore:*` on `Resource: *`. The gateway role uses `lambda:InvokeFunction` on `Resource: *`. These should be scoped to specific resource ARNs in a production deployment. The broad `bedrock-agentcore:*` verb is retained deliberately (flagged `PROD:` in code) because the exact action set varies across SDK versions of the identity/gateway calls; tightening it is a version-pinned exercise, not a one-line change.

### 6.3 CORS and Cognito password policy

HTTP API CORS is `allowOrigins: ['*']`. Restrict to the CloudFront domain. The Cognito pool has a relaxed password policy (minimum 8 characters, no complexity requirements) and self sign-up disabled.

### 6.4 Code Interpreter local fallback

`agent/main.py` contains a last-resort fallback that runs model-generated Python directly inside the container using `exec()` if the AgentCore Code Interpreter is unavailable. This runs with full container privileges and no sandbox isolation. The code is flagged with a comment block; it must be removed for any non-demo deployment.

### 6.5 Vault secrets are hardcoded

`lambda/vault-tool/index.py` contains hardcoded compliance and market-data values (`restricted_list`, `bloomberg_terminal_pin`, `oms_master_pin`, `counterparty_credit_memo`). These should come from AWS Secrets Manager or Parameter Store in production. Note this is distinct from the FRED API key, which *is* handled correctly for the agent path: `macro_indicator` pulls it from the AgentCore Identity API-key vault (§3.4). Only the `bond-ingest` batch Lambda still takes FRED as a plaintext env var — intentionally left as the "before" the vault replaces.

### 6.6 The connect-time token check is structural, not cryptographic

`_check_token()` in the websocket Lambda checks token structure, expiry, issuer, and `client_id` but does not verify the RS256 signature (the Lambda asset is intentionally dependency-free — no native crypto wheel; a bundled `cryptography` wheel previously caused an ELF-arch bug). This is acceptable because the signature **is** verified by the runtime's `customJWTAuthorizer` on every invoke *and* by the runtime's own `_verify_cognito_token()` (§3.1). The connect-time check exists to fast-reject malformed/expired tokens and bind a verified-enough identity to the connection record. It now binds issuer and `client_id` **exactly** (a token that omits either is rejected — previously an absent claim slipped through), so the edge gate is honest even though the authoritative RS256 check lives one hop downstream.

### 6.7 Deploy-time secret handling, JWKS caching, and identity observability

Smaller hardening items, noted for completeness:

- **Provider secrets are off the process argv.** `deploy.sh` creates the 3LO and M2M OAuth2 credential providers by writing the config (including `clientSecret`) to a `600`-perm temp file and passing `file://…` — so the secret isn't visible to a local `ps` — then deletes the file. (A production build would create the provider via an SDK call reading the secret straight from Secrets Manager.)
- **JWKS caches carry a TTL.** Both RS256 verifiers (runtime and Gateway interceptor) cache Cognito public keys per-kid with a 1-hour TTL and always refetch on an unknown kid, so a rotated signing key is picked up promptly and stale key objects don't live for the whole warm-container lifetime.
- **Identity spans cover all three flows.** `enable-observability.sh` wires span/log delivery for the 3LO, M2M, **and** API-key vault credential providers (it previously covered only 3LO), so the per-flow traceability in §5 isn't limited to the user-delegated path.
- **`AGENT_WORKLOAD_NAME` (RBAC key) vs. the workload-identity resource.** The runtime's agent-side credential-grant key is `AGENT_WORKLOAD_NAME` (= the runtime *name*), which is distinct from the underlying AgentCore workload-identity *resource* (tied to the runtime *id*). They are intentionally decoupled for the demo; a production deployment would bind the RBAC agent principal to the concrete workload-identity ARN.

---

## 7. Repository Layout Reference

```
bin/agent_core.ts            CDK app entry point (reads DEMO_ENV for parallel deploys)
lib/agent_core-stack.ts      CDK stack definition
deploy.sh                    Full deploy: CDK + AgentCore CLI + container push
cleanup.sh                   Full teardown
enable-observability.sh      Per-resource vended log/trace delivery
agent/
  main.py                    Agent code (BedrockAgentCoreApp, all tool handlers, 3LO flow)
  Dockerfile                 arm64 container, ADOT auto-instrumented
  requirements.txt           Python dependencies including bedrock-agentcore SDK + ADOT
lambda/
  websocket/index.py         Chat handler: bearer invoke, session state, auth_required relay
  policy-toggle/index.py     Cedar permit/forbid toggle (isolated role)
  oauth-callback/index.py    3LO session-binding callback (CompleteResourceTokenAuth)
  grades-api/index.py        Downstream Portfolio API resource server (3LO; JWT authorizer, trade audit log)
  market-data-api/index.py   Downstream market-data vendor (M2M; JWT authorizer on market-data/read, app audit log)
  vault-tool/index.py        Gateway target: compliance/market-data secrets only the Lambda holds
  userdata-tool/index.py     Gateway target: per-PM firm-directory DynamoDB data
frontend-react/              React/AG-UI SPA (Hosted UI auth, WebSocket chat, swarm/graph viz, RBAC console)
docs/
  DESIGN.md                  This document
  architecture.svg            Architecture diagram
```

---

## 8. Deployment Sequencing Details

The 8-step deploy sequence in `deploy.sh` has a few ordering constraints worth understanding:

1. **CDK first** — Cognito pool/clients, Lambda ARNs, API endpoints, and the ECR repo are all needed before any AgentCore resource is created.
2. **Container before runtime** — The runtime references the container URI at creation time. The image must be in ECR before `create-agent-runtime`.
3. **Memory, gateway, policy engine before runtime** — The runtime's environment variables reference all of these by ID. They are created in step 5 so step 6 (runtime) can wire them in.
4. **OAuth2 credential provider before runtime** — `CREDENTIAL_PROVIDER_NAME` is an env var on the runtime. The provider must exist first.
5. **Workload identity update after runtime endpoint** — `update-workload-identity --allowed-resource-oauth2-return-urls` can only be called once the runtime exists and has an ID. The workload identity's name equals the runtime ID.
6. **Cognito callback URL registration after credential provider** — The credential provider creates its own callback URL (a bedrock-agentcore-hosted URI); that URL must be added to the Cognito client's allowed callback list before the first consent redirect.
7. **Lambda env var update after runtime** — `AGENT_RUNTIME_ARN` cannot be set on the websocket Lambda until the runtime ARN exists.
8. **Frontend config and second CDK deploy last** — `frontend-react/dist/config.js` is written at the very end with all resolved endpoints; a second `cdk deploy` pushes the updated config to S3 and invalidates CloudFront. (The React app itself is built up-front in step 0 so a broken build aborts the deploy immediately.)

The `DEMO_ENV` variable threads through every step to support parallel ("green") deployments. Setting `DEMO_ENV=test` suffixes every physical resource name so the test stack coexists with the live stack in the same account without touching it.
