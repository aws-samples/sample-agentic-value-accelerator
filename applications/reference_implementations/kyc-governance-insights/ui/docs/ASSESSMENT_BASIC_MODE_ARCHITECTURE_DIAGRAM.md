# Assessment — Basic Mode "Governance Architecture" diagram

**Scope:** analysis only. **Constraint (Roshan): do NOT touch Raphael's governance architecture
diagram** — neither the `base/1/2.png` images nor how they render. This doc changes nothing; it only
records findings. Sources reviewed: `src/components/BasicMode/BasicModeView.tsx`,
`src/data/basicModeContent.ts`, and the live TEST URL.

## Headline finding — the spec's premise doesn't match the implementation

The build task assumes an **SVG diagram that lights up governance nodes per step**. That is not what
Basic Mode renders. In `BasicModeView.tsx` the "Governance Architecture" panel is a **single static
`<img>`** whose source swaps by stage:

```
architectureImage(currentStep): base.png (intro) → 1.png (steps 1–5, index < 5) → 2.png (step 6+, index ≥ 5)
```

These are **Raphael's slide images** (added recently, ~5–6 stage images describing the architecture).
There are **no interactive nodes, no per-control illumination, no click behaviour, no arrows driven by
code.** Whatever "lights up" is painted into Raphael's PNGs.

### Consequence: `activeControls` is dead data
Every step in `basicModeContent.ts` has an `activeControls: string[]` (e.g. Step 5 =
`['policy-engine','deterministic','llm-judge','guardrails-out','grounding','automated-reasoning']`),
and there's a full `CONTROLS[]` catalog with plain-English labels + AWS service names. **Neither is
rendered in Basic Mode** — `activeControls` is referenced nowhere in `src` outside its own type
definition. So the data needed to drive a light-up diagram already exists, but nothing consumes it.

Because the six "gaps" in the spec all assume toggleable nodes, most are **moot against the current
build**: there are no nodes to add an Observation/Arbiter node *to*, and no `activeControls` wiring to
correct — the visual is a flat image owned by Raphael.

## Node inventory (as requested)

There is **no code-driven node set**. The *intended* control inventory (from `CONTROLS[]`, which would
be the node list if the diagram were interactive) is:

| id | label (plain English ✓ Rule 10) | AWS service | Steps it's flagged active (`activeControls`) |
|----|-------------------------------|-------------|-----------------------------------------------|
| guardrails-in | Guardrails (Input) | Bedrock Guardrails | 1, 2 |
| guardrails-out | Guardrails (Output) | Bedrock Guardrails | 3, 4, 5, 6, 7 |
| deterministic | Deterministic Checks | Lambda (AgentCore) | 2, 3, 5, 7 |
| llm-judge | LLM-as-Judge | Bedrock (Claude) | 4, 5 |
| policy-engine | Policy Engine | Verified Permissions (Cedar) | 1, 5, 7 |
| automated-reasoning | Automated Reasoning | Bedrock Automated Reasoning | 5 |
| grounding | Contextual Grounding | Bedrock Grounding Check | 3, 4, 5 |
| registry | Agent Registry | Bedrock AgentCore | 7 |
| hitl | Human-in-the-Loop | Step Functions | 6 |

The labels are already plain-English and business-first — good per Rule 10 — but they live only in
data, not on the rendered image.

## Gap-by-gap verdict (against reality + the no-touch constraint)

| # | Reported gap | Verdict | Notes / recommendation |
|---|--------------|---------|------------------------|
| 1 | No Observation node (CloudWatch/Evals "always on") | **Can't fix in the diagram** (it's Raphael's image). Partially addressed elsewhere. | The "traceable/replayable" claim is now evidenced by the **live badges** added to the Operational Dashboard (Cedar/Grounding/AR/HITL/Registry verified live) + the Advanced-mode Evaluations/Evidence tabs. Recommend: leave the image; rely on those. |
| 2 | No Arbiter/Supervisor node | **Present in narrative, not as a node.** | The 👑 Supervisor already appears in the agent-conversation panel (`supervisorNote`). The coordination story is told in text, not the image. No diagram change needed. |
| 3 | Step 6 missing `deterministic` | **Real data inconsistency, but cosmetic — not rendered.** | Step 6 `supervisorNote` says deterministic checks re-run, yet `activeControls` = `['hitl','guardrails-out']`. Since `activeControls` isn't rendered, this has **zero visible effect today**. If an interactive diagram is ever built, add `deterministic` to Step 6. Not worth changing now. |
| 4 | Diagram is inventory, not flow | **Confirmed — it's a static image, not a code flow.** | Directional flow (User→Guardrails→Agent→Policy→Decision) is conveyed only insofar as Raphael's PNGs draw it. Out of scope to change. |
| 5 | Missing AgentCore invocation (agent) node | **Same as #1/#4** — image-owned. | The agent reasoning is represented in the Credit Analyst / Compliance Officer conversation cards, not a node. |
| 6 | AR only at Step 5 | **Reasonable as-is.** | AR at the policy gate is defensible (it validates the final synthesised claim). The new live wiring fires AR at Step 5; grounding already covers Steps 3–4. No change recommended. |

## Additional checks

- **Node count:** N/A — one `<img>` per stage (3 images total). No discrete nodes.
- **Node labels:** the code catalog is plain-English; the on-screen labels are baked into Raphael's PNGs (not verifiable/changeable from code, and out of scope).
- **Light/dark mode (Rule 16):** ⚠️ a **PNG does not adapt to theme**. If the images have a light/transparent background they may look off in one theme. This is the one item worth a human eyeball — but the asset is Raphael's, so flag to him rather than change it.
- **Click behaviour:** none — it's a static image (the spec's assumed click-for-info doesn't exist here). The clickable "more info" affordance in Basic Mode is on the **metric dials** (Accuracy/Security/etc.), which open the `InfoPanel` — that works and is plain-English.
- **Visual hierarchy at Step 5:** whether "most controls active here" is visually obvious depends entirely on Raphael's `2.png`. Not code-controllable.

## Recommendation

**Do nothing to the diagram** (per your instruction, and because it's Raphael's asset). The gaps the
spec worries about are largely artifacts of assuming an interactive node diagram that doesn't exist.

Where the underlying *concern* is valid ("prove it's layered, observable, real"), it's **already
addressed without touching the image**:
- The **live-verification badges** (Cedar, Grounding, Automated Reasoning, HITL, Registry) now light up
  per step in the Operational Dashboard — that's the real "controls are active and observable" signal,
  and it's genuinely live.
- The metric **dials + InfoPanel** carry the plain-English "what each control is / why it matters."

**Optional, non-diagram follow-ups (only if you want them, all avoid Raphael's images):**
1. Fix the Step 6 `activeControls` data (`add 'deterministic'`) for correctness — harmless, invisible today.
2. If you ever want the controls to visibly light up, build a **separate, small text "controls active
   this step" chip strip** driven by the existing `activeControls` + `CONTROLS[]` data — rendered
   beside (not over) Raphael's image. This would make `activeControls` live data instead of dead data.

Neither is required for the demo; both are explicitly separate from the architecture image.

## One data-accuracy note (not a diagram change)
`activeControls` for Step 6 omits `deterministic` despite the narrative stating deterministic re-checks
run there. Purely a data/consistency nit; no user-visible impact while `activeControls` is unrendered.
