# KYC Controlled Quality Output — Known Backend Gaps (tracked)

> Authoritative record of backend integrity gaps found during the 2026-07-13 audit.
> None affect the demo UI (Basic mode uses staged values; the one genuinely live control
> is Cedar via cedar-proxy). These are correctness/observability items to fix in a focused
> session once stable AWS creds are in place (see "ada / creds" below).

## GAP 1 — X-Ray tracing is OFF on all Lambdas
- **State:** all 16 `kyc-*` Lambdas have `TracingConfig.Mode = PassThrough`; 0 traces recorded.
- **Impact:** the "Observation / audit trail" story isn't backed by live distributed tracing.
  (The Basic-mode Step 7 wording was already softened from "spans" to "reasoning steps".)
- **Fix:** per function set `TracingConfig: { Mode: Active }` and add
  `xray:PutTraceSegments` + `xray:PutTelemetryRecords` to its role (or attach
  `AWSXRayDaemonWriteAccess`); redeploy the owning stack.
- **In scope (14 governance fns):** cedar-proxy, metrics-proxy(-handler), grounding-proxy,
  registry-proxy(-handler), hitl-review(-handler), evaluation-runner, agent-registry,
  llm-judge, sanctions-check, policy-admin, policy-interceptor, agent-control,
  agentcore-api-proxy(+ test handler), scenario-b-mock.
- **EXCLUDE:** `kyc-banking-prewarm` — that is `kyc_banking` (B01, Vivian et al.); never touch.
- **Caveat:** proxies are HTTP APIs (v2) → no API-Gateway active tracing; tracing is Lambda-side
  only (still gives per-function traces + downstream AWS calls). Minor ongoing X-Ray cost.
- **Effort:** medium-repetitive (~13 stacks); needs a stable creds session.

## GAP 2 — Deployed LLM-as-Judge is a placeholder stub
- **State:** the live `kyc-llm-judge` Lambda code is a no-op placeholder:
  `def handler(event, context): return {'statusCode': 200, 'body': '{}'}`.
  Its `EVAL_TABLE` / `GUARDRAIL_ID` env vars are set but the code ignores them — it does NOT
  score, call a guardrail, or write DynamoDB.
- **Repo has the real implementation, undeployed:** `deploy/governance/llm-judge/`
  (`template.yaml` + `lambda_function.py`) — a working 5-dimension scorer
  (correctness/faithfulness/completeness/helpfulness/tone) on Bedrock Claude Haiku 4.5,
  HTTP API `POST /llm-judge`, model parameterized via `JUDGE_MODEL_ID`. It would deploy as a
  NEW stack `kyc-gov-llm-judge` (different name from the live stub).
- **Impact:** the "LLM-as-Judge" governance control does not actually function in prod. The
  demo does not call it live (the Basic-mode "LLM-Judge quality" figure is staged), so the demo
  is not broken — but the control is not real.
- **Fix options:**
  - **A (recommended):** deploy the repo's `kyc-gov-llm-judge`, verify it scores, wire the
    evaluations pipeline / Advanced mode to it, then retire the `kyc-llm-judge` stub.
  - **B:** package the real `lambda_function.py` into the existing `kyc-llm-judge` stack
    (keep the name) — but that stack's template isn't in the repo, so A is cleaner.
- **Effort:** one isolated stack deploy (low risk) + wiring + test; needs creds.

## Dependency — stable creds (parked)
Both fixes need multiple AWS calls/redeploys. AWS creds currently expire hourly (Isengard
session), and `ada` (auto-refresh) can't be installed here without the internal builder-toolbox
bootstrap. Interim: copy longest-duration creds from the Isengard console + run `awssave`.
Do this before the focused fix session.

## Note on demo integrity
The demo's Basic mode is a scripted walkthrough with staged metrics; the single control wired to
live infrastructure is **Cedar** (via `cedar-proxy /evaluate`, the "Verified live by Cedar"
badge). GAP 1 and GAP 2 do not change the demo, but should be closed before claiming X-Ray
observability or a functioning LLM-as-Judge as *live*.

---

## RESOLUTION — 2026-07-13

**GAP 2 (LLM-judge) — RESOLVED.** Deployed the real scorer as stack `kyc-gov-llm-judge`
(`https://xyz.execute-api.us-east-1.amazonaws.com/llm-judge`). Fixed a parse bug (the
model wraps JSON in markdown fences) in both `template.yaml` and `lambda_function.py` — now
extracts the JSON object before `json.loads`. Verified live: returns real per-dimension scores
(e.g. correctness 0.85, faithfulness 0.9, tone 0.95). Remaining (optional): wire it into the
evaluations pipeline / Advanced mode and retire the old `kyc-llm-judge` stub stack.

**GAP 1 (X-Ray) — ENABLED LIVE.** Set `TracingConfig.Mode = Active` and attached
`AWSXRayDaemonWriteAccess` to the role on all 16 governance Lambdas (excluded
`kyc-banking-prewarm`). Verified all report `Active`.
- REMAINING (tracked): the 8 in-repo stack templates (console-services/*, governance/llm-judge)
  still say PassThrough/absent, so a future `cloudformation deploy` of a given stack would reset
  that function's tracing until the templates are updated to `TracingConfig: Active` +
  `AWSXRayDaemonWriteAccess`. Low priority (stacks aren't redeployed often); do in the next
  backend pass.

---

## Persona verify-and-fix (Task A) — 2026-07-13

**Fixed (frontend, live-verified endpoints):**
- **Agent Fleet / registry:** `api/registry.ts` was calling `/registry` (404) with no auth headers.
  Fixed to `/agents` (200) + `x-api-key`/`x-tenant-id`. Now live.
- **Evaluations dashboard:** `EvaluationsSection.tsx` now calls live `/evaluators` via `useLiveData`
  and shows a Live/Offline `DataSourceBadge` (endpoint returns 200).
- **HITL client:** `api/hitl.ts fetchPendingDecisions` now sends `x-api-key` (was tenant-only).

**Backend gaps found (NOT fixed — need infra/CFN work blocked by an account hook):**
- **HITL `/pending` → 500:** the stack declared `hitl-pending-reviews` / `hitl-audit-log` but never
  created them. I created both via CLI (PK `review_id`, PAY_PER_REQUEST, ACTIVE, seeded 2 demo
  reviews — CLI scan returns Count=2). **However the HITL API still 500s** with
  `ResourceNotFoundException`, even though the deployed Lambda's env `PENDING_TABLE=hitl-pending-reviews`
  and its code scans that env var. Root cause is a deployment inconsistency (the `j64az3x7g7` API's
  integration likely invokes a stale/mismatched Lambda, or region/warm-container) that CFN can't
  reconcile — **`cloudformation deploy` to `kyc-hitl-review` is blocked by an account-level
  `AWS::EarlyValidation::ResourceExistenceCheck` hook.** Frontend falls back gracefully (Review Queue
  shows Demo Data). TODO: resolve the account hook, then redeploy/reconcile the HITL stack so the API
  invokes the correct Lambda; move the two tables into the template (they exist now via CLI).
- ~~**Grounding → 500:** the grounding Lambda references a Bedrock Guardrail that does not exist
  (`ValidationException`).~~ **FIXED.** The guardrail id was a hardcoded parameter default in the
  cedar-proxy, grounding-proxy and metrics-proxy templates that nothing ever overrode, so every
  deployment inherited one account's resource; when that guardrail was deleted, `/check-grounding`
  and `/ar-check` returned 500 on every call. `console-services/deploy_all.sh` now resolves the
  guardrail by NAME and picks its highest published version, and aborts if none exists. The
  handlers also log before answering 500 — a handled 500 raises no Lambda error metric, so the
  failure previously left nothing in CloudWatch but `START`/`END`/`REPORT`.

**Not changed:** `ReviewQueueTab` keeps its (correct) Offline badge — no live data is available until
the HITL backend is reconciled, so attempting live would just fail; current behaviour is honest.
