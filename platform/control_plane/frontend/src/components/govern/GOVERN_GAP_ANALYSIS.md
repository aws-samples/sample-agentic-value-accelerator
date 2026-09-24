# Govern Branch — Gap Analysis (removed features / dead imports / broken links)

Read-only pre-merge review of UNCOMMITTED changes on the Govern branch.
Scope: did any change REMOVE a feature/tab/route or leave a dead import / broken
link? Verified with grep + an actual `tsc -p tsconfig.app.json --noEmit` run
(tsc reports TS2307 for any broken import and TS6133 for any unused/dead import).

Findings ordered most-severe first.

---

# Pre-release gate (policy round) — 2026-09-02

Scope: NOT a full-module re-audit. Narrow check of REACHABILITY + COMPLETENESS of
the surfaces that now show the newly-seeded A2A data (4 trust policies + 6 agent
identities + per-policy Cedar export). Verified by tracing routes/nav and by
grepping every consumer of `governA2AApi` against the backend contract
(`api/routes/govern_a2a_trust.py`, `client.ts:2249-2258`). Most-severe first.

## MUST-FIX (broken / dangling surfaces): 0
No dangling tab, no nav entry without a target, no surface that references the
seeded policies but renders nothing. Everything that IS wired renders real content.

## Completeness gaps — 2 of 4 seeded artifact types have NO UI surface

### GAP 1 (highest) — Cedar export is unreachable from the UI
The seed's per-policy Cedar export exists end-to-end on the backend
(`GET /govern/a2a-trust/policies/{id}/cedar`) and in the client
(`governA2AApi.exportCedar`, client.ts:2256-2257), but **grep finds ZERO callers
of `exportCedar` anywhere in `src/`.** A2AGovernance's Trust Policies cards
(A2AGovernance.tsx:675-771) render name/effect/actions/autonomy but expose no
"Export Cedar" button or download. The route docstring calls this export "the
bridge to AgentCore enforcement" — the differentiator is seeded but invisible.
Fix: add an Export Cedar action to each live policy card (and/or the expanded
detail) that calls `governA2AApi.exportCedar(policy.id)` and shows/downloads the
returned `cedar` string. Only meaningful on the live path (`policiesLive`).

### GAP 2 — The 6 seeded agent identities have NO UI surface at all
Backend exposes `GET /govern/a2a-trust/identities` (govern_a2a_trust.py:96-98) and
these identities carry the `scope_level` that drives the evaluator's autonomy
ceiling. But **the frontend has no client method for it** — `governA2AApi`
(client.ts:2249-2258) has `listPolicies` / `evaluate` / `exportCedar` only; no
`listIdentities`, no `AgentIdentity` type, and no component references
`a2a-trust/identities`. The 6 seeded identities are entirely invisible: no list,
no scope table, and the Delegation Evaluator uses two free-text inputs rather than
a picker populated from the registered identities.
Fix: add `governA2AApi.listIdentities()` + an "Agent Identities" surface in
A2AGovernance (a small table of agent_id → scope_level), and ideally back the
evaluator's source/target inputs with that list so the demo shows real scopes.

### Related NOTE — evaluator default IDs may floor to L1
`A2ATrustEvaluator` defaults source/target to `agt-00001` / `agt-00002`
(A2ATrustEvaluator.tsx:16-17). Those IDs match the *graduation* service's demo
agents, a DIFFERENT table; whether the A2A identity table was seeded with the same
IDs is unconfirmed. If not, `evaluate()` floors both scopes to L1
(govern_a2a_trust_service.py:189-190) and returns a conservative-but-valid
decision — non-breaking, but the demo may not show the intended high-scope
ceiling. Surfacing identities (GAP 2) removes the guesswork.

## PASS — reachability of the surfaces in scope

### A2A Governance Trust Policies view IS reachable and clearly labeled
- `'a2a'` tab present in AgentRegistry `TABS` (AgentRegistry.tsx:67), label
  **"A2A Governance"**; renders `<A2AGovernance />` (line 976) which shows the
  live policies list, the live Delegation Evaluator, topology, protocols, audit,
  and AWS-patterns sub-tabs. Real content, not a stub.
- AgentRegistry is reachable every documented way: route `/govern/agents`
  (App.tsx:218), GovernLanding card `id:'agents'` → `/govern/agents`
  (GovernLanding.tsx:355-362), Sidebar entry + subLink (Sidebar.tsx:202, 396),
  and the governProgram Inventory step (`{label:'Agent Registry', nav:'agents'}`,
  governProgram.ts:94). Demo path: **Govern → Agent Registry → "A2A Governance" tab.**
- Discoverability NOTE (not a gap): no deep-link to `?tab=a2a` exists, and a
  separate `/a2a` route (`A2aLanding` = the Build "A2A Agents" registry) is a
  DIFFERENT surface. A presenter hunting for "A2A" from the sidebar may land on
  `/a2a` (registry) instead of the Govern trust-policy tab. Consider a direct
  landing entry or cross-link if the A2A trust view is a headline demo beat.

### Fleet "Policies" card → /secure/policy is complete and reachable
- FleetOverview Security Controls card links "Policies →" to `/secure/policy`
  (FleetOverview.tsx:1730); the card also shows the top-3 active policies with
  rule counts (1762-1775), so it is obvious where the full list lives.
- `/secure/policy` is a real routed view (App.tsx:297 → `<Policy initialTab="engines"/>`),
  also reached from the AgentRegistry Permissions banner "Manage policies in
  Secure →" (AgentRegistry.tsx:1581) and AgentDrawer (125/139). Not dangling.

---

## MUST-FIX

### 1. Untracked module import (see Integration analysis, item 1)
`src/App.tsx:2` imports `./components/ErrorBoundary`, which is UNTRACKED. Must be
committed alongside App.tsx or the build/typecheck breaks. This is the only
untracked-import risk in the branch — no other modified/committed file imports an
untracked module (only `src/components/ErrorBoundary.tsx` is untracked under `src/`).

---

## PASS — no feature/tab/route dropped or duplicated

### Command Center — AI Quality moved, still rendered exactly once
- `GovernanceCommandCenter.tsx`: the diff REMOVED the bare
  `{/* AI Quality Monitor */} <AIQualityMonitor compact />` and RE-ADDED it inside
  a `<ZoneHeader title="AI Quality">` section. Net result: `<AIQualityMonitor compact />`
  is rendered EXACTLY ONCE (line 487). Not dropped, not duplicated.
- `AIQualityMonitor` also renders in `ModelManagement.tsx:854` (its own `quality`
  subtab) — a distinct view, not a duplicate within the Command Center.

### ReportsLanding — all 6 tabs intact
- Tab set unchanged: `assessments | inventory | attestation | trends | playbooks
  | framework` (ReportsLanding.tsx:30). `TABS` array (lines 39-72) still defines
  all 6; all 6 are rendered (lines 165-170). The diff only touched the HEADER
  badge area — swapped a static `MockDataBadge` for a live/mock badge driven by
  `useReportsDataSummary()` plus a live-stats strip. No tab logic changed.
- New imports resolve: `LiveDataBadge` is exported from `./DataSourceIndicator`
  with matching signature `{ source?, detail? }`; `useReportsDataSummary` is
  exported from `./operations/useReportsLiveData` and returns
  `{ summary, loading }` where `summary` exposes every field ReportsLanding reads
  (`dataSources`, `liveAgents`, `liveGuardrails`, `avgCompliancePct`,
  `totalFindings`, `criticalFindings`). No shape mismatch.

### No broken import links anywhere
- The full `tsc` run produced ZERO TS2307 (cannot-find-module) errors across all
  100+ touched files. Every import (including the ErrorBoundary and its
  `./govern/icons` import) resolves.

### No NEW dead imports in touched Govern files
- The only TS6133 (unused) error in a touched file is `App.tsx:112 RoleProvider`,
  which is PRE-EXISTING on HEAD (the branch did not add it, nor remove its usage).
- All other TS6133 findings are in untouched Plan/other-module files
  (HarnessCreate, RoadmapReviewStep, PhaseRoadmapView, ValueCostReport) —
  pre-existing, out of scope.

### GovernLanding shadow-AI banner
- Change is a bug fix (flat → nested `shadow_ai?` access), not a feature removal.
  Banner still computes critical/high/model counts. See Integration analysis.

---

## Summary
No feature, tab, or route was removed or duplicated by this branch. The only
gap-class MUST-FIX is committing the untracked `ErrorBoundary.tsx` alongside
App.tsx. No broken import links; no new dead imports in Govern files.
