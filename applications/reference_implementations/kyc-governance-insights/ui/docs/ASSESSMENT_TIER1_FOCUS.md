# Assessment: Tier 1 Focus — IA re-tiering, wiring, info panels

> Pre-implementation assessment for `BUILD_TASK_TIER1_FOCUS.md`.
> Golden rule honoured throughout: **nothing is deleted** — only hidden, collapsed, or reordered.

## How the app is structured today

- **Two app modes** (`App.tsx`, `localStorage['app-mode']`): `basic` → `BasicModeView` (sacred, untouched); `advanced` → persona-driven tabbed console.
- **Four personas** (`PersonaContext`): `cro-fleet`, `business-ops`, `compliance`, `engineering`. Default persona = `compliance`.
- **Tabs per persona** come from `config/personaTabs.ts` (`PERSONA_TABS`). `cro-fleet` has no tabs — it renders `FleetDashboard` as a whole page.
- **Landing tab bug:** `App.tsx` initialises `activeTab` to `'simulation'`. For `compliance`, `simulation` (relabelled "Decision Log") exists, so the console lands on a Tier-3 depth view, not a Tier-1 view.
- **Info system:** `InfoTooltip` (hover/click ℹ️ with text) and `InfoPanel` (rich right-side drawer, fed by `infoContent.ts` via `getInfoItem(id)`; 116 entries). Both exist and are used in Basic Mode + parts of the console.
- **Unrouted components:** `components/evaluations/EvaluationsDashboard.tsx` and `components/evaluations/PipelineGate.tsx` are built and self-contained (render from `evaluatorsData.ts`) but no persona tab routes them. (`EvalSummaryCard` — also under `evaluations/` — IS routed, inside the Governance tab.)

## Current persona views → tier mapping

Tiers per the agreed system: **T1** front-and-centre · **T2** visible but secondary · **T3** behind "More" · **T4** hidden.

### cro-fleet — `FleetDashboard` (no tabs)
Already a single Tier-1 page (portfolio health, constellation, KRIs, KPIs, alerts). **No re-tiering needed**; add info panels + a Simulation modal entry (already present). Keep as-is structurally.

### business-ops
| Current tab (id) | Meaning | Tier |
|---|---|---|
| Operations (`operations`) | Monitoring texture | T2 |
| Live Decision (`simulation`) | Agent execution depth | T3 |
| Review Queue (`review-queue`) | HITL queue | T3 |
| Decision Rules (`governance`) | **Autonomy config + intervention ladder** | **T1** |
| ROI Projection (`roi-projection`) | Payoff | T2 |
| Control Framework (`risk-register`) | Controls | T2 |
| Reports (`kyc-report`) | Reports | T4 |
| Agent Fleet (`overview`) | Fleet story | **T1** |
| **Evaluations (NEW)** | EvaluationsDashboard + PipelineGate | **T1** |

Target order: Decision Rules (governance) · Agent Fleet (overview) · Evaluations (new) · Operations · ROI · Control Framework · [More: Live Decision, Review Queue] · [hidden: Reports].

### compliance (default persona)
| Current tab | Meaning | Tier |
|---|---|---|
| Audit Dashboard (`compliance-audit`) | SM&CR / controls matrix | T2 |
| Decision Log (`simulation`) | Agent execution depth | T3 |
| Evidence Packs (`evidence-trail`) | Evidence & HITL | T3 |
| Policy Enforcement (`governance`) | **Autonomy config + intervention ladder** | **T1** |
| Findings & Remediation (`risk-register`) | Findings | T2 |
| **Evaluations (NEW)** | EvaluationsDashboard + PipelineGate | **T1** |

Target order: Policy Enforcement (governance) · Evaluations (new) · Audit Dashboard · Findings & Remediation · [More: Decision Log, Evidence Packs].

### engineering
| Current tab | Meaning | Tier |
|---|---|---|
| Architecture (`architecture`) | Security/arch depth | T3 |
| Observability (`simulation`) | Agent execution depth | T3 |
| Policy Engine (`cedar-policy`) | Cedar depth | T3 |
| Agent Registry (`overview`) | Fleet/registry | T2 |
| Controls Matrix (`compliance-audit`) | Controls | T2 |
| Guardrails (`more-info`) | Guardrails depth | T3 |
| **Evaluations (NEW)** | EvaluationsDashboard + PipelineGate | **T1** |

Target order: Evaluations (new) · Agent Registry (overview) · Controls Matrix · [More: Architecture, Observability, Policy Engine, Guardrails].

## What needs to move / change

1. **Landing:** initialise `activeTab` to the persona's first (Tier-1) tab, not hardcoded `simulation`.
2. **Ordering:** reorder `PERSONA_TABS` so each persona leads with Tier-1.
3. **"More" grouping:** add a tier to `TabConfig`; `TabBar` renders T1+T2 inline, T3 in a "More ▾" dropdown, T4 hidden unless `?presenter` (same pattern already used for Talking Points).
4. **Wire unrouted:** new `evaluations` TabId + `EvaluationsTab` (composes `EvaluationsDashboard` + `PipelineGate`), routed in `App.tsx`, added as Tier-1 to engineering, compliance, business-ops.
5. **Info panels:** add `learnMore?` to `InfoItem`; author entries; apply thoroughly to Tier-1 surfaces first, then Tier-2/3.

## Nothing is removed

Every existing tab id stays routed in `App.tsx`. Re-tiering only changes *ordering* and *grouping* (inline vs "More" vs presenter-only). `cro-fleet`/`FleetDashboard`, all tab components, `basicModeContent.ts`, and `SimulationTab` are untouched in content. `evaluatorsData.ts` and the two previously-unrouted components are now *more* visible, not less.

## Phasing (info panels)

Exhaustive info-panel coverage of every element across every tab is a large content effort. This build:
- **Phase A (this build):** IA re-tiering + landing + "More" grouping + wire unrouted Evaluations (the density fix — the actual stakeholder pain) + rich info panels on the new Evaluations tab and Tier-1 headers + `learnMore` support.
- **Phase B (follow-on):** systematic info-panel sweep across remaining Tier-2/3 elements using `infoContent.ts` + research corpus, tracked as a checklist.

This keeps the shippable "focus" win intact now while being honest that per-element info coverage is incremental.

---

## Update: display-prominence model (supersedes the global tier numbering)

Correction applied: Raphael's Tier 1–4 list was **development priority**, not display prominence.
Since all four are built, prominence is now assigned **per persona** — the earned-autonomy story is
the same for everyone (prove → earn → grant → monitor → revoke), but each persona enters from a
different door. `tier` in `personaTabs.ts` is therefore per-persona, and within-page depth is demoted
with `<CollapsibleSection defaultCollapsed>`.

### Per-persona entry (inline / expanded) vs depth (More / collapsed)

| Persona | Landing / expanded entry | Behind "More" (tabs) | Collapsed sections (within page) |
|---|---|---|---|
| CRO Fleet | Fleet page: hero, aggregate health, use-case constellation, KRIs, operational performance, risk appetite, board accountability | — (no tabs) | Reference Architecture, Recent Alerts, Compliance Operations, KRI Trends, Incidents & Near-Misses |
| Business Ops | Decision Rules (autonomy config + intervention ladder), Operations (KPIs), Evaluations | Live Decision, Review Queue; Reports = presenter-only | Governance-by-Outcome, Business Metrics, SLA Monitor, Cost Breakdown, Capacity Planning, ROI Before/After |
| Compliance | Evaluations, Audit Dashboard (composite/domain + findings), Evidence Packs | Decision Log | Governance-by-Outcome, Business Metrics, Control Framework Mapping, Control Testing Evidence, Model Inventory |
| Engineering | Architecture, Policy Engine (live Cedar), Observability | Guardrails | (within-page depth — see Phase B) |

Landing tab = each persona's first entry (`App.tsx` initialises `activeTab` to `tabs[0]`). Autonomy
config, Policy Params, Intervention Ladder, and the Evaluations/Fleet headlines stay full-size.

### Collapse rollout — done this pass

`CollapsibleSection` (`components/shared/CollapsibleSection.tsx`) applied to Tier-2 depth in the five
persona-entry dashboards: **GovernanceTab** (Governance-by-Outcome, Business Metrics), **FleetDashboard**
(Reference Architecture, Alerts, Compliance Ops, KRI Trends, Incidents), **OperationsTab** (SLA, Cost,
Capacity), **ROIProjectionTab** (Before/After), **ComplianceAuditTab** (Control Framework Mapping,
Control Testing, Model Inventory). Human Oversight (Governance) already collapses via its own toggle.

### Phase B remainder (within-page collapse, not this pass)

Engineering's within-page depth — attack surfaces + resilience (ArchitectureTab), the full agent
waterfall (SimulationTab), guardrail config (MoreInfoTab) — is deferred: those are large monolithic
components where blind wrapping risks breakage, and Engineering already enters via Architecture/Cedar/
Observability at the tab level with Guardrails behind "More". RiskRegisterTab is left as-is (its content
is its purpose, not collapsible depth). These are refinements, not the core focus win.

Verified: `tsc --noEmit` clean, `npm run build` green, all tab routes still present (nothing deleted),
Basic Mode (`basicModeContent.ts` / `BasicModeView`) untouched.
