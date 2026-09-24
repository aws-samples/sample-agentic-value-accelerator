# BUILD_TASK: Basic Mode UI Fixes — Visibility, Layout, Grouping, Accuracy

> **Traceability note (Rule 3):** This spec was originally authored on branch
> `backup/kyc-banking-b11-work` under the WRONG folder (`ui/kyc_banking/docs/`) and
> was reverted with the kyc_banking cleanup (commit `8d0dd3f8`). It never made it into
> `kyc_governance_insights`. This file restores it in the CORRECT location and
> reconciles it against the current, image-based Basic mode.
>
> **Important:** Raphael Fuchs (commits `dab1b58f`, `b42fbbe9`) later replaced the SVG
> `ControlsFlowDiagram` with static per-stage architecture **images** (`base/1/2.png`)
> and added an intro step + agent-prompt cards. Per Roshan, his architecture diagrams
> are NOT to be touched. Several original spec items are therefore SUPERSEDED.

Codebase: `src/components/BasicMode/BasicModeView.tsx`, `src/data/basicModeContent.ts`,
`src/components/shared/InfoPanel.tsx`.

---

## Status reconciliation

| # | Item | Status |
|---|------|--------|
| 1 | SVG governance nodes — light-mode contrast | **Superseded** (Raphael uses static images) |
| 2 | Observation node inline SVG eye + subtext | **Superseded** (images) |
| 3 | Node-click → shared right InfoPanel | **Superseded** for nodes (images not clickable) |
| 4 | Step circles evenly spaced (`space-between`, full width) + mobile horizontal scroll | **DONE** (restored on current UI) |
| 5 | Operational Dashboard — Workflow vs Customer metric grouping (dashed boxes) | **DONE** |
| 6 | Metric gauges clickable → shared InfoPanel with `METRIC_INFO` | **DONE** |
| 7 | Metric info drawer sized to content (not full-height rail) | **DONE** — compact card, top-right, `max-height: calc(100vh - 104px)` |
| 8 | Narrative accuracy vs deployed Cedar policies | **DONE** (see below) |
| 9 | Dial values per V3_PATCH table (Security 95%+ from step 1, Accuracy grey early) | **Already correct** in `basicModeContent.ts` |

---

## Detail — what was implemented on the current UI

### #4 Step bar spacing
- Outer container `overflowX: 'auto'`; inner row `justifyContent: 'space-between'`, `width: 100%`,
  `minWidth: 540px`, `gap: 12px`. Step circles `flexShrink: 0`; connectors `flex: 1, minWidth: 12px`.
- Result: evenly spread across full width on desktop; horizontal scroll (no squish) on narrow screens.

### #5/#6 Operational Dashboard grouping + clickable metrics
- Two dashed-border groups: **Workflow Metrics** (`accuracy`, `security`) and
  **Customer Metrics** (`compliance`, `product`, `legal`).
- Each `ConfidenceGauge` is clickable and opens the shared `InfoPanel` with `METRIC_INFO`
  (per-metric description + threshold / "why it matters").
- `data-testid="basic-metric-group-workflow"` / `-customer`.

### #7 Info panel vertical space
- `src/components/shared/InfoPanel.tsx` changed from a full-height right rail
  (`top:0; bottom:0`) to a content-height card: `top:80px; right:24px`, rounded, shadowed,
  `max-height: calc(100vh - 104px)` with internal scroll only when needed.
- Only `BasicModeView` consumes `InfoPanel`, so no other screen is affected.

### #8 Narrative accuracy (aligned to the 19 deployed Cedar policies)
The Basic-mode block scenario was rewritten to match the live policy store
(`L3yUSPSB7oD9EoarS8ZS9m`, stack `kyc-cedar-gateway`):
- Sanctions block is **ORG-003** at `fuzzy_match_score > 85` (Omega match raised 78% → **92%**).
- PEP hard-block is **ORG-004** at `pep_level >= 3` (Omega PEP raised Level-2 → **Level-3**).
- Omega's £2.5M facility also correctly noted as breaching **ORG-001** (amount ceiling > £500K).
- Approve path references **DEFAULT-001** (no FORBID) and **APP-006** (`risk_score >= 80`).
- Policy count corrected `12 → 19`; sanctions confidence unified to 92%; approve score 22/100.
- "spans/traces" softened to "reasoning steps" (X-Ray tracing is not currently enabled).

---

## Acceptance Criteria

- [x] Step circles evenly spaced across full width; horizontal scroll on mobile
- [x] Dashboard dials grouped into Workflow / Customer with dashed borders
- [x] Each dial clickable → shared right-side InfoPanel
- [x] Info panel is content-height (not a tall empty rail)
- [x] Block narrative cites correct policies/thresholds (ORG-003 >85, ORG-004 ≥3)
- [x] Policy count and confidence numbers internally consistent (19 policies, 92%)
- [x] Raphael's intro step + architecture images + agent-prompt cards untouched
- [x] Build passes (`npm run build`)
- [ ] Deployed to test URL and visually verified (light + dark mode)

---

## Out of scope / superseded (do NOT re-implement)
- SVG flow-diagram node work (items #1–#3, and all of `BUILD_TASK_BASIC_MODE_V3*` about the
  SVG diagram): superseded by Raphael's static architecture images.
- Advanced mode: unchanged.

---

## Addendum — composite metric info panels + staged-number disclosure

**Requested by Roshan:** the metric info panels were too reductive (Accuracy described as only
Contextual Grounding, Security as only Guardrails). In reality each dial is a composite of
multiple controls.

**Implemented:**
- `InfoItem` (`src/data/infoContent.ts`) gained an optional `contributors?: string[]`.
- `InfoPanel` renders a "What feeds this" bulleted section when `contributors` is present.
- `METRIC_INFO` (`BasicModeView.tsx`) rewritten so each metric lists its real contributing controls:
  - **Accuracy** ← Contextual Grounding + LLM-as-Judge + deterministic Lambda validators
  - **Security** ← Guardrails (in/out) + Verified Permissions (Cedar) authorization + session isolation
  - **Compliance** ← 19 Cedar policies across the Org/App/Request cascade (most-restrictive-wins)
  - **Product Risk** ← agent risk synthesis + deterministic recompute + sanctions/PEP/adverse-media
  - **Legal** ← Cedar coverage + evidence-pack completeness + immutable audit trail

**Data provenance (honesty note):** the Basic-mode dial *numbers* are **staged** — hardcoded
per step in `basicModeContent.ts` (`riskUpdatesApprove` / `riskUpdatesBlock`). There is no live
API feeding them; the only real network call in Basic mode is the HITL escalate/decision POST in
the block path. The live-metrics plumbing (`metrics-proxy`, `useMetrics`) exists in the app but is
NOT wired to these dials. A `// staged/illustrative` comment now documents this in `METRIC_INFO`.

**Potential follow-up (not done):** wire the dials to real signals per the original
`BUILD_TASK_BASIC_MODE_V3.md` (grounding_score, Cedar decision, Guardrail status, token usage)
with an offline badge when APIs are unavailable — deferred pending decision.
