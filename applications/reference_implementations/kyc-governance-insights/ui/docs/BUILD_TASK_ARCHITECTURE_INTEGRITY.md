# BUILD TASK: Architecture Integrity Pass

**Priority:** CRITICAL — blocks credibility of the demo
**Constraint:** Must satisfy ALL invariants in `docs/ARCHITECTURE_INVARIANTS.md` (commit this file to repo first)
**Rule:** DO NOT break the demo. Acme → APPROVE, Omega → BLOCK must still work after every change.

---

## Context

Raphael Fuchs (co-owner, Solutions Architect) has flagged repeated architectural violations:

1. Cedar/AVP is never invoked in the agent runtime or governance services
2. API key validation is hardcoded in Lambda business logic instead of API Gateway authorizer
3. Governance service thresholds are hardcoded env vars, not runtime-configurable
4. Slider state lives in localStorage only — never reaches the backend
5. Terraform tfvars don't carry governance URLs (drift risk)

These aren't bugs — the demo works. But they make the architectural claims false. The demo says "config not code, external enforcement, Cedar is the policy engine" — but none of that is actually happening under the hood. This must be fixed.

---

## Task 1: Move API Key Auth to API Gateway Authorizer

**Current state:** All governance Lambdas have this in handler code:
```python
expected_key = os.environ.get('API_KEY', '')
if provided_key != expected_key:
    return {'statusCode': 403, ...}
```

**Target state:**
- API Gateway has a Lambda authorizer (or Cognito authorizer) that validates requests BEFORE they reach the Lambda
- Lambda code has ZERO auth logic — assumes request is authenticated
- Remove the `API_KEY` env var from all governance Lambda configs
- Same auth pattern as "the other use cases" (Raphael's words) — check how the existing non-governance APIs handle auth and replicate that pattern

**Invariant:** #1 (Authentication at the Edge)

---

## Task 2: Policy Cascade → Cedar/AVP Integration

**Current state:** `kyc-gov-policy-cascade` Lambda evaluates hardcoded thresholds:
```
RISK_ESCALATE=60, RISK_BLOCK=80, static prohibited-jurisdiction set
```
It never calls AVP. Decision logic is `if score > threshold → BLOCK`.

**Target state:**
- Policy-cascade calls Amazon Verified Permissions (`verifiedpermissions:IsAuthorized` or the cedar-proxy endpoint) to evaluate the decision
- Cedar policies in AVP encode the rules (thresholds, jurisdiction lists, escalation conditions)
- The policy store ID and policy template IDs are configuration — read from env or parameter store
- Changing a Cedar policy in AVP changes the next decision WITHOUT redeploying the Lambda

**Design consideration:** The Cedar policies already exist (deployed from `.cedar` files). The question is how policy-cascade invokes them:
- Option A: Call AVP `IsAuthorized` directly (AWS SDK, pass entity/context)
- Option B: Call the existing `cedar-proxy` endpoint (already deployed at `krzr5xcibc`)

Assess which is cleaner. The cedar-proxy was built for this purpose — if it's healthy and correctly configured, use it.

**Invariant:** #3 (Cedar/AVP is the Policy Engine), #5 (No Hardcoded Thresholds)

---

## Task 3: Slider State → Backend Persistence

**Current state:** `services/policyConfigService.ts` reads/writes `localStorage` only (with fake latency). Sliders never POST anywhere. No backend endpoint exists for config.

**Target state:**
- Slider changes POST to a backend endpoint (e.g. `/svc/governance/config`)
- Backend persists to DynamoDB (e.g. `kyc-governance-config` table)
- Policy-cascade reads current config from DDB at evaluation time (or: config writes update AVP policy context directly)
- Moving a slider → next governance call uses the new value → decision changes without any deploy

**Design options (assess and pick):**
- A: Sliders → DDB config table → policy-cascade reads DDB before calling AVP
- B: Sliders → update AVP policy context directly (Cedar context attributes) → policy-cascade passes fresh context to `IsAuthorized`
- C: Sliders → DDB → cedar-proxy reads DDB for context → returns decision

Option B is cleanest (fewest hops, true "config not code") but requires AVP context attribute mapping. Assess feasibility.

**Invariant:** #4 (No localStorage for Persistent State), #5 (No Hardcoded Thresholds)

---

## Task 4: Terraform Durability for Governance URLs

**Current state:** 5 governance URLs were passed via CLI to `update-stack`. `variables.tf` defaults them to `""`. A future `terraform apply` without explicit tfvars would blank them.

**Target state:**
- `terraform.tfvars` (or environment-specific `.tfvars` file) carries all 5 URLs
- Alternatively: use SSM Parameter Store references in the Terraform config (Terraform reads URLs from SSM at apply time — truly dynamic)
- A clean `terraform apply` from the repo produces a working system with all URLs populated

**Invariant:** #6 (Infrastructure Durability)

---

## Task 5: Verify Runtime Update (Step 3 Confirmation)

**Prerequisite:** Creds refresh (already done)

1. `describe-stacks` → confirm `UPDATE_COMPLETE` on `ava-kyc-governance-insights-langgraph-agentcore-runtime-useast1`
2. `get-agent-runtime` → confirm 5 URLs non-empty + `GOVERNANCE_MODE=external`
3. If ROLLBACK → investigate, fix, redeploy
4. If COMPLETE → invoke a live assessment (Acme + Omega) and confirm external services are hit (check CloudWatch logs on the governance Lambdas for invocations)

---

## Execution Order

1. **Task 5 first** — confirm the runtime update landed (quick, no code change)
2. **Task 1** — API key → APIGW authorizer (low risk, surgical)
3. **Task 4** — Terraform durability (commit tfvars, no runtime change)
4. **Task 2** — Policy cascade → Cedar/AVP (medium complexity, core architectural fix)
5. **Task 3** — Slider → backend → AVP (depends on Task 2 being done)

Tasks 2+3 are the heavy lifts. Design doc / assessment first, then implement.

---

## Standing Instruction

**Before implementing ANY code change, verify it satisfies the Architecture Invariants doc (`docs/ARCHITECTURE_INVARIANTS.md`).** If a shortcut would violate an invariant, DO NOT take it — ask for guidance instead.

This document exists because we've had too many cases of "it works" that turn out to be architecturally wrong. "Works" is necessary but not sufficient. "Works AND satisfies the invariants" is the bar.
