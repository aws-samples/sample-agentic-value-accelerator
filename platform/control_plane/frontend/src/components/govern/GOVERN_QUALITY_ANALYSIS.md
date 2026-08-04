# Govern Module Code Quality Analysis

**Date:** 2026-07-22  
**Scope:** `src/components/govern/` (213 files, ~79,674 lines)  
**Overall Quality Score:** 72/100

---

## Summary

The Govern module is a substantial codebase with solid TypeScript compilation (zero tsc errors) but exhibits patterns that should be addressed before merge. The primary concerns are ESLint violations (particularly React hooks rules), oversized components, and hardcoded color values that may cause accessibility issues.

---

## Errors (Must Fix)

### 1. Unused Variables/Imports (24 instances)

ESLint reports multiple unused variables that indicate dead code or incomplete implementations:

| File | Line | Issue |
|------|------|-------|
| `ComplianceCenter.tsx` | 1046 | `showWizard`, `setShowWizard` unused |
| `ComplianceCenter.tsx` | 1798 | `apiLoading` unused |
| `ComplianceCenter.tsx` | 1822 | `controlEvalsLoading` unused |
| `ConfigGuardrailsSideBySide.tsx` | 48 | `guardrails` unused |
| `CriAiRmfView.tsx` | 32 | `CriCategory` type unused |
| `FleetOverview.tsx` | 77 | `isLiveData` unused |
| `LivePromptTelemetry.tsx` | 21 | `MockDataBadge` unused |
| `MitreAtlasView.tsx` | 445 | `controls` unused |
| `ModelManagement.tsx` | 33 | `LiveDataBadge` unused |
| `OutcomeMonitoring.tsx` | 20 | `BarChart`, `Bar` unused |
| `OutcomeMonitoring.tsx` | 31 | `OutcomeType` unused |
| `OutcomeMonitoring.tsx` | 272 | `useCase` unused |
| `OutcomeMonitoring.tsx` | 283 | `useCaseAlerts` unused |
| `OutcomeMonitoring.tsx` | 596, 750 | `i` unused in loops |
| `PolicyObservability.tsx` | 73 | `e` unused |
| `PromptGovernance.tsx` | 165 | `MOCK_GUARDRAIL_CONFIG` unused |
| `PromptGovernance.tsx` | 929 | `invocations` unused |
| `ShadowAI.tsx` | 144 | `loading` unused |
| `agentThreatProfile.ts` | 10 | `AGENTIC_RISK_CATEGORIES` unused |
| `compliance/ComplianceGapGuidance.tsx` | 25 | `GapStatus` unused |
| `compliance/GpaiModelCard.tsx` | 30 | `RiskLevel` unused |
| `compliance/GpaiModelCard.tsx` | 334-338 | Multiple unused props/state |
| `data/DataGovernanceLanding.tsx` | 566 | `SetupTab` unused |

### 2. React Hooks Violations (13 instances)

Critical violations that can cause cascading renders or stale closures:

**setState in useEffect (10 files):**
Setting loading state synchronously in effects causes unnecessary re-renders:
- `ConfigGuardrailsSideBySide.tsx:29,39`
- `DevToolsGovernance.tsx:97`
- `DeveloperAiUsageView.tsx:142`
- `FailingConfigRules.tsx:21`
- `FinOps.tsx:421`
- `HallucinationDetection.tsx:308`
- `LiveGuardrailValidation.tsx:30`
- `ModelManagement.tsx:322`
- `ShadowAI.tsx:149`
- `data/DataGovernanceLanding.tsx:103`

**Missing Dependencies (2 files):**
- `ComplianceCenter.tsx:1910` - useMemo missing `framework` dependency
- `ModelManagement.tsx:95` - useEffect missing `activeTab` dependency

### 3. Components Created During Render (1 file)

`DeveloperAiUsageView.tsx:174-178` - `SortIcon` component defined inside render, causing React to recreate it on every render. Move outside the component.

### 4. Impure Function in Render (1 file)

`DataSourceStatus.tsx:35` - Calls `Date.now()` during render, which is impure and can cause hydration mismatches. Use `useMemo` or move to an effect.

### 5. Explicit `any` Types (17 instances)

Violates `@typescript-eslint/no-explicit-any`:

| File | Line(s) |
|------|---------|
| `data/KnowledgeSources.tsx` | 66 |
| `data/useDataLineage.ts` | 64, 117, 133 |
| `data/useDataQuality.ts` | 64, 66, 82, 96, 191, 234 |
| `data/useDataReadiness.ts` | 96, 98, 99, 139 |
| `metrics/useLiveMetrics.ts` | 288 |
| `safety/RuntimeSafetyControls.tsx` | 222 |

### 6. prefer-const Violations (6 instances)

Variables declared with `let` but never reassigned in `data/useDataReadiness.ts`:
- Line 92: `guardrails`
- Line 105: `invocationLogs`
- Line 112: `cloudTrail`
- Line 119: `configCompliance`
- Line 127: `security`
- Line 136: `serviceApprovals`

---

## Warnings (Should Fix)

### 1. Fast Refresh Incompatibility (7 files)

Exporting non-components from component files breaks React Fast Refresh:
- `CoreBadge.tsx` (lines 90, 102, 106)
- `DataSourceContext.tsx` (lines 65, 229, 238)
- `EmptyState.tsx` (line 88)
- `GoLiveGuide.tsx` (line 22)
- `MaskedIdentity.tsx` (line 106)

**Fix:** Extract constants/functions to separate utility files.

### 2. Oversized Components (Top 10)

Components exceeding 1000 lines violate single-responsibility principle:

| File | Lines | Recommendation |
|------|-------|----------------|
| `ComplianceCenter.tsx` | 2,940 | Split into ComplianceOverview, ComplianceDetails, ComplianceWizard |
| `PromptGovernance.tsx` | 2,290 | Extract PromptTemplates, PromptAnalytics, GuardrailConfig |
| `DataGovernance.tsx` | 2,143 | Split into CatalogView, LineageView, QualityDashboard |
| `FleetOverview.tsx` | 2,003 | Extract AgentList, FleetStats, FleetFilters |
| `MultiCloudGovernance.tsx` | 1,889 | Split by cloud provider sections |
| `TrustStack3Layer.tsx` | 1,474 | Extract each layer into separate component |
| `risk/PolicyAsCode.tsx` | 1,427 | Split PolicyEditor, PolicyPreview, PolicyHistory |
| `DevToolsGovernance.tsx` | 1,418 | Extract UsageTable, ShadowAIPanel, CompliancePanel |
| `ModelOperations.tsx` | 1,334 | Split by tab content |
| `AgentRegistry.tsx` | 1,215 | Extract AgentTable, AgentFilters, AgentCharts |

### 3. Hardcoded Colors (100+ instances)

Colors like `#10b981`, `#ef4444`, `#f59e0b` are hardcoded throughout. This creates:
- Maintenance burden when updating theme
- Potential accessibility issues (no dark mode support)
- Inconsistent color usage

**Files with most hardcoded colors:**
- `ComplianceCenter.tsx` (20+ instances)
- `AgenticGovernancePlaybook.tsx` (18 instances)
- `AgentRegistry.tsx` (15 instances)
- `AuditIncidents.tsx` (12 instances)
- `BiasFairness.tsx` (8 instances)

**Recommendation:** Use Tailwind classes or extract to a `governColors.ts` theme file.

### 4. Console Statements in Production Code (14 instances)

Found `console.log`, `console.warn`, `console.error` calls:

| File | Line | Type |
|------|------|------|
| `ConnectionWizard.tsx` | 168, 185 | error |
| `data/DataGovernanceLanding.tsx` | 106 | warn |
| `risk/ConcentrationRiskCard.tsx` | 131 | error |
| `useAgentRegistry.ts` | 317 | error |
| `useComplianceAttestations.ts` | 103, 168, 196, 212 | warn/error |
| `useControlEvaluation.ts` | 139 | warn |
| `useGuardrailMetrics.ts` | 185 | error |
| `useGovernanceAggregator.ts` | 413 | error |
| `safety/RedTeamTestPipeline.tsx` | 584, 589 | log |

**Recommendation:** Replace with a proper logging utility or remove before production.

### 5. Missing useEffect Dependencies (86 effects without deps or with empty deps)

Many `useEffect(() => { ... })` calls have empty dependency arrays or missing dependencies. This pattern is common in the codebase for data fetching but should be audited for correctness.

---

## Suggestions (Nice to Have)

### 1. Limited Context API Usage

Only 1 file (`DataSourceContext.tsx`) uses React Context. With 116 components using `useState`, there's likely prop drilling that could benefit from context or state management:
- Consider context for: filter state, selected items, theme preferences
- Files with high onClick counts suggest deep prop passing: `ModelOperations.tsx` (39), `ComplianceCenter.tsx` (37)

### 2. Low useMemo/useCallback Adoption

- **Total `.map()` calls:** 1,350
- **Total `useMemo`/`useCallback` usage:** 439

Ratio suggests potential for optimization in components with expensive computations or frequent re-renders.

### 3. Accessibility Improvements Needed

**Current state:**
- 164 aria-label/role usages across 45 files
- Only 10 `tabIndex`/`onKeyDown` handlers across 7 files
- 493 onClick handlers across 106 files

**Gaps:**
- Many clickable `<div>` and `<tr>` elements lack keyboard handlers
- The `a11y.ts` helper exists but is underutilized
- No ARIA live regions for dynamic content updates

**Recommendations:**
1. Audit all `onClick` handlers on non-button elements
2. Use `rowButtonProps()` from `a11y.ts` consistently
3. Add `aria-live` regions for loading states and data updates

### 4. Inconsistent Prop Type Definitions

Only 21 files define explicit `Props` interfaces. Most components use inline type annotations or implicit typing.

**Recommendation:** Standardize on `interface Props { ... }` pattern for all components.

### 5. Utility File Organization

36 `.ts` utility files in the root govern directory. Consider organizing into subdirectories:
- `data/` - data hooks and types
- `utils/` - exportUtils, postureColor, a11y
- `constants/` - mock data, evaluation data
- `types/` - shared type definitions

---

## Metrics Summary

| Metric | Value | Status |
|--------|-------|--------|
| TypeScript Compilation | 0 errors | PASS |
| ESLint Errors | 68 | FAIL |
| ESLint Warnings | 3 | WARN |
| Files > 1000 lines | 18 | WARN |
| `any` type usage | 17 | FAIL |
| Console statements | 14 | WARN |
| Hardcoded colors | 100+ | WARN |
| ARIA coverage | ~30% | WARN |

---

## Recommended Fix Priority

### P0 - Before Merge
1. Fix all unused variable errors (remove or implement)
2. Fix components created during render (`DeveloperAiUsageView.tsx`)
3. Fix impure render in `DataSourceStatus.tsx`
4. Add proper types to replace `any` in data hooks

### P1 - Sprint After Merge
1. Refactor setState-in-effect patterns to use loading state initialization
2. Fix missing useEffect dependencies
3. Extract non-component exports to separate files
4. Remove console statements or use logging utility

### P2 - Technical Debt
1. Split oversized components (start with `ComplianceCenter.tsx`)
2. Extract hardcoded colors to theme constants
3. Improve accessibility coverage
4. Standardize prop type definitions

---

## Testing Recommendations

Before merge, verify:
1. No runtime errors in browser console
2. All tabs/views render without blank screens
3. Data loading states appear correctly
4. Interactive elements respond to keyboard navigation
