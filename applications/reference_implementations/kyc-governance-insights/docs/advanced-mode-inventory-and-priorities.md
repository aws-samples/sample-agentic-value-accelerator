# Advanced Mode — Feature Inventory & Demo Priorities

Planning doc for refining the KYC Controlled Quality Output **Advanced mode**. Every feature
below is pinpointed to its exact location in the UI: **Advanced toggle → Persona → Tab
(label) → section**.

## The two customer questions this demo answers

1. **How do we keep AI accurate and secure — at scale?**
2. **How do we measure and monitor agents across the business?**

**Basic mode** already answers Q1 for a *single* decision. **Advanced mode** must carry
Q1 *at scale*, all of Q2, and the ROI lever: **earned autonomy** — an agent earns the
right to act more autonomously by proving itself over time, and loses it automatically
when it doesn't. Earned autonomy is the connective tissue: you can only safely increase
autonomy (the ROI) if you can continuously measure accuracy/security and enforce it
across the fleet.

## How to navigate Advanced mode

- Top-right toggle: **Basic / Advanced**. Advanced reveals the **Persona selector**
  (top-right, next to the toggle).
- Four personas (each is a different lens on the *same* underlying use case):

| Persona (selector label) | What it is | Layout |
|---|---|---|
| 📊 **CRO Fleet** | Board-level risk oversight across all AI systems | **Single-page dashboard** (no tabs) = `FleetDashboard` |
| 📈 **Business Ops** | Operational throughput, SLAs, case management | 8 tabs |
| ✓ **Compliance** | Regulatory evidence, controls, audit readiness | 5 tabs (default persona on first load) |
| ⚙️ **Engineering** | Architecture, traces, policy implementation | 6 tabs |

> Same tab component, different label per persona. Example: `OverviewTab` is labeled
> **"Agent Fleet"** under Business Ops and **"Agent Registry"** under Engineering — it is
> the same screen. `SimulationTab` shows as **"Live Decision" / "Decision Log" /
> "Observability"** across personas.

## Where every feature lives (authoritative map)

### 📊 CRO Fleet (single page — `FleetDashboard`)
Top → bottom on the one page:
- **Hero "See the Agent in Action"** → opens the decision simulation modal (`SimulationModal`)
- **Aggregate Health ring** + **Use-case constellation** (2×2 cards of multiple use cases)
- **Key Risk Indicators (KRIs)**
- **CRO Architecture** diagram (`CROArchitectureSimple`)
- **Operational Performance** — STP / auto-processed %, false-positive rate, cost/decision
- **Recent Alerts**
- **Compliance Operations** summary — AI Model Inventory, Control Testing, Open Findings
- **Risk Appetite vs Actual** gauge (`RiskAppetiteGauge`)
- **KRI Trends** 30/60/90d (`KRITrends`)
- **Incidents & Near-Misses** timeline (`IncidentTimeline`)
- **SM&CR Board Accountability Summary** (`BoardAccountabilitySummary`)
- **Board Pack Generator** (header button)

### 📈 Business Ops (tabs)
- **Operations** (`OperationsTab`) → Operational KPIs, SLA Monitor, Capacity Planning, Cost Breakdown
- **Live Decision** (`SimulationTab`) → step timeline, Governance Grid, Blast-Radius Meter, Decision Attribution, Decision Waterfall
- **Review Queue** (`ReviewQueueTab`) → HITL pending decisions (live `/api/v1/hitl/pending`)
- **Decision Rules** (`GovernanceTab`) → **★ earned-autonomy hub** (see below)
- **ROI Projection** (`ROIProjectionTab`)
- **Control Framework** (`RiskRegisterTab`)
- **Reports** (`KYCReportTab`)
- **Agent Fleet** (`OverviewTab`) → **Agent Constellation** + **Tokenomy & Cost Governance**

### ✓ Compliance (tabs)
- **Audit Dashboard** (`ComplianceAuditTab`) → Model Inventory, Control Testing Overlay, Issues Tracker, Risk Assessment Report
- **Decision Log** (`SimulationTab`)
- **Evidence Packs** (`EvidenceTrailTab`) → Accountability Chain, Attestation Tracker, Decision Attribution, Evidence Pack Viewer
- **Policy Enforcement** (`GovernanceTab`) → **★ earned-autonomy hub** (same as "Decision Rules")
- **Findings & Remediation** (`RiskRegisterTab`)

### ⚙️ Engineering (tabs)
- **Architecture** (`ArchitectureTab`) → Model Inventory, Attack Surface, Data Flow Map, Defence-in-Depth Layers, Intervention Status, Request Flow Diagram, Resilience/Compliance
- **Observability** (`SimulationTab`)
- **Policy Engine** (`CedarPolicyTab`) → the 19 Cedar policies (currently static data — see note)
- **Agent Registry** (`OverviewTab`) → Agent Constellation + Tokenomy
- **Controls Matrix** (`ComplianceAuditTab`)
- **Guardrails** (`MoreInfoTab`)

### ★ The earned-autonomy hub — `GovernanceTab`
Reached via **Business Ops → "Decision Rules"** or **Compliance → "Policy Enforcement"**
(not present in CRO Fleet or Engineering). Contains, in order:
- **Autonomy Configuration** (`AutonomyConfigSection`) — L0–L4 levels, current-level card,
  **promotion progress** (criteria met vs required, e.g. clean-decision count), business-
  configurable parameter envelopes (approval-required flags, owner, last-changed),
  alarms + rate throttle, **auto-tighten event log** (autonomy auto-reduced after
  incidents), configuration audit trail (who/what/approved-by)
- **Intervention Ladder** (`InterventionLadder`) — KILL SWITCH → Restricted → Supervised →
  Autonomous → Full Agency, with earned-autonomy progress + live kill-switch
- **Policy Sliders** (`PolicySliders`), **Profile Selector** (`ProfileSelector`) — adjustable risk posture
- **Evaluations** (`EvaluationsSection`) + **Eval Summary** (`EvalSummaryCard`)
- **QA Panel** (`QAPanel`)

## Priority ranking (for refinement)

Ranked by how directly each element demonstrates **scaling accuracy/security → earned
autonomy (ROI)** and **measuring/monitoring across the business**. Basic mode already
covers single-decision accuracy/security, so per-decision depth ranks lower here.

### Tier 1 — the earned-autonomy + fleet story (refine first)
1. **Autonomy Configuration + Intervention Ladder**
   — *Business Ops → "Decision Rules"* (or *Compliance → "Policy Enforcement"*).
   The centerpiece for the ROI/autonomy question: autonomy is *earned* (promotion
   criteria), *bounded* (approval-gated envelopes), and *revocable* (auto-tighten + kill
   switch). This is the single most important screen for "let agents run autonomously —
   but the right must be earned."
2. **CRO Fleet dashboard** — *CRO Fleet persona* (whole page).
   The direct answer to Q2 and the visual of "at scale": portfolio health, multi-use-case
   constellation, KRIs, operational KPIs, alerts.
3. **Evaluations / continuous measurement** — today only the **Evaluations section inside
   "Decision Rules"/"Policy Enforcement"** (`EvaluationsSection`) is reachable. The richer
   `EvaluationsDashboard` and **`PipelineGate`** (gate promotion on eval results) are
   **built but not wired into any view** (see Unrouted below). This is the *evidence* that
   should justify autonomy promotion — high value to surface and connect to Tier 1 #1.

### Tier 2 — makes autonomy defensible + quantifies the payoff
4. **Accountability (SM&CR)** — *CRO Fleet* (Board Accountability Summary) + *Compliance →
   "Evidence Packs"* (Accountability Chain, Attestation Tracker, Decision Attribution).
   A named human must own outcomes as autonomy rises — the sign-off enabler for FSI.
5. **Model governance at fleet scale** — *Compliance → "Audit Dashboard"* (Model Inventory,
   Control Testing, Issues Tracker) [also *Engineering → "Controls Matrix"*].
6. **ROI & cost** — *Business Ops → "ROI Projection"* + *Business Ops → "Operations"*
   (Operational KPIs / cost/decision) + *Business Ops → "Agent Fleet"* → Tokenomy.
   Quantifies the payoff of higher autonomy (STP rate, cost/decision, projected savings).
7. **Monitoring texture** — *CRO Fleet* (Risk Appetite gauge, KRI Trends, Incident
   Timeline) + *Business Ops "Agent Fleet" / Engineering "Agent Registry"* → Agent
   Constellation (per-agent health / decisions / autonomy level).

### Tier 3 — accuracy/security depth (reinforces Basic; per-decision)
8. **Cedar Policies** — *Engineering → "Policy Engine"* (make rule eval live — currently static).
9. **Security architecture** — *Engineering → "Architecture"* (Attack Surface, Defence-in-Depth, Resilience, Data Flow, Request Flow).
10. **Guardrails** — *Engineering → "Guardrails"*.
11. **Agent Execution depth** — any persona's *Live Decision / Decision Log / Observability* (Governance Grid, Blast-Radius Meter, Decision Waterfall).
12. **Evidence & HITL** — *Compliance → "Evidence Packs"* + *Business Ops → "Review Queue"*.

### Tier 4 — supporting / presentation
13. Reports (*Business Ops → "Reports"* = KYC Report), Risk Register (*Control Framework* / *Findings & Remediation*), More Info, Talking Points (presenter-only tab), Presentation Mode, Guided Tour.

## Built but NOT reachable in the UI (no importer found)
Relevant because some are exactly the Tier-1 concept and would need routing:
- **`LifecycleTab`** — agent SDLC lifecycle (risks/controls/HITL per stage) — not wired to any tab.
- **`EvaluationsDashboard`** — full evaluations dashboard — not wired (only the smaller `EvaluationsSection` is).
- **`PipelineGate`** — eval-gated promotion — not wired.
- A couple of simulation sub-panels (`LiveActivityFeed`, `RiskControlsPanel`) also appear unwired.

## Current data state (important for "refine")
Most Advanced-mode surfaces render **hardcoded/mock data**, including the Tier-1 targets:
`autonomyConfigData`, `earnedAutonomyData`, `fleetData`, `agentConstellationData`,
model/control/issues/KPI datasets are all static. What is genuinely live today (via the
console-services) is confined to the Basic-mode badges + a few Advanced surfaces
(Review Queue → live HITL; Evaluations section → live records; Cedar decision).
So "refining Tier 1" largely means deciding **which mock surfaces to wire to real
signals** — e.g. feed **promotion criteria** from the live evaluation store + registry
tier, feed the **fleet KRIs** from real metrics — versus keep as curated demo data.

## Recommended demo spine (four screens, one story)
1. **Business Ops → "Decision Rules" → Autonomy Configuration + Intervention Ladder** —
   how one agent earns (and can lose) autonomy.
2. **CRO Fleet** — how the whole fleet is watched doing it, at scale.
3. **"Decision Rules" → Evaluations** (+ surfaced `EvaluationsDashboard`/`PipelineGate`) —
   the evidence that gates promotion.
4. **Compliance → "Evidence Packs" → Accountability** (+ CRO Fleet board summary) —
   who stays accountable as autonomy scales.

That sequence = Q1-at-scale + Q2 + the earned-autonomy ROI in four clicks.
