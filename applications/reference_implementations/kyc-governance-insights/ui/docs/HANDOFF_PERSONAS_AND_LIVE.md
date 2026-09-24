# HANDOFF — KYC Controlled Quality Output: personas live-data + Basic-mode assessment

> For a NEW Kiro chat/agent. Read top to bottom. Everything below is verified unless marked PENDING.
> The current agent hit a wedged command terminal mid-task; file edits still work, commands don't.

---

## TL;DR of current state

- Use case is **`kyc_governance_insights`** ONLY. **NEVER touch `ui/kyc_banking`** (that's Vivian
  et al.'s B01; reverting it once was painful). `ls` before committing.
- Almost everything this session is **committed + pushed** to branch `fchsrp/feat/kycgovernance`
  (last commit `fca33d4a`) and **deployed to TEST and PROD**.
- **ONE uncommitted change staged:** `public/runtime-config.json` `hitl_api_url` →
  `tovdy9yzy9` (HITL was pointing at an orphan API). Needs build → deploy → verify → commit.
- **Blocker right now:** the command terminal is wedged (replays stale output, times out). Needs a
  terminal/session reset. File reads/writes work fine.

---

## Environment & how to operate

- **Repo (source of truth):** WSL `\\wsl$\Ubuntu\home\roshan\ava-official`, branch
  `fchsrp/feat/kycgovernance`.
- **AWS:** Isengard account **548509140218**, region **us-east-1**, role Admin.
  - Creds expire ~hourly. Interim helper: after pasting an Isengard bash export in WSL, run
    **`awssave`** (function in `~/.bashrc`) to persist to the default profile. Verify:
    `aws sts get-caller-identity`.
  - `ada` (auto-refresh) is NOT installed and needs the internal Builder-Toolbox bootstrap URL
    (parked — ask Roshan). Do NOT pipe unverified internal installers.
- **Git push/fetch:** SSH to gitlab.aws.dev is VPN-blocked from WSL → run from **Windows
  PowerShell**: `git -C "\\wsl$\Ubuntu\home\roshan\ava-official" push origin HEAD:fchsrp/feat/kycgovernance`.
  Refresh the short-lived SSH cert with `mwinit -s -f` in Windows PowerShell when you see
  `Permission denied (publickey)`. **Never `--force`** (shared branch with Raphael); fetch+rebase.
  Local commits work offline in WSL.
- **Quoting gotcha:** nested `wsl bash -lc "..."` from PowerShell mangles quotes/`$`. ALWAYS write
  a script to a temp dir inside the repo (e.g. `.tmp/x.sh`), `sed -i 's/\r$//' x.sh`, then `bash x.sh`.

---

## Deploy targets (authoritative — see docs/DEPLOY_TARGETS.md)

- **PROD (team URL): https://d34f241zukf5gh.cloudfront.net** (basic auth: `fsigovdemo` / `FsiDemo2026`)
  - Bucket `kyc-governance-demo-uibucket-gzvmftyoiqv8`, dist **E1Q6VO2AHA03JB**. Deploy: `./deploy-prod.sh`.
  - **CRITICAL: this bucket hosts 4 consoles** — root `/` = KYC (our app), `/claims/`, `/mortgage/`,
    `/trade/`. **Never `s3 sync --delete`** the root; `deploy-prod.sh` is additive.
- **TEST: https://d3r8o92vlqvocy.cloudfront.net** — bucket `kyc-governance-demo-test-uibucket-...`,
  dist `E1V1IBH8DIKFGR`. Deploy: `./deploy.sh`.
- Both `deploy.sh`/`deploy-prod.sh` **exclude `runtime-config.json`** from the S3 sync, so after a
  config change you must **upload runtime-config.json to the bucket separately** + invalidate.
  (deploy scripts are local/untracked; recreate from DEPLOY_TARGETS.md if missing.)
- Standing rule (Rule 4): build → test → deploy+verify on AWS → THEN commit → push.
- **Basic-mode fidelity is sacred** — do not change `src/data/basicModeContent.ts` or
  `src/components/BasicMode/*` without explicit sign-off. Advanced mode = the 4 persona dashboards.

## Real backend endpoints (verified)

| Service | Endpoint | Notes |
|---|---|---|
| Cedar proxy | `https://xyz.execute-api.us-east-1.amazonaws.com` | fixed (was orphan `xyz`); CORS `*` + allows x-api-key |
| Metrics | `https://xyz.execute-api.us-east-1.amazonaws.com` | 200 ✓ |
| Registry | `https://xyz.execute-api.us-east-1.amazonaws.com` | use `/agents` (NOT `/registry`); 200 ✓ |
| HITL | `https://xyz.execute-api.us-east-1.amazonaws.com` | REAL api; `/api/v1/hitl/pending` = 200 (orphan was `xyz`) |
| Grounding | `https://xyz.execute-api.us-east-1.amazonaws.com` | real but 500s (bad guardrail) |
| LLM Judge | `https://xyz.execute-api.us-east-1.amazonaws.com/llm-judge` | `kyc-gov-llm-judge`, real scorer, verified |
| Cedar policy store (AVP) | `xyz` | stack `kyc-cedar-gateway`, 19 policies |

API key for all proxies: `x-api-key: FsiDemo2026-ProxyAuth`, `x-tenant-id: fsi-demo`.

---

## DONE this session (committed to fchsrp/feat/kycgovernance, deployed)

- **Basic mode:** metrics grouping (Workflow/Customer), compact + composite info panels, step-bar
  spacing, narrative accuracy pass (ORG-003 >85, ORG-004 >=3, 19 policies), and **hybrid live Cedar**
  ("✓ Verified live by Cedar" badge at the decision step — real `is-authorized`, graceful fallback).
  Deployed to PROD + TEST.
- **LLM judge:** deployed real `kyc-gov-llm-judge` + fixed a markdown-fence JSON parse bug; verified
  returns real scores.
- **X-Ray:** `TracingConfig=Active` + `AWSXRayDaemonWriteAccess` on all 16 governance Lambdas via CLI
  (excluded `kyc-banking-prewarm`). NOTE: stack templates NOT updated → a future `cloudformation
  deploy` of a stack resets its function to PassThrough (tracked in KNOWN_GAPS).
- **Advanced personas:** `api/registry.ts` → `/agents` + auth (Agent Fleet LIVE);
  `EvaluationsSection.tsx` wired to live `/evaluators` + DataSourceBadge; `api/hitl.ts` sends x-api-key.
  Deployed to TEST + PROD (Basic mode verified byte-identical/untouched).
- Docs added: `docs/DEPLOY_TARGETS.md`, `docs/KNOWN_GAPS.md`, `docs/ASSESSMENT_BASIC_MODE_LIVE.md`.

## Basic-mode assessment result (docs/ASSESSMENT_BASIC_MODE_LIVE.md)

Recommendation: **Hybrid (option C)** — fire the *deterministic* governance calls live (Cedar
verdict already is; HITL escalation too), keep *LLM/agent text + risk scores scripted* (non-
deterministic → would break the deck narrative). Do NOT wire Bedrock/agent text live. Assessment
only — nothing built.

---

## PENDING — action items for the next agent

### PENDING 1 — HITL Review Queue (fix STAGED, just finish it)
- Root cause was an **orphan endpoint**: `runtime-config.json hitl_api_url` was `j64az3x7g7` (invalid);
  real API is **`tovdy9yzy9`**. This is a **config fix, no backend/CFN**.
- Already done: created DynamoDB tables `hitl-pending-reviews` + `hitl-audit-log` (PK `review_id`,
  PAY_PER_REQUEST) via CLI, seeded 2 demo reviews (Omega, Petrov). Verified
  `tovdy9yzy9/api/v1/hitl/pending` → 200 with those reviews.
- Already done: `public/runtime-config.json` edited to `tovdy9yzy9` (UNCOMMITTED).
- **To finish:** (a) check whether `components/tabs/ReviewQueueTab.tsx` actually fetches — it had a
  hardcoded `<DataSourceBadge isLive={false}/>` and no fetch; wire it to `fetchPendingReviews()`
  (api/hitl.ts, already has headers) via `useLiveData` if you want it to show the live queue.
  `components/PendingDecisions.tsx` DOES use `fetchPendingDecisions()`. (b) `npm run build`,
  (c) `./deploy.sh` (test) + `./deploy-prod.sh` (prod), (d) upload updated `public/runtime-config.json`
  to BOTH buckets + CloudFront invalidate (deploy scripts exclude it), (e) verify Review Queue live,
  (f) commit + push. **Basic mode must remain untouched.**

### PENDING 2 — Grounding — RESOLVED
- The original "guardrail doesn't exist" diagnosis was wrong. Actual root cause was TWO issues:
  1. **`ApplyGuardrail` needs a *published numeric* guardrail version** — the Lambda env had
     `GUARDRAIL_VERSION=DRAFT`, which this account rejects with `ValidationException: guardrail
     identifier or version does not exist`. Guardrail `4brd2515jt13` (`fsi-agent-guardrail-prod`)
     exists, is READY, and already has a contextual-grounding policy (GROUNDING ≥0.85, RELEVANCE ≥0.75).
  2. **Orphan frontend endpoint** — `runtime-config.json grounding_api_url` pointed at `w8749wujod`,
     which is NOT the API fronting the Lambda. The real API is **`mindupjlp8`** (name
     `kyc-grounding-proxy`; the Lambda's resource policy only allows `mindupjlp8/*`).
- **Fix applied (CLI + config):** published guardrail version **4** of `4brd2515jt13`
  (`aws bedrock create-guardrail-version`), set the Lambda env `GUARDRAIL_VERSION=4` via
  `aws lambda update-function-configuration`, and repointed `grounding_api_url` → `mindupjlp8`.
  Updated the CFN template `GuardrailVersion` default `DRAFT`→`4` for durability.
- **Verified:** `POST mindupjlp8/check-grounding` → grounded case 200 (grounding 1.0, relevance 0.97);
  ungrounded case 200 with `action=GUARDRAIL_INTERVENED` (grounding 0.0). `/health` 200.
- Note: `useGrounding`/`checkGrounding` are defined but not yet consumed by any rendered component,
  so this is backend-ready but not yet surfaced in the UI. Wiring it in is a future enhancement.

### PENDING 3 — parked / lower priority
- **ada install** (stop hourly cred expiry) — needs internal toolbox bootstrap URL from Roshan.
- **X-Ray template durability** — put `TracingConfig: Active` + `AWSXRayDaemonWriteAccess` into the
  ~13 stack templates so redeploys don't reset tracing.
- **LLM judge wiring** — wire the working `kyc-gov-llm-judge` into evaluations/Advanced mode; retire
  the old placeholder-stub stack `kyc-llm-judge`.

### PENDING 4 — account CFN hook (affects backend deploys)
- `cloudformation deploy` to `kyc-hitl-review` fails on account hook
  `AWS::EarlyValidation::ResourceExistenceCheck`. Assume other backend stacks may be affected too.
  Until resolved, make Lambda/table/env changes via **CLI**, and only edit templates for
  documentation/future-deploy. Ask Roshan / account owner to resolve the hook.

---

## Recurring lesson
Several things were **misfiled or stale**: prod URL mislabelled "KYC Banking", cedar + hitl
`runtime-config` pointed at orphan APIs, llm-judge deployed as a stub, X-Ray off, HITL tables never
created. When a live surface shows "Demo Data": check (1) frontend headers/path/timeout,
(2) runtime-config endpoint vs the stack's real `ApiEndpoint` output (orphans!), (3) backend 500s
(missing tables/guardrails). `docs/KNOWN_GAPS.md` tracks the open ones.
