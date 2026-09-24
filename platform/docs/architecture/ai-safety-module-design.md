# AI Safety Module — Design

> **Status:** BUILT. This is the design record for the **AI Safety** capability inside
> the AVA Govern module, kept because it carries the rationale the code cannot: why
> capability safety is a module rather than scattered features, which external framework
> each surface is grounded in, and where the honest limits of the approach are. The
> module ships at `frontend/src/components/govern/safety/` and is routed under
> `/govern/safety`. Scope stays entirely within Govern; nothing here edits Plan or other
> modules.

**Surface-to-route map (all mounted in `App.tsx`):**

| Surface | Route | Implementation |
|---|---|---|
| RAI Coverage Rubric (module hub) | `/govern/safety` | `safety/AISafety.tsx` |
| Threat Modeling (MAESTRO) | `/govern/safety/threat-modeling` | `ThreatModeling.tsx` + `threatModelData.ts` |
| Frontier Capability Thresholds | `/govern/safety/capabilities` | `safety/FrontierThresholds.tsx` |
| Safety Cases | `/govern/safety/safety-cases` | `safety/SafetyCases.tsx` |
| Red-Team & Safety Evals | `/govern/safety/evals` | `safety/SafetyEvals.tsx`, `safety/LiveBedrockEvals.tsx` |
| Red-Team Test Pipeline | `/govern/safety/redteam-pipeline` | `safety/RedTeamTestPipeline.tsx` |
| Incident Management | `/govern/safety/incidents` | `safety/IncidentManagement.tsx` |
| Incident Playbooks | `/govern/safety/playbooks` | `safety/IncidentPlaybooks.tsx` |
| Runtime Safety Controls | `/govern/safety/runtime` | `safety/RuntimeSafetyControls.tsx`, `safety/LiveRuntimeSafety.tsx` |

Two surfaces arrived after this design and are not described below: **Incident Playbooks**
(remediation playbooks paired with Incident Management) and **Runtime Safety Controls**.
The module's two genuinely live components are `LiveRuntimeSafety` (guardrail telemetry,
rendered by Runtime Safety Controls and Red-Team & Safety Evals) and `LiveBedrockEvals`
(Bedrock evaluation jobs, rendered by Red-Team & Safety Evals and, outside this module, by
`ModelEvaluations.tsx`). The other surfaces are fixture-backed and badged as such; the RAI
rubric is the mixed case — it grades several dimensions from real agent-registry signals
(guardrail attachment, open incidents) but still carries a Mock badge because the remaining
dimensions are a documented baseline. §6 explains why illustrative depth is the intended
posture here rather than a gap. One design decision only half held:
`ThreatModeling.tsx` is routed under `/govern/safety/` but the file still sits at
`components/govern/` rather than in the `safety/` subfolder. `App.tsx` is its only
importer, so moving it is a low-risk cleanup that was simply never done.

---

## 1. Why a module (not scattered features)

The Govern module answers several distinct governance questions well already:

| Existing surface | Question it answers |
|---|---|
| Risk Management | *What could go wrong?* (register, heatmap) |
| Compliance Center | *Are we meeting regulations?* (framework mapping) |
| Human Oversight | *Who approves actions at runtime?* (HITL, enforcement) |
| Earned Autonomy | *How much autonomy has this agent earned?* (ladder) |

**One question has no coherent home today: _is the model/agent's capability within safe bounds — and can we prove it?_** The frontier-safety field (Amazon FMSF, Anthropic RSP, OpenAI Preparedness, DeepMind FSF) has standardized on exactly this: *critical-capability threshold → dangerous-capability eval → deploy/no-deploy gate → safety case*. AVA's deployment gate only checks responsible-AI eval quality, not capability gating, and there is no safety-case artifact, no dangerous-capability register, no red-team/incident lifecycle.

These whitespace items share one spine (capability safety + evidence), so they cohere into a module rather than fragmenting across existing tabs.

## 2. Organizing rubric — AWS 8 Responsible-AI dimensions

The module is organized on **AWS's 8 Responsible-AI dimensions** (Fairness, Explainability, Privacy & Security, Safety, Controllability, Veracity & Robustness, Governance, Transparency), crosswalked to **NIST AI RMF** (Govern/Map/Measure/Manage + trustworthiness characteristics). This gives an executive "coverage across all 8" view and a clean home for each surface.

## 3. Grounding sources (all verified)

| Source | Used for |
|---|---|
| **Amazon Frontier Model Safety Framework** (Critical Capability Thresholds: CBRN, offensive cyber, automated AI R&D; deploy gate) | Frontier capability thresholds surface |
| **Anthropic RSP / ASL**, **OpenAI Preparedness v2** (High/Critical gates), **DeepMind FSF** (CCLs + RAND SL1-5), **Seoul/Korea Frontier AI Safety Commitments** | Capability-threshold register (per-model framework/level attestation) |
| **METR** — Inspect eval framework, RE-Bench, HCAST task suites, autonomy/ARA (RepliBench) | Dangerous-capability eval register (the concrete eval artifacts referenced) |
| **CoSAI (OASIS)** — WS1 supply chain, WS2 AI Incident Response Framework, WS3 risk governance scorecard, WS4 secure agentic design + MCP security; CoSAI Risk Map (Apache-2.0) | Authoritative backbone woven through: supply chain (OWASP T17), incident mgmt, agentic secure design |
| **MAESTRO** (CSA, Ken Huang) — 7-layer reference architecture + cross-layer threats + agentic architecture patterns | Threat Modeling restructure |
| **OWASP Agentic AI Threats v1.1** (T1–T17) | Threat vocabulary (kept, nested within MAESTRO layers) |
| **NIST AI RMF + GenAI Profile (600-1)**, **ISO/IEC 42001/23894**, **EU AI Act** (Art. 14 oversight, Art. 73 incident clocks) | Compliance crosswalk + incident reporting deadlines |

## 4. Module structure — six surfaces

### 4.1 Frontier Capability Thresholds  *(NEW — differentiated)*
Per-model register: which framework/level covers a model (FMSF / ASL-N / Preparedness tier / CCL), dangerous-capability eval results (CBRN, offensive cyber, autonomy-ARA), and Seoul-commitment attestation. Feeds the existing **Deployment Gate** as a capability-gating input (not just RAI eval quality).
*Live-vs-illustrative:* illustrative register + attestation fields; the capability verdict is expert judgment from the lab's own evals (we surface the attestation, never auto-judge dangerous capability). RAI dimension: **Safety, Governance**.

### 4.2 Threat Modeling — MAESTRO-aligned  *(MOVE + UPGRADE)*
Route the existing `ThreatModeling.tsx` under Safety and restructure it around MAESTRO's **7 layers** (Foundation Models · Data Ops · Agent Frameworks · Deployment/Infra · Eval/Observability · Security/Compliance vertical · Agent Ecosystem), with **cross-layer threats** (lateral movement, privilege escalation, goal-misalignment cascades) and **agentic architecture patterns** (single/multi/hierarchical/distributed → named threat). Keep OWASP T1–T17 as the threat vocabulary *within* layers, and keep the existing capability→control→residual mapping.
*Live-vs-illustrative:* model logic is real (already built); data illustrative. RAI dimension: **Safety, Controllability**.

### 4.3 Safety Cases  *(NEW — differentiated)*
Structured claims–arguments–evidence artifact (GSN / CAE style; Clymer taxonomy: Inability / Control / Trustworthiness / Deference) that assembles the deploy decision's rationale, with coverage indicators. Maps onto the existing Deployment Gate — the gate gives the verdict, the safety case gives the *argument*.
*Live-vs-illustrative:* structure is real; verdict soundness stays expert/qualitative (build the tree, not an auto-judge). RAI dimension: **Governance, Transparency**.

### 4.4 Red-Team & Safety Evals  *(NEW — table-stakes+)*
Track red-team coverage, findings, severities, remediation; surface safety-benchmark scores (HarmBench ASR, WMDP *[inverted — lower is safer]*, AILuminate grade, TruthfulQA, Cybench). Integrates the METR/Inspect eval framing.
*Live-vs-illustrative:* illustrative scores + a live path noted (Bedrock evals / Inspect). RAI dimension: **Veracity & Robustness, Safety**.

### 4.5 Incident Management  *(NEW — table-stakes, time-sensitive)*
Incident lifecycle (detect → triage → remediate → report → learn), near-miss capture, and **EU AI Act Article 73 reporting clocks** (2/10/15-day statutory deadlines, in force 2026-08-02), grounded in the **CoSAI AI Incident Response Framework** + AIID/OECD taxonomy. Distinct from today's append-only audit log (which is evidence, not lifecycle).
*Live-vs-illustrative:* illustrative incidents; the audit log it reads from is real. RAI dimension: **Governance, Controllability**.

### 4.6 Responsible-AI Coverage Rubric  *(NEW — executive surface)*
A single per-agent scorecard across the 8 AWS dimensions with the NIST-7 crosswalk, aggregating signals the platform already computes (fairness from Explainability, guardrail posture, autonomy level, audit completeness, etc.). The module's landing/summary view.
*Live-vs-illustrative:* aggregates existing signals (some live, some mock). RAI dimension: **all 8 (this is the rubric)**.

## 5. What moves vs. what's new (overlap discipline)

To avoid recreating fragmentation:
- **MOVES into Safety:** Threat Modeling (from top-level Govern) — and it gets the MAESTRO upgrade. In
  practice only the route moved; see the note under Status.
- **STAYS where it is, cross-linked (not duplicated):**
  - Guardrails / content safety → **Secure module** (Safety links to it, doesn't reimplement).
  - Bias/fairness metrics + SHAP/LIME → **Model Explainability** (the RAI rubric *reads* these).
  - Deployment Gate → **Model Management** (Frontier Thresholds + Safety Cases *feed* it).
  - Compliance framework mapping → **Compliance Center** (Safety references the crosswalk).
  - Kill switches → **Fleet** (Incident Mgmt *triggers* them).
- **NEW surfaces:** Frontier Capability Thresholds, Safety Cases, Red-Team & Evals, Incident Management, RAI Coverage Rubric.

Rule: the Safety module is the *consolidation and evidence layer* for capability safety — it **references** operational controls that live in their owning surfaces, never re-implements them.

## 6. Boundaries & honesty

- **Module scope:** everything under `components/govern/` (a `safety/` subfolder). No Plan/Secure/Model-Mgmt edits — only cross-links out.
- **Editions:** most surfaces are illustrative-prototype depth — correct for the OSS "art of the possible" story. Every surface carries an honest live-vs-mock badge; the honest seams (attestation not auto-judgment, illustrative evals) are labelled, never faked.
- **Explicitly OUT of scope (documented, not built):** running dangerous-capability evals ourselves; detecting deceptive alignment / sandbagging (needs white-box access AVA lacks); interpretability internals. Defensible posture = track vendor attestations + watch behavioral symptoms, not claim upstream research capabilities.

## 7. Known limitation — three risk taxonomies coexist

Govern carries three different enumerations of "agentic AI risk", and they are **not**
mappings of one another. They have not been reconciled, so anyone comparing counts across
surfaces needs to know which set they are looking at:

| Taxonomy | Where | What it is for |
|---|---|---|
| OWASP Agentic AI Threats **T1–T17** | `threatModelData.ts`, placed on MAESTRO layers | The threat vocabulary for threat modeling and control mapping |
| The enterprise-metrics **12 categories** | `metrics/agenticRiskCatalog.ts` | Scored Likelihood × Impact with thresholds and control effectiveness; the board-tier Aggregate Risk Score and its Go/No-Go gate are defined against *this* set only |
| The operational risk register | `risk/riskData.ts` | The register the Risk Management tabs read and edit |

The split between the second and third is intentional and documented in
`agenticRiskCatalog.ts`'s own header: the metrics feed needs a spec-faithful, fixed set so
the aggregate score stays comparable, which editing the operational register would break.
The consequence is that "how many risks do we have" has three defensible answers, so a
surface must name its taxonomy rather than print a bare count. If the taxonomies are ever
unified, OWASP/MAESTRO is the intended canonical vocabulary.
