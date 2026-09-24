# Design: Slider-Driven Governance (config → Cedar → decision)

**Status:** Proposed (follow-on to the external-enforcement wiring)
**Related:** `DESIGN_DECISION_CEDAR_SHADOW_MODE.md`, `governance.py` (`GOVERNANCE_MODE`), `deploy/governance/`, `foundations/iac/agentcore/runtime/`

---

## 1. Problem / intent

The autonomy sliders (Business Ops → Decision Rules) must be *real* governance
config: moving a slider should change the policy context the enforcement layer
evaluates, so the **next** agent decision reflects the new value — with **no
agent redeploy** and **no agent-side gate**. Raphael's framing: *"If we implement
the sliders of autonomy, we cannot rely on hardcoded gates in the agent."*

This is the "config, not code" claim. It is only true if:
1. Enforcement runs **outside** the agent process (external service), and
2. That service reads **live, mutable** policy state that the sliders write.

## 2. Current state (what exists after the external-enforcement wiring)

| Piece | Today | Gap for slider→decision |
|---|---|---|
| Enforcement location | `GOVERNANCE_MODE=external` → agent calls the `kyc-gov-*` Lambdas; degraded fails closed. **Done.** | — (this part is solved) |
| Slider persistence | `services/policyConfigService.ts` writes to **`localStorage` only** (simulated latency, no network). | No server-side state exists for any service to read. |
| Policy-cascade service | `deploy/governance/policy-cascade/` evaluates **hardcoded env thresholds** (`RISK_ESCALATE=60`, `RISK_BLOCK=80`, static prohibited-jurisdiction set) baked in at deploy. | Cannot change when a slider moves without a stack redeploy. |
| Cedar / AVP | `cedar-proxy /evaluate` → AVP `is_authorized`; policies loaded from `.cedar` files at deploy by `load_policies.sh`. The agent does **not** call this path — it calls `policy_cascade` (`POLICY_CASCADE_URL`). | Slider values are not represented as AVP policy/entity context; agent isn't on the AVP path. |

**Net:** wiring the 5 URLs delivers *external enforcement* (the requested task).
It does **not** deliver *slider-driven* decisions. Three links are missing:
slider→backend, backend→policy-service-read, and (optionally) agent→AVP.

## 3. Proposed architecture

```
Sliders (UI)                Config store (new)            Enforcement (existing svc)
────────────                ──────────────────            ──────────────────────────
PolicySliders  ──PUT──▶  /svc/policy-config            policy-cascade Lambda
updateParam()            DynamoDB: kyc-policy-config    reads config store at eval
                         (tenant → {riskEscalate,       time (GetItem, ~5s cache)
                          riskBlock, hitlRate,          → decision reflects sliders
                          maxAutonomy, toggles},        (no redeploy)
                          version, updatedBy, ts)
```

### 3.1 Where slider state persists
- New DynamoDB table `kyc-policy-config` (PK `tenant_id`, attrs = the `PolicyParams`
  shape from `data/autonomyProfiles.ts`, plus `version`, `updated_by`, `updated_at`).
- New route on the console gateway: `PUT/GET /svc/policy-config` → a small proxy
  Lambda (mirror `metrics-proxy`). `policyConfigService.ts` `applyProfile` /
  `updateParam` call it instead of (or alongside) `localStorage`; keep `localStorage`
  as an offline cache so the demo still renders when the API is down.
- Every write appends to a config **audit log** (immutable, no DeleteItem — reuse
  the HITL audit-table pattern) so "who changed what, when" is provable.

### 3.2 How policy-cascade reads it at eval time
- `policy-cascade` Lambda gains `POLICY_CONFIG_TABLE` env + `dynamodb:GetItem` on it.
- On each invocation: `GetItem(tenant_id)`; fall back to its env defaults if absent.
  Cache in-memory with a short TTL (e.g. 5s) so a slider change propagates within
  seconds without a cold start per request.
- Thresholds (`RISK_ESCALATE_THRESHOLD`, `RISK_BLOCK_THRESHOLD`, autonomy scope,
  HITL rate, toggles) come from the row, not the hardcoded env. Env stays as the
  seed/default so unseeded deployments are safe.
- The agent already passes `tenant_id` context; thread it into the cascade payload.

### 3.3 AVP / Cedar interaction (two options)
- **Option A (pragmatic, recommended first):** keep the agent on `policy_cascade`;
  the config store is the mutable layer. Cedar/AVP remains the *policy-as-data*
  showcase (`cedar-proxy /evaluate`) that the UI exercises directly. Sliders drive
  the cascade thresholds; Cedar policies stay deploy-time.
- **Option B (fuller Cedar story):** represent slider values as AVP **policy
  template parameters** or evaluation **context**, and move the agent's enforcement
  call to `cedar-proxy /evaluate`. Slider write → `PutPolicy`/template param update
  in AVP → next `is_authorized` reflects it. More faithful to "Cedar decides," more
  work (schema/template design, and AVP is eventually-consistent).

Recommend shipping **A** first (small, unblocks the live slider→decision demo),
then evaluating **B** if the Cedar-native narrative needs it.

## 4. Work items
1. `kyc-policy-config` DynamoDB table + `policy-config` proxy Lambda + gateway route (IaC).
2. `policyConfigService.ts`: POST/GET to `/svc/policy-config`; keep localStorage as cache.
3. `policy-cascade` Lambda: read config row (cached) instead of only env thresholds.
4. Thread `tenant_id` from agent → cascade payload.
5. Config audit log (immutable) + surface in the Decision Rules "change log".
6. E2E test: move slider → GET reflects it → agent decision changes on next run.

## 5. Risks / constraints
- **Don't break the demo:** config store must fall back to env defaults + localStorage
  cache so an unseeded/unreachable store still yields the scripted decisions.
- **Shadow mode preserved:** this changes *what values* the cascade uses, not *that it
  returns a decision value* — no runtime-abort (`DESIGN_DECISION_CEDAR_SHADOW_MODE.md`).
- **Consistency:** DynamoDB + in-memory TTL means a slider change is visible within the
  cache TTL, not instantly — acceptable for the demo; call it out to presenters.
- **Multi-tenant:** key by `tenant_id` from day one to avoid a global-mutable-state retrofit.

## 6. Out of scope (already done)
External enforcement + fail-closed degrade + `GOVERNANCE_MODE=external|local` — landed
in `governance.py` / `governance_pipeline.py` and the runtime IaC.
