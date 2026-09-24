# Design Decision — API Consolidation (browser → CloudFront → single gateway)

**Status:** proposed · **Date:** 2026-07-15 · **Author:** Kiro (for Roshan/Raphael review)
**Spec:** `BUILD_TASK_CF_CONSOLIDATION_ARCHITECTURE.md` (Quick/V6, from Raphael's 14-Jul critique)
**Note:** the spec was filed under `kyc_banking/docs/` by mistake; this work is entirely
`kyc_governance_insights`. `kyc_banking` (B01, Vivian et al.) is not touched.

## Problem (recap)
The KYC Governance console calls **6 public API Gateways directly from the browser**, with the
`x-api-key` baked into the JS bundle / `runtime-config.json`, and account-specific `execute-api`
URLs committed to git. This is not portable, leaks the key to DevTools, needs per-APIGW CORS, and
diverges from the AVA pattern (browser → CloudFront → backend).

## Non-negotiable constraints (from spec)
Portable (no account URLs in config) · no creds in browser · same-origin (no CORS) · aligned with
AVA CF→backend pattern · no functional regression (8 services keep working) · controls eventually
inline in the agent flow (phased).

## Options considered

| # | Option | Same-origin | Key hidden | CF surgery | APIGW sprawl | Verdict |
|---|--------|-------------|-----------|-----------|--------------|---------|
| A | **Multi-origin on CF** — 6 CF origins + 6 `/svc/*` behaviors + a prefix-strip CF Function; inject key via Origin Custom Header per origin | ✅ | ✅ (edge) | **Heavy** (6 origins, 6 behaviors, 1 function) | unchanged (6) | ❌ bloats the shared multi-console distribution; most edit-risk on a live dist |
| B | **Single consolidated HTTP API** — one `kyc-console-gateway` (API Gateway HTTP API) with `ANY /svc/{service}/{proxy+}` routes HTTP-proxying to each existing backend APIGW; **one** CF origin + **one** `/svc/*` behavior; CF injects `x-api-key` as an Origin Custom Header | ✅ | ✅ (edge→gateway, never browser) | **Light** (1 origin, 1 behavior) | +1 thin layer, backends reused | ✅ **Recommended** |
| C | Single APIGW + one new router Lambda replacing the proxies | ✅ | ✅ | Light | collapses to 1 | ❌ throws away 6 working, already-fixed proxies; high rewrite risk |
| D | CF → ALB → services (full control-plane pattern) | ✅ | ✅ | Heavy (new ALB/ECS) | — | ❌ over-engineered; our services are Lambdas, not a FastAPI app |

### Why B (and why I disagree with my own earlier Option-A instinct)
- It's **literally Raphael's suggestion** — "one single APIGW with different paths for the action it needs to trigger."
- **Minimal change to the shared, live CloudFront distribution** (1 origin + 1 behavior) — far lower blast radius than adding 6 origins/behaviors to a distribution that also serves `/claims`, `/mortgage`, `/trade`.
- **Reuses the 6 backend proxies** we already fixed this cycle (Cedar, grounding, AR, HITL, registry, validator) — no functional rewrite, easy rollback (just revert the CF behavior + config).
- **Path handling falls out for free**: HTTP API route `ANY /svc/cedar/{proxy+}` → integration `https://xgkacmjesb…/{proxy}` — no CloudFront Function needed to rewrite URIs (Option A needed one).
- **One place for auth**: the consolidated gateway is the single choke point; the key is injected by CloudFront as an origin header and forwarded to backends. The browser never holds it.

## Chosen architecture (Phase 1)

```
Browser ──/svc/<service>/<path>──▶ CloudFront (same dist as UI, basic-auth gate)
   (no key, relative paths)          │  Origin Custom Header: x-api-key + x-tenant-id  (injected here)
                                      ▼
                       kyc-console-gateway  (API Gateway HTTP API, our account)
                         ANY /svc/cedar/{proxy+}     ─▶ xgkacmjesb  (cedar)
                         ANY /svc/registry/{proxy+}  ─▶ cyrqxuao3b  (registry+eval)
                         ANY /svc/hitl/{proxy+}      ─▶ tovdy9yzy9  (hitl)
                         ANY /svc/grounding/{proxy+} ─▶ mindupjlp8  (grounding)
                         ANY /svc/validator/{proxy+} ─▶ n79e2ivfai  (validator)
                         ANY /svc/metrics/{proxy+}   ─▶ dfa5nbg508  (metrics)
                         GET /svc/health             ─▶ 200 (static)
```

- **runtime-config.json** → relative bases only, **no `api_key`**:
  `cedar_api_url:"/svc/cedar"`, `registry_api_url:"/svc/registry"`, … Portable across accounts.
- **Frontend**: a shared API client sets the base from config and **stops sending `x-api-key`**; all `${X_API}/path` calls become `/svc/x/path` (same-origin).
- **Auth model (Phase 1):** CloudFront injects the single `x-api-key` origin-side; the consolidated gateway forwards it to the backend APIGWs (they already validate it). Browser never sees it.
- **CORS:** disappears — all calls are same-origin to the CF domain.

## Phasing (recommended)
- **Phase 1 — routing consolidation (this build):** stand up `kyc-console-gateway`, add the single CF `/svc/*` behavior + origin header, flip the frontend to relative paths, drop `api_key` from config. TEST first, verify all 8 services same-origin with no key, then PROD. **Rollback:** revert config to absolute URLs (old APIGWs stay live).
- **Phase 2 — lock the backends to CF-only (hardening):** CloudFront injects a shared secret; backend APIGWs (or a Lambda authorizer) reject requests without it, so the raw `execute-api` URLs stop working directly. Closes the "APIGWs still publicly reachable" gap.
- **Phase 3 — controls inline (separate iteration):** move Cedar/Grounding/AR evaluation *into* the AgentCore agent flow; UI becomes read-only over DynamoDB results. Depends on AgentCore orchestration changes; out of scope for the routing fix.

## Where this diverges / open calls for Roshan+Raphael
1. **Path prefix:** I chose `/svc/*` to avoid colliding with the prod dist's existing `/api/*` (PaceBackend) and `/api-b/*` (ScenarioBBackend) behaviors. If you'd rather match AVA's `/api/*` convention, we'd need a non-colliding sub-path (e.g. `/api/kyc/*`). **Flag if you have a preference.**
- 2. **`runtime-config.json` in git:** the AVA release convention (kickstarter `03`) *tracks* runtime-config on GitLab and scrubs it at the GitHub release cut. I earlier gitignored it (commit `37e9d135`) for portability. With relative paths there are **no secrets left in it**, so it becomes portable-by-construction and can safely be tracked again — I recommend **reverting the gitignore** and keeping the (now secret-free) config tracked, aligning with the AVA release flow. Confirm.
3. **AgentCore invoke endpoints** (`59y7veoya3` Acme, `qwcwi5hfz8` Omega) are in the spec's current-state list; Basic/Advanced mode wiring for those should route through `/svc/agentcore/*` the same way.

## Acceptance criteria mapping
1 no direct execute-api in Network tab → ✅ all via `/svc/*`. 2 no `x-api-key` in requests → ✅ injected at CF. 3 no CORS → ✅ same-origin. 4 no account URLs in config → ✅ relative. 5 deploy to new account w/o config change → ✅ (infra deploy sets the CF origin; config is relative). 6 all services work → verified TEST→PROD. 7 `/svc/health` 200. 8 Playwright updated to relative URLs.

## Deliverables
This doc → **review/approve** → then: IaC for `kyc-console-gateway` (CFN template, per convention) + CF behavior/origin change (CLI, since CFN on the shared dist is out of band) + frontend shared-client refactor + config flip + Playwright update. TEST first, PROD on sign-off.

---

## Applied infrastructure (Phase 1 + 1.5) — as deployed

**Consolidated gateway (both accounts share it in ours):** HTTP API `kyc-console-gateway`
(id `46md2r9izf`, us-east-1). Routes `ANY /svc/{cedar,registry,hitl,grounding,validator,metrics}/{proxy+}`
+ `GET /svc/health` → HTTP-proxy to each backend. IaC: `use_cases/kyc_governance_insights/deploy/console-services/console-gateway/template-cfn.yaml`.

**CloudFront (applied via CLI on the shared dists — CFN is out of band):**
- Added origin `svc-gateway` (domain = gateway) with Origin Custom Headers `x-api-key` + `x-tenant-id`.
- Added behavior `/svc/*` → `svc-gateway` (CachingDisabled `4135ea2d-…`, AllViewerExceptHostHeader `b689b0a8-…`, all methods).
- **TEST** `E1V1IBH8DIKFGR` (`d3r8o92vlqvocy`): `/svc/*` is **open** (no auth function) — intentional dev surface.
- **PROD** `E1Q6VO2AHA03JB` (`d34f241zukf5gh`): `/svc/*` has viewer-request function **`kyc-svc-basic-auth`** (auth-only, realm `"KYC Governance Demo"` — matches the page gate so the browser forwards cached creds to same-origin `fetch`; anonymous/direct → 401).

### `kyc-svc-basic-auth` function source (cloudfront-js-2.0, viewer-request)
```js
function handler(event) {
  var h = event.request.headers;
  var expected = "Basic ZnNpZ292ZGVtbzpGc2lEZW1vMjAyNg=="; // fsigovdemo:FsiDemo2026
  if (h.authorization && h.authorization.value === expected) { return event.request; }
  return { statusCode: 401, statusDescription: "Unauthorized",
           headers: { "www-authenticate": { value: 'Basic realm="KYC Governance Demo"' } } };
}
```

### Verification (curl)
- PROD `/svc/health` → 401 without creds, 200 with; `/svc/{registry,cedar,grounding,validator}` → 200 with creds (POST bodies pass through).
- TEST `/svc/health` → 200 (open). Served `runtime-config.json` on both → relative `/svc/*`, no `api_key`.

### Rollback
- Config: re-upload `/tmp/prod-runtime-config.backup.json` to the prod bucket + invalidate `/runtime-config.json`.
- CF: remove the `/svc/*` behavior + `svc-gateway` origin (and the `kyc-svc-basic-auth` association) via `update-distribution`. Old backend APIGWs remain live throughout, so rollback is non-destructive.

## Status
Phase 1 (routing consolidation) + Phase 1.5 (PROD `/svc` auth) **done, deployed, verified** on TEST + PROD.
Playwright (accept. #8): **N/A** — this UI has no e2e test suite (only `dev`/`build`/`preview`).
Phase 3 (controls inline in AgentCore flow) remains.

---

# Phase 2 — lock the raw backends to CloudFront-only (hardening)

**Status:** **done, deployed, verified on TEST + PROD** · **Date:** 2026-07-15

## Problem (the residual gap after Phase 1)
Phase 1 stopped the browser from holding the key and moved all traffic same-origin through
`/svc/*`. But the 6 backend `*.execute-api.*` URLs are **still directly reachable**, and each one
validates the **publicly-known** `x-api-key` (`FsiDemo2026-ProxyAuth`) — which was visible in the
browser before Phase 1, so it must be treated as compromised. Anyone with that key can call the raw
backends (or the console gateway) directly, bypassing the CloudFront auth gate. Closing this is the
whole point of Phase 2.

## Key finding from recon
The backends are **HTTP APIs (v2)**, which have **no native API-key mechanism** — each backend
**Lambda checks `x-api-key` in its own code** (confirmed in `deterministic-validator/index.py`:
`if API_KEY and hdrs.get("x-api-key") != API_KEY: return 403`). So the "key" is application-level,
not an API Gateway usage-plan key. This shapes the options below.

Recon also confirmed: `cedar, registry, hitl, grounding, validator` are **KYC-exclusive** (referenced
only by the KYC consoles), while **metrics `dfa5nbg508` is shared** (also in the control-plane
`offerings.json`). So metrics must be left key-only; the other five can be locked.

## Options considered

| # | Option | Non-invasive to backend Lambdas | Works on HTTP API (v2) | CF-only enforceable | Reversible | Verdict |
|---|--------|-------------------------------|------------------------|---------------------|-----------|---------|
| A | **Shared APIGW REQUEST Lambda authorizer** checking a CF-injected secret header `x-origin-verify` on the 5 backends; secret held in **AWS Secrets Manager** (encrypted at rest, rotatable), read by the authorizer at runtime | ✅ (APIGW layer only) | ✅ | ✅ | ✅ (detach) | ✅ **Recommended** |
| B | Rotate the shared `x-api-key` to a strong secret, hold it only in the CF origin header | ✅ | ✅ | partial | ✅ | ❌ the key is **shared with metrics/control-plane** — rotating it breaks `offerings.json`; and it's the same value everywhere |
| C | Add an `x-origin-verify` check **inside each backend Lambda** | ❌ touches 5 live functions | ✅ | ✅ | medium | ❌ higher regression risk; HITL stack redeploy is already blocked by an account hook (see KNOWN_GAPS) |
| D | CloudFront **OAC / SigV4** to the origin | ✅ | n/a | ✅ | ✅ | ❌ CF OAC signs only S3 / Lambda function URLs / MediaStore — **not** arbitrary API Gateway; would need Lambda@Edge signing. Over-engineered for a demo |
| E | REST-API **resource policy** (allow only CF) | ✅ | ❌ | ✅ | ✅ | ❌ resource policies are REST-only; these are HTTP APIs |

### Why A
- **Non-invasive:** nothing touches the 5 backend Lambdas or their (partly un-redeployable) stacks;
  the authorizer is a pure APIGW-layer addition, attached via CLI and removable via CLI.
- **Right enforcement point:** the secret is injected **at CloudFront** (the authenticated edge),
  so it never reaches the browser. The **console gateway does not inject it**, so hitting the gateway
  directly is rejected too — only genuine browser→CF→gateway→backend traffic carries the header.
- **Doesn't disturb the shared key:** `x-origin-verify` is a *new, dedicated* secret on the 5
  KYC-exclusive backends; the shared `x-api-key` (needed by metrics/control-plane) is untouched.
- **Cacheable + cheap:** HTTP API REQUEST authorizer with a 300s result TTL keyed on the header;
  a missing header is 401'd by API Gateway *without* invoking the Lambda.

## Chosen architecture

```
Browser ──(no secret)──▶ CloudFront /svc/*  ──Origin Custom Header  x-origin-verify: <secret>──▶
   kyc-console-gateway (46md2r9izf)  ──HTTP_PROXY forwards the header──▶  backend HTTP API
        backend route AuthorizationType=CUSTOM ─▶ kyc-origin-verify-authorizer
              isAuthorized = (x-origin-verify == secret)      # missing header → 401 (pre-Lambda)
```

- **Secret (SECURITY.md-aligned):** generated by CloudFormation into **AWS Secrets Manager**
  (`kyc/origin-verify`, encrypted at rest, rotatable). The authorizer reads it at runtime (env var
  holds only the ARN) with a 300s in-memory cache; its role can read **only that one secret**
  (least privilege). CloudFront carries the literal value as the `x-origin-verify` Origin Custom
  Header on **both** dists (CF can't reference Secrets Manager) — injected via a helper that reads
  it straight from Secrets Manager, so the value never hits the CLI, disk, git, or the browser.
  **Residual (documented, not a shortcut):** the value is plaintext-at-rest inside the CloudFront
  distribution config (readable only via `cloudfront:GetDistributionConfig`); inherent to origin
  custom headers, gated by control-plane IAM, accepted for the demo.
- **Metrics `dfa5nbg508` excluded** — recon showed it is **not in this account** (cross-account
  control-plane); never a candidate. Left untouched.

## Rollout ordering (no breakage window)
1. Deploy the authorizer stack (secret set).
2. **Inject the CF header first on both dists** — harmless: backends ignore an unknown header until
   an authorizer is attached.
3. **Verify-one:** attach to `validator` only, confirm CF path still 200 and the raw validator URL
   now 401 (this empirically proves the header survives the CF→gateway→backend hop — the one open
   assumption).
4. Attach to the remaining four; run `phase2-verify.sh` on TEST then PROD.

## Rollback
`phase2-rollback.sh` sets every CUSTOM route back to `NONE` and deletes the authorizers
(non-destructive — backends keep working via their in-Lambda `x-api-key` check, which CF still
sends). Leaving the CF header in place afterwards is harmless.

## Acceptance criteria (Phase 2)
1. Raw backend URL + old key → **401** for all 5 locked backends.
2. Console gateway hit directly (no CF) → **401**.
3. Through CloudFront `/svc/*` → **200** on TEST and PROD (no functional regression).
4. Metrics still reachable (unchanged) — narrative fidelity preserved.
5. Secret is absent from git, the template, env vars, the JS bundle, and browser requests;
   held encrypted-at-rest in Secrets Manager with least-privilege read (SECURITY.md).
6. Public-repo-safe: `template-cfn.yaml` hardcodes no secret and no account-specific value
   (backend ids are the only literals, and they are the routing targets, not credentials).

## Deliverables (built this session)
`deploy/console-services/origin-verify-authorizer/`:
`template-cfn.yaml` (authorizer Lambda + role + Secrets Manager secret, least-priv read) ·
`phase2-deploy.sh` (stack + CF header inject) · `phase2-cf-inject-header.py` (CF Origin Custom
Header add/remove; reads the value from Secrets Manager, stdlib-only) · `phase2-attach.sh` (create
authorizers + attach to routes, idempotent, verify-one via `BACKENDS=`) · `phase2-verify.sh` ·
`phase2-rollback.sh` · `README.md`.

## Applied (as deployed) — 2026-07-15
- Stack **`kyc-origin-verify-authorizer`** deployed: authorizer Lambda `kyc-origin-verify-authorizer`
  (reads the secret from Secrets Manager at runtime, 300s cache), role
  `kyc-origin-verify-authorizer-role` (least-priv: `secretsmanager:GetSecretValue` on the one
  secret), and Secrets Manager secret **`kyc/origin-verify`** (CFN-generated, encrypted at rest).
  The `x-origin-verify` value is injected into both dists' CF origin headers from Secrets Manager;
  it is not in the template, an env var, or on disk. (An initial env-var build was migrated to
  Secrets Manager the same day to comply with SECURITY.md ahead of the eventual public release.)
- **`x-origin-verify` Origin Custom Header** added to the `svc-gateway` origin on **both** dists
  (TEST `E1V1IBH8DIKFGR`, PROD `E1Q6VO2AHA03JB`); both reached `Deployed` before any attach.
- REQUEST authorizer (`kyc-origin-verify`, 300s TTL, identity source `$request.header.x-origin-verify`,
  simple response) created on and attached to **all routes** of the 5 KYC-exclusive backends:
  cedar `xgkacmjesb` (`$default`), registry `cyrqxuao3b` (7 routes), hitl `tovdy9yzy9` (`$default`),
  grounding `mindupjlp8` (2 routes), validator `n79e2ivfai` (2 routes).
- **metrics excluded** — recon confirmed `dfa5nbg508` is **not in this account** (cross-account
  control-plane), so it was never a candidate; left untouched.
- **Verification (curl), both TEST + PROD:** raw `execute-api` + old key → **401** for all 5;
  console gateway hit directly → **401**; through CloudFront `/svc/*` → **200** (health, registry,
  validator). No functional regression; Basic-mode narrative untouched (backend-only change).
- **Rollout was verify-one-first** (validator only) to prove the header survives the
  CF→gateway→backend hop before touching the other four.
- **Rollback:** `phase2-rollback.sh` (routes → NONE, delete authorizers); non-destructive.
