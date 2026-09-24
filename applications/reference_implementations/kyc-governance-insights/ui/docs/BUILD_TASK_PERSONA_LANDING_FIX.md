# BUILD TASK: Persona Landing Fixes (Browser-Verified Gaps)

> **Git revert:** `git stash` or `git checkout -- .` if this breaks things.

---

## WHY

The Tier 1 re-tier + collapse rollout was reported as complete, but browser verification on PROD shows 4 gaps between what was specified and what's actually rendering. These need fixing before internalization briefs make sense.

**The principle:** Each persona should land on the tab that answers THEIR first question. Not the dev's first tab, not alphabetical order, not session-persisted state.

---

## GOLDEN RULE

DO NOT DROP ANYTHING THAT EXISTS. Every tab, feature, component, and route must survive. You are ONLY changing: (1) default tab selection per persona, (2) adding CollapsibleSection wrappers to Fleet, (3) handling Guardrails overflow. If in doubt: KEEP IT.

---

## FIX 1 — Business Ops default tab → Decision Rules

**Problem:** Business Ops lands on "Live Decision" (tab 2). Should land on "Decision Rules" — that's where autonomy config + intervention ladder lives, which is the Tier 1 entry for this persona.

**File:** `src/config/personaTabs.ts` (or wherever persona → default tab mapping lives)

**Fix:** Set the default/initial tab for Business Ops persona to `Decision Rules`. The tab already exists at position 4 — just make it the active-on-load tab.

**Do NOT:** Reorder tabs. Just change which one is selected on first render.

**Edge case:** If tab selection is persisted in localStorage/sessionStorage, the default should only apply when there's NO persisted state (first visit).

---

## FIX 2 — Compliance default tab → Audit Dashboard

**Problem:** Compliance lands on "Decision Log" (tab 2). Should land on "Audit Dashboard" — that's where composite/domain scores + findings live, which is the Tier 1 entry for Compliance.

**File:** Same as above — `personaTabs.ts` or equivalent

**Fix:** Set default tab for Compliance persona to `Audit Dashboard`. It's already tab 1 in the nav — just needs to be the active-on-load selection.

**Note on "Evaluations":** The handoff mentioned an "Evaluations" tab that doesn't exist. This is fine — the evaluation content lives within Audit Dashboard (composite scores, control testing). No new tab needed. The spec was using a conceptual name, not a literal tab name.

---

## FIX 3 — CRO Fleet: Apply CollapsibleSection to depth content

**Problem:** Fleet page has ALL sections fully expanded. The CollapsibleSection component was built but never applied here. The page is too long — a CRO needs the top-level health picture, not every detail expanded.

**File:** `src/views/FleetDashboard.tsx` (or equivalent Fleet page component)

**What should be EXPANDED (Tier 1 — the CRO's first glance):**
- Portfolio Health (the 4 use-case cards with scores)
- Key Risk Indicators (the 6 KRI metrics)
- Risk Appetite Alignment (score cards per use case)
- Board Accountability Summary (SM&CR attestation)

**What should be COLLAPSED (default-collapsed, one-line header + expand chevron):**
- "How the system works" / Reference Architecture (pipeline diagram)
- Recent Alerts
- Compliance Operations
- KRI Trends (30d/60d/90d detail)
- Incidents & Near-Misses

**Implementation:** Wrap each collapsed section in `<CollapsibleSection title="..." defaultCollapsed={true}>`. The component already exists and is used elsewhere.

**Info tooltip (optional but nice):** Add a `tooltip` prop if the component supports it — one sentence explaining what's inside (e.g., "30/60/90 day trend lines for all 6 KRIs").

---

## FIX 4 — Engineering: Guardrails behind "More" overflow

**Problem:** All 6 Engineering tabs fit inline at current viewport width (985px nav). There's no "More" dropdown. Guardrails should be deprioritised — it's not Engineering's Tier 1 entry.

**Two acceptable solutions (pick the simpler one):**

**Option A — Responsive overflow (preferred if the pattern exists elsewhere):**
If there's already a "More" overflow pattern in the codebase, apply it to Engineering tabs with a max visible count of 5. Guardrails (position 6) flows into the overflow menu.

**Option B — Move Guardrails to a sub-section within another tab:**
If no overflow pattern exists and building one is heavy, move Guardrails content as a collapsible section within the Architecture tab (at the bottom, collapsed by default). Keep the route alive for direct linking but remove it from the top nav for Engineering persona.

**Option C — Just leave it (lowest priority):**
If both A and B are non-trivial, skip this. Guardrails being visible at position 6 is not a blocker — it's just not ideal. The other 3 fixes are more important.

**DO NOT:** Delete the Guardrails tab/route. It must remain accessible.

---

## VERIFICATION

After changes:

1. Clear localStorage/sessionStorage (or use incognito)
2. Select Business Ops persona → should land on Decision Rules tab
3. Select Compliance persona → should land on Audit Dashboard tab
4. Select CRO Fleet → page should show portfolio health + KRIs expanded, depth sections collapsed with one-line headers
5. Select Engineering → Architecture tab active (unchanged), check if Guardrails is behind overflow or still inline (report back either way)
6. Navigate ALL tabs in ALL personas → confirm nothing is missing/broken

```bash
npm run build   # must exit 0
tsc --noEmit    # must exit 0
```

---

## WHAT NOT TO TOUCH

- Basic/Advanced mode toggle
- Any data files (`src/data/`)
- Tab order (just default selection)
- Tab content/components (just wrapping in CollapsibleSection)
- `kyc_banking/` — wrong app
- Any backend / deploy / CFN files

---

*Source: Browser verification 2026-07-16 against PROD (d34f241zukf5gh.cloudfront.net)*
*Priority: Fixes 1-3 are required. Fix 4 is nice-to-have.*
