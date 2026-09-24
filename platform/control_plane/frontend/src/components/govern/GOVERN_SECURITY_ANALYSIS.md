# Govern Branch — Pre-Merge Security Analysis

---

## Pre-release gate (policy round) — 2026-09-02

Review type: Read-only security review of the AgentCore Policy + A2A-Trust surfaces changed this
round (region-split fix + seeded-data exposure).
Scope reviewed:
- `backend/src/api/routes/policies.py`, `backend/src/services/policy_service.py` (region-split fix)
- `backend/src/api/routes/govern_a2a_trust.py`, `services/govern_a2a_trust_service.py`, `models/govern_a2a_trust.py`
- `docker-compose.yaml` (`POLICY_ENGINE_ID` added)
- Seeded-data GETs: `/policies`, `/policies/engines`, `/policies?engine_id=`, `/govern/a2a-trust/{policies,identities}`

### MUST-FIX COUNT: 1

Findings, most-severe first.

#### [MUST-FIX] Create-policy response returns the full `policyArn` (real account id) unmasked
- `PolicyService.create_policy` appends a `StatusHistoryEntry` whose `message` is
  `f"Deployed to AgentCore (ARN: {agentcore_arn})"` (`policy_service.py:258-264`). `agentcore_arn` is
  `response["policyArn"]` from `create_policy` — a full ARN
  (`arn:aws:bedrock-agentcore:<region>:<ACCOUNT_ID>:...`) that embeds the real 12-digit account id.
- `POST /api/v1/policies` has `response_model=Policy`, and `Policy.status_history` is serialized, so
  the create response ships the account id to the frontend **unmasked**. This contradicts the hard
  rule that the account id must not appear in any API response, and `core/security_utils.mask_arn` /
  `mask_account_id` exist precisely to prevent this.
- Nuance (does not clear it): OPERATOR-gated; the ARN is the account's own resource; and the line is
  pre-existing (not introduced by the region-split). But the file is in-scope this round and the
  exposure is real. Fix: mask the ARN in the status-history message (e.g. `mask_arn(agentcore_arn)`)
  or drop the account/region portion before it reaches the response.
- NOT affected: `list_policies` and `get_policy` construct `Policy` with an empty `status_history`
  and expose no ARN-bearing field (`policy_id/name/description/resource_type/resource_id/status/
  rules/rules_count/blocking_rules/created_by/timestamps` only). The seeded-data GET paths in scope
  are clean.

### Accepted warnings

1. **`AgentIdentity.role_arn` is returned unmasked by `GET /govern/a2a-trust/identities` (VIEWER)**
   (`models/govern_a2a_trust.py:47`; `service.list_identities`). It defaults `None` and no in-repo
   seed populates it, so no account id is exposed today. Latent: if an OPERATOR ever upserts an
   identity with a real role ARN, a VIEWER would see the account id. Recommend masking on read.
2. **`USE_DEV_AUTH=true`** in `docker-compose.yaml:68` — expected for the local demo. Accepted:
   `rbac.py::_is_dev_auth_allowed()` hard-disables the bypass whenever `ENVIRONMENT=production`, even
   if the flag is set, so it cannot weaken a prod deploy.
3. **`create_policy` accepts raw `cedar_code` and `rules_to_cedar` interpolates `rule.target`/
   `rule.value` into Cedar strings** (`policy_service.py:47-73,185`). OPERATOR-gated, validated
   server-side by AgentCore, and pre-existing — out of the region-change scope. The **seeded** path
   uses server-defined presets (`FSI_POLICY_PRESETS`) with constant targets/values and generates
   Cedar via `rules_to_cedar`; no user-injected Cedar reaches the seed. Note only.

### Task verifications (PASS)

1. **Account-ID / ARN leak scan** — the real 12-digit account id has **zero** matches anywhere in the working tree.
   Every 12-digit ARN found is a placeholder (`123456789012`, `000000000000`, `111111111111`,
   `222222222222`, `999999999999`, `111122223333`) in docs/tests/fixtures — no real account. In
   `policies.py`, ARNs are runtime f-string TEMPLATES: `account_id` comes from
   `boto3.client("sts").get_caller_identity()["Account"]` (lines 252-253, 294-295) — not hardcoded.
   `docker-compose.yaml` `POLICY_ENGINE_ID=PolicyEngine_P1-y_2qsnuwtp` is a resource id, not an
   account/ARN. `policy_service.py` builds no ARN from an account id.
2. **Response masking** — see MUST-FIX (create response) + warning #1 (role_arn). `list_policies`/
   `get_policy`/engines/observability responses carry no unmasked account id.
3. **RBAC** — all `policies.py` routes retain `require_role`: engines GET=VIEWER, POST=OPERATOR,
   DELETE=ADMIN, attach/detach/set-mode=OPERATOR, gateways/presets/list/get/audit/metrics/
   observability/evaluate=VIEWER, create/update/delete/activate/disable=OPERATOR. The region change
   only added `agentcore_region` to `get_service()` — no auth dropped.
4. **Input handling** — region is sourced from `settings.GOVERN_AWS_REGION` (env), never
   user-controlled; no new injection surface. Seed Cedar is server-generated from presets.
5. **A2A AuthZ unchanged** — create (`POST /policies`) = OPERATOR, `evaluate` = OPERATOR, list
   policies/identities = VIEWER (`govern_a2a_trust.py:47-105`). Confirmed unchanged.

---

# Govern Branch — Pre-Merge Security Analysis (prior round)

Review type: Read-only pre-merge security review of UNCOMMITTED changes on the AVA Govern branch.
Date: 2026-08-31
Scope: files changed vs HEAD (`git diff --name-only HEAD`). MUST-FIX = defects in touched files only.

## MUST-FIX COUNT: 0

No security defects were found in the touched files. Details and the specific verifications performed are below (most-severe first — none rise above informational).

---

## Verifications performed (all PASS)

### 1. Backend `govern_cost_service.py` — SAFE
- **`_AI_SERVICE_NAMES` new constant** (lines ~97-105): contains only AWS service *display names*
  ("Amazon Bedrock", "Amazon Bedrock Service", "Amazon SageMaker", "Amazon Comprehend",
  "Amazon Textract", "Amazon Kendra"). No credentials, account IDs, ARNs, tokens, or local paths.
- **`get_by_tag(key, months=6, ai_only=True)`** (lines 487-552): the new `ai_only` param has a
  default (`True`), `months` has a default, `key` is required — the signature cannot throw on a
  missing param. The SERVICE `Filter` is only added to `kwargs` when `ai_only` is truthy, so an
  `ai_only=False` call omits it cleanly. Graceful error handling is preserved: the CE call remains
  inside the `try`, and the `except (ClientError, BotoCoreError, KeyError, ValueError)` block
  (lines 546-552) still returns an `unavailable-fallback` `CostTagBreakdown`. No exception can escape.
- **Route gating unchanged**: `GET /by-tag` (`api/routes/govern_cost.py:101-108`) still wraps the
  handler in `Depends(require_role(Role.VIEWER))`. The route was not modified by this branch and
  RBAC gating is intact. It calls `get_by_tag(key=key, months=months)`, relying on the `ai_only=True`
  default — consistent with the "scope to AI spend" intent.

### 2. `PutModelInvocationLoggingConfiguration` — NOT in app code (CONFIRMED)
- Grep of the entire backend for `PutModelInvocationLoggingConfiguration` /
  `put_model_invocation_logging_configuration` returned **no matches**. The one-off admin action to
  enable invocation logging is not invoked from service/route code.

### 3. `govern_invocation_safety_service.py` note change — SAFE (no injection)
- The changed `note` (lines 242-246) is a static, developer-authored operational message. The only
  interpolated value is `days` (an `int` request param). No user-supplied or unsanitized data is
  injected into the note. The fallback `except` block (lines 248-253) is unchanged and still returns
  a graceful `unavailable-fallback` response.
- `log_group=None` is deliberately redacted with a comment ("log group name can reveal internal
  naming") — good data-minimization practice, unchanged.

### 4. Frontend input handling / data exposure — SAFE
- **No `dangerouslySetInnerHTML` introduced.** The only two occurrences in the codebase
  (`Documentation.tsx`, `guardrails/RegexPatternBuilder.tsx`) are NOT in the changed-file set.
- **`api/client.ts`**: changes are TypeScript interface updates to match the backend Pydantic
  `DeveloperAiUsageResponse`/`UsageAnomaly` models, plus a `days` query param on `governDeveloperAiApi.usage`.
  No auth/interceptor/`Authorization`/Bearer/`localStorage`/credential handling was touched (verified
  by grep of the diff — the only "token" matches are `input_tokens`/`output_tokens`/`total_tokens`
  usage metrics, not auth tokens). The new interface exposes PII-adjacent fields (`email`,
  `department`, `cost_center`, `user_id`, `team_id`), but these are typed shapes of data returned by
  an authenticated, RBAC-gated backend endpoint (`/api/v1/govern/developer-ai/usage`) — not hardcoded
  values, and consistent with usage-attribution intent. Informational only.
- **`mockData.ts`**: only two additions — a `'not-started'` union literal, and the removal of a set
  of duplicate object keys (`riskScore`/`provider`/`externalId`/`governanceStatus`) in an
  `EXTERNAL_AGENTS` entry (a latent duplicate-key bug fix). No secrets/PII introduced.

### 5. AuthZ (RBAC) — no regression
- No route files are in the changed set (only the two backend *service* files). Therefore no changed
  route could have dropped RBAC gating. The exposed surface for the changed services (`/by-tag`)
  retains `require_role(Role.VIEWER)`.

### 6. Secrets / PII spot-scan — clean for introduced lines
- Placeholder identifiers exist in some changed govern files — `123456789012` (the canonical AWS
  documentation example account ID) in `FleetOverview.tsx`, and synthetic `sha256:` mock hashes in
  `operations/ReportsCenter.tsx`. A diff-scoped grep confirmed **none of these lines were added by
  this branch** (they are pre-existing, unchanged content). No real account IDs, ARNs, tokens, or
  absolute local paths were introduced in any changed file.

---

## MUST-FIX list

None. Zero MUST-FIX defects in the touched files.
