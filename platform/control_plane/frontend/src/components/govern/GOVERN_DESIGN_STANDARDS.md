# Pre-release gate (policy round) — Seeded Trust-Policy Surfaces

**Generated:** 2026-09-02
**Reviewer scope:** DESIGN gate, read-only. Two surfaces the newly seeded demo policy data renders in — NOT a full-module re-review (prior gates cleared the rest):
1. `A2AGovernance.tsx` — Trust Policies tab (the 4 seeded live policies), status/effect treatment, icons, palette.
2. `FleetOverview.tsx` — the "Policies" compact list inside the Security Controls card (L1762-1775).
**Standards enforced:** (1) Heroicons via `<Icon>` only — no emoji / icon-substitute dingbat / raw `<svg>` iconography; (2) every `<Icon name=>` resolves to a real name in the `IconName` union (`icons.tsx`); (3) light theme (slate/white surfaces, slate-900 text); (4) LiveDataBadge/MockDataBadge consistency; (5) card conventions.
**Method:** read both surfaces in full + the `icons.tsx` registry + the live `TrustPolicy` shape (`api/client.ts:2244`, `effect: 'permit'|'deny'`); ran emoji/dingbat/`<svg>` regex over both files.

## MUST-FIX COUNT: 0

No hard-standard violations on either surface. All `<Icon>` names resolve (no blank renders), no emoji / icon-substitute dingbat / raw `<svg>` iconography, correct light-theme palette, correct data badges, standard card class. Findings below are polish/consistency recommendations only, most-severe first.

### ACCEPTED-WARNING (non-blocking; recommendations)

1. **permit/deny (`effect`) is not visually distinguished** — On seeded live policies, `effect` renders as plain uncolored slate text, while the sibling `status` field gets a proper color-coded pill (`A2AGovernance.tsx:687-693`, emerald/amber/slate). `effect` appears as flat gray text in the meta row (`:702`) and the expanded Delegation panel (`:728`). The brief asked whether permit/deny is "rendered with consistent Icon + color (green/red)" — it is not; permit and deny look identical. **Recommend:** a color-coded effect pill matching the status-badge idiom (e.g. emerald for `permit`, rose for `deny`), optionally with `<Icon name="check-circle">` / `<Icon name="no-symbol">` (both in the union). Not blocking — renders correctly and violates no hard rule.
2. **`effect` + autonomy rendered twice per seeded row** — `livePolicyToDisplay` bakes `Effect: … • max delegated autonomy L…` into the `description` string (`A2AGovernance.tsx:527`), which the row prints at `:695`; the same two facts are then re-printed as separate meta spans (`:702-703`) and again in the expanded panel (`:728-729`). So each seeded policy shows Effect/autonomy 2-3x. **Recommend:** drop the baked-in copy from the `description` and rely on the structured spans. Content redundancy, low severity.
3. **Guardrails half of the Security Controls card has a count/dot palette mismatch** — In the same card as the Policies list, the guardrail count is `violet-600` (`FleetOverview.tsx:1721`) but the guardrail status dot is `emerald-500` (`:1754`). The **Policies** half is internally consistent (count `indigo-600` `:1724` ↔ dot `indigo-500` `:1767`), so the seeded-policy surface itself is clean; flagged only because it shares the card. Low.
4. **Text arrow `→` inside the policy row + `•` separator in the seeded description** — `A2AGovernance.tsx:699` prints `source → target` immediately after a leading `<Icon name="arrow-right">`; `:527` uses a `•` middot in the description. Per the established precedent in the first review section of this doc (navigational/flow `→`/`←` and decorative `•` are a platform-wide typographic convention, explicitly NOT counted as must-fix), these are **accepted**. The redundancy of a literal `→` right after an arrow Icon in the same span is a minor tidy-up if a strict zero-dingbat gate is ever adopted.

### Reviewed and CLEAN

- **`trust-policies` tab icon `shield-check` resolves** — declared `A2AGovernance.tsx:469`, present in registry `icons.tsx:252`. All 5 A2A tab icons resolve (`shield-check`, `share`, `document-text`, `clipboard-list`, `cloud`).
- **No blank-render icons on either surface.** A2A policy rows use only union names (`arrow-right`, `chevron-right`, `check`, `x-mark`, `plus`, `information-circle`, `shield-check` empty-state). The FleetOverview Policies list uses **no** `<Icon>` — a colored `<span>` dot — matching its Guardrails sibling; no unknown names anywhere.
- **Status pill color-coding consistent** — active=emerald / testing=amber / disabled=slate (`A2AGovernance.tsx:687-693`).
- **Auth/Encryption use consistent Icon + color** — `check` (emerald-500) vs `x-mark` (rose-500) in the expanded Security panel (`:747-753`). Good permit/deny-style pattern already present here; item #1 above asks to extend the same idiom to `effect`.
- **No emoji / icon-substitute dingbat / raw `<svg>` iconography** in either surface's rendered UI (regex + read confirmed; only box-drawing chars in code comments and accepted `→`/`•` typographic separators).
- **FleetOverview Policies card conventions PASS** — wrapper is the canonical `bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 … shadow-sm` (`:1715`); compact-row styling (`py-1 px-2 bg-slate-50 rounded text-[10px]`) and the `+N more` affordance (`:1772-1774`, `text-[9px] text-slate-400 pl-2`) are identical to the Guardrails sibling (`:1758-1760`) and the dataSources/tools `+N more` pattern elsewhere in the file.
- **Data badges correct on Trust Policies tab** — `LiveDataBadge source="DynamoDB"` when the store responds, `MockDataBadge` on fallback (`A2AGovernance.tsx:642-644`).
- **Light theme throughout** — slate/white surfaces, slate-900 headings; no dark card/page surfaces on either surface.

---

# Pre-Merge Design/Styling Review — Branch Delta vs `origin/gsorrels/feature/govern-audit-backend`

**Generated:** 2026-08-31
**Reviewer scope:** Read-only design/styling review of the full branch delta
(`git diff --name-only origin/gsorrels/feature/govern-audit-backend...HEAD`), focused on the
**47 changed `src/components/govern/**/*.tsx` files.**
**Standards enforced:** (1) Heroicons via `Icon` component only — no emoji/dingbat-as-icon, no raw inline `<svg>` for iconography, no hand-rolled Live spans; (2) every `<Icon name=>` must resolve to a real name in the `IconName` union; (3) light theme (slate/white surfaces); (4) LiveDataBadge/MockDataBadge/DataSourceIndicator used consistently; (5) card conventions.
**Method:** grepped emoji/dingbat ranges, `<svg`, static + dynamic (`icon:` config) `<Icon name=>`, dark-surface classes, and Live spans across the 47 changed files; read each hit in context to confirm rendered UI.

## MUST-FIX COUNT: 11

Findings most-severe first. Each cites `file:line` and a one-line fix.

### MUST-FIX

1. **Runtime-missing icon `minus-circle`** — `operations/FrameworkReportsModule.tsx:1455` (STATUS_CONFIG `not-applicable`), rendered at `:1573` via `<Icon name={statusConfig.icon as any}>`. `minus-circle` is NOT in the `IconName` union → `PATHS[...]` is `undefined` → renders a blank `<svg>` whenever a requirement is N/A (the `as any` cast hides it from the compiler). **Fix:** use `minus` (in union) or add a `minus-circle` entry to `icons.tsx`.
2. **Runtime-missing icon `server`** — `operations/AgentResourceInventory.tsx:1005` (CONTROL_CATEGORY_CONFIG `platform`), rendered at `:1598` (also `:1123`) via `<Icon name={config.icon as any}>`. `server` is NOT in the union (the real name is `server-stack`) → blank render for the "Platform" control category. **Fix:** change config value to `server-stack`.
3. **Emoji used as metric icons** — `DataGovernance.tsx:125-128` (`icon: '🛡️' / '👤' / '🚫' / '📊'`), rendered at `:134` (`{c.icon} {c.label}`). Pictographic emoji in rendered UI. **Fix:** replace with `<Icon name="shield-check" | "user" | "no-symbol" | "chart-bar">`.
4. **✓ / ✕ dingbats used as status-badge icons** — `FinosAirView.tsx:46,48` (`statusMeta` `icon: '✓' / '✕'`), rendered at `:467`, `:553`, `:674` (`{sm.icon}` inside a colored badge). **Fix:** render `<Icon name="check">` / `<Icon name="x-mark">` instead of the glyph string (leave the ASCII `!`/`—` or swap for `exclamation-triangle`/`minus`).
5. **`↻` dingbat used as a refresh-button icon** — `GovernanceCommandCenter.tsx:424` (`↻ Refresh All`). The Icon set already provides the refresh glyph. **Fix:** `<Icon name="arrow-path" className="w-3 h-3" /> Refresh All`.
6. **Ad-hoc `● live` indicators bypassing the badge system** — `TrustStack3Layer.tsx:784, 1105, 1157, 1200, 1432` (`{anyLive ? '● live' : 'baseline'}`). Hand-rolled Live text + `●` dingbat where `DataSourceIndicator`/`LiveDataBadge` belong — this file already imports and uses `LiveDataBadge` (L772/L1687). **Fix:** render `<LiveDataBadge>` (or the shared `StatusDot`) instead of the `● live` string.
7. **Ad-hoc `LIVE`/`Demo` pill duplicating LiveDataBadge/MockDataBadge** — `ComplianceCenter.tsx:923-924` (bespoke `bg-emerald-100 text-emerald-700 … LIVE` / `bg-slate-100 … Demo` spans). Same role/colors as the badge components already imported here (L29, used L673/L1989). **Fix:** `{live ? <LiveDataBadge/> : <MockDataBadge/>}`.
8. **Raw inline `<svg>` iconography (toolbar + alert + chain icons)** — `ModelRegistry.tsx:255, 270, 284, 298, 312, 564, 1106` (chart-bar, compare/chart-bar-square, calculator, link, document-text, exclamation-triangle, arrow-right). **Fix:** replace each with the matching `<Icon name=…>`.
9. **Raw inline `<svg>` iconography (close + migration arrow)** — `ModelLifecycle.tsx:509` (x-mark close button), `:680` (arrow-right). **Fix:** `<Icon name="x-mark">` and `<Icon name="arrow-right">`.
10. **Raw inline `<svg>` iconography (badge-check callout)** — `Iso42001View.tsx:346`. **Fix:** `<Icon name="check-badge">` (or `shield-check`).
11. **Raw inline `<svg>` expander/tree chevrons** — `FinosAirView.tsx:702`, `CriAiRmfView.tsx:431`, `NaicAiView.tsx:432, 554`, `OsfiE23View.tsx:373`, `OwaspLlmView.tsx:593`, `data/DataTaxonomy.tsx:107`. Identical hand-rolled chevron path repeated across the compliance-framework views + taxonomy tree. **Fix:** `<Icon name="chevron-down">` (rotate for expanded), `chevron-right` for the DataTaxonomy tree toggle.

### ACCEPTED-WARNING (not blocking; judgment calls / constrained cases)

- **`★` in HandoffWorkspace** — `HandoffWorkspace.tsx:360` (`★ agent rec`). No `star` name exists in the `IconName` union, so a text glyph is the pragmatic choice. Accepted per review brief; consider adding a `star` icon later.
- **Dingbat glyphs inside native `<option>`** — `ComplianceCenter.tsx:2806-2808` (`✓ Compliant`, `◐ In Progress`, `✗ Gap`). An `<Icon>` (SVG) cannot render inside a native `<select><option>`; either drop the glyphs (plain text labels) or move to a custom dropdown.
- **Inline trend/direction glyphs `▲ ▼ ↗ ↘ ↓`** — e.g. `EarnedAutonomyView.tsx:142,143,207`, `HandoffWorkspace.tsx:324`, `ModelEvaluations.tsx:224`, `finops/BusinessMetrics.tsx:455`, `ModelDrawer.tsx:152`. Icons exist (`arrow-trending-up`/`arrow-trending-down`/`arrow-up`/`arrow-down`); low visual weight. Migrate for strict compliance.
- **Decorative bullet / legend / severity glyphs `● ○ ·`** — legend swatches `ModelDrawer.tsx:364-366`; list bullets `FinOps.tsx:835,1212,1268,1334,1377,1502,1581`; severity micro-glyph `ModelRegistry.tsx:41` (`○`). Prefer the shared `StatusDot` span or an `Icon`; currently decorative, not blocking.
- **Navigational / flow text arrows `→` `←`** — pervasive (~100 across nearly every changed file, e.g. "View →", "Concept → Pilot → Production"). Treated as an established platform-wide typographic link/flow convention rather than iconography, so NOT counted as must-fix. Flagging all would contradict the evident intent (only `★` was carved out). Promote to must-fix only if a strict zero-dingbat gate is desired.

### Reviewed and CLEAN

- **Invalid static icon names:** none. All 84 distinct static `<Icon name="…">` literals and all `icon:'…'` config values across the 47 files resolve to the union — except the two `as any`-cast runtime cases in MUST-FIX #1/#2.
- **Light-theme palette (standard 3): PASS.** Every `bg-slate-800/900` / `bg-black` / `text-white` hit in the changed files is a legitimate non-surface use — active toggle/tab pills, toast notifications, modal scrims/overlays, dark code/JSON viewers, or small numbered step badges. No dark page or card surface, no `text-white` body text on a light card.
- **Non-icon `<svg>`: PASS.** Remaining raw SVGs are data-viz, not iconography — radial progress rings (`ProgramProgress.tsx:101,202`, `Iso42001View.tsx:485`, `DevToolsGovernance.tsx:5035`) and sparklines/charts (`HandoffWorkspace.tsx:59`, `operations/CapacityPlanning.tsx:493`). Acceptable.
- **Card conventions:** changed cards follow `bg-white/… rounded-xl border border-slate-200/60 shadow-sm`; no gross deviations found.

---

# Pre-Merge Design/Styling Review — Uncommitted Govern Branch Changes

**Generated:** 2026-08-31
**Reviewer scope:** Read-only pre-merge design/styling review of this branch's UNCOMMITTED changes
(`git diff --name-only HEAD` — ~120 changed frontend files under `src/components/govern/`, `App.tsx`,
`api/client.ts`, `GovernLanding.tsx`) plus new `src/components/ErrorBoundary.tsx` and the icon registry `icons.tsx`.
**MUST-FIX rule applied:** defects in touched files only.

## MUST-FIX COUNT: 0

No design/styling defects were introduced by this branch's changes. All five focus areas pass. Details below, most-severe first.

---

### Focus results (branch changes)

| # | Focus area | Result | Evidence |
|---|-----------|--------|----------|
| 1 | No emoji in changed UI | PASS (no new emoji) | `git diff HEAD` added (`+`) lines across all changed `*.tsx`/`*.ts` contain **zero** pictographic/dingbat/flag emoji. Verified emoji regex works (5 hits in ComplianceCenter file body) but none fall on added/removed lines. |
| 2 | icons.tsx union ↔ PATHS integrity | PASS | All 28 new union members (`cog-6-tooth` … `arrows-pointing-in`) have matching valid `<path>`/`<circle>`/fragment PATHS entries. No syntax issues, no blank-render names, no orphan paths. `PATHS: Record<IconName, React.ReactNode>` compiler-enforces completeness. |
| 3 | Badge prop usage | PASS | `MockDataBadge({ integration?: string })` / `LiveDataBadge({ source?, detail? })` (DataSourceIndicator.tsx L346/L359). All usages across changed files use only the correct props (or none). No misuse. |
| 4 | Command Center AI Quality zone matches other zones | PASS | AI Quality zone (GovernanceCommandCenter.tsx L479-489): `ZoneHeader` (violet) + `<div className="bg-white/80 rounded-xl border border-slate-200/60 p-4 shadow-sm">`. Exactly matches the Risk (L504) and Cost (L841) zone cards and the stated target pattern. |
| 5 | Light-theme (slate/white) palette | PASS | No dark-theme classes (`bg-slate/gray/zinc/neutral-800/900`, `bg-black`, `dark:` prefix) on any added line. New `ErrorBoundary.tsx` uses the canonical card, Icon component, and slate/white/amber palette. |

---

### Advisory (NOT must-fix; pre-existing, not introduced by this branch)

The branch introduces no new emoji, but the following pre-existing emoji/dingbat glyphs already live in files this branch happens to touch. They are context lines (not added/modified by the diff), so they are not regressions and do not block this merge. Listed only so a strict "zero-emoji in all merged files" gate can be applied later if desired:

- `ComplianceCenter.tsx` — `🔴🟠🟡🟢` (L92-110), `🏛️📋⚙️🔧🚀` (L1024-1028), `⚡📅📜🔀⚠️` and `✓/✗` status glyphs (various L2217-2867)
- `ModelRegistry.tsx` — flag emoji `🇺🇸🇨🇦🇪🇺` (L579, L602-605, L734-737)
- `DataGovernance.tsx` — `🛡️👤🚫📊` (L124-127)
- `FinosAirView.tsx` — `📋` (L242) and `✓/✕` verdict glyphs; `EuAiActView.tsx` — `📋` (L205)
- `mockData.ts` — `👍` (L4606), `✅` (L4625) in mock reaction data
- Inline `✓/✕/✗/!` dingbat status glyphs in `DevToolsGovernance.tsx`, `AgentRegistry.tsx` (L1573)

Other non-blocking observations:
- `icons.tsx`: new `cog-6-tooth` reuses the exact path of the existing `cog` (renders a valid gear, not the canonical 6-tooth shape). Several pre-existing icons also share paths (e.g., `plug` renders the `bolt` lightning glyph; `robot`≡`cpu-chip`; `syringe`≡`beaker`; `magnifying-glass`≡`search`). None render blank; all pre-existing except `cog-6-tooth`.
- New error boundary lives at `src/components/ErrorBoundary.tsx` (imports `./govern/icons`), not `src/components/govern/ErrorBoundary.tsx` as the review brief anticipated. Cosmetic path note only.

---

# Govern Module Design Standards Compliance Report

**Generated:** 2026-07-22  
**Scope:** `src/components/govern/` (~155 files)  
**Reference Patterns:** FinOps.tsx, CommandCenter.tsx, GovernPageLayout.tsx, StatCard.tsx

---

## Executive Summary

The Govern module demonstrates **strong overall consistency** with AVA platform design standards. The codebase has established patterns through dedicated components (StatCard, GovernPageLayout, DataSourceIndicator, CoreBadge, Icon) that most files follow. However, there are areas requiring attention, particularly around **raw SVG usage** in some components and **hardcoded hex colors** in chart/data visualization code.

**Compliance Score:** ~85% (Good)

---

## 1. Component Patterns

### Icon Component Usage

**Status:** NEEDS ATTENTION

The module has a well-designed `Icon` component (`icons.tsx`) with 100+ Heroicon definitions. However, many files still use raw inline SVGs instead of the Icon component.

**Violations (files with `<svg` but NOT importing Icon):**

| File | Issue |
|------|-------|
| `EmergencyControls.tsx` | 25+ raw SVGs for action icons (lines 43-325, 384-416, etc.) |
| `ControlPlanePillars.tsx` | Raw SVGs for pillar icons |
| `Drawer.tsx` | Close button uses raw SVG (line 83) |
| `EmptyState.tsx` | Icons passed as path strings, rendered as raw SVG |
| `RiskDrawer.tsx` | Raw SVGs for status indicators |
| `FleetRiskPosture.tsx` | Raw SVGs in the component |

**Recommendation:** Migrate these files to use the `Icon` component. For EmptyState.tsx, refactor to accept `IconName` instead of raw path strings.

### StatCard Usage

**Status:** GOOD

StatCard is used consistently across 50+ files with proper variant usage:
- `variant="success"` for positive metrics (emerald)
- `variant="warning"` for caution states (amber)
- `variant="danger"` for errors/critical (rose)
- `variant="info"` for neutral information (blue)

### GovernPageLayout Usage

**Status:** PARTIAL

27 files properly use GovernPageLayout for consistent page structure. However, several major pages implement their own header patterns:

| File | Issue |
|------|-------|
| `FinOps.tsx` | Custom header implementation (lines 657-675) |
| `CommandCenter.tsx` | Custom header implementation (lines 24-44) |
| `AgentRegistry.tsx` | Custom header implementation |
| `ModelManagement.tsx` | Custom header implementation |

**Recommendation:** These are likely intentional for flexibility, but consider whether GovernPageLayout could be extended to support these use cases.

### DataSourceIndicator/Badges

**Status:** EXCELLENT

103 files properly use MockDataBadge, LiveDataBadge, or CoreBadge. This is a strong pattern adoption.

---

## 2. Color Palette Compliance

### Status Colors

**Status:** CONSISTENT

The module correctly uses Tailwind semantic classes:
- `emerald-*` for success/healthy states
- `amber-*` for warnings/pending
- `rose-*` for errors/critical
- `slate-*` for neutral/muted

### Pillar Colors

**Status:** CONSISTENT (defined in CoreBadge.tsx)
- Blue (`blue-*`) for "See It" pillar
- Violet (`violet-*`) for "Govern It" pillar
- Emerald/Green (`emerald-*`) for "Show It" pillar

### Hardcoded Hex Colors

**Status:** NEEDS ATTENTION

3,375+ occurrences of arbitrary `text-[Npx]` values and 100+ hardcoded hex colors found, primarily in:

**Chart/Visualization Components (Acceptable):**
- `FinOps.tsx` - Recharts colors for data visualization
- `AgentRegistry.tsx` - Chart colors (lines 903-951)
- `AuditIncidents.tsx` - Chart gradient colors
- `BiasFairness.tsx` - Bar chart colors
- `ComplianceCenter.tsx` - Framework colors
- `AgentCoreEvaluations.tsx` - Evaluation chart colors

**Data Definition Files (Acceptable):**
- `mockData.ts` - Provider and status colors
- `agentEvalData.ts` - Trace type colors

**Files with Potentially Unnecessary Hardcoded Colors:**

| File | Line(s) | Issue |
|------|---------|-------|
| `A2ATrustEvaluator.tsx` | 76 | Inline style colors for status dots |
| `AgenticGovernancePlaybook.tsx` | 140-277, 359-374 | Hardcoded colors in data objects |
| `AttackSurfaceView.tsx` | 24-33 | OWASP category colors |

**Recommendation:** For charts, hardcoded colors are acceptable (Recharts limitation). Consider extracting non-chart colors to a shared palette constant.

### Dark Mode Support

**Status:** NOT IMPLEMENTED

0 occurrences of `dark:` prefix found. The module is light-mode only.

**Recommendation:** Document as known limitation. If dark mode is needed, prioritize high-visibility components first.

---

## 3. Typography

### Heading Hierarchy

**Status:** CONSISTENT

The module follows a clear typography pattern:
- Page titles: `text-3xl font-semibold text-slate-900 tracking-tight`
- Section headers: `text-sm font-semibold text-slate-900`
- Subsection: `text-xs font-semibold text-slate-700`
- Body text: `text-xs text-slate-600` or `text-slate-500`
- Micro text: `text-[9px]`, `text-[10px]`, `text-[11px]` for labels/badges

### Arbitrary Font Sizes

**Status:** ACCEPTABLE

3,375 occurrences of `text-[Npx]` patterns. This is intentional for fine-grained control in dense data displays and badges. Common patterns:
- `text-[9px]` - Micro badges, severity labels
- `text-[10px]` - Small labels, metadata
- `text-[11px]` - Secondary text in cards
- `text-[12px]` - Compact body text

---

## 4. Layout Standards

### Grid Patterns

**Status:** CONSISTENT

Common patterns used throughout:
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for card grids
- `grid-cols-2 md:grid-cols-4` for stat displays
- `grid-cols-1 lg:grid-cols-2` for two-column layouts

### Spacing

**Status:** CONSISTENT

Standard spacing patterns observed:
- `gap-4` / `gap-6` for grids
- `p-4` / `p-5` / `p-6` for card padding
- `mb-3` / `mb-4` / `mb-6` for vertical rhythm
- `px-6 py-10` for page containers

### Responsive Breakpoints

**Status:** GOOD

Proper use of `md:` and `lg:` breakpoints throughout. Mobile-first approach maintained.

### Max-Width Containers

**Status:** CONSISTENT

`max-w-7xl mx-auto` used for main content containers in page layouts.

---

## 5. Interactive Elements

### Hover States

**Status:** GOOD

1,179 occurrences of `hover:` classes. Most interactive elements have proper hover states.

### Focus States

**Status:** PARTIAL

240 occurrences of `focus:` classes. Coverage is good but not universal.

**Files Missing Focus States on Interactive Elements:**

| File | Issue |
|------|-------|
| `EmergencyControls.tsx` | Action buttons lack visible focus rings |
| Several table rows using `onClick` | Need `rowButtonProps()` pattern |

**Recommendation:** The `a11y.ts` helper (`rowButtonProps`) exists - ensure all clickable non-button elements use it.

### Transitions

**Status:** GOOD

Standard transition patterns:
- `transition-colors` for color changes
- `transition-all` for multi-property animations
- Duration typically implicit (Tailwind default 150ms)

### Cursor Styles

**Status:** GOOD

100 occurrences of `cursor-pointer`. Clickable elements are properly styled.

---

## 6. Badge/Tag Standards

### CoreBadge

**Status:** EXCELLENT

Properly applied to all 9 Core modules with correct pillar assignment:
- See It: Command Center, Agent Registry, Fleet, Models, FinOps
- Govern It: Compliance Center, Prompt Governance
- Show It: Audit & Incidents, Data Governance

### LiveDataBadge/MockDataBadge

**Status:** EXCELLENT

103 files use these badges appropriately to indicate data source status.

### Status Badges

**Status:** CONSISTENT

Standard pattern: `text-[9px] px-1.5 py-0.5 rounded font-semibold` with appropriate color variants.

---

## 7. Table Standards

### Table Styling

**Status:** CONSISTENT

65 occurrences of `divide-y` for row separation. Standard patterns:
- Header: `text-slate-400 text-[10px] uppercase tracking-wide`
- Rows: `border-t border-slate-100` or `divide-y divide-slate-100`
- Hover: `hover:bg-slate-50/50` or similar

### Empty State Handling

**Status:** GOOD

`EmptyState.tsx` component provides reusable empty states with 12 pre-configured options.

---

## 8. Form Elements

### Input Styling

**Status:** CONSISTENT

Standard input pattern:
```tsx
className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm 
           focus:outline-none focus:ring-2 focus:ring-blue-500"
```

### Select/Dropdown

**Status:** CONSISTENT

Tab-style selectors common pattern:
```tsx
className="flex gap-1 p-1 bg-slate-100/80 rounded-xl"
// with active/inactive button states
```

---

## Priority Action Items

### VIOLATIONS (Must Fix)

1. **EmergencyControls.tsx**: Convert 25+ raw SVGs to Icon component
2. **EmptyState.tsx**: Refactor to use IconName instead of path strings
3. **Drawer.tsx**: Replace close button raw SVG with Icon

### INCONSISTENCIES (Should Fix)

1. **A2ATrustEvaluator.tsx line 76**: Replace inline style colors with Tailwind classes
2. **AgenticGovernancePlaybook.tsx**: Consider extracting color definitions to constants
3. **AttackSurfaceView.tsx**: Consider moving OWASP colors to shared palette

### SUGGESTIONS (Nice to Have)

1. **Dark Mode**: Add as future enhancement if needed
2. **GovernPageLayout Adoption**: Consider extending to support FinOps/CommandCenter header needs
3. **Chart Color Palette**: Create shared constant for visualization colors to ensure consistency
4. **Focus State Audit**: Comprehensive review of all interactive elements for accessibility

---

## Files Requiring Updates

| File | Priority | Issue |
|------|----------|-------|
| `EmergencyControls.tsx` | HIGH | 25+ raw SVGs |
| `EmptyState.tsx` | HIGH | Icon pattern mismatch |
| `Drawer.tsx` | MEDIUM | 1 raw SVG |
| `ControlPlanePillars.tsx` | MEDIUM | Raw SVGs |
| `RiskDrawer.tsx` | MEDIUM | Raw SVGs |
| `FleetRiskPosture.tsx` | MEDIUM | Raw SVGs |
| `A2ATrustEvaluator.tsx` | LOW | Inline style colors |
| `AgenticGovernancePlaybook.tsx` | LOW | Color organization |
| `AttackSurfaceView.tsx` | LOW | Color organization |

---

## Appendix: Established Patterns Reference

### Card Styling
```tsx
className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm"
```

### Section Header
```tsx
className="text-sm font-semibold text-slate-900"
```

### Micro Badge
```tsx
className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-{color}-100 text-{color}-700"
```

### Interactive Row
```tsx
<tr
  {...rowButtonProps(() => handleClick(id))}
  className="cursor-pointer hover:bg-slate-50/50 transition-colors"
>
```

### Tab Navigation
```tsx
<div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist">
  <button
    role="tab"
    aria-selected={active}
    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    {label}
  </button>
</div>
```
