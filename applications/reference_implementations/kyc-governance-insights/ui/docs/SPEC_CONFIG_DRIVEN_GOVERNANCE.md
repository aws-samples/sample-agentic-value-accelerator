# BUILD TASK: Config-Driven Governance (thresholds & sliders → live config store + Cedar)

**Priority:** HIGH
**Constraint:** Must satisfy ALL invariants in `.kiro/steering/architecture-invariants.md`
**Rule:** DO NOT break the demo. Acme → APPROVE, Omega → BLOCK must still work.
**Enforcement:** Closes fitness failures `no-hardcoded-thresholds` (#3), `no-localstorage-policy` (#4), `governance-urls-in-iac` (#7). See `fitness/README.md`.

> This spec is the discovery-backed, fitness-gated **plan of record** for Tasks 2/3/4.
> It does NOT restate the architecture already written in:
> - `DESIGN_SLIDER_DRIVEN_GOVERNANCE.md` — the config-store + policy-cascade-read design (extend, don't duplicate).
> - `DESIGN_DECISION_CEDAR_SHADOW_MODE.md` — DECIDED: shadow-evaluate-and-display, no runtime-abort. Binding.
> - `KIRO_HANDOFF_CEDAR.md` — Cedar loader status + PENDING A/B/C (throwaway-store proof, inline-policy removal).
> This spec adds the Phase 0 inventory, the fitness-gate acceptance criteria, and the design
> tensions surfaced during discovery that the prior docs did not resolve.

---

## Phase 0: Discovery (COMPLETE — read-only investigation, 2026-07-22)

### Existing infrastructure relevant to this task

| Component | Location | Status | Reuse? |
|-----------|----------|--------|--------|
| AVP policy store (STRICT) + full Cedar schema (`AgentCore::Governance`: Agent/CustomerRecord/ToolResource/HumanOperator entities; ApproveApplication/AccessCustomerRecord/ExecuteSanctionsQuery/ExecuteToolCall/RecommendFacility actions) | `deploy/console-services/cedar-gateway/template-cfn.yaml` (`GatewayPolicyStore`) | Deployed | **YES** — the config/policy store already exists; do not create a second one |
| 19 Cedar policies (6 ORG / 6 APP / 6 REQ / 1 default), source of truth | `deploy/console-services/cedar-gateway/policies/*.cedar` | Committed; loaded by loader | **YES** — thresholds live here (`APP-006: risk_score >= 80`, `ORG-002: KP/IR/SY/MM`, `ORG-003: sanctions>85`, `ORG-004: pep_level>=3`) |
| Cedar policy loader (`.cedar` → AVP static policies) | `deploy/console-services/cedar-gateway/load_policies.sh` | Syntax-checked, **NOT proven on live AVP** (KIRO_HANDOFF PENDING B) | **YES** |
| cedar-proxy `/evaluate` → `avp.is_authorized` (also `/policies`, `/ar-check`, `/health`); origin-verify authorizer attached (invariant #1 ✓) | `deploy/console-services/cedar-proxy/template-cfn.yaml` | Deployed | **YES** — this is the working AVP evaluation entrypoint |
| policy-cascade Lambda — tri-state BLOCK/ESCALATE/ALLOW via **hardcoded** `RISK_ESCALATE=60`/`RISK_BLOCK=80`/`PROHIBITED={KP,IR,SY,MM}` | `deploy/governance/policy-cascade/lambda_function.py` (+ inline `template.yaml`) | Deployed | Modify — source thresholds from config store |
| Agent governance call path — `policy_cascade()` → `POLICY_CASCADE_FUNCTION` via `_invoke`; `GOVERNANCE_MODE=external` fails closed, `=local` uses `_policy_cascade_local` | `use_cases/.../src/langchain_langgraph/governance.py` | Live (external) | Modify — thread `tenant_id`; keep external-only enforcement |
| UI slider persistence — `PolicyParams` (valueThreshold, riskScoreThreshold, allowExternalActions, hitlReviewRate, maxAutonomyScope, pepAutoApprove) written to **localStorage** with *simulated* latency; no network | `ui/.../src/services/policyConfigService.ts`, `src/data/autonomyProfiles.ts` | Live (fake backend) | Modify — POST/GET a real config endpoint; keep localStorage as offline cache only |
| Config-store DynamoDB table for policy params | — | **DOES NOT EXIST** | Create (Task 3) |
| Committed IaC params (`*.tfvars`/`parameters*.json`) carrying the 5 governance URLs | `foundations/iac/agentcore/runtime/` | **DOES NOT EXIST** (URLs injected outside IaC) | Create (Task 4) |
| HITL immutable audit-table pattern (reuse for config change log) | `deploy/console-services/hitl/` | Deployed | **YES** |

### What must NOT be rebuilt
- The AVP policy store / Cedar schema / cedar-proxy `/evaluate` — **exist and work**. Task 2 wires *to* them; it does not create a new policy engine.
- External enforcement + fail-closed degrade + `GOVERNANCE_MODE=external|local` — already landed (commit `b5bb86c1`).
- The shadow-mode decision — already DECIDED (`DESIGN_DECISION_CEDAR_SHADOW_MODE.md`).

### Dependencies
- Task 3 (config store) is the **substrate** for Task 2 (thresholds read from it) — build the store first, then point both policy-cascade and (optionally) Cedar at it.
- Task 4 (URLs in IaC) is independent and cheap; can land first to clear fitness `#7`.
- KIRO_HANDOFF PENDING B (prove `load_policies.sh` on a throwaway store) gates any Cedar-native threshold change (Option B below).

---

## Intent

**WHAT:** Make the risk thresholds and autonomy sliders *live governance config* read at request time from a server-side store, instead of hardcoded constants (policy-cascade env + Cedar policy literals) and browser localStorage.

**WHY:** Invariants #3 (no hardcoded thresholds) and #4 (no policy state in localStorage). Also Raphael's framing: *"if we implement the sliders of autonomy, we cannot rely on hardcoded gates."* "Config, not code" is only true if enforcement reads live, mutable, server-side state.

**LONG-TERM STRATEGY:** One config store is the single source of truth for policy knobs; both the tri-state policy-cascade and the Cedar/AVP path consume it. Sliders write it; enforcement reads it; every change is audited.

---

## Tasks

### Task 4 — Commit governance URLs to IaC  (clears fitness #7; do first)
**Current:** The 5 governance URLs (`DETERMINISTIC_CHECK_URL`, `SANCTIONS_CHECK_URL`, `PEP_CHECK_URL`, `POLICY_CASCADE_FUNCTION`, `LLM_JUDGE_URL`) are populated on the live runtime but not committed in any `*.tfvars`/`parameters*.json`.
**Target:** A committed IaC parameter file under `foundations/iac/agentcore/runtime/` carrying all 5, so a clean apply reproduces a working system.
**Invariants:** #7 (IaC durability), #8 (no stubbed wiring).

### Task 3 — Config store + slider write path  (substrate)
**Current:** `policyConfigService.ts` persists `PolicyParams` + change log to localStorage with simulated latency; no service can read slider state.
**Target:** New `kyc-policy-config` DynamoDB table (PK `tenant_id`) + a `policy-config` proxy Lambda behind the console gateway (mirror `metrics-proxy`, origin-verify authorizer attached) exposing `PUT/GET /svc/policy-config`; `policyConfigService.ts` calls it; localStorage demoted to offline cache. Immutable config change-log (reuse HITL audit pattern). All in IaC.
**Invariants:** #1 (auth at edge via the shared authorizer), #4 (server-side state), #7 (IaC), #8 (wired + verified).
**Design of record:** `DESIGN_SLIDER_DRIVEN_GOVERNANCE.md` §3.1.

### Task 2 — policy-cascade reads config store (not hardcoded)
**Current:** `evaluate_cascade` uses module-level `RISK_ESCALATE_THRESHOLD`/`RISK_BLOCK_THRESHOLD`/`PROHIBITED_JURISDICTIONS`.
**Target:** On each invocation, `GetItem(tenant_id)` from `kyc-policy-config` (in-memory TTL cache ~5s); thresholds/jurisdictions come from the row; env stays only as the seed/default for unseeded deploys. Thread `tenant_id` from the agent into the cascade payload.
**Invariants:** #2/#5 (external enforcement, fail-closed — unchanged), #3 (no hardcoded thresholds).
**Design of record:** `DESIGN_SLIDER_DRIVEN_GOVERNANCE.md` §3.2 + §3.3 (Option A recommended first).

---

## Design tensions surfaced in discovery (NEED DECISIONS before implementation)

1. **Cedar is binary; policy-cascade is tri-state.** `avp.is_authorized` returns permit/forbid — there is no native ESCALATE. policy-cascade returns BLOCK/ESCALATE/ALLOW with `deciding_layer`/`deciding_rule`/`reason` + full `evaluations[]` that the UI renders. Implication: "just call `is_authorized`" would drop ESCALATE and the per-rule reasons. Options: **(A)** keep tri-state orchestration in policy-cascade, source only *thresholds/jurisdictions* from the config store, leave Cedar as the policy-as-data showcase (matches `DESIGN_SLIDER_DRIVEN_GOVERNANCE.md` Option A — recommended); **(B)** map ESCALATE onto a second Cedar action/policy set and derive tri-state from `determiningPolicies`, moving the agent onto `cedar-proxy /evaluate` (fuller Cedar story, much more work, gated by KIRO_HANDOFF PENDING B).

2. **The block threshold is duplicated in two places.** `RISK_BLOCK=80` exists in *both* policy-cascade (`RISK_BLOCK_THRESHOLD`) *and* Cedar `APP-006` (`resource.risk_score >= 80` literal). A slider that changes it must update whichever path is authoritative. Under Option A, only policy-cascade reads the slider; Cedar `APP-006` would drift unless (a) it's parameterized (threshold as entity/context attribute compared at eval time) or (b) `load_policies.sh` re-templates and reloads on change. **Decision needed:** is Cedar `APP-006` authoritative, or is policy-cascade? (Prevents two thresholds disagreeing.)

3. **Test6 local-mode duplication (`GOVERNANCE_MODE=local`).** `_deterministic_check_local`/`_screen_local`/`_policy_cascade_local` duplicate service logic (invariant #6) though never used under `external` (invariant #2 satisfied). **Decision:** keep for dev/standalone and narrow the fitness test to only fail if a `_local` is reachable under `external`, OR remove local mode.

4. **Fitness enforcement policy** (process, not code): hook is hard-fail today. Options A (ratchet/baseline), B (hard-fail + `--no-verify` for backlog — current default), C (warn-only). Recommendation: A.

5. **Shadow mode is binding** (`DESIGN_DECISION_CEDAR_SHADOW_MODE.md`): this spec changes *what values* the cascade uses, never *that it returns a value*. No runtime-abort.

---

## Wiring Verification Gate (task is NOT done until these pass)

- [ ] `bash fitness/run-all.sh` — `no-hardcoded-thresholds`, `no-localstorage-policy`, `governance-urls-in-iac` all PASS.
- [ ] Config store is READ at eval time: CloudWatch shows policy-cascade `GetItem(kyc-policy-config)` per invocation (not just env defaults).
- [ ] Slider write reaches the store: UI `updateParam` → `PUT /svc/policy-config` → DynamoDB row changes (HTTP 200 + item diff).
- [ ] End-to-end: move `riskScoreThreshold` slider → GET reflects it → next agent run’s decision changes accordingly.
- [ ] No duplicate policy engine created (grep: single `AWS::VerifiedPermissions::PolicyStore`).
- [ ] Auth at edge: `policy-config` route has `AuthorizationType: CUSTOM` + origin-verify authorizer (no auth in the Lambda).
- [ ] Demo intact: Acme → APPROVE, Omega → BLOCK with unseeded store falling back to env defaults + localStorage cache.
- [ ] IaC durable: config table, proxy, route, and the 5 URLs all committed; clean apply reproduces them.

---

## Standing Instructions
1. Read `.kiro/steering/architecture-invariants.md` before implementing.
2. Build order: Task 4 → Task 3 (store) → Task 2 (read). Resolve tensions #1/#2 before Task 2 code.
3. Reuse the existing AVP store, cedar-proxy, HITL audit pattern, and metrics-proxy shape — do not rebuild.
4. Deploy + verify on AWS (Rule 4 / KIRO_HANDOFF) before commit; wire every connection (invariant #8).
5. No implementation in this spec — design/plan only.
