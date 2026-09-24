# Enterprise Metrics — Cross-Module Metric Contract

> **Purpose:** Align the "AWS Agentic AI Enterprise Metrics" framework with the AVA
> platform so the same metric means the same thing whether a user is in **Plan** or
> **Govern**, and navigation between them carries context.
>
> **Status:** BUILT inside Govern, **not yet shared with Plan.** The contract is
> implemented at `frontend/src/components/govern/metrics/metricContract.ts` with five
> module feeds and a board-tier roll-up (§4). Its scope is exactly that directory —
> verified: no file outside `components/govern/metrics/` imports `metricContract`, and
> nothing in Plan has been modified. Read §5 before assuming a number is shared.

---

## 1. The core principle

The metrics framework spans the whole AI program lifecycle (assessment → plan →
business case → **actuals vs plan**). It should **not** live in one module.
Instead:

- **One module OWNS and computes each metric** (the source of truth).
- **Other modules READ it** through a shared contract — never recompute it.
- Metrics join on the **entity IDs the modules already share** (`use_case_id`,
  `business_case_id`, `agent_id`), which is what lets a Plan metric and a Govern
  metric refer to the same subject and deep-link to each other.

This is why the same number (e.g. Aggregate Risk Score) can appear on the Plan
scorecard, in Govern's Risk Management, and on the Govern Command Center strip
and be **guaranteed identical** — it is computed once by its owner.

---

## 2. Sheet → owning module map

| Workbook sheet | Owning module | Rationale |
|---|---|---|
| CXO Briefing, Executive Dashboard | **Plan / Reporting** | The composite scorecard and narrative — Plan's lifecycle closing on itself |
| Financial Metrics (NPV, IRR, BCR, payback, DCF) | **Plan** | Investment-appraisal / business-case model |
| Financial Metrics (**operational subset**: cost reduction %, AI ROI, orchestration cost ratio, cost/task, investment-as-%-revenue) | **Govern · FinOps** | Operational cost & efficiency — FinOps already owns ROI, TCO, chargeback, unit economics |
| Maturity Progression, People & Adoption, Process Efficiency | **Plan** | Maturity dimensions & adoption — Plan's assessment model |
| **Risk & Governance** (likelihood×impact, residual, control eff., risk velocity, leading indicators, RAG, aggregate risk score) | **Govern · Risk Management** | Govern already owns the risk register with inherent/residual likelihood×severity + controls |
| **Data & AI Quality** (accuracy, completeness, freshness, consistency, lineage, catalog, PII, governance compliance) | **Govern · Data Governance** | Govern's Data Governance module already tracks all of these |
| Data & AI Quality (**model rows**: model accuracy, drift, bias, versioning) | **Govern · Model Management** | These are model-governance, not data-quality — land them with their true owner |
| Operational "Incident Resolution Time"; Feedback Loop "Critic Agent Audit Log" | **Govern · Audit & Incidents** | Two distinct things: MTTR/open-incidents are metrics; the audit log is the *evidence trail* (see §3a) |
| Sensitivity & Scenarios, Value Driver Tree, Causal Measurement | **Plan** | Financial modeling methodology |
| Feedback Loop, RACI, Maturity Gates, 4-Phase escalation | **Shared / Plan** (governance gates reference Govern's autonomy ladder) | Gate logic touches Govern; composite display is Plan |

**Boundary that matters:** FinOps takes the *operational* cost metrics; Plan
keeps the *investment-appraisal* financials (NPV/IRR/DCF). This avoids two teams
both owning "the financials."

---

## 3. The shared metric contract

Defined once, used by all modules. (Implemented: `metricContract.ts`.)

```ts
interface Metric {
  id: string;                 // 'risk.aggregate-score', 'data.pii', ...
  label: string;
  tier: 'board' | 'management' | 'diagnostic';   // workbook 12 → 30 → 167
  owningModule: 'plan' | 'risk' | 'data' | 'model' | 'finops';
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  polarity: 'higher-is-better' | 'lower-is-better';
  unit?: string;
  expected?: number; actual?: number; target?: number;
  subject?: { useCaseId?; businessCaseId?; agentId? };   // cross-module join key
  owner?: string; source?: string; asOf?: string;
}
// computed ONCE, read everywhere:
interface ComputedMetric extends Metric { variance; variancePct; rag; }
```

Shared rules (from the workbook's Configuration & Lookups sheet, defined in one
place so banding is identical everywhere):

- **RAG on variance:** Green ≤5%, Amber ≤15%, else Red (polarity-aware).
- **Residual risk:** `rawScore × (1 − controlEffectiveness)`.
- **Risk RAG:** Green ≤ 0.6×threshold, Amber ≤ threshold, else Red.

Each module exposes a `MetricContribution { owningModule, generatedAt, metrics }`.
Plan / Command Center aggregate these **without recomputing**.

---

### 3a. Metrics vs. evidence (Audit & Incidents)

Not everything in the workbook is a *metric*. The "Critic Agent Audit Log" row
(execution trace ID, finding, policy violated, resolution status) is an audit
**trail** — the append-only examiner evidence that risk signals and incident
KPIs are computed *from*. It is deliberately **not** modeled as a
`ComputedMetric`. Audit & Incidents therefore contributes:

- **Metrics** → Incident Resolution Time (MTTR), Open Incidents, Resolution Rate
  — these feed the scorecard like any other module.
- **Evidence** → the audit-event feed, exposed as its own accessor and rendered
  as a log, not a KPI.

This mirrors the platform's backend: the Govern audit log is already the
system-of-record that enforcement, A2A, and risk write to. The metrics sit on
top of that evidence; they don't replace it.

## 4. What is implemented (Govern side)

| Feed | File | Rendered by |
|---|---|---|
| Risk metrics (+ Aggregate Risk Score = Go/No-Go gate feed) | `metrics/riskMetrics.ts` | `risk/RiskDashboard.tsx` |
| FinOps operational-cost metrics (+ Cost Reduction headline) | `metrics/finopsMetrics.ts` | `FinOps.tsx` |
| Audit & Incidents metrics (MTTR/open/resolution) + audit-trail evidence feed | `metrics/auditMetrics.ts` | `AuditIncidents.tsx` |
| Model-governance metrics (accuracy, drift, bias, versioning) | `metrics/modelMetrics.ts` | `ModelGovernance.tsx` |
| Data-quality metrics (+ Data Quality Health composite) | `metrics/dataMetrics.ts` | **Nothing** — see below |
| Board-tier roll-up with deep-links | `metrics/ScorecardStrip.tsx` | `GovernanceCommandCenter.tsx` |

All read through the contract, so the Command Center tile and the module panel show the
same value. Deep-links use the existing `?tab=` pattern.

**Data-quality is the one incomplete row.** `metrics/DataQualityMetricsPanel.tsx` has no
importer — the intended Data Governance → Data Quality surface never mounted it — so
`dataMetrics.ts` reaches a user only indirectly, through `useLiveMetrics.ts` feeding the
Command Center scorecard. Mount the panel (or delete it) rather than assuming the Data
Quality page is already on the contract.

---

## 5. Boundary: the contract is Govern-local

Everything above is scoped to `components/govern/metrics/`. **Plan does not emit or consume
`ComputedMetric`**, so the guarantee in §1 — one owner computes, everyone else reads —
currently holds *within* Govern only. A number that appears in both Plan and Govern today
is computed twice and is not guaranteed to agree.

Graduating the contract to a shared layer means, in order:

1. Move `metricContract.ts` (and the shared RAG/variance/residual constants) out of
   `components/govern/` into a shared location, so neither module owns the other's rules.
2. Have Plan-owned metrics (NPV, IRR, maturity, adoption) emit `ComputedMetric[]`.
3. Have the Plan scorecard *read* Govern's contributions — chiefly the Aggregate Risk Score
   behind the Go/No-Go gate, Data Quality Health, and Cost Reduction — instead of
   recomputing them.
4. Add the cross-module deep-links in both directions (Plan's Go/No-Go gate → Risk
   Management filtered to the contributing risks; a business case → the risks that threaten
   it; and the Govern→Plan return trip). Today the deep-links in `ScorecardStrip.tsx` all
   point at other Govern routes.

Step 1 is the load-bearing one: while the constants live under `components/govern/`, any
Plan consumer inherits a dependency on Govern's internals, which is the coupling the
contract exists to avoid.

Two design points that remain open, and are called out because picking either changes where
code lands: whether the composite scorecard and CXO briefing live in Plan or in a dedicated
reporting module, and whether the workbook's cross-sheet consistency check becomes a real
runtime reconciliation between module contributions (today nothing verifies that two
modules' contributions agree).
