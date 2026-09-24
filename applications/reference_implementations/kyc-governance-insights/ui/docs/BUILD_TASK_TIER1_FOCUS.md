# BUILD_TASK: All Tiers — Cull, Info Panels, Wire Unrouted Views

> **Priority:** P0 — demo is too dense, puts off stakeholders, needs ROI next week
> **Created:** 2026-07-15 by V6
> **Context:** Raphael's tiered priority list (agreed), Steve's feedback (too overwhelming), need to share broadly with SAs + customers ASAP
> **Depends on:** Phase 1/1.5 (CF consolidation) — DONE. Phase 2 in-flight (independent).
>
> **NOTE TO KIRO:** This spec describes the problem and desired outcome. The GOLDEN RULE applies: DO NOT DROP ANYTHING THAT EXISTS. Every tab, feature, and component must survive. You are only HIDING, COLLAPSING, or REORDERING — never deleting. If in doubt: KEEP IT.

---

## Problem Statement

The demo has **too much on screen**. It was built iteratively over 26 iterations and every feature accumulated additively. The result:

- A CRO or C-level viewer opens it and is **overwhelmed** — dozens of tabs, metrics, panels, charts
- Presenters (Roshan, Raphael, Reka, Arvind) can't confidently explain every element
- Steve (LT) saw it and wanted "just the basic HTML" — the density actively repels senior stakeholders
- Customers exploring independently have no context for what they're looking at

The features are good. The problem is **information architecture** — everything is equally prominent, nothing guides the eye.

---

## Design Constraints

1. **DO NOT DROP ANYTHING.** Every existing tab, feature, section, component must survive. No deletions.
2. **Tier 1 is front-and-centre.** Tier 2-4 content is accessible but not default-visible.
3. **Info panels explain WHAT, not WHY.** Describe the metric, what the numbers mean, what a trend implies. Never preachy or justificatory — the value should be self-evident from the explanation.
4. **Must work for three audiences:**
   - Presenter with no prep (info panel = cheat-code)
   - Customer exploring alone (info panel = self-serve context)
   - Steve / C-level (sees 3 clear things, not 30)
5. **Basic Mode untouched** — narrative fidelity sacred
6. **Wire unrouted views** — EvaluationsDashboard and PipelineGate are built, just not in nav

---

## The Agreed Tier System (from Raphael, 15 Jul)

### Tier 1 — Earned Autonomy + Fleet Story (default visible, prominent)

1. **Autonomy Configuration + Intervention Ladder** — Business Ops "Decision Rules" or Compliance "Policy Enforcement". Centerpiece: autonomy is earned, bounded, revocable.
2. **CRO Fleet dashboard** — CRO Fleet persona (whole page). Portfolio health, multi-use-case constellation, KRIs, operational KPIs, alerts.
3. **Evaluations / continuous measurement** — EvaluationsDashboard + PipelineGate (BUILT, currently UNROUTED). Evidence that justifies autonomy promotion.

### Tier 2 — Makes autonomy defensible + quantifies payoff (accessible, not default)

4. SM&CR Accountability
5. Model governance at fleet scale
6. ROI & cost
7. Monitoring texture (risk appetite, KRI trends, constellation health)

### Tier 3 — Accuracy/security depth (collapsed or behind "More")

8. Cedar Policies (make rule eval live)
9. Security architecture
10. Guardrails
11. Agent Execution depth
12. Evidence & HITL

### Tier 4 — Supporting/presentation (hidden unless requested)

13. Reports, Risk Register, Talking Points, Presentation Mode, Guided Tour

---

## What "Cull" Means (NOT delete)

For each persona view, apply this pattern:

| Tier | Treatment |
|------|-----------|
| Tier 1 | **Full prominence.** Default tab, full-size, no collapse. |
| Tier 2 | **Visible but secondary.** Tab exists in nav but not first-selected. Sections may start collapsed with a "Show details" expand. |
| Tier 3 | **Behind a "More" or "Advanced" grouping.** Still one click away. Not in the primary tab bar — in a dropdown or sub-nav. |
| Tier 4 | **Hidden unless URL param or menu.** Talking Points already behind `?presenter=true` — same pattern for others. |

The goal: when someone lands on any persona, they see **Tier 1 content first** without scrolling or clicking. Tier 2+ is discoverable but not in-face.

---

## Wire Unrouted Views

These components exist in code but have no route/tab:

| Component | Where to Wire | Persona |
|-----------|--------------|---------|
| `EvaluationsDashboard` | New tab or section within the evaluations area | Engineering + Compliance |
| `PipelineGate` | Within or adjacent to EvaluationsDashboard — shows promotion gate logic | Engineering + Compliance |

Kiro: find these components in the codebase, understand what they render, and wire them into appropriate persona views as Tier 1 content.

---

## Info Panels — ALL Tiers

Add clickable info panels (existing `InfoPanel` / `InfoTooltip` system from iteration 7) to ALL elements across ALL tiers — not just Tier 1.

Every metric, chart, score, badge, table, and interactive element should have an info panel. The user may not reach Tier 3 on first visit, but when they do, the panels are already there.

### Content Style

**DO:** Explain what the viewer is seeing.
- What this metric/element shows
- What the numbers mean (scale, units, what "good" vs "bad" looks like)
- What drives changes (what makes it go up/down)
- How it relates to the autonomy story (implicit, not stated)

Examples:
- "This score represents the rolling 7-day average of automated evaluation results across all agent decisions."
- "Green = within risk appetite. Amber = approaching threshold. Red = breach — triggers automatic tightening."
- "Trend direction: upward means improving accuracy. A sudden dip may indicate model drift or data quality change."

**DON'T:** Justify the element's existence.
- ~~"This metric exists because regulators require continuous monitoring of..."~~
- ~~"We included this because FSI customers told us..."~~

### Coverage by Tier

| Tier | Info Panel Requirement |
|------|----------------------|
| Tier 1 | Every element. Rich content. "Learn more" links to research where available. |
| Tier 2 | Every element. Solid content. Links where available. |
| Tier 3 | Every element. Can be more technical/terse — audience is Engineering/Compliance depth. |
| Tier 4 | Key elements only. Reports and Presentation Mode are self-explanatory. |

**Total expected:** Info panels on every non-trivial UI element across all personas and all tiers. If an element is worth showing, it's worth explaining.

### Where to source content

1. Existing `infoContent.ts` (116 entries) — audit for Tier 1 coverage, rewrite generic ones
2. Research corpus at `Documents\AI\Demo Working\Research\kyc_banking_research\` — extract key insights
3. If neither has good content for an element, write factual descriptions of what the metric shows

### Linking to research

Where a research doc exists that explains the domain deeply, add a "Learn more" link in the info panel pointing to the doc filename (these will eventually be accessible URLs). Format: `📄 See: [doc_name]` at bottom of panel.

---

## Acceptance Criteria

1. [ ] Landing on any persona shows Tier 1 content FIRST without scrolling or extra clicks
2. [ ] Tier 2 content is accessible (1 click) but not default-prominent
3. [ ] Tier 3 content is behind a "More" / "Advanced" grouping
4. [ ] Tier 4 content is hidden (URL param or menu)
5. [ ] EvaluationsDashboard is routed and reachable in at least one persona view
6. [ ] PipelineGate is routed and reachable
7. [ ] Every Tier 1 element has a clickable info panel with factual "what this shows" content
8. [ ] Every Tier 2 and Tier 3 element has a clickable info panel
8a. [ ] Info panels never say "this exists because..." — only describe what the viewer is seeing
9. [ ] ALL existing features still accessible (nothing deleted)
10. [ ] Basic Mode untouched (narrative fidelity)
11. [ ] `npm run build` passes

---

## Kiro Prompt

```
Read docs/BUILD_TASK_TIER1_FOCUS.md.

Key context:
- The demo is too dense. Stakeholders are overwhelmed. We need to focus.
- GOLDEN RULE: DO NOT DROP ANYTHING THAT EXISTS. Every tab, feature, component must survive. You are only HIDING, COLLAPSING, or REORDERING — never deleting.
- Tier 1 (Autonomy Config, CRO Fleet, Evaluations) must be front-and-centre on landing.
- EvaluationsDashboard and PipelineGate are BUILT but UNROUTED — find them in the codebase and wire them.
- Add info panels (existing InfoPanel/InfoTooltip system) to ALL elements across ALL tiers.
- Tier 1 = full prominence. Tier 2 = visible but secondary. Tier 3 = behind "More". Tier 4 = hidden.
- Info panels on EVERYTHING non-trivial — not just Tier 1.

Before implementing: write a brief assessment — what's currently in each persona view, map each tab/section to a tier, identify what needs to move, what's unrouted.

Run npm run build to verify. Test all personas manually.
```

---

## What This Enables

After this build ships:
- **Steve sees 3 things**, not 30 → willing to share with his stakeholders
- **Presenters have cheat-codes** → info panels mean you can present without memorizing every metric
- **Customers can explore** → self-serve context on every element
- **Raphael can confidently present** → Tier 1 is tight, explained, defensible
- **You get ROI** → shareable next week with SAs, customers, LT
