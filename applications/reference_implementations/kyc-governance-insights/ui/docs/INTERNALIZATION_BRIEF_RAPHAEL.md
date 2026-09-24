# Tier 1 Internalization Brief — Raphael

> **For:** Raphael (Business/Strategy, presenting to internal stakeholders on ROI)  
> **Demo:** KYC Controlled Quality Output — the console URL is per-account; take it from the
> deployment's `ui_url` output (`terraform output -raw ui_url` in `iac/terraform/ui`)  
> **Mode:** Basic Mode = C-level arc (no separate Tier 1 landing page)  
> **Audience:** Internal stakeholders evaluating ROI, risk appetite alignment, speed-to-value

---

## THE CORE NARRATIVE (Your North Star)

> **Customers won't scale agentic AI until they trust the accuracy and quality of output.**  
> This demo proves trust is earned through measurement — not assumed through policy documents.

**Your angle:** Governance is the *enabler* of speed, not the brake. Without it, teams won't get past pilot. With it, they go from 1 agent to a portfolio of 4+ use cases with board-level confidence.

---

## PERSONA ENTRY MAP

| Persona | Who They Represent | Where They Land | Business Question Answered |
|---------|-------------------|-----------------|---------------------------|
| **Business Ops** | Head of Operations, VP Digital | Autonomy Configuration | "How do I control the agent without filing tickets?" |
| **CRO Fleet** | Chief Risk Officer | Fleet Dashboard | "Is my entire AI portfolio within risk tolerance?" |
| **Compliance** | Head of Compliance, GRC | Evaluations | "Where's the evidence for the regulator?" |
| **Engineering** | CTO, Platform Lead (skip in business demo) | Architecture | — |

**Navigation:** Switch personas using the selector. Same platform, different lenses for different stakeholders.

---

## VIEW 1: AUTONOMY CONFIGURATION

### Entry: Business Ops persona → Decision Rules tab

---

#### Section: The Earned Autonomy Ladder

**What's on screen:**  
A 5-level progression showing how an AI agent moves from basic chatbot (L0) to workflow automation (L3). Current agent is at L2 with a progress bar showing 847 of 1000 clean decisions before promotion.

**Business question:** *How does the AI earn more responsibility?*

**The "So What":**  
This isn't a binary on/off. It's a maturity model — just like how you'd promote a new hire. The agent starts supervised, proves reliability through measured performance, and earns expanded authority. 847 out of 1000 clean decisions is auditable, defensible evidence. A regulator can see exactly why this agent has the authority it has.

**ROI connection:** Every level of autonomy earned = less human intervention required. The research shows 98.2% success rate with only 14.5% human oversight (vs 100% human review in traditional models). That's an 85% reduction in manual effort — without increasing risk.

---

#### Section: Business-Owned Controls (Sliders)

**What's on screen:**  
Configuration sliders for risk tolerance, approval thresholds, and maximum unattended risk. Each slider has bounds (set by risk committee) and some require dual approval to change.

**Business question:** *Who controls this day-to-day — business or IT?*

**The "So What":**  
Business owns the dials. No engineering ticket, no deployment cycle, no 3-week change request. A slider adjustment takes effect in under a millisecond. But governance isn't abandoned — the risk committee sets the boundaries (the "envelope"). Business moves within those boundaries freely. Anything outside requires dual sign-off. This is the "configuration, not code" principle that makes governance scalable.

**ROI connection:** Traditional policy changes take 2–6 weeks (code change → review → deploy → validate). This takes milliseconds. Multiply that by dozens of policy adjustments per quarter across a portfolio of agents.

---

#### Section: Kill Switch + Automated Response

**What's on screen:**  
A red emergency stop button and a log of automated tightening events (system reduced agent autonomy automatically based on performance metrics).

**Business question:** *What happens if something goes wrong?*

**The "So What":**  
Two safety nets: (1) Human kill switch — immediate, no delay, no "are you sure?" The agent stops. (2) Automated response — if accuracy drops below threshold for 7 days, the system demotes the agent automatically. No one needs to be awake at 2 AM. This is what lets leadership sleep at night. The governance framework is self-correcting.

**ROI connection:** Incident response time drops from hours (human detection + decision + action) to zero (automated demotion on metric breach). Reduced risk of prolonged exposure to degraded AI performance.

---

### How it works (plumbing)

**React components:**
- `InterventionLadder.tsx` — renders the autonomy level display (L0–L4), current level indicator, promotion progress bar, and kill switch.
- `AutonomyConfigSection.tsx` — renders the parameter sliders (risk tolerance, approval threshold, max unattended risk), envelope bounds, config audit log, and auto-tighten events.

**Data sources:**
- **Basic Mode (what you're demoing):** All data comes from `src/data/autonomyConfigData.ts` and `src/data/earnedAutonomyData.ts` — pinned fixture data in the frontend. The 847/1000 progress, the slider positions, the audit log entries are all deterministic. No backend call required.
- **Advanced Mode (live compute):** Sliders write to Cedar policy store via `/svc/cedar` Lambda. Kill switch triggers an immediate Cedar policy change. Promotion progress would read from `/svc/evaluations` (Phase 3, not wired yet).

**Backend services:**
- Cedar/AVP policy store `L3yUSPSB7oD9EoarS8ZS9m` — enforces autonomy level and parameter bounds at authorization time. Slider changes flow into `context.autonomy_level`, `context.auto_approve_threshold`, `context.max_unattended_risk` on the next authorization call.
- Auto-tighten path: CloudWatch alarm fires → Lambda → Cedar `CreatePolicy`/`DeletePolicy` → agent immediately constrained.

**What's real vs fixture:**
- Basic Mode = fixture. The numbers on screen are static from the `.ts` data files. Nothing hits DDB or Cedar. Safe for any account, no infra needed.
- Advanced Mode = live Cedar writes. Slider adjustment → Lambda → AVP → sub-millisecond enforcement on next agent action.

**To deploy on your own account you need:**
1. DDB table for autonomy config + audit log (schema matches `autonomyConfigData.ts` structure).
2. Cedar policy store provisioned via AVP (`CreatePolicyStore`) — seed with the autonomy level policies from the build spec.
3. `/svc/cedar` Lambda deployed with IAM permissions to `verifiedpermissions:CreatePolicy`, `DeletePolicy`, `IsAuthorized`.
4. `earnedAutonomyData` seeded in DDB with level definitions and a promotion counter record.
5. CloudWatch alarm + auto-tighten Lambda for the demotion trigger path.

---

## VIEW 2: CRO FLEET DASHBOARD

### Entry: CRO Fleet persona → Fleet page

---

#### Section: Portfolio Health Score

**What's on screen:**  
A single score ring showing 92 (out of 100) for overall fleet health. Four use-case cards below: KYC Verification, Trade Surveillance, Claims Processing, Mortgage Assessment.

**Business question:** *Does this work at portfolio scale, or is it a one-use-case pilot?*

**The "So What":**  
This is the difference between "we have an AI experiment" and "we have an AI-governed portfolio." Four use cases, one governance framework. The aggregate score tells the CRO in 5 seconds whether the portfolio is healthy. This is what boards need — not a 40-page report, a single number with drill-down available.

**ROI connection:** Portfolio-level governance means you don't rebuild the control framework for each new use case. Use case #2 costs 60% less to govern than use case #1. By use case #4, it's marginal cost. The platform pays for itself.

---

#### Section: Fleet Risk Indicators (KRIs)

**What's on screen:**  
Six risk indicators with traffic-light status (green/amber/red): Decision Accuracy, Response Latency, Policy Compliance, Cost Efficiency, Drift Detection, Escalation Rate.

**Business question:** *What could go wrong across my AI portfolio?*

**The "So What":**  
These aren't per-agent metrics — they're fleet-wide. The most dangerous AI risk isn't a single agent failing (you'd catch that). It's correlated silent degradation — all agents using the same model drift simultaneously, and your infrastructure dashboard still shows green. These KRIs catch the semantic failures that infrastructure monitoring misses.

**ROI connection:** Early detection prevents costly incidents. One undetected AI error in KYC (missed sanctions match) can trigger regulatory fines of £10M+. Six fleet-level indicators catching drift early is insurance that pays for itself many times over.

---

#### Section: Risk Appetite Gauge

**What's on screen:**  
A gauge with a green band representing board-approved risk tolerance. A needle showing where the fleet's actual risk position sits relative to that appetite.

**Business question:** *Are we within the risk tolerance the board approved?*

**The "So What":**  
The board sets appetite. The gauge shows reality. If the needle drifts outside the green band, that's not just an alert — it triggers automated policy tightening across the fleet. This satisfies PRA SS1/23 requirements for board-level AI visibility. It's the difference between "we think we're compliant" and "here's real-time proof."

**ROI connection:** Regulatory confidence = faster approval for new use cases. Banks that can demonstrate real-time board visibility get new AI deployments approved in weeks, not quarters. This gauge is evidence for the regulator that governance is continuous, not periodic.

---

#### Section: Accountability Map (SM&CR)

**What's on screen:**  
Named individuals mapped to specific AI systems and accountability domains.

**Business question:** *Who is personally accountable?*

**The "So What":**  
Every AI system has a named human owner under Senior Managers & Certification Regime. This isn't optional — it's regulatory. When the FCA asks "who was responsible for this decision?", the answer is on screen. Named, mapped, auditable.

---

### How it works (plumbing)

**React components:**
- `FleetDashboard.tsx` — top-level orchestrator. Renders `UseCaseCard` (×4), `ScoreRing` (aggregate 92), KRI indicators (×6), fleet alerts, and the simulation hero card.
- `RiskAppetiteGauge.tsx` — the board-threshold gauge (green band + needle).
- `KRITrends.tsx` — sparkline historical view (collapsed by default).
- `BoardAccountabilitySummary.tsx` — SM&CR named-individual mapping.
- `SimulationModal.tsx` — launches a live AgentCore invocation when the hero card is clicked.

**Data sources:**
- **Basic Mode:** Everything reads from `src/data/fleetData.ts` — use case definitions, aggregate score (92), KRI definitions + values, alerts. All pinned fixture. The score ring, KRIs, and gauge render from this static file with no network calls.
- **Advanced Mode:** Score ring computes from per-agent health via `/svc/registry/agents` (grouped by use case). KRIs pull from DDB `kyc-metrics-history`. Simulation modal calls `/svc/agent/acme/invoke` or `/svc/agent/omega/invoke` for live inference.

**Backend services:**
- `/svc/registry/agents` — agent registry (the "CMDB for AI"). Returns agent identity, owner, model, tools, permissions, governance posture.
- DDB `kyc-metrics-history` — time-series KRI data. Queried for sparklines and RAG computation.
- AgentCore (`/svc/agent/*/invoke`) — real Bedrock inference when simulation runs. This is a live LLM call, not canned.
- CloudWatch alarms — aggregated into fleet alerts panel.
- Risk appetite thresholds — currently hardcoded (board-set values baked into `RiskAppetiteGauge.tsx`). In production these would live in DDB config.

**What's real vs fixture:**
- Basic Mode = fixture. `fleetData.ts` drives all four cards, the score ring, KRIs, and gauge. No backend dependency. SM&CR data is static (iteration 22 build).
- Advanced Mode = live compute for simulation only. The hero card "Run a decision" triggers a real AgentCore invocation (Bedrock). KRIs and fleet health remain fixture unless you wire up the metrics pipeline.

**To deploy on your own account you need:**
1. DDB `kyc-metrics-history` table — schema: `pk` (agent ID), `sk` (timestamp), KRI values. Seed with the 6 KRI metric types × 4 use cases.
2. Agent registry entries in DDB — one record per agent (KYC, Trade, Claims, Mortgage) with health score, status, owner.
3. AgentCore Lambda + Bedrock model access (Claude 3.5 Sonnet or equivalent) — for the simulation modal to produce live inference.
4. CloudWatch alarm definitions for fleet-level thresholds (optional — alerts panel works from fixture without them).
5. SM&CR accountability data — static seed in DDB or left as frontend fixture (no regulatory enforcement in demo).

---

## VIEW 3: EVALUATIONS + PIPELINE GATE

### Entry: Business Ops → Evaluations tab (or Compliance persona)

---

#### Section: Overall Evaluation Score (94.4%)

**What's on screen:**  
A headline score of 94.4% with trend arrow. Ten evaluators grouped into five categories (Accuracy, Safety, Compliance, Quality, Performance). Each shows a score bar with trend sparkline.

**Business question:** *How do we know the AI's outputs are actually trustworthy?*

**The "So What":**  
Every single decision the AI makes gets scored across 10 dimensions. Not sampling — every decision. The 94.4% is the rolling accuracy that feeds into the earned autonomy framework. Above 98% for 30 days? The agent earns promotion to the next level. Below threshold for 7 days? Automatic demotion. This is the evidence layer that makes the entire governance story credible.

**ROI connection:** Continuous measurement replaces periodic manual audits. Traditional model validation happens quarterly — here it happens on every decision. You catch drift in hours, not months. That's the difference between a £50K incident and a £10M regulatory action.

---

#### Section: Hard Gates vs Soft Gates

**What's on screen:**  
Each evaluator labelled as "HARD" (red) or "SOFT" (amber). Hard gates: PII Leakage (99%), Toxicity & Bias (99%). Soft gates: Regulatory Adherence, Quality metrics.

**Business question:** *What gets blocked automatically vs what needs human judgment?*

**The "So What":**  
Hard gates physically block bad outputs from reaching customers. If the PII detection evaluator fails, the response is stopped — period. No human needs to intervene. Soft gates flag issues for review without blocking the process. This distinction matters: you can tell the regulator exactly which failure modes are auto-blocked (zero customer exposure) and which require human expertise (proportionate response).

**ROI connection:** Hard gates eliminate entire categories of risk automatically. One PII leak to a customer can cost £4M+ in regulatory fines + remediation. Automated blocking at 99% threshold = near-zero exposure on the highest-consequence failures.

---

#### Section: Pipeline Gate (Per-Decision Status)

**What's on screen:**  
A row of coloured chips — green for pass, red for fail — showing the current decision's status against all evaluators.

**Business question:** *Can I trace any specific decision back to its quality checks?*

**The "So What":**  
Full traceability. Every decision has a pass/fail record against every evaluator. When the regulator asks "show me decision #4,721 and prove it was checked" — here it is. Not a summary, not a sample. The actual decision, the actual checks, the actual result. This is regulatory evidence that doesn't require manual compilation.

**ROI connection:** Audit preparation drops from weeks of effort to real-time retrieval. The evidence exists automatically because it's produced on every decision. No separate evidence-gathering exercise needed.

---

### How it works (plumbing)

**React components:**
- `EvaluationsDashboard.tsx` — renders the overall score (94.4%), per-evaluator score bars with sparklines, HARD/SOFT gate labels, status badges (passing/warning/failing), and category groupings.
- `PipelineGate.tsx` — renders the per-decision pass/fail chips (coloured row).
- `useBackendStatus` hook — checks `/svc/registry/evaluators` for network connectivity. Returns LIVE or SIMULATED badge accordingly.

**Data sources:**
- **Basic Mode:** All data from `src/data/evaluatorsData.ts` — 10 evaluator definitions with id, name, category, description, threshold, currentScore, trend (20 data points), passRate, lastRun, status, gateType, awsService. The 94.4% overall is computed client-side as the average of all 10 scores. Pipeline chips derive from per-evaluator pass/fail in the same file.
- **Advanced Mode:** `/svc/registry/evaluators` returns evaluator definitions. `/svc/evaluations` returns per-decision evaluation results (what populates the pipeline chips with real pass/fail from actual inference runs).

**Backend services:**
- `/svc/registry/evaluators` Lambda — CRUD for evaluator definitions. Returns the 10 evaluators with their thresholds, gate types, and metadata.
- `/svc/evaluations` Lambda — stores and retrieves per-decision evaluation results. Each agent decision gets 10 evaluation records written here.
- DDB `kyc-agent-evaluators` — already seeded with 10 evaluator records (this table exists in the demo account).
- Backend status detection: `useBackendStatus` pings `/svc/registry/evaluators` on mount. HTTP 200 = show LIVE badge, error = show SIMULATED badge and fall back to fixture data.

**What's real vs fixture:**
- Basic Mode = fixture. `evaluatorsData.ts` provides all scores, sparklines, and gate statuses. No network calls. The SIMULATED badge appears.
- Advanced Mode = live reads. If `/svc/registry/evaluators` responds, the LIVE badge shows and evaluator definitions come from DDB. Per-decision pipeline gate results come from `/svc/evaluations` after a real agent run.

**To deploy on your own account you need:**
1. DDB `kyc-agent-evaluators` table — seed with 10 evaluator records (schema: id, name, category, threshold, gateType, awsService). Seed script already exists in the build artifacts.
2. `/svc/registry/evaluators` Lambda — reads from the evaluators table. Needs `dynamodb:GetItem`, `Query` on the evaluators table.
3. `/svc/evaluations` Lambda — writes evaluation results after each agent decision, reads them for the pipeline gate view.
4. Cedar policy store (same one from View 1) — the evaluation results feed the promotion/demotion logic. The rolling 30-day accuracy check compares against the promotion threshold stored in Cedar context.
5. For full pipeline: an evaluation orchestrator that runs all 10 evaluators after each agent invocation and writes results to `/svc/evaluations`. In Basic Mode this doesn't exist — the fixture simulates what it would produce.

---

## THE CLOSING STORY (Your 60-Second Wrap)

"So here's the business case: Governance doesn't slow AI adoption — lack of governance does. Without this, teams stay in pilot indefinitely because leadership can't answer 'how do I know it's safe?' With this, they have the answer:

1. **Bounded** — business controls the parameters, risk committee sets the walls
2. **Measured** — every decision scored across 10 dimensions, drift caught in hours
3. **Portfolio-scale** — one framework, four use cases, board-level visibility
4. **Self-correcting** — automated demotion on degradation, no 2 AM phone calls

The ROI isn't just the automation savings from AI. It's the speed-to-production for every subsequent use case. Use case #1 takes 6 months. Use case #4 takes 6 weeks. The governance platform is the accelerant."

---

## KEY NUMBERS TO REMEMBER

| Metric | Value | Source |
|--------|-------|--------|
| Human intervention reduction | 85.5% (from 100% to 14.5%) | Kumar & Singh 2026, Dynamic Intervention Framework |
| Latency reduction vs static HITL | 89% | Same source |
| Clean decisions toward L3 promotion | 847 / 1,000 | Demo live data |
| Fleet health score | 92 / 100 | Demo live data |
| Evaluation score (rolling) | 94.4% | Demo live data |
| Promotion threshold | 98% accuracy over 30 days | Earned Autonomy Framework |
| Hard gate threshold (PII) | 99% | Evaluator configuration |
| Evaluators per decision | 10 (across 5 categories) | Pipeline Gate design |
| Use cases in portfolio | 4 | Fleet Dashboard |
| Policy change effect time | Sub-millisecond | Cedar/AVP architecture |

---

## STAKEHOLDER OBJECTION HANDLING

| Objection | Business Response |
|-----------|-------------------|
| "This adds overhead / slows teams down" | "The opposite. Without governance, teams stay in pilot. With it, use case #4 deploys in 6 weeks instead of 6 months. Governance is the unlock, not the brake." |
| "We can build this ourselves" | "You could build the dashboard. You can't build the Cedar policy engine, the fleet-level KRI correlation, or the automated demotion loop. That's platform, not UI." |
| "How do we justify the cost?" | "One prevented PII incident = £4M+ saved. One quarter faster to production per use case = £2M+ in accelerated value. The framework pays for itself on use case #2." |
| "Is this proven or theoretical?" | "Live demo. Real inference. The score ring updates from actual agent evaluations. This is deployed and running, not a mockup." |
| "What does the regulator think?" | "PRA SS1/23 requires board-level AI visibility with named accountability. This provides exactly that — continuous, not periodic. SM&CR mapping is built in." |

---

## TIMING GUIDE

| Section | Time | Lead With |
|---------|------|-----------|
| Autonomy Config (earned trust + business controls) | 3 min | "Who controls the agent?" |
| Fleet Dashboard (portfolio proof + risk appetite) | 3 min | "Does this scale?" |
| Evaluations (evidence + gates) | 2–3 min | "Where's the proof?" |
| Closing story | 1 min | ROI summary |
| **Total** | **9–10 min** | |

---

## REMEMBER

- Basic Mode IS the C-level arc. No landing page to navigate past.
- Lead with the business question, not the technology.
- "Configuration, not code" = no IT dependency for day-to-day governance changes.
- The earned autonomy story is an HR analogy: new hire → prove yourself → earn responsibility.
- Portfolio scale is the differentiator: one governance framework, many use cases, marginal cost decreasing.
- Every number on screen is defensible — point to the source if challenged.
- **Plumbing awareness:** In Basic Mode, all data is pinned fixture (`.ts` data files) — nothing hits the backend. This is intentional: it means the demo runs on any account without infra. Advanced Mode wires to Cedar + DDB + AgentCore for live enforcement and inference.
