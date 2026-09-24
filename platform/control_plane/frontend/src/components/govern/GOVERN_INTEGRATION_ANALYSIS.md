# Govern Branch — Integration / Untracked-Import Safety Analysis

---

## Pre-release gate (policy round) — 2026-09-02

Read-only INTEGRATION review of the Govern↔Secure region-split round. Change set under
review (3 files):
- `backend/src/services/policy_service.py` — `PolicyService` gained `agentcore_region`
  (defaults to `region`); AgentCore client now uses `agentcore_region`; DynamoDB metadata
  still uses `region`.
- `backend/src/api/routes/policies.py` — all `bedrock-agentcore-control` clients, both
  policy-engine ARN constructions, and `/observability/events` logs+cloudwatch clients now
  use `settings.GOVERN_AWS_REGION`; `get_service()` passes `agentcore_region=GOVERN_AWS_REGION`.
- `control_plane/docker-compose.yaml` — added `POLICY_ENGINE_ID=PolicyEngine_P1-y_2qsnuwtp`
  (backend env; us-east-1 = GOVERN_AWS_REGION).

Findings most-severe first.

### MUST-FIX
None.

### ACCEPTED-WARNING

**AW-P1 — Latent wrong-region AgentCore client in `govern_operations_service.py` (PRE-EXISTING, out of this round's scope).**
- `_agentcore_client()` (service line 232-235) builds `bedrock-agentcore-control` with
  `region_name=self.region` (= `AWS_REGION`, us-east-2 in compose). It is used at
  service line 459 for `list_agent_runtimes`. Its sibling `_ssm()` (line 240-242) correctly
  uses `self.govern_region` (= `GOVERN_AWS_REGION`), so the split is applied inconsistently:
  runtimes governed in us-east-1 would list EMPTY from the us-east-2 client.
- The route wires it with `region=AWS_REGION, govern_region=GOVERN_AWS_REGION`
  (`routes/govern_operations.py:66-69`), so the fix is a one-line swap to `self.govern_region`
  in `_agentcore_client()`.
- Why ACCEPTED here: not part of this round's 3-file change set, and Operations' primary
  discovery (SSM fleet) already uses the govern region. Flag as a follow-up for the Operations
  owner; not a blocker for the policy round.

**AW-P2 — Build-module AgentCore routes use `AWS_REGION` (by-design, NOT flagged as bugs).**
- `routes/memory.py:38`, `routes/catalog.py:70`, `routes/harness.py:49`, and provisioners
  `kb_provisioner.py:28` / `datalake_provisioner.py:30` construct `bedrock-agentcore-control`
  in `settings.AWS_REGION`. These surface/provision AVA-owned resources in the control-plane
  region, are NOT consumed by the Govern Fleet, and are consistent with the intended split
  (AVA-owned = AWS_REGION; governed/discovered = GOVERN_AWS_REGION). No change needed.

### Task-by-task verification

1. **Region split correctness — VERIFIED CORRECT.** All 7 `bedrock-agentcore-control` clients
   in `policies.py` (lines 57, 131, 171, 194, 246, 287, 318) use `GOVERN_AWS_REGION`; both
   policy-engine ARNs (lines 253, 295) use `GOVERN_AWS_REGION`; observability sets
   `region = GOVERN_AWS_REGION` (line 515) for BOTH `logs` (519) and `cloudwatch` (520)
   clients. In `policy_service.py`, the AgentCore client uses `self.agentcore_region` (159)
   and DynamoDB uses `region` (162). The ONLY remaining `settings.AWS_REGION` in `policies.py`
   is line 36 (DynamoDB metadata table in `get_service()`) — the one legitimate case. NO
   missed AgentCore/CloudWatch spot.

2. **Single-region regression — SAFE.** `agentcore_region = agentcore_region or region`
   (service line 154) falls back to `region` when unset. Both `AWS_REGION` and
   `GOVERN_AWS_REGION` default to `"us-east-1"` in `core/config.py`, so when
   GOVERN_AWS_REGION == AWS_REGION behavior is identical to before. `PolicyService` is
   instantiated at exactly ONE site (`policies.py:34` `get_service()`); no other caller
   exists to break (`GovernHarnessPolicyService` is a different class).

3. **Shared-file safety — UNCHANGED, as intended.** This round's change set does not include
   `api/client.ts` or `App.tsx`. `policiesApi` (client.ts:835) and `governA2AApi`
   (client.ts:2249) contracts are present and coherent; untouched this round. The FleetOverview
   `/secure/policy` link (`FleetOverview.tsx:1730`) resolves to a real route — `App.tsx:297`
   `<Route path="/secure/policy" element={<Policy initialTab="engines" />} />`. The Fleet
   Policies card consumes `policiesApi.list()` (`useGovernanceAggregator.ts:411`) with no
   `engine_id`, so it lists the default `POLICY_ENGINE_ID` — which now lands in the correct
   (GOVERN) region. This round's fix is precisely what makes that card populate.

4. **Scope note.** `policy_service.py` and `policies.py` are SECURE-module files (the
   `/policies` router serves Secure → AgentCore Policy) edited from Govern work, plus a
   docker-compose infra edit. ACCEPTABLE: the region split is a shared-infra correctness fix
   that the Govern Fleet Policies card directly depends on (it consumes `/api/v1/policies`).
   Recommend a heads-up to the Secure-module owner so the ownership boundary stays explicit.

5. **Other wrong-region clients — see AW-P1 (govern_operations, latent) and AW-P2 (Build,
   by-design).** `govern_fleet_service` (instantiated `GovernFleetService(region=GOVERN_AWS_REGION)`,
   `govern_fleet.py:30`) and `govern_agentcore_service` (multi-region) are correct.

---

Read-only pre-merge review of the Govern branch, updated for the CURRENT committed
state (4 commits ahead of `origin/gsorrels/feature/govern-audit-backend`).

Scope:
1. Untracked-import pipeline-breaker check (does any tracked/committed file import a
   local-only untracked module?).
2. Shared-file / cross-module integration (`App.tsx`, `api/client.ts`, `a2a/api.ts`,
   `main.tsx`) — confirm Govern-scoped changes do not break Plan/Secure/Operate/other
   modules, and that the `governOperationsApi` retype left the shared `Incident`,
   `Change`, `OpsMetricsResponse`, `PendingApprovalsResponse` types intact.
3. Branch is ahead by 4 commits.

Comparison base: `git diff origin/gsorrels/feature/govern-audit-backend...HEAD`.
Findings ordered most-severe first.

> Note: This supersedes the prior round's analysis. The prior round's #1 MUST-FIX
> (App.tsx importing an untracked `src/components/ErrorBoundary.tsx`) is RESOLVED —
> that file is now TRACKED (`git ls-files` confirms). The prior unused-`RoleProvider`
> import (TS6133) is also RESOLVED — this branch's App.tsx diff removes that import line.

---

## Branch state (check 3) — CONFIRMED ahead by 4 commits

`git log --oneline origin/gsorrels/feature/govern-audit-backend..HEAD`:

1. `76d97488` Govern: wire MED-tier live data (framework control-eval, capacity, operations)
2. `9af6310b` Govern: wire shared aggregator to live data (getData + compliance posture + maturity)
3. `f90f81cd` Govern: wire existing live APIs into mock surfaces (Wave 3b live-data, LOW-effort wins)
4. `ba1f9de8` Govern: P2 styling polish + full-project TypeScript gate to zero + stale-chunk self-heal

`git status -sb` reports `[ahead 4]`.

---

## MUST-FIX

None.

---

## ACCEPTED-WARNING

### AW-1 — Pre-existing duplicate `interface PendingApprovalsResponse` in client.ts (NOT introduced by this branch)
- **Evidence:** `git grep -c "export interface PendingApprovalsResponse"` = **2 on origin AND 2 on HEAD** (unchanged by the branch).
  - `api/client.ts:5896` — ops shape: `{ approvals: Change[]; total; live; source; note }` (returned by `governOperationsApi.pendingApprovals()`).
  - `api/client.ts:6425` — marketplace shape: `{ subscriptions: Subscription[]; total; by_resource_type; live; source; note }`.
- **Why ACCEPTED:** Two same-name `interface` declarations in one module are legal TypeScript (declaration merging) and this condition predates the branch — it is not a regression. The branch's ONLY touch here is widening the marketplace copy's `note?: string` -> `note?: string | null` (`api/client.ts:6428` region), an additive, non-breaking change.
- **Recommendation (out of branch scope):** dedupe/rename one of the two interfaces in a follow-up; not a merge blocker for this branch.

### AW-2 — Non-Govern component files edited (scope observation; all benign, no breakage)
This branch touches a handful of files outside the Govern module. Each was reviewed; all are safe cleanups with no cross-module ripple:
- `components/DeploymentDetail.tsx`, `components/Observability.tsx`: defensive optional chaining only (`deployment.outputs?.AmplifyUrl`, `foundationDeployment.outputs?.langfuse_host`). Additive null-safety.
- `components/harness/HarnessCreate.tsx`: removed dead `FALLBACK_MODELS`/`listModels()` block and the `FoundationModel` import (39 deletions). **Verified clean:** `git grep` at HEAD finds NO dangling references to `FoundationModel`, `FALLBACK_MODELS`, `modelsLoading`, `modelsErr`, or `grouped` (the sole `models` hit is inside a tooltip string literal). `harness/api.ts` is untouched, so `listModels`/`FoundationModel` still exist there for other callers.
- `components/organization_design/views/PhaseRoadmapView.tsx`: stopped destructuring an unused `computed` prop — the prop TYPE signature is unchanged, so the parent (`RoadmapReviewStep.tsx`) is unaffected.
- `components/organization_design/steps/RoadmapReviewStep.tsx` / `components/prioritization/ValueCostReport.tsx`: removed an unused `phaseColor` import and an unused `viewBox` destructure. `scoring.ts` still exports `phaseColor` for other consumers.
- **Why ACCEPTED:** No removed/renamed exports, no changed signatures consumed elsewhere. Technically outside strict Govern scope, but none introduce breakage.

---

## PASS — verified safe

### Check 1 — UNTRACKED-IMPORT (pipeline-breaker): NO committed file imports an untracked file
- Untracked `*.ts/*.tsx/*.py` files under `platform/control_plane` (recursive, `--untracked-files=all`) are exactly 5, all test specs / test config:
  - `backend/test_govern_compliance_agent.py`
  - `backend/tests/test_path_jail.py`
  - `frontend/playwright.config.ts`
  - `frontend/test-connection-wizard.spec.ts`
  - `frontend/test-data-governance.spec.ts`
- `git grep` for each basename across `platform/control_plane` finds **no tracked/committed source importing any of them** — only self-references in their own docstrings and matches inside untracked `frontend/test-results/**` artifacts. None are `src/` modules.
- Untracked non-code dirs (`infra/`, `docs/`) contain only `.md`/`.yaml`/`.tf` (e.g., `infra/cloudformation/ava-govern-iam.yaml`, `infra/terraform/**`) — not importable by frontend/backend source.
- **Reverse check (imports ADDED by committed files resolve to TRACKED files):** every added relative import in changed `frontend/src/*` files resolves to a tracked module. Verified via `git ls-files`: `useOpsLiveData.ts`, `useReportsLiveData.ts`, `useControlEvaluation.ts`, `useAwsCost.ts`, `useFleetScale.ts`, `autonomyLadder.ts`, `scoring.ts`, `DataSourceIndicator.tsx`, `mockData.ts`, `icons.tsx`, `harness/api.ts`, and `api/client.ts` are all tracked.
- Only ONE file was ADDED (committed) on this branch — `GOVERN_LIVE_DATA_OPPORTUNITIES.md` (docs, no imports). No new source modules were committed, so there is no committed-file-imports-uncommitted-module hazard.

### Check 2 — `api/client.ts` `governOperationsApi` retype is Govern-scoped
- The large operations-domain retype (`FleetStatusResponse`/`FleetAgent`/`Alert`/`AlertRule`/`SLA*`/`OnCall*`/`EscalationPolicy`/`Capacity*`/`OpsTrends*` -> new `*Summary`/backend-aligned shapes, plus new `OpsMetricsSummaryResponse`) is confined to Govern.
- **Shared types the task flagged are UNMODIFIED:** the diff touches no `interface Incident`/`interface Change`/`interface OpsMetricsResponse`/`interface PendingApprovalsResponse` body — the only diff line naming these is `opsMetrics: async (): Promise<OpsMetricsResponse>` being repointed to `Promise<OpsMetricsSummaryResponse>`. `OpsMetricsResponse` remains defined (`client.ts:5516`) and is still consumed by `governIncidentApi.metrics()` (`client.ts:5605`) and `operations/useIncidents.ts` (lines 23, 939). `PendingApprovalsResponse`@5896 (`approvals: Change[]`) is unchanged and still returned by `governOperationsApi.pendingApprovals()`.
- **No non-Govern consumer of `governOperationsApi` or the retyped ops types.** `git grep` for `governOperationsApi` outside `/govern/` = none. The one non-Govern hit for the retyped type names, `guardrails/GuardrailAlerting.tsx`, defines its OWN local `interface AlertRule` (line 9) and does not import from `api/client.ts` — a false positive.
- `PolicyCreatePayload` write-side widening (`resource_type` union; inlined `rules` union) has its ONLY consumer inside `client.ts` itself. `PolicyRule` consumers (`risk/PolicyAsCode.tsx`, `policies/PolicyBuilder.tsx`) each use their own local `interface PolicyRule`. No ripple.

### Check 2 — `App.tsx`: Govern-scoped, catch-all + ErrorBoundary intact
- Full diff is a single 12-line hunk removing one unused import: `import { RoleProvider } from './components/govern/RoleBasedDashboard';`. `RoleProvider` has ZERO references in `App.tsx` at HEAD (unused-import cleanup), and is STILL exported by `RoleBasedDashboard.tsx:114` for any other consumer. No routes were added or changed.
- Catch-all intact: `App.tsx:330` `<Route path="*" element={<Navigate to="/" replace />} />` (appears once).
- ErrorBoundary intact: imported `App.tsx:2`, wraps `<Routes>` at `App.tsx:146` (`<ErrorBoundary resetKey={location.pathname}>`) / closes `App.tsx:332`.

### Check 2 — `a2a/api.ts` and `main.tsx`: additive only
- `a2a/api.ts`: adds one optional field `curated_id?: string` to `A2aAgent`. Optional -> non-breaking for existing consumers.
- `main.tsx`: adds a `vite:preloadError` self-heal listener (reload-once, session-guarded) for stale-chunk-after-deploy. No route/export impact.

---

MUST-FIX COUNT: 0
