# Govern Pre-Merge Quality Analysis

Read-only review of the AVA Govern branch's **uncommitted** changes
(`git diff --name-only HEAD` + new file `src/components/ErrorBoundary.tsx`).
Scope = touched files only. Pre-existing errors in untouched files are the
accepted baseline and do not block.

**Verdict: ZERO must-fix findings in touched files.**

- `npx tsc -p tsconfig.app.json --noEmit`: 14 errors total, **all in non-Govern
  files** (`api/client.ts`, `App.tsx`, `components/a2a`, `DeploymentDetail.tsx`,
  `harness`, `Observability.tsx`, `organization_design`, `policies`,
  `prioritization`). **Zero errors in `components/govern/**` or `ErrorBoundary.tsx`.**
  Matches the expected baseline exactly — no Govern regression.
- `npm run lint`: 394 errors / 44 warnings project-wide. After filtering to Govern
  files, **no lint error was introduced by this branch** (details below).

---

# Pre-release gate (policy round) — 2026-09-02

Reviewer: QUALITY gate. Branch `gsorrels/feature/govern-audit-backend`, tip `2f7c3da7`.
This round's changes are **backend/config only** — `backend/src/services/policy_service.py`
(`agentcore_region` param), `backend/src/api/routes/policies.py` (AgentCore client +
policy-engine ARNs + observability now on `settings.GOVERN_AWS_REGION`),
`docker-compose.yaml` (`POLICY_ENGINE_ID` default). Plus seeded account data
(4 A2A trust policies + 6 identities; 3 AgentCore Cedar policies). **No frontend
source (`.tsx`/`.ts`) changed this round** — confirmed via `git show --stat HEAD` and
`git status` (only `.md` + test/screenshot artifacts are dirty).

**Verdict: 0 must-fix. Gate PASS.**

## tsc — clean (VERIFIED TWICE, note on baseline)
`npx tsc -p tsconfig.app.json --noEmit` → **0 errors, exit 0.** Run twice: once with
the existing `.tsbuildinfo`, once after deleting `node_modules/.tmp/tsconfig.app.tsbuildinfo`
and re-running fresh (config has no `incremental`/`composite`, so the stale June-22
buildinfo was not consumed anyway). Both full runs took multiple minutes (real
type-check, not a no-op cache hit) and emitted zero diagnostics.

> **Finding — baseline no longer reproduces.** The expected ~30-error baseline
> (AgentRegistry / DevToolsGovernance / MultiCloudGovernance / RagEvaluations —
> recharts formatter + `IconName`) does **not** appear. tsc is fully clean. The
> recharts/@types baseline errors documented in prior rounds appear to have been
> resolved earlier on this branch. **New errors: 0** (trivially — total is 0).
> No frontend was touched this round, so no regression was possible regardless.

## lint — baseline only (no new problems possible this round)
`npm run lint` (`eslint .`) → **455 problems (414 errors, 41 warnings), exit 1.**
Dominant categories, all matching the known baseline classes:

| Rule | Count | Baseline category |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 231 | `Icon name={… as any}` pattern + misc `any` |
| `react-hooks/set-state-in-effect` | ~65 | set-state-in-effect (standard fetch effects) |
| `@typescript-eslint/no-unused-vars` | 48 | baseline |
| `react-refresh/only-export-components` | 40 | baseline |
| `react-hooks/exhaustive-deps` | ~41 | baseline (warnings) |
| `rules/components-and-hooks-must-be-pure` + `react-hooks/purity` | ~22 | impure-date / purity |

**New vs baseline: 0 new.** Because no frontend source changed this round, every
lint problem is pre-existing. Top offenders are non-touched hooks
(`operations/useOpsLiveData.ts` 35, `UnifiedGuide.tsx` 21, `useAwsCost.ts` 12).
(Count drift vs the 2026-08-31 section's 445 is baseline churn in untouched files,
not this round.)

## Spot-check — seed-lit surfaces (React best-practices / a11y)

**`FleetOverview.tsx` Policies card (L1762-1775) — CLEAN.**
- `policies.filter(p => p.status === 'active').slice(0,3).map(...)` with `key={p.policy_id}`
  — key present, unique. `policies` is destructured from the aggregator hook (L1520)
  and used as an array throughout (`.length`, `.filter`); the hook defaults it to `[]`,
  so no unguarded access. `{p.rules_count}r` is a typed field. Empty-state guarded at
  L1734 (`guardrails.length === 0 && policies.length === 0`). **0 lint findings on this file.**

**`A2AGovernance.tsx` Trust Policies tab (L637-774) — CLEAN.**
- `displayPolicies.map(policy => …)` uses `key={policy.id}` (unique). Empty-state guarded
  at L664 (`displayPolicies.length === 0`). Nested `.map`s (`allowedActions`, `dataClassifications`)
  use index keys — acceptable for static, non-reordered lists.
- Live/mock normalization is sound: `livePolicyToDisplay` maps `TrustPolicy` (typed
  `allowed_actions: string[]`, non-optional) → `DisplayPolicy.allowedActions`, so
  `policy.allowedActions.join(', ')` (L701) and `.map` (L716) cannot hit `undefined`
  under the declared contract. Provider-specific fields (`maxChainDepth`, `rateLimit`,
  `dataClassifications`) are `!= null`-guarded before render — no fabricated values
  under a Live badge.
- a11y: tablist uses `role="tab"` + `aria-selected` (L621-622); policy rows use
  `aria-pressed` + `rowButtonProps` (keyboard-activatable). **0 lint findings on this file.**

### Advisory (non-blocking, not introduced this round)
- `A2AGovernance.livePolicyToDisplay` trusts the API shape — `governA2AApi.listPolicies()`
  returns `response.data` with no runtime validation. A malformed payload missing
  `allowed_actions` would throw on `.join()`/`.map()`. This matches the app-wide
  "trust the typed API contract" pattern (not unique to this surface); low risk given
  the backend controls the schema. Nice-to-harden later with a defensive `?? []`.

## MUST-FIX COUNT: 0

---

# Branch-Delta Composition + Quality Review (2026-08-31)

Scope = `git diff --name-only origin/gsorrels/feature/govern-audit-backend...HEAD`
(51 Govern files, +2946 / -659). `tsc` baseline (0 Govern errors) trusted, not re-run.
Focus: rendered composition of ComplianceCenter (embedded framework views) and the
Operations / Reports landings, plus React correctness in changed hooks/components.

**Verdict: 0 must-fix. All findings ACCEPTED-WARNING (repo-wide lint baseline or
pre-existing cosmetic redundancy — none introduced by this branch).**

> Task-premise correction for the caller: `AgentResourceInventory` and
> `FrameworkReportsModule` are NOT rendered by `OperationsLanding`. Their parent is
> **`ReportsLanding.tsx`** (L172 / L176). `OperationsLanding.tsx` renders
> `OpsOverview` (L222), `AlertCenter` (L227), `CapacityPlanning` (L230) and 9 others.

## Composition

Traced each changed surface from its parent to what actually renders on the tab.

### ComplianceCenter → embedded framework deep-dive views — CLEAN (verified)
- **No double page header / CoreBadge / page-level data badge.** All 9 deep-dive
  views gate their `GovernPageLayout` + `CoreBadge` + page-level Live/Mock badge
  behind `if (embedded) return body;` — verified the header markup sits *after* that
  line in every case: `NistAiRmfView` L813, `EuAiActView` L702, `FinosAirView` L631,
  `OwaspLlmView` L775, `CriAiRmfView` L586, `OsfiE23View` L519, `Iso42001View` L906,
  `NaicAiView` L627, `Sr26MappingView` L154. ComplianceCenter renders them inside a
  bare card (`ComplianceCenter.tsx` L2309-2337), so only the page's single
  "Compliance Center" header (GovernPageLayout L1985-1990) shows. Any Live/Mock badge
  still inside `body` (e.g. `FinosAirView` L566, `Iso42001View` L776) is a
  *section-scoped* framework badge, not a duplicate of the page badge. **ACCEPTED.**
- **No duplicate `POST /govern/controls/evaluate` on the same tab.** ComplianceCenter's
  own `useControlEvaluation` (`ComplianceCenter.tsx` L1836-1845) is
  `skip`-gated: `skip: activeTab !== 'frameworks' || frameworkViewMode !== 'checklist'`.
  The framework views own their `useControlEvaluation` and only mount in `deep-dive`
  mode (L2307-2337). Checklist and deep-dive are mutually exclusive, so exactly one
  hook instance is active per tab → single POST. The hook is also cache-keyed by
  control-id set (`useControlEvaluation.ts` L102-114) and cancel-guarded. **ACCEPTED.**

### Operations / Reports landings → embedded children — pre-existing only
- **`FrameworkReportsModule.tsx:2120`** renders `<CoreBadge pillar="show" compact />`
  while its parent `ReportsLanding.tsx:114` already renders `<CoreBadge pillar="show" />`
  on the same tab → two identical "Show" pillar chips visible on the Framework Reports
  tab. **Not introduced by this branch** (badge line unchanged in the diff). Cosmetic.
  *Fix:* drop the child's `CoreBadge`; the landing header already supplies the pillar.
  **ACCEPTED-WARNING.**
- **`AgentResourceInventory.tsx:1806`** renders `<CoreBadge pillar="govern" compact />`
  under `ReportsLanding` (a "show" surface) → a second, differently-pillared chip on
  the Resource Inventory tab. Pre-existing (unchanged in diff). *Fix:* remove child
  badge or align pillar to "show". **ACCEPTED-WARNING.**
- **`OpsOverview.tsx:990`** renders `<h1>Operations Overview</h1>` while
  `OperationsLanding.tsx:127` renders `<h1>Operations</h1>` → nested `<h1>` on one page
  (a11y nit; titles differ so not a visual duplicate). Pre-existing (unchanged in diff).
  *Fix:* demote the tab heading to `<h2>`. **ACCEPTED-WARNING.**
- `AlertCenter.tsx` (rendered by OperationsLanding) has no page `<h1>/<h2>` or
  `CoreBadge` — only inline section `MockDataBadge`s → no duplicate header. **CLEAN.**
- `CapacityPlanning.tsx` (rendered by OperationsLanding) has no page header/CoreBadge —
  inline Live/Mock badges only (L675, L1215) → no duplicate header. **CLEAN.**

### React correctness in changed hooks/components — CLEAN
- `AgentResourceInventory.tsx:1772-1775` reset-selection effect (`setSelectedAgentIds`
  keyed on `[inventoryAgents]`) does **not** clobber user selection: `inventoryAgents`
  is a `useMemo` on `[useLive, liveAgents]` and `useAgentResourceData` does **not** poll
  (`useReportsLiveData.ts` — no `setInterval`), so it fires at most twice (mock→live),
  matching its own comment. **ACCEPTED.**
- `useAlerts.ts` — `useActiveAlerts` polls (30s) via a properly-deped effect
  (`[awsLoading, awsConnected, refreshKey, pollIntervalMs]`) with `cancelled` guard +
  `clearInterval` cleanup; mutations are stable `useCallback`s. No loop. **CLEAN.**
- `useFleetScale.ts` — `useFleetScaleServer` effect deps `[enabled, groupBy, filterKey,
  nonce]` are all primitives, cancel-guarded; refresh via `nonce`. No refetch loop.
  **CLEAN.**
- `useGovernanceAggregator.ts` — single fetch effect keyed on `[refreshKey]` (L369/L496);
  all other blocks are `useMemo` with explicit deps. No loop. **CLEAN.**

## Lint

`npm run lint` (eslint .) — **445 problems (404 errors, 41 warnings) project-wide**,
exit 1. Filtered to the 51 changed files, hits land on 6 files, all in the
already-accepted repo-wide baseline rule categories (React-Compiler-style
`react-hooks/set-state-in-effect`, `components-must-be-pure`, and the codebase's
standing `Icon name as any` pattern). No new defect-class error:

| File:line | Rule | Verdict |
|---|---|---|
| `operations/AgentResourceInventory.tsx:1123,1598` | `@typescript-eslint/no-explicit-any` (`Icon name={… as any}`) | ACCEPTED-WARNING — matches repo pattern (`OperationsLanding` L184/207). *Fix:* type to Icon name union. |
| `operations/AgentResourceInventory.tsx:1774` | `react-hooks/set-state-in-effect` | ACCEPTED-WARNING — reset-selection effect (see above). |
| `operations/CapacityPlanning.tsx:538` | `react-hooks/set-state-in-effect` (`setIsLoading(true)`) | ACCEPTED-WARNING — standard fetch effect. |
| `useFleetScale.ts:268` | `react-hooks/set-state-in-effect` | ACCEPTED-WARNING — standard fetch/reset effect. |
| `FinOps.tsx:1173` | `react-hooks/set-state-in-effect` | ACCEPTED-WARNING — standard fetch effect. |
| `HallucinationDetection.tsx:312` | `react-hooks/set-state-in-effect` | ACCEPTED-WARNING — standard fetch effect. |
| `DataSourceStatus.tsx:37` | impure `Date.now()` in `useMemo` | ACCEPTED-WARNING — cosmetic age display. |

These rules fire on 400+ locations repo-wide (DatasetList, CatalogView, ui/badge,
types/index, etc.) — a strict rule set flagging a pervasive pre-existing pattern, not
a regression from this branch.

## MUST-FIX COUNT: 0

---

## 1. Types / Lint

### tsc — clean for Govern
All 14 tsc errors are in untouched non-Govern files (see list above). Strict null
checks are on (baseline includes `TS18048 possibly undefined` in non-Govern files),
so the fact that every touched Govern file compiles is strong evidence there are no
type-level unguarded-undefined defects in the changed Govern code.

### Govern lint errors — all baseline or in unchanged regions
14 lint "errors" and 2 warnings land on files under `components/govern/`. Triage
against the diff:

| File | Touched by branch? | Flagged line changed? | Verdict |
|---|---|---|---|
| `finops/useAwsCost.ts` (1) | No (not in diff) | — | Baseline |
| `finops/useCacheWarming.ts` (3, unused `_`-vars) | No | — | Baseline |
| `useGovernModels.ts` (1) | No | — | Baseline |
| `ModelLineageViewer`→`useModelLineage.ts` (5) | No | — | Baseline |
| `useFleetHealth.ts` (3 "impure fn during render" @476-478) | Yes | **No** — diff hunks are import-only (`@@ -12` / `@@ -21`); L476-478 unchanged | Pre-existing pattern |
| `useGuardDutyAIFindings.ts` (1 "setState in effect" @182) | Yes | **No** — diff hunk is import-only (`@@ -17`); effect body unchanged | Pre-existing pattern |
| `useFleetHealth.ts` (warning, useMemo dep @424) | Yes | No | Pre-existing (warning) |
| `useLiveKPIs.ts` (warning, missing dep `updateSource` @266) | Yes | No | Pre-existing (warning) |

The `react-hooks/set-state-in-effect` and "Cannot call impure function during
render" rules fire on ~394 errors across the whole repo (DatasetList, CatalogView,
useAwsCost, useGovernModels, etc.) — a newly-strict rule set flagging a pervasive
pre-existing pattern, not defects this branch introduced. The two touched-file
errors sit in code the branch did not modify. **No Govern lint error introduced.**

---

## 2. React best practices / a11y (touched files)

No blocking issues. Minor, non-blocking observations:

- **AIQualityMonitor.tsx (L282-299)** — the trend-refresh `useEffect` has `[]` deps
  but its `setInterval` callback reads `kpiValues`, so it captures the initial value
  (stale closure). Impact is nil: the trend series is explicitly illustrative/mock
  ("Illustrative trend — historical KPI series not wired"), so the stale values are
  decorative only. Pre-existing; lint did not flag it. Nice-to-fix later.
- **GovernanceCommandCenter.tsx (L396)** — "↻ Refresh All" uses a Unicode glyph
  rather than a Heroicon (`arrow-path` exists in `icons.tsx`). Minor deviation from
  the Heroicons-only UI convention.
- **GovernanceCommandCenter.tsx** — several `.map()` use array-index `key` (compliance
  L519, cost L861, budgets L896, platform map L1046/L1053). Lists are static/stable
  order, so low risk.
- **GovernanceCommandCenter.tsx** — "Refresh All" calls `refreshAggregator` +
  `refreshGuardrails` but does not bump `pollKey`, so the command-center aggregator
  tiles (`governCommandCenterApi.getData`) refresh only on the 60s poll, not on the
  manual click. Minor UX gap, not a defect.

---

## Composition (step 3)

### AI Quality section — no double title, no new double-fetch (verified)
Command Center ZONE 1b renders:
```
<ZoneHeader title="AI Quality" .../>
<div className="...card..."><AIQualityMonitor compact /></div>
```
- **Double title: NO.** `AIQualityMonitor` compact mode (L359-419) renders no
  `<h3>`/title — only the status-count chips + KPI grid + data-source badge. The
  code comment at L362 confirms the internal title was intentionally removed so the
  ZoneHeader supplies the single "AI Quality" title. Verified.
- **New double-fetch: NO.** The diff for `GovernanceCommandCenter.tsx` shows
  `<AIQualityMonitor compact />` was **already embedded at HEAD**; this branch only
  wrapped it with the ZoneHeader + card and removed the compact's internal title.
  No new data hook was added by the change.
- Pre-existing observation (baseline, not introduced here): the Command Center runs
  `useLiveKPIs(60s)` itself (L172) and `AIQualityMonitor` runs `useLiveKPIs(30s)`
  (L275), so two independent instances poll the same 9 AWS endpoints on this page.
  Redundant AWS-call load; candidate for a shared context/dedup later. Not a
  regression from these uncommitted changes.

### ReportsLanding + useReportsDataSummary — clean, no double fetch
- `useReportsDataSummary()` is used **only** in `ReportsLanding` (L96). Its internal
  sub-hooks `useAgentResourceData` / `useFrameworkCompliance` are not consumed by any
  other component (exported in `operations/index.ts` but unreferenced elsewhere), so
  there is no duplicate instance at the landing level.
- The `inventory` tab (`AgentResourceInventory.tsx`) renders from `MOCK_AGENT_PROFILES`
  and does **not** call `useAgentResourceData`, so no duplicate agent fetch when the
  tab mounts. (Minor data-consistency note: the header shows live counts while the
  inventory tab is mock-badged — expected, not a defect.)

### Embedded vs standalone AIQualityMonitor — both correct
- `GovernanceCommandCenter` L487: `<AIQualityMonitor compact />` (no title — correct).
- `ModelManagement` L854: `<AIQualityMonitor />` (full view with its own header —
  correct standalone). No duplicated title/KPIs across the two render sites.

### ErrorBoundary (new file) — correct and wired
- `src/components/ErrorBoundary.tsx` (note: at `components/`, not `components/govern/`).
- Wired in `App.tsx`: imported L2, used L147 `<ErrorBoundary resetKey={location.pathname}>`,
  closed L333 — resets on navigation as documented. Uses the `exclamation-triangle`
  Heroicon (present in `icons.tsx`). Type-checks clean.

---

## MUST-FIX summary

**0 must-fix findings in touched files.**

---

<!-- COMPOSITION PASS -->
# Composition — pre-release gate (policy round) (2026-09-02)

Separate section owned by the COMPOSITION reviewer (merge with the quality pass
above). Read-only. Traced ACTUAL render paths from parent → child, not isolated
files. **Verdict: 0 MUST-FIX composition defects.**

## A2A Governance — embedded via `AgentRegistry` `a2a` tab (`/govern/agents?tab=a2a`)

Render path: `App.tsx` L218 `/govern/agents` → `<GovernWrapper><AgentRegistry /></GovernWrapper>`
→ tab `a2a` (L976 `{tab === 'a2a' && <A2AGovernance />}`) → `A2AGovernance` L581 `<A2ATrustEvaluator />`.

- **Parent suppresses page-level guide + KPIs for `a2a` — CONFIRMED.** `AgentRegistry.tsx`
  L510 gates `<UnifiedGuide {...AGENT_REGISTRY_GUIDE} />` behind
  `!['human-oversight','a2a','evaluations','fleet-scale'].includes(tab)`, and L515 gates the
  provider bar + 7-KPI grid behind the same list. `a2a` IS in both exclusion lists. No double
  page-level guide, no double KPI grid on the embedded path.
- **Child renders its OWN single guide — no stacking.** `A2AGovernance` L578 renders one
  `<UnifiedGuide {...A2A_GUIDE} />`. Since the parent guide is suppressed for `a2a`, exactly ONE
  guide shows (the A2A-specific one). There is no separate `GoLiveGuide` component — `UnifiedGuide`
  is the combined How-to-Use + Go-Live, rendered once.
- **No double header.** Parent `GovernPageLayout` shows page title "Agent Registry" (+ CoreBadge +
  data badge). `A2AGovernance` L585 renders a small section `<h2>A2A Governance</h2>` above its own
  5-stat block — a subhead, not a competing page header. On the `a2a` tab exactly one KPI row shows
  (A2A's own), since the parent's is suppressed.
- **Trust Policies fetched ONCE — no double-fetch.** Only `A2AGovernance` calls
  `governA2AApi.listPolicies()` (L551, on mount). `A2ATrustEvaluator` does NOT fetch on mount; it
  calls a different endpoint (`governA2AApi.evaluate()`) only on button click. The parent
  `AgentRegistry` never fetches A2A trust policies. No duplicate fetch across parent+child.
- **A2ATrustEvaluator + Trust Policies coexist correctly on the same tab.** Evaluator (L581)
  renders unconditionally above the stat block; the Trust Policies list renders on the child's own
  default `activeTab === 'trust-policies'`. `A2ATrustEvaluator` takes NO props and owns all its
  state — no prop double-wiring with the Trust Policies tab.
- **Seeded/empty-state honesty — CLEAN.** `listPolicies()` → `[]` renders the "store connected but
  empty" empty state (L664) under a Live badge; on throw it falls back to 6 mock
  `A2A_TRUST_POLICIES` under a Mock badge. Correct.

## Fleet Policies — `/govern/fleet` → `FleetOverview`

Render path: `App.tsx` L215 `/govern/fleet` → `<GovernWrapper><FleetOverview /></GovernWrapper>`.

> **Task-premise correction:** there is NO standalone "Policies card". The policy list is the
> RIGHT column of a shared **"Security Controls"** card (`FleetOverview.tsx` L1715-1778); the LEFT
> column is Guardrails. Links to `/secure/policy` at L1730.

- **No duplicate list section — CLEAN.** The policy LIST renders exactly once (L1763-1775). The
  policy COUNT is echoed as summary metrics elsewhere (trust-stack `policiesEnforced` L1695,
  `GovernanceDimensionsCard policiesActive` L1707, header badge L1724) — legitimate metric echoes,
  not a duplicated list.
- **`+N more` logic (L1772) — CORRECT.** `policies.filter(p => p.status === 'active').length > 3`
  → `+{active-3} more`; `slice(0,3)` shows the first 3. `policy_id`/`name`/`status`/`rules_count`
  all exist on `PolicySummary` (`useGovernanceAggregator.ts` L197-209); `{p.rules_count}r` renders
  type-correctly. List of 3 renders correctly.
- **Empty-state — CORRECT with two accepted-warning edge cases** (below).

## Routes (`App.tsx`) — CORRECT
- L215 `/govern/fleet` → `FleetOverview`. L218 `/govern/agents` → `AgentRegistry`.
- `A2AGovernance` has no standalone route (App.tsx does not import it) — reached only via the
  `a2a` tab. Consistent with the task description.

## Accepted warnings (composition pass, non-blocking, pre-existing)
1. **A2A stat block badge precision.** The 5-KPI block (`A2A Trust Network` = 7,
   `Success Rate`, `Denied`, `Avg Latency` = hardcoded 185ms) is always from mock
   `AGENT_NODES`/`A2A_EVENTS` under one `<MockDataBadge />` (L586), yet the "Trust Policies" KPI in
   the same block can be LIVE. Minor honesty nit; not a composition break.
2. **Fleet Security Controls combined empty-state.** L1734 fires only when
   `guardrails.length === 0 && policies.length === 0`. In the MIXED case (guardrails present, 0
   policies) the grid renders and the Policies column shows a bare "POLICIES" header with no rows /
   no per-column empty text. Cosmetic; shared-card design.
3. **Fleet policy count vs list mismatch.** Header badge (L1724) counts `policies.length` (all
   statuses); the list (L1765) shows only `status === 'active'`. If policies exist but none active,
   the badge reads "N policies" while the column is empty. Precision nit; not a break.

**Composition MUST-FIX: none.**
