# Autonomy Ladder Reconciliation — Design Spec

**Status:** COMPLETE (2026-06-30). Buckets A, B, C implemented, §5 graduation
enhancement shipped, and every consumer routed through autonomyLadder.ts. Verified
in a headless browser against the built bundle (Playbook tree colors; AgentROI
threshold-grid sub-lines; EarnedAutonomy oversight-shift panel).
**Date:** 2026-06-30
**Scope:** Govern module only (`src/components/govern/**`).
**Decision captured:** Keep current canonical names (do NOT rename to AWS's exact
"… Agency" casing). `AGENT_SCOPE_META` stays the single source of truth.

## Confirmed level mappings (Bucket A)
- AgentRiskProfile: supervised→L2 · semi-autonomous→L3 · autonomous→L3 (2nd L3 sub-band) · fully-autonomous→L4. All four riskMultipliers (1.0/1.5/2.0/3.0) preserved.
- AgentROI: supervised→L2 · co-pilot→L2 · human-in-loop→L3 · autonomous→L4. Error thresholds preserved.
- Playbook: level 1-4 already 1:1; only colors re-derived from canonical (L2 amber→blue, L3 purple→amber).
- All folded surfaces show an "L{n} · {canonical name}" sub-line so band labels (e.g. an L2 "Supervised") never collide textually with canonical L3 "Supervised".

---

## 1. Why

Six distinct autonomy/agency ladders plus one risk-scoring dimension exist in the
module. They disagree on level names, ordering, colors, and meaning. The worst
collision: **"Supervised"** is L3 / amber / "autonomous within guardrails" in the
canonical ladder, but L1 / **emerald** / "human approves *every* action" in
`AgentRiskProfile` and `AgentROI` — same word, opposite meaning, opposite color.
This directly undercuts the Earned-Autonomy graduation story (graduation moves an
agent *up a ladder* — it must be unambiguous which ladder, and what each rung means).

## 2. Authoritative grounding

Canonical spine = **AWS Agentic AI Security Scoping Matrix** (Nov 2025), reinforced by
the AWS Public-Sector governance framework blog (May 2026). Both define the same
four-level agency model; the Matrix is the authoritative naming source.

| Scope | AWS official name | Defining gate | Oversight mode |
|------|-------------------|---------------|----------------|
| 1 | No agency | Read-only / advisory; no state change | Human does everything |
| 2 | Prescribed agency | HITL approval per consequential action | Human-in-the-loop, ex-ante |
| 3 | Supervised agency | Autonomous within bounds after human initiation | Human-on-the-loop + stop button |
| 4 | Full agency | Self-initiating; strategic oversight only | Out-of-the-loop + audit/exception |

Key principles to preserve in the UI:
- **"Progressive autonomy"** is AWS's own term — start low, advance as confidence/controls
  mature. This *is* our graduation model; keep the framing.
- **Oversight inverts, it doesn't vanish.** Real-time human touch *decreases* L1→L4, but
  governance/audit intensity *increases* (EU AI Act Art. 14(3): measures "commensurate
  with the risks, level of autonomy and context of use"; OSFI E-23 Principle 2.3). L4
  needs the *most* rigorous controls despite the *least* per-action human involvement.
- `AGENT_SCOPE_META` already matches AWS scopes (L2 "Prescribed Agency" fixed 2026-06-30).
  Per decision, we keep current names: L1 "No Agency", L3 "Supervised", L4 "Full Agency".

## 3. Canonical definition (unchanged)

`mockData.ts:4121` — the single source of truth. Type `AgentScopeLevel = 1|2|3|4` (`mockData.ts:3489`).

```
1: No Agency        #10b981 emerald  "Static responses, no tool use"
2: Prescribed Agency #3b82f6 blue     "Limited tools, human approval"
3: Supervised        #f59e0b amber    "Autonomous within guardrails"
4: Full Agency       #ef4444 red      "Fully autonomous, self-directed"
```

## 4. The six ladders, sorted into three buckets

### Bucket A — FOLD to canonical (true duplicates of *deployed-agent autonomy*)

These describe the same concept as `AGENT_SCOPE_META` and must adopt its 4 levels,
names, ordering, and colors. Their **extra per-level data is valuable and is retained**
— only re-keyed to the canonical L1–L4 and recolored to canonical hues.

| Ladder | File | Current levels | Extra data to KEEP | Re-key to canonical |
|--------|------|----------------|--------------------|---------------------|
| Playbook `AUTONOMY_LEVELS` | `AgenticGovernancePlaybook.tsx:81` | Informational / Assisted / Supervised / Autonomous | `controls[]`, `hitlRequirement`, `examples[]`, `icon` | L1→No Agency, L2→Prescribed Agency, L3→Supervised, L4→Full Agency; recolor L3 amber (was purple #8B5CF6) |
| AgentRiskProfile `AUTONOMY_LEVELS` | `risk/AgentRiskProfile.tsx:59` | supervised / semi-auto / autonomous / fully-autonomous | `riskMultiplier` 1.0–3.0 | map supervised→L2, semi→L3, autonomous→L3/L4, fully→L4; recolor "supervised" to L2 blue (was emerald — this is the collision) |
| AgentROI `AUTONOMY_LABELS` + `AUTONOMY_ERROR_THRESHOLDS` | `finops/AgentROI.tsx:58` | supervised / human-in-loop / co-pilot / autonomous | per-level error thresholds | map to canonical L1–L4; recolor "supervised" off emerald |

**Implementation approach for Bucket A:** introduce a small shared module
`autonomyLadder.ts` (in `govern/`) that re-exports `AGENT_SCOPE_META` plus typed
"overlay" maps keyed by `AgentScopeLevel` — e.g. `SCOPE_RISK_MULTIPLIER`,
`SCOPE_ERROR_THRESHOLDS`, `SCOPE_CONTROLS`. Each consumer reads names+colors from
`AGENT_SCOPE_META` and its specialized data from the matching overlay. No consumer
defines its own names/colors anymore.

**Mapping note — string-keyed → numeric levels.** AgentRiskProfile/AgentROI/Playbook
data records currently key off strings ("supervised", "co-pilot", …). The fold adds a
`scopeLevel: AgentScopeLevel` to each record (or a string→level lookup) so the data
binds to canonical metadata. The exact per-record mapping must be reviewed case by case
(e.g. AgentROI "co-pilot" ≈ L2/Prescribed; "human-in-loop" ≈ L2; "autonomous" ≈ L4) —
flagged as the one judgment-heavy step, NOT mechanical.

### Bucket B — KEEP DISTINCT, document the mapping (different axes, not duplicates)

These are *not* deployed-agent autonomy ladders. They stay as-is but get a header
comment documenting that they are deliberately separate and how they relate to canonical.

| Ladder | File | What it actually measures | Why it stays separate |
|--------|------|---------------------------|------------------------|
| riskScoring autonomy **dimension** (5 levels) | `riskScoring.ts:173` | A 0–25 point input to the 0–100 *inherent risk score* | It's a scoring dimension, not a governance dispatch level. 5 granular bands feed a number; collapsing to 4 would change risk math. |
| TaskAssessment `DEPLOYMENT_APPROACHES` | `finops/TaskAssessment.tsx:68` | Recommended approach for a *workload/use-case* (by risk range) | Scores tasks, not live agents. Its "human-led" top rung has no agent equivalent. |

**Action:** add a comment block to each pointing to `AGENT_SCOPE_META` as the canonical
*agent* ladder and explaining the different axis. No behavioral change.

### Bucket C — DE-DUPLICATE (local copies of canonical)

| Location | Issue | Fix |
|----------|-------|-----|
| `FleetRiskPosture.tsx:32` local `SCOPE_NAMES` / `SCOPE_COLORS` | Hand-copied mirror of `AGENT_SCOPE_META` — drifts silently | Delete locals; import `AGENT_SCOPE_META` from `mockData.ts` |

## 5. Graduation alignment (EarnedAutonomyView / graduationData)

Already correctly built on `AGENT_SCOPE_META` (`graduationData.ts:15`, L1→L2→L3→L4
path). One enhancement to add during the refactor (consistent with the "oversight
inverts" principle): when the UI shows an agent graduating to a higher level, it should
surface that **audit/monitoring intensity increases** even as per-action approval drops
— not imply oversight simply goes away. Copy-only change in `EarnedAutonomyView.tsx`.

## 6. Files touched (full reconciliation, when approved)

1. `autonomyLadder.ts` (NEW) — canonical re-export + typed overlays
2. `AgenticGovernancePlaybook.tsx` — fold to canonical names/colors, keep controls/HITL/examples
3. `risk/AgentRiskProfile.tsx` — fold; keep riskMultiplier; **fixes the Supervised collision**
4. `finops/AgentROI.tsx` — fold; keep error thresholds
5. `FleetRiskPosture.tsx` — delete local SCOPE_NAMES/COLORS, import canonical
6. `riskScoring.ts` — doc comment only (Bucket B)
7. `finops/TaskAssessment.tsx` — doc comment only (Bucket B)
8. `EarnedAutonomyView.tsx` — copy enhancement re: oversight intensity

All inside the Govern module. User-visible changes: L3 "Supervised" rendered amber
everywhere (no longer emerald/purple in places); AgentRiskProfile/AgentROI level chips
recolored to canonical hues. Level *labels* unchanged where they already match; the
"supervised" string in AgentRiskProfile/AgentROI is the one that changes meaning/color.

## 7. Risks / review gates

- **The string→level mapping (§4 Bucket A note) is the only non-mechanical step** — needs
  a human pass to confirm e.g. AgentROI "co-pilot" → which canonical level.
- Recoloring "supervised" will change screenshots/snapshots if any exist.
- Verify rendered composition (parent + child) after the fold, per prior review lesson —
  not just isolated files.

## 8. §5 graduation enhancement — SHIPPED

`graduationData.ts` now exports `OVERSIGHT_SHIFT` (keyed by target `AgentScopeLevel`):
each level documents what oversight `relaxes` (per-action human involvement removed)
and what `intensifies` (monitoring/audit/control added), grounded in the AWS Agentic
Scoping Matrix per-scope controls + EU AI Act Art. 14(3). `EarnedAutonomyView` renders
this as a two-panel block (blue "relaxes" / amber "intensifies") in the agent detail,
and the intro copy now states oversight steps from per-action approval → monitoring +
audit rather than disappearing. The graduation UX no longer implies oversight vanishes.

## 9. Single import path — DONE

All consumers import `AGENT_SCOPE_META` / `AgentScopeLevel` from `autonomyLadder.ts`
(which re-exports the physical definitions that still live in `mockData.ts` — no risky
data move). Routed: AgentDrawer, AgentRegistry, FleetScaleView, fleetScaleData,
graduationData, EarnedAutonomyView, AgentRiskProfile, AgentROI, AgenticGovernancePlaybook,
FleetRiskPosture.

## 10. Open follow-ups (tracked separately — NOT part of this reconciliation)

- AWS AgentCore runtime ARN `runtime/` vs `agent/` — held, low confidence.
- Eval-score compression (97.5–99.6) making the deployment gate inert + the three-source
  fleet-quality ordering disagreement — separate dive.
