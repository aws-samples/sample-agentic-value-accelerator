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
