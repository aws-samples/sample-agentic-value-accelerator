# Govern Module

> AI Governance, Risk & Compliance - one view.

The AI GRC hub your executives, auditors, and engineers share. Monitor trust, track compliance, manage risk, and control cost across every agent in your fleet.

## Overview

Govern is the governance layer of the Agentic Value Accelerator (AVA) platform. It provides comprehensive AI governance capabilities organized around three pillars: **See It** (visibility), **Govern It** (control), and **Show It** (accountability). The module integrates with AWS services for live data and provides illustrative mock data where integrations are pending.

---

## Data Provenance & Hardening

Govern holds itself to a strict **data-honesty** standard: a green `LiveDataBadge` should render only when
the data actually shown in that surface reports `live: true` from its AWS/AVA source; illustrative or
placeholder content carries a `MockDataBadge` (or an "Inferred"/"Demo" marker), and surfaces degrade to
honest empty states rather than fabricating values.

> **This is the standard, not yet the state of the module — read this before trusting a green pill.**
> `LiveDataBadge` gating is **opt-in, and the default is green**: `DataSourceIndicator.tsx:558-565`
> degrades to `MockDataBadge` only on an explicit `live === false`, so omitting the prop renders "Live".
> Measured 2026-09-04: of **278** call sites, **16** pass `live=` and **262 (94%) pass none**; `live={true}`
> appears **0** times, which makes grepping for it falsely reassuring. A module-wide sweep found **~150
> honesty defects across ~75 of 300 files (13 Critical)**, tracked as Batch 4. Because `GovernPageLayout`
> renders the page badge beside the `<h1>`, **an unbadged panel is not neutral — it inherits the header's
> claim.** When adding or reviewing a surface: pass `live={…}` explicitly, gate each surface on the flag
> belonging to the data *it* renders (never `a || b || c`), and keep the badge visible in `embedded` mode.

Module-wide invariants (added by the Wave-4 deep-audit remediation). These are the rules to test a number
against before trusting it:

- **`null` means unmeasured; `0` means measured zero.** The two are never conflated. An unmeasured metric
  emits `null` (`Optional[...]` on the Pydantic response model, `number | null` in `client.ts`) and renders
  as an em-dash with a tooltip — never `0`, never `$0.00`, and never a green "excellent" state. Guards are
  therefore written `x == null` / `is not None` and **never** as truthiness checks: `if (!x)` silently
  reclassifies a real measured `0` as unmeasured. Aggregates must not let a `null` coerce to `0` inside a
  `reduce`/`sum` that is displayed under a Live badge.
- **No estimate may masquerade as a measurement, including on a fallback path.** There is no "default"
  pricing rate, no `|| 1` denominator, and no error/catch branch that invents an inventory. A missing rate
  or a missing source yields `null` plus a `note` naming exactly what was unavailable.
- **Reachability is measured, never declared.** "Connected" is a claim about the customer's own account, so it
  requires a real AWS call — `DataSourceIndicator.tsx` used to hardcode 47 `status: 'live'` literals and render
  "47/50 connected" in emerald before any call was made. All 50 rows now come from
  `services/govern_data_source_probes.py`, one spec per source. The contract has **seven** statuses
  (`connected`, `connected_empty`, `degraded`, `access_denied`, `not_enabled`, `error`, `not_probed`) and
  deliberately **no boolean `live`**: only `connected` + `connected_empty` count toward the numerator, the
  denominator is `probed` (total − `not_probed`), and emerald requires every probed source connected *and* zero
  unprobed. A boolean cannot separate reachable-and-empty from reachable-but-disabled, and the old route's
  `'live': live if live is not None else True` is the fail-open that caused the overclaim. Full rationale:
  `platform/docs/architecture/govern-module.md`.
- **A service's `.live` flag is not a reachability signal.** Probes must not reuse it. 18 of the 50 services set
  `live=False` after a *successful* call that returned zero rows, and all of them swallow `ClientError` — four
  AVA endpoints return `200 []` for a table that does not exist. Both directions are wrong for connectivity.
- **Internal consistency is not evidence of correctness.** Making several views of a number agree can
  *remove* the discrepancy that would otherwise have exposed a shared fabrication. Reconcile against an
  independent source instead — as Developer AI Usage now does against `/invocation-safety/telemetry`.
- **A swallowed exception on a call feeding a badged number is a data-honesty bug**, not merely an
  error-handling one: `.catch(() => {})` or `except Exception: pass` renders "0" as if it were measured.
  Degrade explicitly with `live: false` plus a `note`.
- **Two client APIs are `async` in shape only — never badge their output Live.** An `await someApi.x()`
  is normally proof that a network call happened; for these two it is not, so the awaiting code reads as
  live-wired when it is not:
  - `guardrailValidationApi` (`api/client.ts`) resolves in-process fixtures and makes **no request at
    all** — there is no `guardrails/validation/*` backend route (its own comments say "would call").
  - `governComplianceEvidenceApi` reaches a real route, but `services/govern_compliance_evidence_service.py`
    builds no boto3 client: every collector either reads an in-process AVA module
    (`core/harness_killswitch.py`, `core/path_jail.py`, `core/rbac.py`) or returns an illustrative stub.
    `_collect_cloudtrail_evidence()` is the one AWS-shaped collector and is the stub that would need a
    client first.
  Both must render under a `MockDataBadge` until a real source is behind them. A `200` from the second one
  is not evidence of live data — check that the *collector* touches AWS, not that the route answered.
- **Read-only IAM tracks the routes.** The read-only Govern role gained **82** least-privilege actions across
  **27** new service prefixes that live routes were already calling, and dropped one
  (`bedrock:GetGuardrailPolicy`, which does not exist — `bedrock:GetGuardrail` already returns the policy
  configuration; see the comment at `ava-govern-role.yaml:306`) — 81 → **162** unique actions, 7 → 34 prefixes.
  **No wildcard actions** (0 of 162), `cfn-lint` clean.
  Three qualifications, because the short version overstates the guarantee:
  the template *does* declare write actions — `AVAGovernWriteActions` grants six
  (`bedrock:ApplyGuardrail`, `cloudwatch:PutDashboard`/`PutMetricAlarm`/`PutMetricData`/`DeleteAlarms`,
  `servicequotas:RequestServiceQuotaIncrease`) — but it is a separate policy behind the
  `EnableWriteActions` parameter, which **defaults to `'false'`**, so a default deployment attaches only the
  read-only statements. The 162 figure above is the read-only set; enabling the parameter adds those six.
  `Resource: '*'` *is* used, in 38 of 47 statements — unavoidable for Cost Explorer, Security Hub, Config and
  similar APIs that do not support resource-level permissions, **but `S3EvaluationOutputRead` grants
  `s3:GetObject` on `'*'`**, i.e. account-wide object read, which S3 *could* scope. Tighten that statement
  before deploying into an account holding sensitive buckets. And `logs:StartQuery`/`StopQuery` are
  write-shaped verbs retained because they are the required read path for Logs Insights.
  Action-by-action reference: `platform/control_plane/docs/ava-govern-iam-permissions.md`.

Recent hardening (govern-audit branch):

- **Resilience** — an app-wide `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) plus a `path="*"`
  catch-all route: a single view error no longer white-screens the whole app, and the boundary resets on navigation.
- **Type safety** — `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`) added. The Vite build uses
  esbuild and does **not** type-check, so run `typecheck` in CI. All Govern module files are type-clean.
- **Command Center** — AI Quality is its own zone section (`ZoneHeader` + standard card), matching Health / Risk / Operations / Cost.
- **Reports landing** — shows a live cross-source summary (AgentCore, Guardrails, Deployments, Compliance,
  Security, Risk, Fleet) via `useReportsDataSummary`.
- **Cross-module baseline** — `useGovernanceAggregator` now derives its baseline from live sources
  (`governCommandCenterApi.getData()`, `complianceApi.getPosture()`, `governModelsApi.catalog()`, `maturityApi`)
  instead of hardcoded values; each has per-payload `live` gating with mock fallback. Incident summary,
  savings targets, and models-pending-review have no live source and remain mock.
- **Framework deep-dives** — six framework views (OWASP LLM Top 10, FINOS AIR, NAIC AI, CRI FS AI RMF,
  EU AI Act, OSFI E-23) overlay live control evaluation via `governControlsApi.evaluate()`
  (`useControlEvaluation`) with per-source `live` gating; NIST AI RMF and MITRE ATLAS remain static.
- **Operations** (`/govern/operations`) — Ops Overview and Alert Center read live CloudWatch alarms and
  fleet status via `governOperationsApi.*` (fleet status, active alarms, MTTR); Capacity Planning reads live
  AWS Service Quotas via `governCapacityApi`. Alert rules/mutations and the Incidents, On-Call, and SLA tabs remain mock.
- **Calculation correctness** — Chargeback is scoped to the AI/Bedrock footprint (not the whole AWS bill);
  AgentROI monthly savings = 4-year net ÷ 48; Token Economics aligns the token window to the month-to-date
  cost window; the exec scorecard reads live cost via `by_model`/`amount` and derives grounding/hallucination
  from the guardrail `ContextualGrounding` policy breakdown.
- **Invocation safety** — requires the Bedrock model-invocation CloudWatch log group to exist; surfaces an
  actionable note when logging is enabled but no records are captured.

Phase 2 live-data wave (all verified against the account):

- **RAG Evaluations** — Model Management → Evaluations → RAG surfaces real Bedrock RAG eval jobs (`governEvalsApi.jobs()`
  filtered to `RagEvaluation`) with S3-parsed per-metric mean scores (`scores()`); the per-query "studio" drill-down stays illustrative (Mock).
- **Knowledge Bases** — new Data Governance "Knowledge Bases" tab (`data/KnowledgeBaseGovernance.tsx`) over `governKnowledgeBasesApi.list()`.
- **Traces (X-Ray)** — new Operations "Traces (X-Ray)" tab (`operations/ServiceMap.tsx`) over `governXRayApi` (service graph, trace table, segment-tree detail).
- **Real AWS Budgets** — the Command Center budget card and `useGovernanceAggregator` source budget-vs-actual from live `governCostApi.budgets()` (`DescribeBudgets`), replacing the hardcoded `BU_BUDGETS` mock.
- **Availability & Routing** — new Model Management tab over `governModelsApi.inferenceProfiles()` / `.promptRouters()` plus a foundation-model availability summary from the catalog.
- **KMS + SCP governance** — a live KMS encryption-at-rest card (`governKmsApi.inventory()`) and a Service Control Policies "Preventive Controls" card (`governScpApi.policies()`) in the Compliance module, both honest about access limits.

Follow-up live-data wave (all verified against the account):

- **AWS Config Rules compliance** — a new "AWS Config Rules" card in Compliance Center's Security Hub tab (`AwsConfigRulesCard` over `governControlsApi.configRules()`, `GET /govern/controls/config-rules`, source `aws-config`) surfaces ~710 real Config rules with per-rule compliance (compliant / non-compliant / not-applicable / insufficient-data); honest note when Config is off or `config:Describe*` is denied.
- **Inspector2 vulnerability detail** — `risk/SecurityPostureCard.tsx` (rendered in Risk Dashboard + Real-Time Monitoring) adds an Inspector2 panel over `governSecurityApi.vulnerabilities()` (`GET /govern/security/vulnerabilities`, source `inspector2`): ~100 findings (5 CRITICAL / 33 HIGH), ~180 covered resources, real CVEs and fix-availability, complementing the existing Inspector "Vulnerabilities" posture dimension.
- **LLM Output Quality — now live (derived proxy)** — a new backend background producer (`core/llm_quality_producer.py`, started at app startup, interval `GOVERN_LLM_QUALITY_INTERVAL`, default 300s) publishes telemetry-DERIVED quality metrics to the `AVA/LLMQuality` CloudWatch namespace the AI Quality dashboard (`AIQualityMonitor`) already reads, flipping it from Mock to Live. Metrics are a governance-grade proxy DERIVED from guardrail + invocation telemetry + Bedrock evals — not a direct per-response measurement: harmful_rate (guardrail `ContentPolicy`), groundedness (guardrail `ContextualGrounding`, or Bedrock eval scores when present), refusal_rate + tokens_per_response (invocation-safety), latency from `AWS/Bedrock`. Eval-quality dimensions are skipped when completed jobs lack those metrics; a dimension is published only when its underlying signal is genuinely live that cycle.

Bug fixes / hardening (this wave):

- **Data Governance 500 fixed** — `GET /govern/data-catalog/summary` (and `/domains`, `/quality`, `/sensitivity`) returned 500 due to a `get_or_load` call-signature bug in the Glue/Macie data services; they now return live data.
- **Framework attestation 404 fixed** — `osfi-e23`, `naic-ai`, `colorado-ai-act`, `mitre-atlas`, and `nist-genai-profile` are now registered as backend framework ids, so attestation reads/writes no longer 404.
- **IAM Access Analyzer severity fixed** — switched to the v1 `ListFindings` API so the `isPublic` flag is available; public external-access findings are now correctly classified HIGH instead of always MEDIUM.

Latest wave (AI Estate Inventory + hardening, account-verified):

- **AI Estate Inventory** — the "AI Estate Inventory" page at `/govern/data/inventory` (`govern/data/AiEstateInventory.tsx`), reachable from the Data Governance landing (Lineage tab), over `governInventoryApi.resources()` (`GET /govern/governance/inventory`, source `resourcegroupstaggingapi:GetResources`) surfaces every tagged AWS resource supporting the AI estate, grouped by service, with an `ai_related` flag derived from the service namespace (bedrock/sagemaker/etc.) plus ai/genai/llm/agentcore tag heuristics (~500 resources incl. bedrock-agentcore/lambda/eks; account IDs masked server-side).
- **cost/by-model 422 fixed** — `useLiveMetrics` and `useLiveKPIs` called `governCostApi.byModel(30)`, but the endpoint caps `months` at 12 → 422 on the Command Center; both now request `byModel(12)`.
- **Canonical Bedrock model names in by-model cost (unblocks the Model Inventory cost join)** — `GovernCostService._model_from_usage_type` emitted two naming styles for one family (`Claude4.5Opus` next to `Claude Opus 4.8`) and could leak a metered-unit suffix (`-1h`, `-token-count`) as a model name. It now strips the metered unit whole (anchored on the required `-tokens`/`-token-count` marker so a real SKU fragment such as a `-1m` context window is preserved) and normalizes BOTH USAGE_TYPE formats to Bedrock's catalog display name, `<Family> <Tier> <Version>` — `Claude Opus 4.5`, `Claude Sonnet 4.6`, `Nova Pro`, `Nova 2 Lite`. That is byte-identical to the `govern_models` catalog `name`, so `LiveModelInventory`'s existing `normalizeKey` bridges cost rows to CloudWatch model ids with no extra normalizer: "Cost (3mo)" went from 4/10 to 9/10 in-use models joined against the live account (the tenth, `amazon.titan-embed-text-v2:0`, has genuinely $0 spend). Row count and window total are unchanged (28 rows / $24,873.52 over 6 months), so no SKU was merged or split; `cost/token-costs` still derives the cache and input-vs-output split from the raw usage type. `finops/TokenEconomics.tsx`'s `MODEL_COST_MAP` was updated to the canonical names (its `normKey` deletes separators and strips id date stamps, so date-stamped ids still need that explicit map).
- **Account-ID masking hardening** — the shared `mask_account_id` helper (`core/security_utils.py`) used a `\b` word boundary that missed 12-digit account IDs adjacent to `_` (e.g. inside resource names/ARNs); switched to digit lookarounds, and masking was extended to the IAM vendor-access ARNs/`resource_scope` and the Bedrock inference-profile/prompt-router ARNs. All govern live endpoints verified leak-clean.

---

## Governance Assessment Banner

The `/govern` landing page features a **Governance Assessment Banner** that provides:
- **Getting Started**: Interactive assessment wizard covering 14 governance domains
- **Gap Analysis**: Identifies gaps across inventory, risk, compliance, safety, and FinOps
- **Role-Based Prompts**: Shows gap counts relevant to each stakeholder role (Executives, Risk Teams, Compliance, Security, Data Stewards, Safety/RAI, FinOps)
- **Auto-Populate**: Scans existing AVA modules to pre-fill assessment responses (with 5-second timeouts per API)

Complete the assessment to unlock contextual prompts throughout the Govern module.

---

## Govern Core: See It, Govern It, Show It

The 9 foundational Core modules deliver ~75-80% coverage across 8 major AI governance frameworks (NIST AI RMF, EU AI Act, ISO 42001, OWASP LLM Top 10, MITRE ATLAS, OSFI E-23, NAIC AI Guidelines, FINOS AIR).

### See It (Blue)
Visibility into your AI estate - what's deployed, how it's performing, what it costs.

| Module | Route | Purpose |
|--------|-------|---------|
| Command Center | `/govern/command-center` | Aggregated governance dashboard |
| Agent Registry | `/govern/agents` | Centralized agent inventory |
| Agentic Fleet | `/govern/fleet` | Fleet-wide governance KPIs |
| Model Management | `/govern/models` | Model registry and lifecycle |
| Cost & FinOps | `/govern/finops` | Budget tracking and optimization |

### Govern It (Violet)
Policy enforcement and compliance management.

| Module | Route | Purpose |
|--------|-------|---------|
| Compliance Center | `/govern/compliance` | Framework checklists and evidence |
| Prompt Governance | `/govern/prompt-governance` | Runtime prompt compliance |

### Show It (Emerald)
Audit trails and evidence for regulators.

| Module | Route | Purpose |
|--------|-------|---------|
| Audit & Incidents | `/govern/audit` | Activity feed and incident management |
| Data Governance | `/govern/data` | Data quality, lineage, and access control |

---

## All Modules

### Command Center
- **Purpose**: Single pane of glass for executives showing trust scores, compliance posture, risk exposure, and real-time alerts across your entire AI fleet.
- **Key Features**:
  - Platform-wide trust score aggregation
  - Compliance posture strip with live metrics
  - Risk heatmap with severity distribution
  - Real-time alerts and notifications
- **Live Data**: AVA APIs (use cases, maturity, business cases), AWS CloudWatch metrics. The shared
  `useGovernanceAggregator` baseline is live via `governCostApi.budgets()` (live AWS Budgets `DescribeBudgets` —
  now the primary source for monthly spend and budget utilization and for the Command Center budget card, replacing
  the hardcoded `BU_BUDGETS` mock), `governCommandCenterApi.getData()` (anomalies, models-in-production, budget fallback),
  `complianceApi.getPosture()` (framework coverage, control counts, trust baseline), `governModelsApi.catalog()`
  (model count), and `maturityApi` — each per-payload `live`-gated with mock fallback.
- **Data-honesty fix (Wave-4)**: `risk_posture` was permanently `null` because the aggregator called
  `get_security_hub_findings()`, a method that does not exist on the security service. The resulting
  `AttributeError` was swallowed, so the risk panel rendered blank while the parallel
  `/govern/risk-posture/security-hub` route had been returning real findings the whole time — a swallowed
  exception, not a missing integration. Fixed: `live_sources` 4 → **5**, and `risk_posture` now reports
  `live: true` with source `security-hub`.
- **Route**: `/govern/command-center`
- **Core Pillar**: See It

### Trust Stack
- **Purpose**: Deep dive into the 3-layer governance maturity model: Foundation, Production, Scale. Shows AWS services, key controls, and 3 Lines of Defense activities.
- **Key Features**:
  - Interactive layer exploration (Foundation/Production/Scale)
  - AWS service mapping per layer
  - 3 Lines of Defense activity tracking
  - Control coverage visualization
- **Live Data**: AWS Config compliance status
- **Route**: `/govern/trust-stack`

### Agent Registry
- **Purpose**: Centralized inventory of all AI agents, tools, MCP servers, capabilities, and permissions across AWS, Azure, GCP, and SaaS platforms.
- **Key Features**:
  - Multi-cloud agent discovery
  - Tool and MCP server inventory
  - Permission tracking per agent
  - Provider filtering (AWS Bedrock, Azure AI, GCP Vertex, ServiceNow, Salesforce)
- **Live Data**: AVA frontier agents API, AWS Bedrock agent inventory, resource-tag governance evidence
  (`GET /governance/resource-tags`), AWS Cost Explorer (AWS provider cost)
- **KPI scoping (Wave-4)**: demo and external agents are excluded from the 7 headline KPIs whenever live data
  is present, so the executive numbers no longer count seeded rows. The table below stays deliberately
  blended, with a per-row `Demo` marker, and the filter chips are computed over the rendered set separately so
  chip counts always match the rows they filter. Total Agents 53 → **36**, In Production 48 → **36**, Open
  Incidents 2 → **0**.
- **Governance status from real evidence (Wave-4)**: `governanceStatus` used to be forced to `review_needed`
  for every live agent, which made the column worthless. It is now derived from real resource-tag evidence on
  an explicit precedence — authored status, then open incident, then `governed && has_owner`, then `unknown` —
  and **33 of 36** agents join the tag scan. Compliant 6 → **10**, Unknown 41 → **3**. The 3 agents that do
  not join are absent from the tag scan entirely, so `unknown` is the honest status rather than a guess.
- **Provider cost (Wave-4)**: AWS provider cost is now measured from Cost Explorer instead of being summed
  from 6 demo rows: **$10,680/mo → $31,972/mo**. The other providers have no connector data and keep a
  `MockDataBadge`.
- **Deliberately absent, not measured**: per-agent cost attribution does **not** exist. Per-agent
  `avgCostPerDay` stays `0` and is badged, because Cost Explorer cannot attribute spend per agent without an
  activated cost-allocation tag; inventing a per-agent split would be exactly the failure mode this module
  forbids. Three further fields are now disclosed as *absent* rather than measured: the live mapper hardcodes
  `scopeLevel: 3`, `incidents: 0` and `owner: 'AWS Account'`, so "High-Scope 36/36", "0 open incidents" and
  "0 ownerless" are constants, not measurements. Per-agent enrichment is a Batch 3 item.
- **Real AWS agent descriptions wired in; the "guardrail is free" claim was wrong (2026-09-08)**: both
  discovery calls already return the agent's own description at no extra API cost
  (`ListAgents` → `agentSummaries[].description`, `ListAgentRuntimes` → `agentRuntimes[].description`), and
  `discoveredAgentToAgent` was discarding it in favour of a sentence the mapper wrote itself — every classic
  agent read **"AWS Bedrock Agent (live)"**, which describes the platform, not the agent, while looking like
  recorded metadata. `DiscoveredAgent.description` now carries it through verbatim; measured on the reference
  account **13 of 36** agents have one (5 of 7 Bedrock Agents, 8 of 29 AgentCore runtimes — of those 8, 5 are
  auto-generated `"AgentCore Runtime: <name>"`, passed through anyway because what AWS holds is the accurate
  answer). Agents with none now read "No description recorded on this …" rather than the invented sentence.
  **Correcting the deep-audit's #19**: it lists `guardrailConfiguration` as another free field from
  `ListAgents`. It is not returned at all — **0 of 7** summaries carried it when measured. An agent's
  guardrail binding needs a per-agent `GetAgent` call, so it is not zero-cost and is deliberately not
  surfaced. #19 is a duo, not a trio.
  Also corrected in the same mapper: `businessPurpose` was `"Discovered from Bedrock AgentCore in the
  connected account"` — provenance, not a purpose — and the drawer renders it under a **Business Purpose**
  heading, so it answered a question nobody had answered. It now states the absence; the provenance it
  carried is already on screen via the Live badge and the framework field.
- **The whole account's invocation total was shown on every agent row (2026-09-08)**:
  `modelMetricsByKeyword` carried a `map.set('bedrock', { invocations: total_invocations })` entry, commented
  as a "whole-fleet fallback for agents with no specific model". But every live discovered agent is mapped
  with `model: 'bedrock'` (`discoveredAgentToAgent`), so that fallback put the **entire account's**
  invocation count into the per-agent Invocations column of each one. With 36 discovered agents and only 3
  emitting real AgentCore telemetry, **33 rows all read 6,918** — the same figure repeated down a per-agent
  column, which reads as a measurement. The tooltip mislabelled it a second way, calling a cross-model fleet
  total "invocations for the bedrock model". The entry is removed, so those agents fall through to the
  "not measured" marker the cell already had (classic Bedrock Agents publish nothing to
  `AWS/Bedrock-AgentCore`), and the remaining model-level tooltip now says explicitly that it is not the
  agent's own figure. Verified on the running app: 0 rows show 6,918; the 3 agents with real telemetry show
  46 / 14 / 12 labelled `per-agent`; the rest show `—`. Per-keyword model entries are kept — those are a real
  model-level figure for an agent pinned to a specific model, and the cell labels them `~<model>`.
- **Hero KPI row layout (2026-09-08)**: the seven headline KPIs sat in a `lg:grid-cols-6` grid, so one card
  wrapped onto a second row, and each card's provenance badge shared the label row (`flex items-center
  gap-1.5`) — which forced "Total Agents", "In Production" and "Review Needed" to wrap mid-label. Now
  `lg:grid-cols-7` with the badge moved to the foot of the card under `mt-auto`, so badges bottom-align
  across the row even though the `sub` strings wrap to different heights. Same treatment applied to the two
  badge-carrying cards in the Providers tab, where the inline badge was breaking "AWS Monthly Cost" across
  two lines.
- **Agent 360 drawer was dead for every live agent (2026-09-08)**: `AgentDrawer` ignored the row it was
  opened from and re-looked-up the agent with `getAgentById(agentId)`, which searches the seeded
  `AGENT_REGISTRY` array only — not even `EXTERNAL_AGENTS`. Live ids are `live-`/`frontier-` prefixed and
  exist in no seeded array, so the lookup returned `undefined`, `open={!!agent}` was `false`, and clicking
  any of the **36 live rows out of 53** did nothing: no drawer, no error, no explanation. The 17 demo rows
  opened normally, which is why it read as working. The registry now resolves the row from `allAgents` (the
  same list the table renders) and passes it in, so anything clickable opens.
  Fixing only the lookup would have been worse than the dead click, because the live mappers fill what AWS
  cannot attribute per agent with placeholder constants that the panel rendered as fact: `scopeLevel: 3`
  became a prominent **L3 Supervised** autonomy classification, `approvalState: 'approved'` an emerald
  **Approved** governance chip, `rateLimit: { rpm: 100, tpm: 50000 }` an invented throttle, all-zero
  `metrics` a **0 invocations / 0% errors / 0ms / $0** agent — with `errorRate: 0` painted *emerald* by the
  `< 2%` tone rule — and `incidents: { count90d: 0 }` a verified-clean **"0 in last 90 days"**. Each is now
  gated on `isDemo === false` and renders `—` or a note saying what is missing and why.
  Three sections that were hidden when empty (Reliability, Alignment Drift, OWASP Agentic Threats) now render
  an explicit unmeasured note for live agents: a hidden reliability panel reads as an agent nobody has had
  trouble with. The threat profile is **suppressed rather than shown** for live agents because every input to
  `deriveAgentThreatProfile` — autonomy scope, tool inventory, data access, A2A edges, guardrail binding — is a
  placeholder or an empty array, so the derived profile would assess the placeholders, not the agent.
  A stale `?agent=` id now renders an explicit "Agent not found" panel instead of silently doing nothing.
  Verified in a browser on all three paths: a live row (all fields gated), a demo row (unchanged — L3
  Supervised, 45,200 invocations, 3 tools, A2A callee name, reliability and threats all still render, zero
  unmeasured notes leaked), and a nonexistent id.
- **Route**: `/govern/agents`
- **Core Pillar**: See It

### Agentic Fleet
- **Purpose**: Fleet-wide governance and KPIs across your entire agent ecosystem. Monitor health, performance, and compliance status for all deployed agents.
- **Key Features**:
  - Fleet health dashboard (agent count, healthy %, alerts)
  - Performance metrics by agent
  - Compliance status aggregation
  - Scale view for large fleets (10k+ agents)
- **Live Data**: AVA deployments API, AWS CloudWatch agent metrics, the resource-tag coverage scan
  (`GET /governance/resource-tags`), and live Bedrock guardrail telemetry
- **Posture pillars are real ratios (Wave-4)**: the `registry` and `access` maturity pillars were **saturated
  formulas** under a Live badge that named them — registry pinned at 90% for any fleet of 20 agents or more,
  access at 100% for 4 or more guardrails — so neither could move with the fleet no matter what changed. Both
  are now coverage ratios over the scanned AI estate: registry 90% → **49%** (29/59 resources carry a
  governance tag) and access 100% → **25%** (15/59 carry a scope tag). `security` was already a real ratio
  (implemented/total controls). The badge strings are derived from the pillar key sets rather than hardcoded,
  so the Live badge can only name pillars that are genuinely live and cannot desync from the lists after a
  change.
  - **Only three of the five pillars are measurements.** `visualization` and `interoperability` remain
    **boolean gates that emit arbitrary magic numbers** — `useCases.length > 0 ? 80 : 40` and
    `guardrailsActive > 0 ? 70 : 30`. The inputs are real counts, but 80/40 and 70/30 are invented scale
    points, so a change from 30 to 70 records only that a count crossed zero, not that interoperability
    improved by 40 points. Both are excluded from `livePillars` and declared through
    `illustrativePillars={['visualization', 'interoperability']}`, and the headline posture `score` is the
    real control ratio rather than an average across all five — so the arbitrary values never leak into a
    Live-badged figure. Converting them to genuine ratios needs a denominator neither currently has.
- **One guardrail vocabulary (Wave-4)**: the page used to report "0 guardrails" and "7 healthy" at the same
  time. `guardrailsApi.list()` returns AVA-managed guardrail *templates* (currently empty) while guardrail
  *telemetry* reports 7 READY Bedrock guardrails, and three surfaces read the wrong one — including
  `AgentChainVisualization`, which rendered chains as **"unprotected"** despite 7 live guardrails. Every
  user-facing "guardrails" figure now uses the telemetry count; the template list is relabelled
  "AVA-Managed Templates" and its counters "template calls", so the two are no longer mistaken for each other.
- **Route**: `/govern/fleet`
- **Core Pillar**: See It

### Model Management
- **Purpose**: Model registry, lifecycle management, evaluations, monitoring, and LLM-specific quality patterns. Track risk tiers, validation status, and cost per model.
- **Key Features**:
  - Live Bedrock model catalog
  - Model lifecycle stages (development, staging, production, deprecated)
  - Risk tier classification (1-4)
  - Model evaluations and benchmarks
  - Cost-per-model tracking
  - **LLM Monitoring Patterns** (NEW): Guidance for LLM output quality monitoring
  - **Model Lineage** (NEW): Live SageMaker ML Lineage graph (artifacts, contexts, associations) — ~31 entities from a seeded training->model->endpoint pipeline
  - **Data Quality Drift** (NEW): Live SageMaker Model Monitor DATA_QUALITY drift read from S3 via an on-demand analyzer (Model Monitor scheduling is in AWS maintenance mode)
  - **Availability & Routing** (NEW): Foundation-model availability plus live cross-region inference profiles and intelligent prompt routers
  - **RAG Evaluations** (NEW): Live Bedrock RAG (Knowledge Base) evaluation jobs with real per-metric mean scores from S3
- **Tabs**: Catalog, Operations (includes LLM Patterns sub-tab), Evaluations, Availability & Routing, Lifecycle, Cost
- **Live Data**: AWS Bedrock `ListFoundationModels`, CloudWatch model metrics, Cost Explorer, Bedrock Guardrails, SageMaker ML Lineage (`ListArtifacts`/`ListContexts`/`ListAssociations`, live source `sagemaker-lineage`, ~31 entities from a seeded pipeline); SageMaker Model Monitor data-quality drift (`governSageMakerApi.modelMonitor()`, `GET /govern/sagemaker/model-monitor`, on-demand analyzer reading baseline constraints + monitor-results from S3); Bedrock inference profiles (`governModelsApi.inferenceProfiles()`, `bedrock-list-inference-profiles`) and prompt routers (`governModelsApi.promptRouters()`, `bedrock-list-prompt-routers`); Bedrock RAG evaluation jobs and S3-parsed scores (`governEvalsApi.jobs()`/`scores()`)
- **Partial Live**: Model catalog, runtime metrics, guardrails, SageMaker lineage, inference profiles, and prompt routers are live; risk tiers and attestation are illustrative. RAG evaluations are live at the job + per-metric-mean level (real `ListEvaluationJobs` filtered to `RagEvaluation`, plus S3 scores), while the per-query RAG "studio" drill-down remains illustrative (Mock) because `scores()` returns aggregated means only; the `ModelEvaluations` embed is unchanged with its sample jobs relabeled illustrative. SageMaker Model Monitor **data-quality drift is now live** via an on-demand analyzer reading baseline vs monitor-results from S3 (Model Monitor *scheduling* is in AWS maintenance mode, so drift comes from the analyzer, not a live schedule); the other model KPIs (safety, hallucination) remain Mock. Clarify SHAP / LIME / Anchor attributions **stay Mock because SageMaker Clarify processing is in AWS maintenance mode** (unavailable to new customers) — a platform block, not a wiring gap; the illustrative SHAP carries an honest note. The previously fabricated ML-SBOM differential-privacy block (DP-SGD/PATE/epsilon-delta) has been removed.
- **Every unmatched catalog model was silently classified Tier 3 (2026-09-08)**: the live-catalog merge in
  `ModelRegistry`, `ModelComparison` and `ModelGovernance` filled governance metadata from a seeded `MODELS`
  match, with literal fallbacks behind an otherwise-correct `catalog?.live` gate — the pattern §9 calls
  "literal fallbacks behind correct gates", which survive review because the `.live` check above them is right.
  `tier: mockMatch?.tier ?? 'Tier 3'` assigned **41 of the 50** rendered models the *most permissive* tier in
  the scheme, rendered emerald and matching the Tier 3 filter as though someone had reviewed the model and
  judged it low risk. `evalScore: ?? 75` asserted an evaluation result for models never evaluated, and 75
  falls in the amber band of the tone rule, so it read as a real middling score. Both are now `null`,
  rendering an **Untiered** chip and `—`.
  The measurable consequence was in the KPI: *Avg Eval Score* divided by the whole catalog while counting each
  unevaluated model as 75, so it read **76** when 41 of the 50 inputs were the constant. It now averages only
  scored models and discloses the denominator: **82, "9 of 50 evaluated"**.
  `ModelComparison`'s **Recommendation** weights eval quality at 40%, so the constant was driving which model
  it recommended; it now ranks only models with a real score and states how many it excluded and why. Also
  fixed there: `status: ?? 'Production'` asserted a lifecycle state for a model that had only ever been listed
  in the catalog (`ModelRegistry` correctly derives that field from real invocation counts).
- **Route**: `/govern/models`
- **Core Pillar**: See It

### LLM Monitoring Patterns (Model Management sub-tab)
- **Purpose**: Guidance for monitoring LLM output quality. Traditional ML monitoring (Model Monitor) doesn't transfer to LLM use cases.
- **Key Features**:
  - 8 quality dimensions: groundedness, relevance, coherence, harmful_rate, refusal_rate, latency_p99, tokens_per_response, citation_accuracy
  - Live status from existing Bedrock Guardrails (7 READY in this account per live guardrail telemetry; the
    AVA-managed template list is a different, currently empty, source — see Agentic Fleet)
  - Current metric values from CloudWatch (AWS/Bedrock namespace)
  - CloudWatch dashboard deployment (one-click)
  - CloudWatch alarm creation for quality thresholds
  - Educational content: 5 tabs covering Overview, Metrics, CloudWatch Setup, Alarms, Best Practices
- **Live Data**: AWS Bedrock Guardrails, CloudWatch AWS/Bedrock metrics, live `AVA/LLMQuality` derived metrics
- **Custom Metrics Namespace**: `AVA/LLMQuality` — now populated **live** by a backend background producer (`core/llm_quality_producer.py`, started at app startup, interval `GOVERN_LLM_QUALITY_INTERVAL`, default 300s) that derives quality signals from live telemetry (guardrails + invocation logs + Bedrock evals) and publishes them, flipping the AI Quality dashboard (`AIQualityMonitor`) from Mock to Live. The metrics are a governance-grade **derived proxy**, not a direct per-response measurement: harmful_rate (guardrail `ContentPolicy`), groundedness (guardrail `ContextualGrounding` or Bedrock eval scores when present), refusal_rate + tokens_per_response (invocation-safety); latency is sourced by the read path from `AWS/Bedrock`. Eval-quality dimensions are skipped when completed jobs lack those metrics, and each dimension is published only when its underlying signal is genuinely live that cycle. Publish plumbing (`POST /govern/llm-quality/metrics`) is unchanged.
- **Route**: `/govern/models` → Operations tab → LLM Patterns sub-tab

### Shadow AI
- **Purpose**: Discover unapproved agents, models, tools, and API keys before they become incidents. Track governed-vs-shadow coverage.
- **Key Features**:
  - Unapproved user detection
  - Unknown tool discovery
  - Unapproved model detection
  - Coverage tracking (governed vs shadow)
  - Onboarding workflow for discovered assets
- **Live Data**: AVA developer AI API over AWS CloudTrail plus Bedrock model-invocation logs (source
  `cloudtrail+bedrock-invocation-logs`) — the same measured token/cost pipeline described under Developer AI
  Usage, so the two surfaces cannot disagree about what a shadow identity consumed
- **Top offenders are now actually the top offenders (Wave-4)**: `unapproved_users` was assembled in insertion
  order and then truncated at 20, so the heaviest identities were the ones most likely to be dropped from a
  list presented as "top offenders". The list is now weight-sorted **before** truncation.
- **Measured, not assumed (Wave-4)**: per-identity token counts come from Bedrock invocation logs (they were a
  hardcoded `+= 1000`) and per-model cost from measured tokens times per-model rates (it was a flat `$0.01`
  per call). An unrated model now returns `null` and is named in the response `note` instead of being priced
  at a neighbouring tier.
- **Route**: `/govern/shadow-ai`

### Risk Management
- **Purpose**: Complete risk register with heatmaps, assessments, controls library, and issue tracking. Aligned to NIST AI RMF and SR 26-2.
- **Key Features**:
  - Risk register with 10 categories
  - Interactive risk heatmap (likelihood x impact)
  - Controls library (25+ controls)
  - Issue tracking and remediation
  - Third-party risk management (TPRM tab)
  - HRAIS assessment integration
  - **Vendor IAM Access** (NEW): Real IAM permissions audit for AI vendors (`risk/VendorIAMAccess.tsx`)
  - **AWS Security Posture + Inspector2 Vulnerabilities** (NEW): live GuardDuty / Macie / Inspector / IAM Access Analyzer rollup with an Inspector2 CVE detail panel (`risk/SecurityPostureCard.tsx`, on the Dashboard + Real-Time Monitoring views)
- **Live Data**: AWS Security Hub findings, AVA use case risks, IAM + IAM Access Analyzer vendor access (`governIamApi.vendorAccess` → `GET /govern/iam/vendor-access/{vendor_id}`), AWS security posture + Inspector2 vulnerabilities (`governSecurityApi.posture()` / `governSecurityApi.vulnerabilities()` → `GET /govern/security/vulnerabilities`, source `inspector2`: ~100 findings [5 CRITICAL / 33 HIGH], ~180 covered resources, real CVEs + fix-availability)
- **Partial Live**: Security findings, vendor IAM access, and Inspector2 vulnerabilities are live; controls and issues are illustrative
- **Data-honesty fix**: IAM Access Analyzer severity now uses the v1 `ListFindings` API so the `isPublic` flag is available — public external-access findings are correctly classified HIGH instead of always MEDIUM
- **Concentration risk is per-model attribution (Wave-4)**: the concentration calculation assigned a provider's
  entire model footprint to *every* capability, multi-counting any vendor that spans capabilities and inflating
  every denominator. Attribution is now per model from the catalog's real `output_modalities`, which corrects
  the capability denominators: llm 128 → **91**, embeddings 48 → **15**. A fabricated `infrastructure` bucket
  was deleted — it reported Amazon at "83% critical" for a modality that does not exist. The single fake alert
  ("AWS 100%") became two real ones, the strongest being **Stability AI supplying 93% of image models
  (13 of 14)**, and a `MIN_POPULATION_FOR_SEVERITY = 10` floor stops a 6-of-6 demo row from scoring
  "100% critical" off a population too small to mean anything.
- **No invented inventory on the error path (Wave-4)**: when the model catalog call failed, the concentration
  card used to invent 5 models (`Anthropic: 3`, `Amazon: 2`) — the exact defect class this audit exists to
  remove, hiding in an error path where it would only ever be seen during an outage. It now renders an
  explicit "Model catalog unavailable" state.
- **Route**: `/govern/risk`

### AI Safety
- **Purpose**: Capability safety and assurance for autonomous AI. Organized on AWS's 8 Responsible-AI dimensions.
- **Key Features**:
  - RAI Coverage Rubric (8 dimensions: Fairness, Explainability, Privacy/Security, Safety, Controllability, Veracity/Robustness, Governance, Transparency)
  - Frontier capability thresholds
  - MAESTRO threat modeling
  - Safety cases documentation
  - Incident management
  - Red-team evaluation pipeline
- **Sub-routes**:
  - `/govern/safety/capabilities` - Frontier Thresholds
  - `/govern/safety/threat-modeling` - MAESTRO
  - `/govern/safety/safety-cases` - Safety Cases
  - `/govern/safety/incidents` - Incident Management
  - `/govern/safety/evals` - Safety Evaluations
  - `/govern/safety/redteam-pipeline` - Red Team Pipeline
  - `/govern/safety/runtime` - Runtime Safety Controls
- **Live Data**: Agent registry guardrail coverage, incident counts
- **Route**: `/govern/safety`

### Prompt Governance
- **Purpose**: Full prompt compliance pipeline: pre-invocation analysis, guardrail enforcement, grounding verification, reasoning trace analysis, and policy violation mapping.
- **Key Features**:
  - Pre-invocation PII/PHI/PCI detection
  - Guardrail enforcement monitoring
  - Grounding verification (RAG hallucination detection)
  - Reasoning trace analysis
  - Policy violation mapping to frameworks
  - **Per-Invocation Telemetry** (NEW): Metadata-only per-invocation table (`LivePromptTelemetry.tsx`) rendered below the aggregates
- **Live Data**: AWS Bedrock Guardrails, CloudWatch guardrail metrics, Bedrock model-invocation logs via CloudWatch Logs Insights (`GET /govern/invocation-safety/invocations`, live source `bedrock-invocation-logs`)
- **Data Honesty**: The per-invocation feed returns metadata only (timestamp, model, operation, stop reason, token counts, guardrail action) and never prompt or response content, by design
- **An outage was labelled `source="mock"` (2026-09-08)**: the per-invocation path reported `source="mock"`
  on both of its degraded branches — invocation logging not enabled, and CloudWatch Logs unreachable or
  `logs:StartQuery` denied — but those responses carry **zero records**. Calling an empty payload "mock"
  claims there is illustrative data to look at when the truth is that nothing could be read; the aggregate
  path 15 lines above already used a reason-shaped `source="unavailable-fallback"` for the same class of
  condition. Now `logging-disabled` and `unavailable-fallback` respectively, with the merged route reporting
  `unavailable-fallback` instead of `mock` (per-region reasons stay in `note` / `regions`).
  Verified by driving both branches in-process: each returns `records=0`, which is what made "mock" wrong.
  The live path is unaffected — this account returns 100 records under
  `bedrock-invocation-logs (1 region(s))`.
  **Deliberately not changed**: `govern_aidlc_service`, `govern_iam_service` and `govern_policy_drift_service`
  also use `source="mock"`, but each returns a genuinely populated illustrative payload, so the label is
  accurate there. The distinction to preserve is *empty vs illustrative*, not *live vs not-live*.
- **Route**: `/govern/prompt-governance`
- **Core Pillar**: Govern It

### Developer AI Usage
- **Purpose**: Monitor developer AI tool consumption (tokens, cost), detect spend anomalies and runaway loops, and identify shadow AI usage.
- **Key Features**:
  - Per-user token/cost tracking
  - Spend anomaly detection
  - Runaway loop identification
  - Shadow AI user detection
  - Tool breakdown (Claude Code, Copilot, etc.)
- **Live Data**: AVA developer AI API over AWS CloudTrail plus Bedrock model-invocation logs read with
  CloudWatch Logs Insights (source `cloudtrail+bedrock-invocation-logs`)
- **Measured tokens and cost (Wave-4)**: two fabrications were removed. Per-identity token counts were a
  hardcoded `+= 1000` per event; they now come from real Bedrock invocation-log Logs Insights queries, with the
  log group resolved dynamically from `GetModelInvocationLoggingConfiguration` rather than hardcoded, so the
  query follows the account's actual logging configuration. Per-model cost was a flat `$0.01` per call; it is
  now measured tokens times per-model per-1K rates. Live: 0 events / $0.00 → **2,280 events / $11.38**.
- **The `default` rate was deleted, on purpose (Wave-4)**: a fallback rate silently priced any unrated model at
  the Sonnet tier — `claude-fable-5-1` was mispriced at roughly $3.37 and now prices at **$11.24**. An unrated
  model now returns `null` for cost and is named in the `note`, because a plausible price is worse than an
  admitted gap: the plausible price gets budgeted against.
- **Reconciled against an independent source**: the token sums (input 80,509 / output 235,593) match the
  `/invocation-safety/telemetry` endpoint **exactly**. That endpoint derives its figures independently, so the
  agreement is evidence — unlike the earlier round of this fix, where making four cost views agree with each
  other simply hid that all four ran off the same fabricated token estimate.
- **AI Tool Provenance (`/govern/dev-tools` → Detection, `GET /govern/developer-ai/provenance`)**: defence in
  depth for agentic coding. Two independent classifications per observed caller/tool pair, from evidence only,
  each with an explicit unknown. Classification logic is pure and unit-tested in
  `backend/src/core/ai_tool_provenance.py` (41 tests, mutation-verified).
  - **`call_path`**: `bedrock` (proven by a CloudTrail Bedrock event) · `public_api` (proven by a DNS/proxy match
    on a provider domain) · `unknown`. **`public_api` is unreachable without Route 53 Resolver query logging** —
    the classifier takes DNS evidence as its only route to that value, so it cannot be inferred. The consequence
    is stated in the UI: with no query logging, a tool calling `api.anthropic.com` produces **no record at all**,
    so it is absent from the counts rather than counted as `unknown`. A zero there is not evidence of absence.
  - **`install_provenance`**: `managed` (host under endpoint management; where package inventory exists, the tool
    is in it) · `managed_runtime` (AWS-managed serverless environment — Lambda, Fargate, AgentCore) ·
    `self_installed` (inventory was read for that host and the tool is absent from it) · `unknown_host`.
    `unknown_host` is deliberately **not** `self_installed`: "we cannot see this host" and "hand-installed on a
    host we can see" are different facts. `managed_runtime` exists for the same reason in reverse — filing a
    Lambda under `unknown_host` counts governed infrastructure as a visibility gap.
  - **`tool_class`** separates `coding_tool` from `sdk_caller`. This fixed a live false positive: the previous
    detector took `user_agent.split("/")[0]` and surfaced a production workload's `Boto3/1.42.97` in the
    Local Agent Discovery panel as a **high-risk** local agent. It is now classed as an SDK caller in an AWS
    Lambda runtime and raises nothing.
  - **Coverage denominators ship with every count** and render *above* the findings: managed hosts / known hosts,
    VPCs with DNS logging / VPCs, calls classified / observed, managed hosts with package inventory / managed
    hosts. `pct` is `null` when the denominator is 0 and renders as "no denominator", never 0% — a failing
    control and nothing to control are opposite readings.
  - **`blind_spots` is backend prose rendered verbatim.** One of them defuses the most dangerous single reading
    in the response: a complete endpoint ratio printed beside an unattributed caller. That ratio counts EC2
    instances, and developer machines are not EC2, so 100% is not coverage of the hosts that made the calls.
  - **Measured on the live account**: 52 calls / 1 caller-tool pair over 7 days; `bedrock` 1, `public_api` 0,
    `unknown` 0; endpoint 2/2 hosts (100%), package inventory 2/2, **DNS 0/5 VPCs (0%)**. The `AWS:Application`
    inventory is real (Amazon Linux RPMs, captured same-day), so tool-level install provenance works today
    without new infrastructure — the two managed hosts are servers with no AI tooling on them.
  - **Not built, and deliberately so**: no network egress inference, and nothing that covers a developer laptop
    off the corporate network. That needs an endpoint agent or MDM, and the panel says so instead of implying
    coverage. Next capability jump is Route 53 Resolver query logging, which makes `public_api` real; that needs
    AWS resources created, so it belongs in the IAM template and Terraform, not clicked in.
- **Honest truncation**: CloudTrail lookups now paginate with a real `NextToken` (they were capped at the first
  50 events, which silently understated every per-identity total) under explicit page and time budgets, and
  emit a truncation note when a budget is hit rather than presenting a partial window as a complete one.
- **Route**: `/govern/developer-ai`

### Compliance Center
- **Purpose**: Interactive checklists for regulatory frameworks. Track control status, evidence, and gaps.
- **Key Features**:
  - 14 compliance frameworks / 281 controls (measured from `GET /govern/compliance/posture`; the
    Governance Assessment wizard's `REGULATORY_FRAMEWORKS` is a **different, 11-entry** inventory —
    only 7 ids appear in both)
  - Interactive control checklists with checkboxes
  - Evidence attachment and links
  - Notes per control
  - Progress tracking with visual indicators
  - Revalidation tracking
  - Attestation management
  - Governance Program Builder (6-phase wizard)
  - **Preventive Controls (SCPs)** (NEW): live AWS Organizations Service Control Policies card
  - **KMS Encryption-at-Rest Evidence** (NEW): live KMS key inventory in the AI Security Controls panel
  - **AWS Config Rules** (NEW): live per-rule AWS Config compliance card in the Security Hub tab (~710 rules)
- **Supported Frameworks**:
  - SR 26-2 (NY DFS AI Regulation)
  - NIST AI RMF
  - EU AI Act
  - CRI FS AI RMF
  - OSFI E-23
  - ISO 42001
  - OWASP LLM Top 10
  - MITRE ATLAS
  - NAIC AI Systems Evaluation Tool
  - FINOS AIR
  - And more...
- **Live Data**: AWS Config rule compliance; live control evaluation (`governControlsApi.evaluate()` via
  `useControlEvaluation`) overlaid on the framework deep-dive views for OWASP LLM Top 10, FINOS AIR, NAIC AI,
  CRI FS AI RMF, EU AI Act, and OSFI E-23. Controls with an `autoDetectSource` are auto-evaluated from their AWS
  source (per-source `live` gating + latency); NIST AI RMF and MITRE ATLAS remain static/attestation-only.
- **Governance Posture (NEW)**: live AWS Organizations Service Control Policies (`governScpApi.policies()`, `GET /govern/governance/scp`, source `organizations:...`) shown as a "Preventive Controls (SCPs)" card in `ComplianceCenter.tsx`, and a live KMS encryption-at-rest key inventory (`governKmsApi.inventory()`, `GET /govern/governance/kms`, source `kms:...`) in `compliance/AISecurityControlsPanel.tsx` (~20 keys: 10 customer-managed with rotation status, 10 AWS-managed). Both are honest about access limits — the SCP card shows a note when only the AWS-managed `FullAWSAccess` default exists or org access is denied, and the KMS card shows a note when `kms:ListKeys` is not granted.
- **AWS Config Rules (NEW)**: the Security Hub tab's `AwsConfigRulesCard` renders live per-rule AWS Config compliance via `governControlsApi.configRules()` (`GET /govern/controls/config-rules`, source `aws-config`) — ~710 real Config rules bucketed into compliant / non-compliant / not-applicable / insufficient-data with summary tiles; honest note + `MockDataBadge` when Config is off, `config:Describe*` is denied, or no rules exist.
- **Partial Live**: Config compliance (rules + auto-detected controls) is live; framework attestations remain manually managed (their read/write endpoints for `osfi-e23`, `naic-ai`, `colorado-ai-act`, `mitre-atlas`, and `nist-genai-profile` were 404ing and are now registered in the backend)
- **Embedded children dropped their badges (2026-09-08)**: twelve views ran `if (embedded) return body;`
  *before* their `GovernPageLayout badge={...}`, so the badge existed only on the standalone route —
  and for most of them, `ComplianceCenter` rendering them `embedded` is the *only* call site. Because
  `GovernPageLayout` stamps a page-level badge on every Govern page, an unbadged embedded child is not
  neutral: it inherits the header's claim, and `compliancePageBadge` reads
  "Live attestations from the control-plane backend" whenever `apiLive` is true. Each view now hoists its
  badge to a `const badge` and renders it in both modes. Fixed in `NistAiRmfView`, `CriAiRmfView`,
  `EuAiActView`, `FinosAirView`, `Iso42001View`, `MitreAtlasView`, `NaicAiView`, `OsfiE23View`,
  `OwaspLlmView`, `Sr26MappingView`, `ConformanceView`, and `compliance/UnfairDiscriminationTesting`.
  The last is the one that mattered most: its only badge sat in a hand-rolled standalone header, and
  `NaicAiView.tsx:560` renders it `embedded`, so its illustrative four-fifths disparate-impact ratios —
  which feed an **Export for Filing** NAIC submission — rendered under NAIC's live control-evaluation
  badge. All twelve were render-verified in a browser at their real call sites.
  Two views the audit listed were already correct and needed no change: `InvestigationQueue` renders its
  badge inside the `embedded` branch, and `ConformityAssessmentWorkflow` keeps its badge inside `content`.
- **`POST /govern/regions/govern` accepted any string as a region (2026-09-08)**: `regions: List[str]` had no
  validation, so whatever was posted was persisted straight to the governed-region config file. The cost is not
  a missing validation error — it is that **every merged Govern read then fans out to a region that cannot
  answer**. Those reads are wall-clock capped rather than hanging, but each one degrades, and the operator sees
  unreachable surfaces across the whole module with nothing pointing back to the typo that caused it. Region
  ids are now checked against the account's enabled regions (`ec2:DescribeRegions`, with the Bedrock-region
  fallback the discovery service already uses) and rejected with a 400 that lists both the unknown ids and the
  valid set.
  `mode` was a bare `str`, and `set_governed_regions` treats anything that is not exactly `'replace'` as
  `'add'`. So `"Replace"` silently **widened** governance when the operator meant to narrow it — the dangerous
  direction. It is now `Literal["add", "replace"]`, rejected with a 422.
  Verified against the running backend: typo region → 400 naming it plus the 17 enabled regions; `mode:
  "Replace"` → 422 "Input should be 'add' or 'replace'"; a valid call → 200; and the governed set was
  unchanged by the tests.
- **The guardrail sync check reported "in sync" while 4 rows pointed at nothing (2026-09-08)**:
  `GET /guardrails/aws-summary` computed drift in one direction only — `untracked = aws_ids - tracked_ids`,
  i.e. AWS guardrails with no template row — and set `in_sync` from that alone. The opposite direction, a
  template row whose guardrail no longer exists in AWS, was never computed. Measured on the reference account
  the response read **`aws_total: 7`, `tracked_total: 11`, `untracked_in_aws: 0`, `in_sync: true`** — the 7 and
  the 11 sitting in the same payload contradicting the flag.
  Four rows are stale, all still marked `status: active` (the same four the deep audit found). Their ids are
  not quoted here — they name live guardrails in the reference account, and the endpoint returns them as
  `orphaned_ids` at runtime, which is the only place an id stays accurate. Anything counting template rows therefore
  over-reports guardrail enforcement by four. The endpoint now returns `orphaned_templates`, `orphaned_ids` and
  a `drift_note`, and `in_sync` requires **both** directions clean → now `false`.
  Note also that the guardrails are in `us-east-1`
  (`GOVERN_AWS_REGION`) while `AWS_REGION` is `us-east-2`: a first probe against `AWS_REGION` returned zero
  guardrails and would have implied all 11 rows were orphans. Always reconcile against the governed region.
- **Orphan reconciliation, added 2026-09-09**: `POST /api/v1/guardrails/reconcile-orphans` closes the drift
  above. The four rows are now `status: deleted` and `/aws-summary` reports `aws_total: 7`, `tracked_total: 7`,
  `closed_rows: 4`, `orphaned_templates: 0`, `in_sync: true`.
  - **`dry_run` defaults to `true`** and `require_role(Role.ADMIN)` gates it. The dry run reports the exact rows
    it would touch and mutates nothing.
  - **It makes no AWS call other than `ListGuardrails`.** The obvious route, `delete_template`, calls
    `_delete_bedrock_guardrail()` — **a real Bedrock delete**. For an orphan that throws and leaves the row
    `FAILED`, and against a mistyped id it would delete a *live* guardrail. `reconcile_orphans` only appends a
    status history entry and puts the row back, so the blast radius is one DynamoDB row.
  - **It aborts if `ListGuardrails` returns nothing**, because an empty list is indistinguishable from a
    permission error or a wrong-region client — exactly the failure that would have marked all 11 rows orphaned.
  - `/aws-summary` **excludes `deleted` rows from the comparison**, matching the reconciler. Without that the
    drift never clears: a closed row still carries its `guardrail_id`, so counting it as tracked reported the
    same orphan forever and made the endpoint look ineffective. It was written this way first and the flag
    stayed `false` after a successful run, which is how the mismatch surfaced. `closed_rows` is returned so the
    gap between `tracked_total` and the raw row count is explained rather than puzzling.
- **The guardrail listing behind both of the above read one page (2026-09-14)**: `ListGuardrails` was called as
  `maxResults=50` in `/aws-summary` and `maxResults=100` in `reconcile_orphans`, with no paging, against an API
  maximum of **1000**. Both requests are legal, so nothing was clamped and nothing warned; the count just
  silently stopped at the page size. Two consequences, and the second is worse than a wrong number:
  - `/aws-summary` **fabricates orphans**. `orphaned = tracked_ids - aws_ids`, so every guardrail past the
    truncation point is missing from `aws_ids`, its live row is reported as pointing at nothing, `in_sync` flips
    to `false`, and `drift_note` explains at length that enforcement is over-reported. All of it manufactured by
    the page size.
  - `reconcile_orphans` **writes** that difference: with `dry_run=false` it marks each row `DELETED`. The abort
    guard only fired on an *empty* result, which is the one failure mode a truncated read never has: a
    truncated read comes back full.
  Both now page through `core.aws_paging.paginate_bounded`, and the abort covers incompleteness of any kind
  (`truncated`, `timed_out`, `failed`), not just emptiness. `/aws-summary` gained `aws_total_is_floor` and
  `listing_note`; `aws_total` is now `null` rather than `0` when the listing *failed*, and `orphaned_templates`
  and `in_sync` are `null` rather than `0`/`false` when the listing did not complete, because an unread tail is
  indistinguishable from a deleted guardrail. `listing_note` is `null` when the walk reached the end, so a
  caveat appearing at all means something. `discover_aws_guardrails` was **not** the same defect, because it
  already threaded `nextToken` to completion, so only its page size moved to 1000.
  Covered by `tests/test_guardrail_aws_summary_paging.py` and `tests/test_guardrail_reconcile_paging.py`, whose
  load-bearing tests are the negative ones: a bound landing exactly on the real total must not abort and must
  not emit a caveat.
- **A random 24-hour trend was returned as live telemetry (2026-09-08)**: `useFleetHealth`'s `useAgentDetail`
  manufactured 24 hourly points from `Math.random()` — latency, errors and invocations all scaled by a random
  multiplier — and returned them with `source: 'live'` whenever the agent was live. Three problems: the series
  changed on every render, so any shape a viewer read into it was noise; noise was labelled measured; and
  random variation is *more* convincing than a static mock precisely because it looks like real telemetry. No
  component consumes `useAgentDetail` today, so nothing rendered it — removed anyway, because leaving a
  fabricated series in the returned object is how it gets rendered by whoever wires this up next. The comment
  records the CloudWatch `GetMetricData` call that would populate it for real.
  Swept the rest of the module for `Math.random()`: the remaining uses are inside clearly-labelled mock
  generators (`MOCK_24H_TREND`, `generateHealthHistory`/`generateIncidents`/`generateSLAs` feeding
  `MOCK_AGENTS`, and OpsMetrics' `// ─── Mock Data Generators ───` block) whose consumers badge Demo and whose
  fallback paths set `source: 'demo'`. Those are a demo-reproducibility wrinkle — the same demo agent shows
  different history each load — not an honesty defect, so they were left alone. `ControlTrends` had already
  been converted to deterministic values.
- **A fifth `Array.isArray` liveness gate, missed in the earlier pass (2026-09-08)**: `OpsOverview`'s
  `TrendSection` had `hasTrend = Array.isArray(data?.trend24h)` with `trendData = data?.trend24h || MOCK_24H_TREND`.
  `Array.isArray([])` is true and `[]` is truthy, so a payload carrying `trend24h: []` rendered
  **`LiveDataBadge source="CloudWatch"` over an empty chart**. The four gates in `ComplianceRiskSection` were
  corrected earlier in the same file; this one sits in a different component and was missed. Now requires
  content. Verified by intercepting the endpoint with `trend24h: []` — the header reads "24-Hour Trend · Demo".
  The file now has no `Array.isArray(data?.…)` liveness gates left.
- **Half the graded posture score was invented (2026-09-08)**: `govern_posture_score_service` assigned an
  arbitrary score to any dimension that assessed nothing, then divided by the **full** weight of all six:
  `audit_completeness` → 50 (0.20 weight), `validation_coverage` → 50 (0.15), `killswitch_ready` → 40 on its
  **exception** path (0.15), and `incident_response` → **100** for "no candidate incidents detected". Measured
  on the reference account, three of those had `items_assessed: 0`, so **50% of an A–F graded score came from
  dimensions that measured nothing** — and the kill-switch 40 was awarded when the readiness check *threw*.
  The `incident_response` 100 was its own error: "no candidates detected" is also what a broken detector looks
  like, so an empty window earned a perfect score.
  `DimensionScore.score` is now `Optional`; all four fabricated defaults return `None`; the overall score is a
  weighted mean over **measured dimensions only, renormalised**; and `PostureScore` gains
  `measured_weight_pct` + `unmeasured_dimensions`. The recommendations path no longer projects from an
  unmeasured baseline (`current_score`/`projected_score` are null there, with the reasoning stated), and the
  projected-score aggregate renormalises the same way.
  Measured before → after: **56.8 grade F → 66.7 grade D at 50% measured weight**. The UI shows
  **"Graded on 50% of the model — 3 dimensions not scored"** beside the grade, and unscored dimensions render
  `—` on a neutral slate bar — never a rose bar at 0, which would read as a measured total failure.
  Note the audit's framing of this one ("guards on `result.calculated_at` rather than `result.live`") was
  wrong: that line is a cache-stamp presence check, not a liveness gate, and is merely redundant since
  `calculated_at` is always set. The real defect was the scoring, found by querying the live endpoint.
- **The Compliance Evidence Chain reported SOC 2 evidence it had not collected (2026-09-08)**: the worst
  finding in this module. `govern_compliance_evidence_service` has 12 evidence collectors; **11 return
  hardcoded worked examples**, each stamped with a plausible `source` (e.g. `artifact_count_30d: 156` behind a
  `# In production, this would query the audit artifact store`). Only `_collect_killswitch_evidence` reads a
  real source. Every item nonetheless defaulted to `EvidenceStatus.COLLECTED`, and both coverage computations
  used `if valid_items: covered += 1` — so a named SOC 2 control was reported as evidenced because a literal
  existed. Measured on the running backend: **SOC 2 read 7/7 collected, 100% coverage**.
  Fixes at the source rather than the display:
  - `EvidenceStatus` gains **`ILLUSTRATIVE`**, distinct from `COLLECTED` because "collected" is the claim an
    auditor relies on.
  - `EvidenceItem.provenance` (`measured` | `illustrative`) defaults to **`illustrative`** deliberately — a new
    collector must opt in to claiming it measured something rather than inheriting a claim it has not earned.
  - The 11 literal collectors declare themselves illustrative; the kill-switch one declares `measured`.
  - A control is `COLLECTED` only when at least one item is `measured`; illustrative-only controls count as
    pending and are **excluded from `coverage_percentage`** in both `get_framework_coverage` and
    `generate_report`.
  - `_collect_killswitch_evidence` also hardcoded `data["test_result"] = "functional"`. Reading the kill
    switch's status is not exercising it, and an auditor reads "functional" as a test outcome. Now records
    `status_read_at` and `tested: false`.
  Result, verified end-to-end in the UI: **100% → 14.3%**, 6 controls showing an `illustrative` chip in slate
  (never emerald) and 1 genuinely collected.
- **Two `DevToolsGovernance` tabs had no provenance badge (2026-09-08)**: contrary to the deep audit's "26
  fabricated panels", this file is now largely well badged — 23 badge usages, most correctly gated on
  `costData?.live`, plus a `NOT_MEASURED` constant and a page badge whose detail text already says "a Live
  badge here does not cover them". The real gap was two tabs with zero badges between their start and the next
  one: **Inventory** (627 lines, rows entirely from `CODING_TOOL_INSTANCES` in mockData) and **Compliance**
  (394 lines). `policy-drift` was a false positive — it delegates to `PolicyDriftContent`, which owns its badge.
  Both now carry a badge; the Compliance one names the split rather than claiming either side, because its
  framework catalogue and control mappings genuinely are live while evidence collection mostly is not.
- **Control-plane rows asserted that AWS Bedrock was live (2026-09-08, latent)**: `useGuardrailMetrics`
  reported `updateSource('aws-bedrock', { status: 'live' })` when
  `telemetryRes?.live || activeGuardrails.length > 0 || newMetricsMap.size > 0`. The last two derive from
  `guardrailsApi.list()`, which reads guardrail **templates** out of the control plane's own DynamoDB table
  (`/api/v1/guardrails`) — the file's own comment says so. So rows in our database flipped the shared
  `aws-bedrock` source to live, and that source is marked **`critical: true`** in `DataSourceContext`, feeding
  the platform-wide "N/M live sources" indicator and every page badge that reads it. With Bedrock unreachable,
  11 template rows would still have asserted it was live. Now gated on `telemetryRes?.live` alone.
  Every sibling call already did this correctly — `AgentCorePostureCard` (`d?.live`), `DevToolsGovernance`
  (`harnesses?.live`), `HallucinationDetection` (`d.live`), `GovernanceCommandCenter`
  (`data.eval_jobs.live`). This was the lone outlier. **Latent today**: guardrail telemetry genuinely is live
  (`bedrock-guardrails+cloudwatch`), so the indicator is unchanged — verified still "All Systems Live".
- **Every live model borrowed the first seeded model's governance record (2026-09-08)**: `ModelComparison`
  resolved `MODEL_DETAILS[id] ?? MODEL_DETAILS[MODELS[0]?.id]`, commented "Fallback to first model's details
  for live models". So any live model without its own record displayed **model zero's** risk profile,
  inherent/residual scores and tiers, controls, MRM compliance, eval history, context window, pricing and
  revalidation status as its own — several compared models therefore showed identical risk figures.
  Worse than the display: the **Recommendation** weights `residualScore` at 30% and `avgCompliance` at 20%, so
  a borrowed record helped decide which model this screen recommends. The fallback is removed; every derived
  field is now `null` when the record is absent, `hasGovernanceRecord` records the state, and the
  recommendation ranks only models with all three weighted inputs real (90% of the weight), saying how many it
  excluded and why. The radar omits an unmeasured axis rather than plotting `0`, which would collapse the hull
  to the centre and read as a measured worst case.
- **The Security Hub severity chart described 10 findings, not the estate (2026-09-08)**:
  `useSecurityHubCompliance` set `allFindings = raw.top_findings` — a top-N **sample**, ten items on the
  reference account — and then counted severities out of it. That fed "Findings by Severity" under a
  `LiveDataBadge`, and set `totalFindings` to the sample's length, understating the estate by an order of
  magnitude. The API already returns `by_severity` computed over everything it scanned, and the hook was
  discarding it. Measured: the chart showed a distribution over 10 findings where the real breakdown is
  **CRITICAL 0 / HIGH 4 / MEDIUM 83 / LOW 113** over 200 scanned.
  Now prefers the server-side breakdown, falls back to counting the sample only for the AI-only filter (where
  no server breakdown exists) and flags that with `countFromSample`. `totalFindings` uses `raw.total`.
  `SeverityBreakdown.aiRelatedCount` became `number | null` and renders only when it counts the same
  population as `count` — the AI subset is knowable only for the sample, so showing it beside a
  server-side count put two different denominators side by side.
  The chart also carries a **Floor** marker: `truncated: true` and the API note say *"Counted the first 200
  active findings (scan limit 200); Security Hub has more, so these counts are floors"*. An unqualified
  distribution reads as the complete shape of the estate's risk.
- **Realistic SSN literals in demo data (2026-09-08)**: `PromptGovernance`'s invocation log rendered
  a `promptPreview` containing a literal nine-digit SSN verbatim, and `mockData.ts` carried the same digits in
  an example PII-leak prompt. Both are now masked (`***-**-****`). Two reasons, and the first is the
  substantive one: **a compliance log that retained the raw SSN would itself be the privacy incident the
  guardrail exists to prevent.** Bedrock Guardrails masks PII, so the masked form is what a correctly governed
  system actually records — this is more accurate, not less. Second, a literal `nnn-nn-nnnn` in the bundle
  trips DLP and secret scanners and reads as real customer data in a screenshot. The records still show
  `type: SSN` / `action: BLOCKED`, so the detection remains legible. `example.com` is RFC 2606 reserved and
  needs no change. Verified: zero SSN-shaped literals remain in the module.
- **A failed artifact fetch fabricated audit evidence (2026-09-08, latent)**: `HarnessAuditViewer` contains
  both the right pattern and the wrong one, 26 lines apart. The run-list `.catch` sets an honest `offline`
  state with the comment *"do NOT present MOCK_RUNS under a Live badge"*. The artifact-fetch `catch`
  immediately below did exactly that — `setRunArtifacts(... MOCK_ARTIFACTS)` on any error. The consequence went
  further than the screen: `handleExport` bundles that same artifacts array into a downloadable **"AVA Harness
  Audit Bundle v1.0"**, so an unreachable artifact store produced fabricated evidence that could leave the
  browser as audit material. The catch now records the failure per run, the UI states that artifacts could not
  be read, and **export is disabled for that run** — an audit bundle whose evidence section is silently empty
  is worse than no bundle. `MOCK_RUNS` and `MOCK_ARTIFACTS` are deleted; that catch was their last consumer, so
  this view now holds no fixtures at all.
  **Latent today**: `GET /govern/harness-audit/runs` returns `[]`, so the view renders its `empty` state and
  there is no run to expand. Verified in a browser: no page errors, no fixture ids on screen.
- **The `operations/` stub-twin imports are debt, NOT a UI-honesty defect (2026-09-08)**: the deep audit flags
  `OnCallCenter.tsx:19` and `ChangeManagement.tsx:21` importing the `useOpsLiveData` stubs instead of the real
  `useOperationsApi`, and suggests repointing them "activates ~10 findings at once". Investigated and **do not
  do this as an honesty fix**:
  - All four stub hooks return `live: false` permanently — `useOnCall` is `live: !!data` where `data` is always
    `null`, and the other three are `length > 0` on arrays that are never filled. Both components gate their
    page badge on that flag, so they correctly render `MockDataBadge` today. There is no user-visible defect.
  - Repointing would not surface live data either: `GET /operations/oncall/current` returns all-nulls with
    `live:false, source:"memory"` and the note *"Configure PAGERDUTY_API_KEY"*, and `GET /operations/changes`
    returns `{changes: [], total: 0, live: false}`. The components would go from "mock, badged Demo" to "empty,
    badged Demo".
  - The return shapes differ (`UseOnCallResult` vs `UseApiResult<OnCallResponse>`), so it is a component
    rewrite, not an import swap.
  The real blocker is upstream configuration, not the import. Worth doing when PagerDuty is configured or
  change records exist; pointless churn before then.
- **Model token rates reconciled onto one backend source; a dead 3x-wrong estimator deleted (2026-09-09)**:
  three per-1K rate tables disagreed by up to 3x on the same model (`claude-opus-5` was 0.015/0.075 in
  `govern_cost_service` and 0.005/0.025 in `govern_developer_ai_service`). Investigating turned up worse than
  drift.
  - **`_BEDROCK_PRICING`'s key matcher could never match anything, so all 10 rows were dead.** It stripped
    hyphens from the dict key but not from the model string, so `"nova-pro"` became `"novapro"` and failed the
    substring test in both directions. Simulated against the 11 model names `_model_from_usage_type` actually
    produces: **11 of 11 fell through to `default`**, so every token estimate in the product used one Sonnet
    rate regardless of model. Cross-checked live: Opus 5 cache_read $169.21 → 564,027,571 tokens, which is
    exactly `169.21 / 0.0003 × 1000`, the `default` cache_read rate.
  - **Its one UI consumer was arithmetically circular.** `EnhancedTokenEconomicsCard` computed
    `$/1K = dollars / ((dollars / rate × 1000) / 1000)`, which reduces to `rate`. "Cost / 1K output" therefore
    displayed exactly **$0.0150 on every account** regardless of spend. The code comment claimed this replaced
    an earlier self-referential computation — the circularity had moved, not gone.
  - **Both deleted rather than repaired.** Real per-model token counts come from CloudWatch, so nothing needed
    to be inferred from spend. `TokenCost.tokens` is now `Optional[int]` and always `None`; the field is kept so
    clients do not break, documented as "not reported here". Dollars are untouched and still measured.
  - **New `backend/src/core/model_pricing.py`** is the single forward-pricing source (measured tokens →
    dollars). `MODEL_COSTS` now delegates to it. 17 regression assertions cover the behaviours that matter.
  - **Fixed a live 3x mispricing.** Opus 4.5 and 4.8 fell past `claude-opus-5` into a bare `claude-opus` family
    key holding Claude-3-Opus rates (0.015/0.075 = the verified $15/$75 per 1M Claude 3 rate). Published Opus
    4.5 is $5/$25 per 1M.
  - **Fixed a live 15x mispricing.** The generic `"titan": 0.0003/0.0004` row matched no published Titan price
    and caught `amazon.titan-embed-text-v2:0`, overstating input 15x ($0.00002 published) while inventing an
    output rate for a model that emits no output tokens. Now `titan-embed` at 0.00002 with `output=None`.
    Verified live: 2,781 tokens now price at $5.6e-05, was $0.000834.
  - **Bare family keys removed entirely.** They cannot match Claude 3 ids anyway (`claude-opus` is not a
    substring of `claude-3-opus`), so their only effect was to catch *current*-generation models missing a
    specific entry and price them at legacy rates — the exact bug above. Era models are now keyed explicitly
    (`claude-3-opus`, `claude-3-5-sonnet`, …) and an unlisted model returns `None` → "cost unavailable".
    Caught while testing: my first draft of the new table returned `None` for real Claude 3 ids.
  - **Provenance is part of the data.** Current-generation Claude models are Marketplace-billed and their rates
    are **not published in machine-readable form** — verified: across all 11,621 `usagetype` values under
    service code `AmazonBedrock`, the only Anthropic entries are Claude 2.0, 2.1, 3 Haiku, 3 Sonnet and Instant.
    Model cards defer to the pricing page; the pricing page renders per-model tables client-side. So each rate
    carries `provenance` (`VERIFIED` with a named AWS source, or `BEST_KNOWN`) and figures resting on a
    `BEST_KNOWN` rate must be presented as estimates.
  - **Cache multipliers are provider-specific, not universal.** Anthropic: write 1.25x input, read 0.10x.
    Amazon Nova: write **$0.00 (not charged)**, read 0.25x. Stated explicitly per model, never derived.
  - **`modelPricing.ts` claimed to be "the single canonical source … everywhere else follows".** It was not —
    neither backend table read it. Its scope is now stated honestly (forecasting and planning, keyed by short
    fleet ids, some illustrative like `opus-4-7` which is not in the account), its values are reconciled with
    the backend, and it carries the same provenance tagging.
  - **Not absorbed, deliberately:** `gateway/litellm-config-local.yaml` is per-*token* (1000x unit difference)
    and is the only surface whose rates price real production spend, since LiteLLM computes cost from it. The
    dead `/api/v1/gateway/*` router and its DynamoDB `MODEL_CATALOG` fallback are a separate cleanup.
- **FinOps: cached tokens surfaced, cache dollars separated (2026-09-09)**: the ask was "show cached tokens".
  Cache token support already existed end-to-end — CloudWatch `CacheReadInputTokenCount` /
  `CacheWriteInputTokenCount` → `govern_models_service` → `client.ts` → `finops/TokenEconomics.tsx`. It rendered
  nothing because of the **window**: the tab requests month-to-date (day-of-month), and this account's cache
  activity stops 2026-08-26. Measured live: **0 cache tokens at 7/9/14 days, 494.8M read / 39.8M write at 30 days**
  (98.9% hit rate). Because the MTD window always starts on the 1st, that data could never re-enter it.
  - **The MTD window was left alone.** It exists so token counts and Cost Explorer MTD dollars cover the same
    period, which is what makes blended $/1k correct (a previous fixed-7-day token window over MTD spend was off
    by 4-7x). Widening it would have re-broken that. Instead a dedicated **Prompt Caching** panel takes its own
    7/14/30-day lookback, defaults to 30, and states which window it used plus an explicit "do not divide the
    token counts here by the dollars above".
  - **Cache WRITE is now rendered.** `fleet.cacheWrite` was computed and used only in a denominator and a
    boolean — never displayed. It is the dimension billed **above** the standard input rate, so it is the one
    that can make caching a net loss. Shown beside cache read, in amber not emerald, with an explicit
    read:write ratio (12.5x on the live fleet).
  - **Cache dollars separated in Cost Explorer.** `govern_cost_service` folded `-cache-read` and `-cache-write`
    usage types into the `input` bucket, so cache spend was unrecoverable — which is why the UI had to estimate
    it. Now emits `fresh_input_total` / `cache_read_total` / `cache_write_total` (additive to `input_total`, which
    is unchanged for existing consumers). On the live account that revealed **$446.79 of $462.01 "input" dollars
    were cache**, with cache write alone $187.81 — roughly a third of total Bedrock spend, previously invisible.
  - **Deleted the fabricated savings figure.** `estimatedCacheSavings` was
    `(cacheRead / (inputTokens + cacheRead)) * totalSpend * 0.9` — a token ratio multiplied by a dollar total,
    with a hardcoded model-agnostic discount. A saving is a
    counterfactual nothing here measures; measured cache spend replaced it. The dead per-row `cacheSavings`
    (`cacheReadTokens * 0.9`, never read) went with it.
  - **`absent → 0` fixed.** `int(b.get("CacheReadInputTokenCount", 0))` made "caching never requested" identical
    to "measured 0% hit rate". CloudWatch returns an empty `Values` list for both, so the service now tracks
    which metrics actually returned datapoints and emits `Optional[int]`; the multi-region merge sums only over
    regions that measured, instead of `int(x or 0)` collapsing None to 0. The UI renders "not measured" — 4 of 9
    models on the live fleet, correctly including the embedding model.
  - **`_BEDROCK_PRICING` cache_read was 2.5x too high**: coded at 0.25x input, but the published Bedrock pricing
    page gives 0.10x (Claude 3.5 Sonnet v2: $6.00 input / $0.60 cache read). Because these rates back-derive
    token counts from dollars, an over-stated rate **under-states** the tokens reported. Corrected to 0.10x, with
    the unmodelled dimensions (1h vs 5m TTL, service tier, cross-region routing) documented as a known limit.
  - **CE and CloudWatch legitimately disagree about timing.** CE bills $446.79 of cache in the September period
    while CloudWatch reports zero cache tokens for Sept 1-9 — CE attributes by billing date, CloudWatch by usage
    date, and these Claude models are Marketplace-billed. Verified directly:
    `get-metric-statistics` on `global.anthropic.claude-opus-5` and `us.anthropic.claude-sonnet-4-6` has its last
    datapoint on 2026-08-26. The panel surfaces this as a named condition rather than reconciling it silently.
  - **Root cause of 0% caching today**: no `cachePoint` block exists anywhere in the backend or gateway, so the
    platform never requests prompt caching. The historical volume is other traffic. The empty state says this.
- **Readiness scoring rebuilt; the parallel trust-tier scale deleted (2026-09-09)**: `trustTier.ts` (379 lines,
  committed but never wired) defined a second four-point ladder, T1 Probation → T4 Autonomous, alongside the
  existing L1–L4 scope ladder. It was **deleted rather than surfaced**. Two four-point scales describing the same
  agent are ambiguous, and the collision was concrete: "Supervised" is L3, the second *highest* scope level, but
  would have been T2, the second *lowest* trust tier. Of its four distinctive mechanics, three were missing from
  the graduation model and were folded in; the fourth already existed.
  - **Weighted criteria** (`CRITERION_WEIGHTS`, sums to 1.00). `readiness` was `passed / len(criteria) * 100`, so
    "Active guardrail policy: none" — a blocking safety gate — moved the score exactly as much as an advisory rate
    marginally over. **An agent could display 86% readiness with a blocking safety gate shut.**
  - **Renormalise over known criteria.** An `insufficient` criterion stayed in the denominator as a non-pass, so
    NOT KNOWN scored identically to FAILED. Unknown criteria now leave the calculation, `coverage` travels with
    every score, and readiness is `null` below `MIN_CRITERION_COVERAGE` (0.60) or when any *blocking* criterion is
    unknown. `readiness: Optional[int]` / `number | null` — never 0.
  - **Hysteresis.** Earning a step needs the threshold plus a margin; holding one needs the bare threshold. The
    requirement string states the bar **as tested** (`≥ 92% to earn (90% to hold)`) — showing `≥ 90%` while
    testing 92% would fail an agent against a requirement it appears to meet.
  - **Delegation-chain minimum: already existed, deliberately not duplicated.** `models/govern_a2a_trust.py`
    computes the autonomy ceiling as `min(source.scope_level, target.scope_level, policy.max_delegated_autonomy)`
    with `max_chain_depth`. That is `effectiveChainTier` on the L-ladder.
  Three bugs found by testing the new code before shipping it:
  - **A relative 10% margin made L4 unreachable.** `minAgreement` 95 × 1.1 = 104.5%, so **no agent could ever be
    promoted to L4**, and L3's bar became 99%. Percentages bounded at 100 now use `PROMOTION_MARGIN_POINTS = 2.0`
    absolute, capped at 100 → 92% and 97%.
  - **Float epsilon.** 90 × 1.1 is 99.00000000000001, so an agent measured at exactly 99 failed a 99 bar.
  - **A fabricated pass.** The service hardcodes `error_rate = 0.0` with no feed; adding Error rate as a criterion
    scored that placeholder as passing `<= 2%` — a clean bill of health on a dimension nothing measures. Gated on
    a new `error_rate_measured` flag and rendered "not measured" instead.
  Also: `insufficient_evidence` is now a distinct verdict (it was `conditional`, i.e. "eligible for L3 with
  monitoring", for an agent with three logged decisions); `client.ts` no longer maps `insufficient → warning`,
  which had erased the unknown/failed distinction at the adapter; `_list_graduations_impl` sorts unscored agents
  LAST rather than crashing on `None`; `GraduationSummary` gained `unscored` and `mean_readiness_scored` (mean over
  scored agents only). An unweighted advisory *unknown* does not degrade the verdict — otherwise the absent error
  feed would pin every agent at `conditional` with no operator action able to clear it.
  Verified on the live roster: 3 ready / 3 not_ready, coverage 95%, mean readiness 86.
- **`ScoreDisclosure.tsx` — scores now state what they mean and what they are made of (2026-09-09)**: Govern
  renders several 0-100 numbers that are **not comparable**. `riskScore` is higher-is-worse (Critical 75-100);
  readiness and posture are higher-is-better. A bare "78" meant opposite things depending on the panel, and
  nothing on the page said which. The component makes polarity, method, inputs and coverage travel with the
  number: `ScoreValue` for table cells (em dash + reason when unscored, amber dot when coverage < 100%), and a
  "How this score works" disclosure listing definition, direction, calculation, data sources, coverage with the
  unevaluated criteria named, and live-vs-illustrative. Reusable for the other Govern scores.
- **Documentation.tsx described a different autonomy ladder than the product renders (2026-09-09)**: the
  "Autonomy Levels" table listed a five-level L0–L4 ladder (`Human-Directed`, `Human-on-the-Loop`,
  `Human-Delegated`, ...) while `AGENT_SCOPE_META` — what every badge, drawer and graduation row actually renders —
  is four levels (`No Agency`, `Prescribed Agency`, `Supervised`, `Full Agency`). A reader comparing the docs
  against the Agent Registry saw two ladders disagreeing about the same agent. Corrected to the canonical four.
- **Four dead files, 3,045 lines, zero importers — DELETED 2026-09-09**: `SLAManagement.tsx` (1,468),
  `OnCallDashboard.tsx` (897), `OperationalMetrics.tsx` (465), `ControlPlanePillars.tsx` (215). Each was
  superseded by an `operations/` equivalent. Originally left in place as a module-owner call; the owner
  chose deletion. `npx tsc --noEmit -p tsconfig.app.json` exits 0 after removal, confirming zero importers.
  Two doc comments that named `ControlPlanePillars` as a live caller were corrected at the same time
  (`FleetPostureSection.tsx`, `postureColor.ts`). Recover from git history if any of it is wanted back —
  `SLAManagement` in particular carried a module-scope `Math.random()` trend and three green-check audit
  assertions its own data falsified, so it needs that fixed before it is reusable.
- **The Generate Report modal offered sections no exporter produced (2026-09-08)**: it listed seven sections
  for every format. Measured against the exporters, it was worse than the audit reported — **three sections
  (`control-inventory`, `trend-analysis`, `auditor-notes`) are consumed by no exporter at all**, `evidence-package`
  is honoured by the PDF path only (`exportToWord` has no evidence section), and `exportToExcel` /
  `exportToJSON` never read `options.sections` — they emit a fixed payload, while the JSON echoes the requested
  section list into its metadata as though it had been applied. Ticking any of those changed nothing, and the
  reader of the resulting document never learned a section they asked for was absent.
  Fixed by driving the modal from a new exported `FORMAT_CAPABILITIES` map rather than implementing three
  unspecified report sections: each format now states what it produces, offers only the sections it honours,
  lists the rest as "not available in \<FORMAT\>" (disabled, explained — not hidden, so the absence is
  accounted for), and prunes the selection when the format changes so a stale tick cannot be submitted. CSV and
  JSON say section choice does not apply at all. Verified in the running app: PDF marks 3 unavailable, DOCX 4
  (correctly including Evidence Package), CSV shows the fixed-payload note.
  **`FORMAT_CAPABILITIES` must be kept in sync with the `options.sections.includes(...)` guards in
  `reportExport.ts`** — a section added to an exporter but not to the map will never be offered.
- **Recent Reports invented a report history (2026-09-08)**: the card seeded six reports with named authors
  ("Sarah Chen"), precise timestamps and precise file sizes ("2.4 MB"), rendered with no badge. Nothing
  persists generated reports — they download straight to the user's machine. The list now starts empty, is
  labelled "this session only", and explains why. `MOCK_GENERATED_REPORTS` is deleted.
  That also closed a second finding: re-downloading a historical row regenerated a fresh document but stamped
  it with **that row's** author and today's date, attributing a new artifact to someone who did not produce it.
  With only session-generated rows remaining, the author is the actual actor.
- **"Avg Compliance" hid its denominator (2026-09-08, latent)**: the rate divides by the *assessed* population
  (`total − not_started`, mirroring the server's `overall_coverage_pct`) while sitting beside a "Total Controls"
  card counting the full population, inviting the reader to take it as a share of that larger number. Both
  tiles now state the split (`N assessed · M not yet`), and a null rate renders an em-dash with "no control
  assessed yet" instead of `0%` — and never a success variant.
  > **SUPERSEDED 2026-09-14.** No longer latent, and no longer a frontend-only mitigation. Running
  > `POST /govern/compliance/auto-detect` produced 24 real attestations from AWS evidence, so
  > `isComplianceLive` is now true and the live branch renders. The denominator moved to the **server**:
  > `FrameworkSummary` gained `assessed_count`/`assessed_pct` and `CompliancePosture` gained
  > `total_assessed`/`total_not_assessed`/`overall_assessed_pct`, so the split now has one
  > authoritative definition instead of being invented per consumer. It is **not** true that every
  > consumer reads those fields: `useReportsLiveData.ts` still derives `assessedControls` and
  > `totalControls` itself, by summing the deduplicated framework list, so the figure holds whether or
  > not the server has already excluded the alias ids. The two definitions agree exactly
  > (`pass + in_progress + fail`), and that agreement is the thing to preserve if either side is
  > edited. `coverage_pct`'s own description now states it is a pass rate over
  > assessed controls, **not** coverage of the full control set. Same round fixed a framework
  > double-count: `FRAMEWORK_META` registered three frameworks under two id spellings each, inflating
  > `/posture` to 17 frameworks / 318 controls; aggregation now excludes the aliases → **14 / 281**.
  > The Reports header chip reads "100% of 24 assessed controls pass (24 of 281 assessed, 24
  > auto-detected)". See `GOVERN_DATA_QUALITY.md` → "Resolved 2026-09-14" for the measured figures and
  > for why the *excluded* alias side had to be the spelling the frontend never calls.
  > All 24 assessed controls are **existence probes**, not efficacy tests: a CloudTrail trail merely
  > existing marks NIST AI RMF MANAGE 3.1 PASS. `ReportsLanding` discloses this; the Command Center
  > and the aggregator's trust baseline do not — still open.
- **Framework report exports were unmarked, and contradicted themselves (2026-09-08)**: the reporting
  module's four exporters (`operations/reportExport.ts`) are reached only from `FrameworkReportsModule`, and
  both entry points feed `MOCK_FRAMEWORKS` — the seeded requirement/control/evidence tree. Yet each artifact
  titled itself **"Compliance Assessment Report"**, wrote `<CODE>-Compliance-Report-<date>.<ext>` to disk,
  footered every PDF page "Confidential", and contained no statement of what it was built from. The on-screen
  surfaces are badged, but a 9px amber pill does not travel with a downloaded file.
  `ExportOptions.dataProvenance` is now **required** — deliberately, so a new call site cannot emit an
  unmarked file by omission; it has to declare which kind of document it is producing. When `'illustrative'`:
  the PDF gets a red cover banner plus a page footer mark that **replaces** "Confidential" (a reader skimming
  footers must not see only a confidentiality marker on a sample), the DOCX the same, the CSV puts the
  disclaimer in rows 1-8 before any figure, the JSON gets `_WARNING` / `_isSampleData` before its payload, and
  all four get a `SAMPLE_NOT_FOR_FILING_` filename prefix. Wording is shared with
  `compliance/exportProvenance.ts` so the disclaimer cannot drift between formats.
  **Second bug, found by reading the artifacts**: `framework.overallScore` is a bare literal per framework
  (82/75/68/71/76) and the exporters printed it while the UI already derived its badges from the requirement
  tallies — so a document disagreed with its own arithmetic. The EU AI Act CSV read
  `"Overall Score","68%"` on row 15 and `"Total Requirements","5"` / `"Compliant","2"` on rows 16-17, i.e.
  40%, matching the on-screen card. Four of five frameworks disagreed (NIST 75 vs 67, EU 68 vs 40, ISO 71 vs
  67, CRI 76 vs 72). Every format now derives the score from the tallies it also prints.
  Verified by downloading the artifacts and reading their bytes: PDF cover `(SAMPLE)` + banner + footer mark
  with plain "Confidential" gone, DOCX the same, CSV rows 1-8, and `"Overall Score","40%"` now agreeing with
  its own tallies. **JSON was verified by code only** — no seeded Recent Reports row uses that format, so it
  is unreachable from that surface and only the Generate modal produces it.
- **Regulator-facing exports were unmarked (2026-09-08)**: three downloads left the browser titled as
  compliance documents with nothing in them saying the figures were illustrative — a `MockDataBadge` on
  screen does not travel with a file. `compliance/UnfairDiscriminationTesting`'s button read **"Export for
  Filing"** and produced a *NAIC UNFAIR DISCRIMINATION TESTING REPORT* closing with "Report generated for
  NAIC Model Bulletin compliance", while every disparate-impact ratio, sample size, confidence interval and
  proxy correlation in it is a module-level constant (the file makes no network calls at all).
  `compliance/GpaiModelCard` produced an *EU AI Act Article 53 Compliance Document* from `SAMPLE_MODEL_DATA`
  — one record served for every model with the name swapped — plus a **JSON** export that was a raw
  serialization with no marking whatsoever, which is the worse of the two because JSON is the shape
  something downstream would ingest as input.
  All three now carry a banner header, a closing restatement, and a `SAMPLE_NOT_FOR_FILING_` filename
  prefix; the JSON gets a `_WARNING` / `_isSampleData` envelope with the payload nested under `data`. The
  button is now "Export Sample Report". Wording is single-sourced in `compliance/exportProvenance.ts` so a
  regulatory disclaimer cannot drift between the artifacts it covers. **When one of these views is wired to
  measured data, drop the helper call rather than softening its text** — a partially-real report is still not
  a filing. Verified by downloading all three files and reading their contents, not by inspecting the source.
- **Three deep dives were unreachable (2026-09-08)**: `FRAMEWORK_DEEP_DIVE_MAP` was keyed `sr-26-2`,
  `owasp-llm-top-10` and `osfi-e-23`, but the real `COMPLIANCE_CENTER_FRAMEWORKS` ids are `sr26-2`,
  `owasp-llm-top10` and `osfi-e23`. A key miss falls through to a "Deep dive view not available"
  placeholder instead of failing loudly, so three fully built views were dead from their only entry
  point. Keys in that map MUST match the framework ids in `mockData.ts` exactly.
- **Route**: `/govern/compliance`
- **Core Pillar**: Govern It

### Cost & FinOps
- **Purpose**: Budget tracking, spend velocity, cost by model and BU, anomaly detection, capacity management, and optimization recommendations.
- **Key Features**:
  - Live AWS spend from Cost Explorer
  - Budget vs actual tracking
  - Cost anomaly detection
  - Spend by model and service
  - 12-month forecast
  - Provider cost comparison (multi-cloud)
  - Unit economics calculator
  - Token economics analysis
  - Chargeback allocation
  - Optimization recommendations
  - **Capacity Management** (NEW): AWS Service Quotas monitoring for AI services
- **Tabs**: Dashboard, Planning, Capacity, ROI, Task Fit, Business Value, Unit Economics, Token Economics, Chargeback, Optimization, Cost Anomalies
- **Live Data**: AWS Cost Explorer, AWS Budgets (`DescribeBudgets` via `governCostApi.budgets()` — live budget-vs-actual, now the primary source across FinOps, the Command Center budget card, and `useGovernanceAggregator`, replacing the hardcoded `BU_BUDGETS` mock), AWS Service Quotas
- **AgentCore compute cost is now real (Wave-4)**: per-agent AgentCore compute was structurally `$0.00` because
  CPU and memory hours were never fetched — a zero that looked like a measured zero. It is now the real Cost
  Explorer "Amazon Bedrock AgentCore" service line, allocated across runtimes by metered CPU/memory hours, so
  the per-agent figures sum to the actual bill: **$0.3033** over a 30-day window, with `/cost/agent-costs`
  reporting `live: true` and source `cost-explorer+cloudwatch-agentcore`. The published list rate is used only
  as *relative weights* between the two metered dimensions while the total stays pinned to the billed line —
  window-matched, the list-rate estimate read $0.1227 against a real $0.3033 (about 2.5x low), which is
  precisely why it is not usable as a value.
- **"Value Creation Trend" is now "Monthly AWS Spend Trend" (Wave-4)**: the chart plots real Cost Explorer
  months (Apr $5,236 · May $5,933 · Jun $8,759 · Jul $10,967 · Aug $24,218 · Sep $1,596 MTD), and the savings
  series and the ROI line have been **removed** rather than re-sourced, because no realised-savings source
  exists anywhere in the platform. The partial current month is flagged four ways so the drop cannot be read as
  a real decline: an MTD label, a lighter fill, a legend entry, and a caption.
- **Selectable spend period**: the Cost Explorer panels are scoped by a five-preset control — month to date,
  last month, 3 months, 6 months, 1 year — defined once in `finops/spendWindow.ts` and threaded to the backend
  as `months` + `months_offset`. Two presets are the same *length*, so a bare `months` number cannot express
  them: month-to-date and last month are both one calendar month and differ only in where the window ends.
  Specifics worth knowing before touching this:
  - **The control renders as the FOOTER of the AWS Spend card**, not as its own card and not in the page header.
    In both of those earlier spots it read as a page-wide filter and was missed entirely.
  - **Changing the period does not blank the area.** The window-driven hooks (`useAwsCost`,
    `useAwsCostDetail`, `useAwsCostEnhanced`, `useTokenCosts`) split their phase in two: `loading` means
    "nothing to display yet" and is true only on first mount, while `refreshing` means a fetch is in flight over
    figures already on screen. Stale figures stay rendered, dimmed, under an "Updating…" pill — the pill is
    required, not decoration, because for a moment last period's numbers sit under the new period's label.
  - **`months_offset` must be in every cache key and every effect dep array.** MTD and last month are both
    `months=1`, so omitting it makes the two indistinguishable and switching between them silently no-ops.
  - **Some sources cannot honour a long window.** Trend, anomalies, per-use-case spend and AgentCore costs take
    `days` with a 90-day cap (by-resource, 14). Panels backed by those label the window they are *actually* on
    (`cappedLabel`) instead of inheriting the page heading — a 90-day series under a "1 year" heading is the
    mislabelling this module keeps removing.
  - **Going deeper than ~13 months needs CUR**, not more offsets: Cost Explorer's API retention ends there.
    `spendWindow.ts` documents the seam (add a `{ kind: 'range' }` variant). Note that enabling CUR does **not**
    backfill — history starts at first delivery.
- **Partial Live**: Spend, forecast, anomalies, by-model costs, budgets, capacity quotas, and per-agent
  AgentCore compute cost are live; chargeback and TCO models are illustrative, and realised savings / ROI have
  no measured source and are no longer charted. ROI-tab savings remain a declared projection (4-year net ÷ 48),
  not a measurement.
- **Route**: `/govern/finops`
- **Core Pillar**: See It

### Capacity Management (FinOps sub-tab)
- **Purpose**: Monitor AWS service quotas and limits to prevent capacity breaches that could halt AI workloads.
- **Key Features**:
  - Real-time quota usage monitoring
  - At-risk alerts (>80% used) and critical alerts (>90% used)
  - Quota increase request submission
  - Usage trend charts (7-day history)
  - AI services focus: Bedrock, SageMaker, Lambda, CloudWatch, IAM
- **Tracked Quotas**:
  - Bedrock: Model invocations/min, provisioned throughput, guardrails
  - SageMaker: Endpoint instances, training jobs, notebook instances
  - Lambda: Concurrent executions, function count
  - CloudWatch: Custom metrics, alarms, dashboards
  - IAM: Roles, policies per account
- **Live Data**: AWS Service Quotas API, CloudWatch usage metrics
- **Route**: `/govern/finops?tab=capacity`

### Audit & Incidents
- **Purpose**: Guardrail activity feed, incident management, audit logs, and compliance evidence. Full traceability for regulators.
- **Key Features**:
  - Real-time guardrail event stream
  - Incident register with lifecycle tracking
  - CloudTrail AI activity integration
  - Compliance evidence export
  - Event filtering and search
- **Live Data**: AWS CloudTrail, Bedrock ApplyGuardrail events
- **Partial Live**: CloudTrail events are live; incident lifecycle is illustrative
- **Route**: `/govern/audit`
- **Core Pillar**: Show It

### Data Governance
- **Purpose**: AI-ready data management: quality, lineage, provenance, domains, and access control.
- **Key Features**:
  - Data quality rules and validation
  - Data lineage visualization
  - Agent data profiles
  - Access control tracking
  - Knowledge architecture (GraphRAG, Ontology, Taxonomy, Glossary)
  - **Knowledge Bases** (NEW): live Bedrock Knowledge Base inventory (Knowledge Bases tab)
  - **AI Estate Inventory** (NEW): live tagged-resource inventory of the AI estate (`/govern/data/inventory`)
  - AI readiness assessment (7 dimensions)
  - Maturity journey roadmap
- **Knowledge Bases** (NEW): a "Knowledge Bases" tab (`data/KnowledgeBaseGovernance.tsx`) lists the account's Amazon Bedrock Knowledge Bases (name, status, storage type, embedding model, data sources) with summary tiles and breakdowns by storage type and embedding model.
- **AI Estate Inventory** (NEW): an "AI Estate Inventory" page (`/govern/data/inventory` → `govern/data/AiEstateInventory.tsx`) over `governInventoryApi.resources()` (`GET /govern/governance/inventory`, live source `resourcegroupstaggingapi:GetResources`) lists every tagged AWS resource supporting the AI estate, grouped by service (sorted by-service bar chart), with an `ai_related` flag derived from the service namespace (bedrock/sagemaker/etc.) plus ai/genai/llm/agentcore tag heuristics. Summary tiles cover total resources, AI-related count, distinct services, and distinct tag keys, with an AI-related-only filter. ~500 resources (incl. bedrock-agentcore/lambda/eks); account IDs are masked server-side; live-but-empty accounts show an honest empty state.
- **Sub-routes**:
  - `/govern/data/agents` - Agent Data Profiles
  - `/govern/data/lineage` - Data Lineage
  - `/govern/data/inventory` - AI Estate Inventory (live)
  - `/govern/data/access` - Access Control
  - `/govern/data/quality` - Data Quality
  - `/govern/data/graphrag` - GraphRAG
  - `/govern/data/ontology` - Data Ontology
  - `/govern/data/taxonomy` - Data Taxonomy
  - `/govern/data/glossary` - Business Glossary
  - `/govern/data/readiness` - AI Readiness Assessment
  - `/govern/data/maturity` - Maturity Journey
  - `/govern/data/metadata` - Metadata Management
- **One readiness ladder (Wave-4)**: two divergent 7-dimension readiness ladders coexisted, one on a 0-5 scale
  and one on a 0-100 scale, and they contradicted each other on the same screen — observed live before the fix,
  Access Governance read **40% vs 20/100** and Audit Trail **40% vs 95/100**. They are reconciled onto one
  scored ladder, and the Data Governance landing tile now reads 14% → **38/100** ("6 of 7 dimensions scored ·
  target 85").
- **Adoption is a separate ladder (Wave-4)**: the three adoption signals that had been mixed into readiness
  became their own "Adoption Maturity" ladder, moved into `dataReadinessEngine.ts` as a pure function over
  primitives so the engine keeps its no-fetch / no-UI property and stays unit-testable. A declared invariant
  forbids rescaling either ladder into the other — that rescaling is what produced the original contradiction.
- **Data Quality is unscored, and says so**: it is the one unscored dimension of the seven, because AWS Glue
  Data Quality returns `live: false` in this account. It contributes no points and is excluded from the scored
  count rather than being scored as a zero.
- **Live Data**: AWS Glue Data Catalog, AVA service approvals, Amazon Bedrock Knowledge Bases (`governKnowledgeBasesApi.list()`, live source `Bedrock Knowledge Bases`), AI estate tagged-resource inventory (`governInventoryApi.resources()`, live source `resourcegroupstaggingapi:GetResources`)
- **Route**: `/govern/data`
- **Core Pillar**: Show It

### Governance Playbook
- **Purpose**: Decision framework for autonomous agents. Configure autonomy levels, design HITL gates, and establish A2A trust policies.
- **Key Features**:
  - Autonomy ladder (4 levels: Assisted, Semi-autonomous, Supervised, Autonomous)
  - HITL gate design patterns
  - A2A trust evaluator
  - AWS integration patterns
- **Live Data**: Illustrative (framework guidance)
- **Route**: `/govern/playbook`

### Multi-Cloud Governance
- **Purpose**: Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms.
- **Key Features**:
  - Dashboard: Fleet risk overview, KPIs, emergency controls, posture by provider
  - Inventory: Unified agent list with filtering by provider/status
  - Registry: Tools, MCP servers, permissions, human oversight, A2A trust
  - Providers: Cloud and SaaS provider cards with **connector configuration**
  - Analytics: Cost trends, performance metrics, migration planning
  - Policies: Cross-provider policy enforcement and compliance
- **Multi-Cloud Connectors** (Aug 2026):
  - AWS: Native (always connected)
  - Azure: Azure AD + Cost Management API (costs, AI Foundry agents)
  - GCP: Service Account + BigQuery (billing export, Vertex AI agents)
  - SaaS: Not yet implemented (ServiceNow, Salesforce, Copilot Studio)
- **Credentials**: Stored in AWS Secrets Manager (`ava/connectors/azure`, `ava/connectors/gcp`)
- **Live Data**: `multicloudApi.status()`, `multicloudApi.allCosts()`, `multicloudApi.allAgents()`
- **Route**: `/govern/multi-cloud`

### Agentic Coding
- **Purpose**: Govern AI-powered coding assistants - Claude Code, Kiro, Copilot, Cursor.
- **Key Features**:
  - API routing compliance tracking
  - Code context exposure monitoring
  - Shadow usage detection
  - Tool-specific policies
  - **Harness governance**: Kill-switch, tool tiers, validation panels
  - **Path Jailing**: Block access to sensitive paths (secrets, credentials, SSH keys)
  - **Policy-Reality Drift Detection**: Compare declared policies vs actual behavior
- **Live Data**: AVA developer AI API, AWS CloudTrail
- **`claude_code` metrics are unmeasured, and say so**: the `claude_code` CloudWatch namespace has zero metrics
  in this account (us-east-1 and us-west-2 both checked), so `/agentic-coding` returns `live: false` with
  `tasks: 0` and a note stating that a 0 here is unmeasured, not a clean bill of health. The autonomous-on-prod
  calculation behind it was corrected in Wave-4 (keyed on the `(repo.org, repo.name, autonomy_level)` pair and
  summing only `level == full`, instead of every task on a production repo), but the corrected path cannot be
  exercised end to end until the namespace has data.
- **Route**: `/govern/dev-tools`
- **Sub-routes**:
  - `/govern/path-jail` - Path Jailing Rule Editor
  - `/govern/policy-drift` - Policy-Reality Drift Dashboard

### Path Jailing Rule Editor
- **Purpose**: Manage path access rules for AI coding assistants. Block access to sensitive files and directories.
- **Key Features**:
  - 18 default blocked patterns (secrets, .env, credentials, SSH keys, AWS config, etc.)
  - Custom rule creation with glob, regex, or exact match patterns
  - Enable/disable rules without deletion
  - Pattern testing tool (check if a path would be blocked)
  - Recent violations panel (last 10 blocked access attempts)
  - Harness-specific overrides (different rules per tool type)
- **The test tool matched nothing at all, and said so as "allowed"**: `_matches_pattern`'s glob arm built its
  regex with chained `str.replace` calls that rewrote each other's output — the escape loop double-escaped
  `\`, then `'*' → '[^/]*'` edited the `(?:.*/)?` the `'**/'` step had just produced, then `'?' → '[^/]'` broke
  that group's syntax. `**/.env` compiled to `^([^/]:.[^/]*/)[^/]\.env$`, so **every one of the 18 default
  patterns failed against the path it names**, and the endpoint answered *"Path is allowed - no blocking rules
  match"* for `.env`, for SSH keys, and for `../../etc/passwd` alike. Rewritten as a single-scan
  `_glob_to_regex`; `**/` is now zero-or-more path components, so `**/.env` matches a bare `.env` too. Two
  sibling defects fell out of the new tests: the REGEX arm normalised the **pattern's** backslashes to `/`,
  turning every `\.`/`\d`/`\w` in an operator's rule into something else, and there was no traversal or
  absolute-path pre-check, so structural refusals were reported as rule misses. Traversal detection now comes
  from `core.path_jail.check_traversal` — the enforcer's own function, not a second copy. 53 tests in
  `tests/test_govern_path_jail_matcher.py`, one per default pattern plus a both-implementations-agree pass.
- **Both fabricated verdicts removed from the UI.** `PatternTestTool` caught a failed request and synthesised
  a verdict from `path.includes('.env') || path.includes('secret')`, rendered in the same green *"Would be
  ALLOWED"* panel as a real answer — with the backend down, everything else was reported safe. It now shows
  "No verdict available". The Add Rule form previewed an unsaved rule with
  `path.includes(pattern.replace(/\*/g, ''))` — substring containment, ignoring `pattern_type` entirely — and
  now calls `POST /govern/path-jail/test-pattern`, so the preview runs the same matcher as enforcement.
  Failed toggle/delete/save no longer `catch {}` silently; they surface what did not happen.
- **Live Data**: Backend rule store, violation audit log
- **Route**: `/govern/path-jail`
- **API**: `POST /test` (path vs all rules, incl. structural refusals), `POST /test-pattern` (one pattern vs one
  path, for previewing a rule that does not exist yet — no structural checks, `matched` not `would_be_blocked`)

### Policy-Reality Drift Dashboard
- **Purpose**: Detect when actual AI assistant behavior deviates from declared governance policies.
- **Key Features**:
  - Drift KPIs: Total findings, compliance gap %, worst offender, time since last analysis
  - Drift-by-type visualization (donut chart): TIER_VIOLATION, PATH_VIOLATION, UNKNOWN_HARNESS
  - Sortable/filterable findings table with CloudTrail evidence
  - Bulk resolve capability for remediated drift
  - Worst offenders panel (top 5 users/harnesses by drift count)
  - 7-day trend chart (new findings vs resolved)
  - Policy comparison view (expected vs actual diff)
- **`approval_bypass` deleted, not implemented (Wave-4)**: a fourth drift type was evaluated and then
  `pass  # Don't flag yet`, while a live pie slice, a legend entry and a filter chip all pointed at that dead
  code path — so the chart read "no approval bypasses detected" when nothing had ever been detected against.
  No approval signal exists to detect with: the approval store is unprovisioned and returns 0 rows, and queue
  rows carry no CloudTrail correlation key. The type was therefore removed from the model, the donut, the
  legend and the filters rather than left as a permanently-empty category. The three surviving drift types
  (TIER_VIOLATION, PATH_VIOLATION, UNKNOWN_HARNESS) are unaffected.
- **Live Data**: AWS CloudTrail, policy store
- **Route**: `/govern/policy-drift`

### Third-Party Risk
- **Purpose**: Manage AI vendor risk with due diligence questionnaires, contract tracking, and exit strategies.
- **Key Features**:
  - Vendor DDQ management
  - Contract tracking
  - Concentration analysis (per-model attribution from the catalog's real `output_modalities`, with a
    minimum-population floor before a severity is assigned — see Risk Management)
  - Exit strategy planning
  - **Vendor IAM Access Review**: Real IAM roles/policies (`ListRoles`/`GetRole` + `RoleLastUsed`, attached and inline policy documents) correlated with IAM Access Analyzer findings (`ListAnalyzers`/`ListFindingsV2`, incl. unused-access); risk derived from external-access findings, wildcard permissions, and stale usage
- **Live Data**: `governIamApi.vendorAccess` (live source `iam+access-analyzer`, or `iam` when Access Analyzer is unreachable; honest mock fallback on missing permissions). DDQ, contract, and exit-strategy tracking remain illustrative (TPRM patterns).
- **Route**: `/govern/risk?tab=third-party`

### Operations
- **Purpose**: AIOps control room for the agent fleet — health, incidents, alerts, SLAs, changes, capacity, and GRC reporting.
- **Tabs**: Ops group (Overview, Fleet Health, Incidents, On-Call, Changes, Alerts, SLAs, Runbooks, Capacity) and GRC group (Compliance, Evidence, Metrics)
- **Live Data**:
  - `governOperationsApi.fleetStatus()` — fleet health (Overview, Fleet Health)
  - `governOperationsApi.activeAlerts()` — firing alerts mapped from CloudWatch Alarms in ALARM state (Overview, Alerts)
  - `governOperationsApi.opsMetrics()` — MTTR, CFR, and fleet health (Overview, Availability). Not uptime: see the Fleet Health note below.
  - `governCapacityApi.quotas()` / `.alerts()` — AWS Service Quotas usage and capacity-breach alerts (Capacity)
  - `governOperationsApi.ssmManagedInstances()` / `.ssmRunbooks()` / `.ssmCommandHistory()` — AWS Systems Manager Fleet Manager, read-only (Runbooks)
  - `governXRayApi.getServiceGraph()` / `.getTraceSummaries()` / `.getTraceDetails()` — live AWS X-Ray service map, recent trace summaries, and per-trace segment detail (Traces (X-Ray))
- **Systems Manager Fleet Manager** (NEW, read-only): The Runbooks tab surfaces managed instances (`describe_instance_information`), the document/runbook catalog (`list_documents`), and command history (`list_commands`) from SSM (live source `ssm`). Execution (`SendCommand`/`StartAutomationExecution`) is intentionally not wired — the Run control is disabled with the label "Read-only - execution not enabled in this build".
- **X-Ray Service Map** (NEW): a "Traces (X-Ray)" tab (`operations/ServiceMap.tsx`) renders the live service graph (`GET /govern/xray/service-graph` — node response time, error rate, throughput, downstream edges) and a recent-trace table (`GET /govern/xray/traces` — duration, HTTP status, fault/error/throttle/partial flags); clicking a trace loads `GET /govern/xray/traces/detail` into a segment-tree detail drawer. Badges gate on the graph/trace `live` flags with an honest empty state when tracing is not enabled.
- **MTTD reports "Not Measured" (Wave-4)**: mean time to detect used to render `0` styled emerald "Excellent" —
  the worst possible presentation of a missing number. `ttd_minutes` has zero writers repo-wide, so there was
  never a value behind it. The tile now says "Not Measured" and names what is missing:
  `DescribeAlarmHistory` works and carries usable onset timestamps, but 0 of the account's 85 alarms cover
  AI/Bedrock/AgentCore, so wiring real MTTD requires creating such an alarm first.
- **"Fleet Availability" was three wrong claims on one tile (2026-09-08)**: `OpsMetrics.tsx` `AvailabilityTab`
  rendered `summary.availability_pct` as **Fleet Availability**, captioned
  `${measurement_period_days}-day measurement window`, in unconditional `text-emerald-600`. All three were
  false. The value is `FleetStatusSummary.pct_healthy` — a point-in-time share of agents reporting healthy —
  and nothing in the platform samples agent health over time, so no window applies to it. Worse, when every
  agent's health resolves to `UNKNOWN` (the current state: the CloudWatch health probe finds no datapoints),
  `pct_healthy` is a hard `0.0`, so the tile drew a **green 0.00% availability** for a fleet nobody measured.
  Fixes: `availability_pct` is now `Optional[float] = None` on `OperationsMetricsSummary` and `number | null`
  in `client.ts`, the service returns `None` when `total == 0 or unknown >= total`, the tile is labelled
  **Fleet Health** with the caption "healthy agents, right now", and the unmeasured state renders `—` in
  slate with a tooltip. This is the same treatment `mttd_minutes` and `sla_compliance_pct` already carried —
  `availability_pct` was the third field in that model with the defect and the last to be converted.
  Verified live: `GET /operations/metrics/summary` now returns `availability_pct: null` where it sent `0.0`.
- **SLA detail claimed `live=true` for seeded data (2026-09-08)**: `get_sla_detail` ran its own DynamoDB
  query, fell back to `self._mem_slas` on a miss, then returned `live=True, source="computed"` **either
  way** — so a seeded SLA definition served the detail view under a green badge. It now reads through
  `_load_sla_targets`, the same loader `list_slas` uses, whose docstring already promised "every SLA read
  reports the same provenance". Seeded reads return `live=false, source="memory"` plus a note. Side effect,
  intentional: an SLA the list cannot show is no longer reachable via detail, so the two views can no longer
  disagree about where an SLA came from. Verified in-process — a memory-only SLA returns
  `live=False / source=memory / note="Seeded SLA definition …"`.
- **Partial Live**: Fleet status, CloudWatch alarms, ops metrics, Service Quotas, and SSM Fleet Manager reads are live (per-payload gated); alert rules/mutations and the Incidents, On-Call, and SLA tabs remain mock. MTTD and fleet health are explicitly unmeasured (both `null`), and the SLA current-values (99.95 / 150 / 0.1) are hardcoded targets, not measurements — a Batch 3 item.
- **`Array.isArray` counted an empty live array as live (2026-09-08, latent)**: `OpsOverview`'s
  `ComplianceRiskSection` gated four sub-blocks on `Array.isArray(data?.x)`, which is `true` for `[]`. An empty
  array is also truthy, so the `|| MOCK_*` fallbacks below did not fire for it either. A payload carrying
  `riskTrend7d: []` would therefore have suppressed the Demo badge while leaving the block with no data, at
  which point `?? 74` / `?? 72` rendered a fabricated risk score of 74 — the top of the High band, painted
  rose — trending a fabricated +2 worse, under no badge. The gates now require content, not just a shape, and
  the literals are gone.
  **This was not reachable in the current build and the panel's rendering is unchanged** — verified by
  querying `GET /api/v1/govern/operations/metrics/summary`, which returns only `summary` / `live` / `source` /
  `note`. `data?.riskTrend7d` is always `undefined`, so all four blocks already fell to the badged mock. The
  fix is hardening against a shape the response type explicitly permits.
  Two related findings from tracing it: (a) `OpsMetricsSummaryResponse` in `api/client.ts` declares
  `frameworkCompliance`, `riskTrend7d`, `upcomingDeadlines` and `policyViolations` as optional top-level
  fields, but the endpoint nests everything under `summary` and never sends them — so **these four blocks can
  never go live as written**, and the type suggests otherwise; (b) the old `?? 74` / `?? 72` were copies of
  `MOCK_RISK_TREND_7D`'s last and first scores, which is why the fabricated values were indistinguishable
  from the mock on screen.
- **Remaining fallback-sweep findings closed (2026-09-08)**: the MEDIUM/LOW tail of the same sweep.
  - **SLA breaches**: `useSLABreaches` required `response.live && response.breaches.length > 0`, so a live
    response reporting **zero** breaches — the best possible result — was replaced by three fabricated
    breaches (INC-2847/INC-2846) and the badge flipped to demo. Now honours the live flag alone. `SLACenter`
    was also not reading the hook's `isLive`, so seeded rows drove the "Breaches This Month" count, its
    "N active" caption, and the four breach tiles; all now render `—` / "breach records not connected" when
    the store is not live. Same for **Avg Error Budget**, which showed a seeded `57.1%` and now gates on
    `budgetsLive`.
  - **EU AI Act Art. 73 obligations were derived from a substring match**: audit-derived incidents took
    `reportable: severity === 'critical' || 'high'` and `reportClockDays: 2 | 15`, where `severity` itself is
    inferred by substring-matching the event summary. That turns a text guess into a **statutory reporting
    deadline**. Those rows now carry `reportableAssessed: false` and render "classification pending" — not a
    clock badge, and not "not reportable", which is an equally strong claim. Their permanent `status:
    'detected'` is documented as the only honest reading of "an audit event exists" rather than a lifecycle.
  - **Data Quality composite**: this one was *already* disclosed — `ScorecardStrip` excludes it from its live
    count and shows "N/M live" — so the ten illustrative dimension scores were deliberately left in place
    rather than blanked. Only the tile's own `source` string was corrected, which described how the composite
    was computed but not what from.
- **On-call showed a staffed rotation during a coverage gap (2026-09-08)**: `OpsOverview`'s on-call card
  gated correctly on `onCallLive`, then *inside* that branch fell back to `MOCK_ON_CALL` field by field
  (`onCallData.primary?.name ?? MOCK_ON_CALL.primary`). The backend returns `live=true` with `primary=None`
  in two real rotation-gap states: PagerDuty reporting nobody on call
  (`govern_operations_service.py:1405`) and stored shifts existing while none covers `now` (`:1372-1381`,
  where `live=len(shifts) > 0`). Either one rendered **"Sarah Chen / Platform SRE / until 18:00 UTC /
  Backup: Marcus Williams"** beside the pulsing green live dot — so an uncovered rotation looked fully
  staffed and a responder would page someone who is not on it. The live path now renders **"No one on call"**
  in rose with a red card border; `MOCK_ON_CALL` is confined to the `!onCallLive` branch. Verified by
  intercepting the endpoint with `live:true, primary:null` — the card reads "No one on call / Rotation
  reported no active shift" with no mock names leaking.
- **Capacity "Projected Runway" was a literal 90 for every live account (2026-09-08)**: `mapServiceQuota`
  set `growthRate: 0`, with the stated intent that runway/forecast "degrade to neutral values rather than
  fabricating a growth curve". `0` defeated that intent twice — it rendered as a measured `+0%/wk`, and
  because `daysUntilHit` returns `Infinity` for `growthRate <= 0`, **every** live quota was filtered out of
  the runway calculation, so `projectedRunway` fell through to its literal `90`. The tile therefore read
  "90d · until first quota hit" in neutral styling regardless of usage, and could never reach its own amber
  (<30) or red (<14) thresholds. `growthRate` and `daysUntilHit` are now nullable; the tile reads
  `—` / "growth history not available".
  Driving the fixed page surfaced two further defects that the literal `90` had been masking, both live
  under the `Live (AWS Service Quotas)` badge: AWS returns `0 / 0` for quotas whose limit is not published,
  and (a) `getUsagePercent(0, 0)` produced **`NaN`**, rendering "NaN% used" per card and **"AVG HEADROOM
  NaN%"** in the KPI row — the existing guard covered only the empty-array case, not a zero limit; (b)
  `daysUntilHit`'s `current >= limit` check treated `0 >= 0` as *saturated*, returning a 0-day runway that
  dragged the whole-account KPI to **"0d" in red**. Both fixed: such quotas now show `NO LIMIT` /
  "no limit published" and are excluded from the headroom average and runway.
  Measured on the running app: Projected Runway `90d → —`, Avg Headroom `NaN% → 100%`, 4 quotas showing
  `NO LIMIT`, 57 showing `growth n/a`, and no `NaN` anywhere on the page.
- **Agent risk tier was guessed from the agent's name (2026-09-08)**: `useReportsLiveData.inferRiskTier()`
  classified an agent's governance risk tier by substring-matching its **name** (`trading`/`credit` →
  critical, `customer`/`fraud` → high, `internal`/`support` → medium) and fell through to **`low`** — the
  most permissive tier — for everything else. The result rendered as a "Low" risk badge on live discovered
  agents in `AgentResourceInventory` (4 render sites) beside a `LiveDataBadge`, so an unreviewed production
  agent whose name matched no keyword read as *assessed low risk*. `inferRiskTier` is deleted and the
  `RiskTier` union gains an explicit **`unassessed`** member rendering "Not assessed" in dimmer slate than
  `low` — an absent assessment must not read as a passing one. The deployments path's placeholder
  `riskTier: 'medium'` is now `unassessed` too. Keeping it in the union (rather than making the field
  optional) keeps the `RISK_TIER_CONFIG` lookup total, so all four render sites report it with no extra
  branching.
- **A literal 25-minute MTTR was computed inside the live branch (2026-09-08)**:
  `metrics/auditMetrics.ts`'s `computeIncidentSummaryFromEvents` returned `mttrMin = resolved7d > 0 ? 25 :
  MTTR_TARGET_MIN`, and that value is rendered by `AuditMetricsPanel` as **"Incident Resolution (MTTR)"** — a
  board-tier KPI — under a `LiveDataBadge` reading "Metrics computed from N live events", with a RAG colour
  derived from it. An `AuditEvent` carries no resolution timestamp, so nothing there measures duration at
  all. The `resolved7d === 0` branch was the worse half: falling back to the *target* made an unmeasured
  metric read as exactly on target. Now `null`, which `computeVariance`/`ragForVariance` already handle as
  `rag: 'na'` per the metric contract's documented "null = not yet captured"; the tile renders `—` with
  "not measured — audit events carry no resolution time" (it would otherwise have printed the string
  `"null min"`).
- **`ControlPlanePillars.tsx` is dead code (2026-09-08)**: it carries `score: pd?.score ?? 75`, which would
  render a grade **C** and a 75%-wide score bar for a pillar with no data. It has **zero importers** — the only
  two mentions of it in the repo are comments (`FleetPostureSection.tsx:4`, `postureColor.ts:8`). Left
  unfixed deliberately and recorded here instead: it belongs with the other delete-rather-than-badge files,
  not on the honesty backlog.
- **Route**: `/govern/operations`

### Reports
- **Purpose**: Board-ready governance reporting aggregating live evidence across the platform.
- **Key Features**:
  - Landing cross-source summary (`useReportsDataSummary`) badged "N/M live sources" across AgentCore, Guardrails, Deployments, Compliance, Security, Risk, Fleet
  - Agent Resource Inventory (`useAgentResourceData`) — agents joined from AgentCore discovery + guardrail telemetry + AVA deployments
  - Framework Compliance (`useFrameworkCompliance`) — per-framework coverage from `complianceApi.getPosture()`
- **Live Data**: `useReportsDataSummary`, `useAgentResourceData`, `useFrameworkCompliance` (each source badged live/mock per payload; empty states instead of fabricated values)
- **Route**: `/govern/reports`

---

## Compliance Framework Coverage

The **Compliance Center** tracks 14 frameworks totalling 281 controls. The list and the counts below
are the ones `GET /govern/compliance/posture` actually returns (`FRAMEWORK_META` in
`backend/src/api/routes/govern_compliance.py`), verified against the live endpoint on 2026-09-14:

| Framework | Id | Focus | Controls |
|-----------|----|-------|----------|
| SR 26-2 | `sr26-2` | Interagency guidance on AI (FSI) | 16 |
| NIST AI RMF | `nist-ai-rmf` | US federal AI risk management (GOVERN, MAP, MEASURE, MANAGE) | 15 |
| EU AI Act | `eu-ai-act` | European AI regulation: risk classification, conformity | 19 |
| Data Sensitivity | `data-sensitivity` | Data classification and handling | 14 |
| AWS RAI Lens | `aws-rai-lens` | AWS Responsible AI lens | 35 |
| CRI FS AI RMF | `cri-fs-ai-rmf` | Financial services AI risk, industry-specific | 45 |
| ISO 42001 | `iso-42001` | AI management system standard, certification-ready | 16 |
| OWASP LLM Top 10 | `owasp-llm-top10` | LLM security: prompt injection, data leakage | 24 |
| FINOS AIR | `finos-air` | Open-source AI readiness, FSI patterns | 34 |
| OSFI E-23 | `osfi-e23` | Canadian model risk (FSI): governance, validation | 15 |
| NAIC AI Systems Evaluation Tool | `naic-ai` | Insurance AI guidance: fairness, governance | 16 |
| Colorado AI Act (SB 26-189) | `colorado-ai-act` | Colorado AI Act | 6 |
| MITRE ATLAS | `mitre-atlas` | Adversarial ML: threat modeling, mitigations | 14 |
| NIST GenAI Profile | `nist-genai-profile` | Generative-AI profile of the AI RMF | 12 |

Three of these are also registered under a second id spelling (`osfi-e-23`, `naic-model-bulletin`,
`colorado-sb-205`) so older attestation calls do not 404. Aggregation excludes the alias side, which
is why `/posture` reports 14 / 281 rather than 17 / 318.

**The Governance Assessment wizard is a different, 11-entry inventory** (`REGULATORY_FRAMEWORKS` in
`assessment/governanceAssessmentFramework.ts`): `NIST_AI_RMF`, `EU_AI_ACT`, `SR_26_2`, `SR_11_7`,
`ISO_42001`, `CRI_FS_AI_RMF`, `OSFI_E23`, `NAIC_AI_BULLETIN`, `MAS_FEAT`, `SG_AI_FRAMEWORK`,
`APRA_CPG235`. Only 7 ids appear in both lists — the wizard adds SR 11-7, MAS FEAT, the Singapore
Model AI Governance Framework and APRA CPG 235, and lacks the 7 the Compliance Center carries. A
"11 frameworks" figure elsewhere in the docs is correct if and only if it is talking about the wizard.

An earlier version of this table listed "Singapore MAS", "Hong Kong HKMA" and "AWS Well-Architected
ML". The first belongs to the wizard's list (as MAS FEAT), the second exists in neither inventory,
and the third was a wrong name for the AWS RAI Lens.

---

## Data Source Status

Govern displays a mix of live AWS data and illustrative mock data.

### Fully Live Data Sources
- Use cases, business cases, maturity assessments, operating models (AVA Plan APIs)
- Deployments, frontier agents (AVA Build APIs)
- Guardrails, service approvals (AVA Secure APIs)
- Guardrail metrics (Amazon Bedrock CloudWatch)
- Model runtime metrics - invocations, latency, tokens, errors (CloudWatch AWS/Bedrock)
- Config compliance (AWS Config `DescribeComplianceByConfigRule`)
- AWS Config rules + per-rule compliance (`governControlsApi.configRules()`, ~710 rules, source `aws-config`)
- Control evaluation for auto-detected controls in the framework deep-dives (`governControlsApi.evaluate()`)
- Security findings (AWS Security Hub)
- Inspector2 vulnerability findings — real CVEs + fix-availability (`governSecurityApi.vulnerabilities()`, source `inspector2`)
- AI activity trail (AWS CloudTrail)
- Fleet status, firing alerts (CloudWatch Alarms), and ops metrics/MTTR (Operations module; MTTD is **not**
  measured and reports "Not Measured")
- Resource-tag governance and scope coverage — the scan behind the Agentic Fleet registry/access pillars and the
  Agent Registry `governanceStatus` derivation (`GET /governance/resource-tags`, source
  `resourcegroupstaggingapi:GetResources`; 29/59 governance-tagged, 15/59 scope-tagged, 33/36 agents joined)
- Per-agent AgentCore compute cost — the Cost Explorer "Amazon Bedrock AgentCore" service line allocated across
  runtimes by metered CPU/memory hours (`/cost/agent-costs`, source `cost-explorer+cloudwatch-agentcore`)
- Per-identity token counts and per-model cost for Developer AI Usage / Shadow AI — Bedrock invocation logs via
  Logs Insights with the log group resolved from `GetModelInvocationLoggingConfiguration`, plus paginated
  CloudTrail (source `cloudtrail+bedrock-invocation-logs`; unrated models return `null`, never a default rate)
- Service Quotas usage and capacity alerts (AWS Service Quotas)
- SSM Fleet Manager reads — managed instances, runbook catalog, command history (AWS Systems Manager, read-only; source `ssm`)
- Vendor IAM access — IAM roles/policies + IAM Access Analyzer findings (source `iam+access-analyzer`)
- Per-invocation telemetry — Bedrock model-invocation logs via CloudWatch Logs Insights, metadata only (source `bedrock-invocation-logs`)
- SageMaker ML Lineage — artifacts, contexts, associations; ~31 entities from a seeded training->model->endpoint pipeline (source `sagemaker-lineage`; honest empty state when the account has none)
- SageMaker Model Monitor data-quality drift — baseline constraints vs monitor-results `constraint_violations.json` read from S3 via an on-demand analyzer (`governSageMakerApi.modelMonitor()`, `GET /govern/sagemaker/model-monitor`; Model Monitor scheduling is in AWS maintenance mode, so drift comes from the analyzer, not a live schedule)
- Bedrock inference profiles and prompt routers (sources `bedrock-list-inference-profiles` / `bedrock-list-prompt-routers`)
- Bedrock RAG evaluation jobs + S3-parsed per-metric mean scores (`governEvalsApi.jobs()` / `scores()`, sources `ListEvaluationJobs` / `S3 eval results`)
- Bedrock Knowledge Base inventory (`governKnowledgeBasesApi.list()`, source `Bedrock Knowledge Bases`)
- AI estate tagged-resource inventory — tagged AWS resources supporting the AI estate, grouped by service with an `ai_related` flag (`governInventoryApi.resources()`, source `resourcegroupstaggingapi:GetResources`; account IDs masked server-side)
- X-Ray service map, trace summaries, and trace detail (`governXRayApi.*`)
- AWS Budgets budget-vs-actual (`DescribeBudgets` via `governCostApi.budgets()`)
- KMS key + alias inventory — encryption-at-rest evidence (`governKmsApi.inventory()`, source `kms:...`)
- Organizations Service Control Policies — preventive controls (`governScpApi.policies()`, source `organizations:...`; honest note when only the AWS-managed default exists or org access is denied)
- LLM output-quality derived metrics — telemetry-derived governance proxy published to `AVA/LLMQuality` by `core/llm_quality_producer.py` (harmful_rate, groundedness, refusal_rate, tokens_per_response, plus eval-derived relevance/coherence/citation when present); a derived proxy, not a direct per-response measurement

### Partially Live Data Sources
| Data Source | Live Slice | Illustrative |
|-------------|------------|--------------|
| Model Inventory | Bedrock catalog + runtime + cost | Risk tiers, attestation metadata |
| Model Evaluations | Bedrock eval-job list + per-metric mean scores from S3 (Model + RAG) | Per-query RAG "studio" drill-down, published benchmarks |
| Cost & FinOps | Spend, forecast, anomalies, by-model, budgets, per-agent AgentCore compute | Chargeback, TCO models; realised savings / ROI have no source and are not charted |
| Agent Registry | Agent inventory, tag-derived `governanceStatus` (33/36 joined), AWS provider cost | Per-agent cost attribution, scope level, incident count, owner (hardcoded by the live mapper) |
| Agentic Fleet | Registry / access / security pillars (tag scan + controls), guardrail telemetry count | Visualization and interoperability pillars; per-agent scope, environment, model, and policy |
| Developer AI / Shadow AI | Per-identity tokens, per-model cost, anomalies (CloudTrail + invocation logs) | Per-harness `claude_code` metrics — the CloudWatch namespace is empty, so the route returns `live: false` |
| Data Governance readiness | 6 of 7 scored dimensions (38/100, target 85) | Data Quality — AWS Glue Data Quality returns `live: false`, so the dimension is unscored |
| Operations | Fleet status, CloudWatch alarms, MTTR, Service Quotas, SSM reads | MTTD (unmeasured), SLA current-values, incidents, on-call |
| Audit Trail | CloudTrail + guardrail events | Incident lifecycle |
| Compliance Status | AWS Config rules | Framework attestations |
| Risk Register | Security Hub + Inspector2 vulnerabilities + use case risks; per-model concentration attribution | Controls, issues |
| Model Lineage & Drift | SageMaker ML Lineage graph + Model Monitor data-quality drift (on-demand analyzer, S3) | Safety/hallucination drift KPIs, Clarify SHAP (blocked by AWS maintenance mode) |
| Third-Party Risk | Vendor IAM + Access Analyzer | DDQ, contracts, exit strategies |
| Prompt Governance | Guardrail telemetry + per-invocation metadata | Reasoning trace analysis |

---

## Technical Architecture

### Live Data Integration Pattern

```
Frontend Component
    |
    v
useHook (e.g., useAwsCost, useGovernModels)
    |
    v
API Client (src/api/client.ts)
    |
    v
Backend FastAPI (control_plane/backend)
    |
    v
AWS APIs (Bedrock, CloudWatch, Cost Explorer, Config, Security Hub, CloudTrail)
```

### Key Hooks
- `useGovernModels` - Bedrock model catalog and metrics
- `useAwsCost` - Cost Explorer data
- `useGovernanceAggregator` - Cross-module metrics
- `useLiveKPIs` - Real-time governance KPIs
- `useAgentRegistry` - Agent inventory
- `useControlEvaluation` - Config compliance
- `useGuardrailMetrics` - Guardrail templates + fleet telemetry (2 requests total, any fleet size)

### Region Coverage in the UI

A count from one region and a count merged from five look identical on screen, so region reach is treated as
part of provenance rather than a deployment detail. Full tier model in
[`platform/docs/architecture/govern-module.md`](../../../../../docs/architecture/govern-module.md#region-architecture).

- **`governRegionsApi.scope()`** (`GET /api/v1/govern/regions/scope`) returns every Govern surface's *declared*
  region reach, read from the backend registry each route module populates at import time. Measured 2026-09-04:
  55 surfaces — **10 `multi-region`**, 31 `single-region`, 3 `account-pinned`, 11 `control-plane`. Use it to label
  a panel with the reach its data actually has; **do not hard-code a list of which surfaces aggregate** — that
  drift is the reason the endpoint exists. `RegionDiscoveryPrompt.tsx` generates its confirmation message from
  this endpoint (it previously claimed "aggregates across all governed regions", false for 45 of 55 surfaces).
- **`AwsRegionProvenance`** (`regions` on a multi-region response): `queried` / `reachable` / `unreachable` /
  `degraded`. `degraded` is a **subset of `reachable`** — the region answered but with `live: false`, so it
  contributed no data. When `unreachable` is non-empty the rendered total is a **floor, not a count**, and the
  surface must say so. An absent `regions` block means single-region *by construction*; it does **not** mean
  every region succeeded.
- **`guardrailsApi.storeStatus()`** (`GET /api/v1/guardrails/store-status`) reports the control-plane table's
  `table_name` / `control_region` / `governed_region` / `reachable` / `note`. A control-plane table has exactly
  one home region; when it is unreachable the response names the table **and** the region, never an empty list.

**`RegionCoverageBadge.tsx`** is where a `regions` block becomes something a viewer can read. Pass `noun` so the
tooltip can name what is a floor ("Agent counts", "Finding counts"). Four branches, and two of them render
**nothing** on purpose:

| Provenance | Renders | Why |
|---|---|---|
| `regions` null/absent | *nothing* | Single-region **by construction**. A badge here would assert coverage nobody measured. |
| one region, complete | *nothing* | The ordinary case. "1 region" on every card trains people to ignore the badge that matters. |
| `degraded` non-empty | slate `N/M live` | The region answered honestly and contributed nothing. Not an error, but the total covers fewer regions than it queried. |
| `unreachable` non-empty | amber `N/M regions` | The total is a **floor**. Outranks `degraded` even when both are true. |

**`FloorCountBadge`** (same file) is the non-region case of the same idea: a scan that hit its limit returns a
real number that is not the answer. It renders nothing when `truncated` is falsy, so callers pass the flag
through unconditionally. Live example: `risk-posture/security-hub` at `scan=200` returns `total: 200,
scanned: 200, truncated: true`, so `LiveSecurityPosture` reads **"≥200 active findings"** plus the badge, and
`GovernanceCommandCenter`'s severity tiles carry it too — "0 Critical" out of a truncated scan is not "no
critical findings", and that is the executive view.

Mounted at (measured 2026-09-08, each verified rendering against a real 2-region governed set):

| Site | What the badge covers |
|---|---|
| `risk/LiveSecurityPosture.tsx` | Security Hub finding counts, beside the `≥`-prefixed total |
| `risk/SecurityPostureCard.tsx` | two badges — Security Hub findings, and Inspector2 vulnerabilities separately |
| `GovernanceCommandCenter.tsx` | Security Findings card; the executive view is where "0 Critical" is most likely to be read as fact |
| `FleetOverview.tsx` | the "(N from AWS)" discovery count, and the guardrail invocation/block line |
| `FleetScaleView.tsx` | gated on `server.summary` — over a client-side fallback the badge would claim coverage the fan-out never produced |
| `ModelManagement.tsx` | the Invocations KPI card, **not** the section header, which spans five different sources |
| `safety/LiveBedrockEvals.tsx` | evaluation job counts (gated on `live`) |
| `safety/LiveRuntimeSafety.tsx` | invocation counts, beside the intervention rate |
| `data/KnowledgeBaseGovernance.tsx` | knowledge base counts (gated on `isLive`) |
| `ModelLifecycle.tsx` | Bedrock catalog active/legacy/total — one badge, because a missing region moves all three |
| `LivePromptTelemetry.tsx` | the invocation record list; **no** `FloorCountBadge`, since "latest N" already says it is capped |
| `risk/ConcentrationRiskCard.tsx` | the model-share denominator |
| `FleetScaleView.tsx` | also the attention queue (`queueRegions`) and the model/provider breakdowns (`inventoryRegions`) |

`ModelManagement.tsx`'s Availability & Routing tab carries three more: model availability (a region that does not
answer hides models that only exist there, so this is not merely a smaller count), inference profiles, and prompt
routers.

### Coverage of the fan-out vs. availability per row

The badge answers "did the fan-out reach everywhere it claimed?". That is **not** the same question as "can I
actually invoke this from every region I govern?", and the Availability & Routing tab now answers both separately.
Three distinct region facts live on that tab:

| Surface | Question it answers | Source |
|---|---|---|
| `RegionCoverageBadge` in a card header | How much of the fan-out succeeded | the response's `regions` provenance block |
| **Routes To** column (profiles) | Where a profile sends inference traffic | `AwsInferenceProfile.regions` |
| **Listed In** column (profiles, routers) | Which governed regions returned the row at all | `available_regions` |

The profiles column was called `Regions` and was genuinely ambiguous against the badge; it is now **Routes To**,
with **Listed In** beside it, so the distinction is rendered rather than only described in a comment. A profile that
routes to five regions can still have been listed from one.

`ListedInCell` flags a row amber when its `available_regions` is smaller than the set of regions *any* row came back
from. That per-row denominator is derived from the rows, **not** from `regions.queried`: provenance says which
regions answered, and a region can answer while legitimately not offering the resource. Using `queried` would paint
every row amber the moment one region went unreachable — a coverage problem the header badge already reports.

Section A gained the same idea for the catalog: a **By Region** strip of how many models each region lists, plus an
amber line counting models not listed in every region. The headline "Models" tile is the **union** across regions, so
it is larger than what any single region can invoke; routing to a region that does not list a model fails at invoke
time. The strip is hidden when only one region answered, since every model is then trivially available in "all" of them.

### All mounts are render-verified (2026-09-08)

Every mount in the table above was driven in a browser against the live account with two governed regions
(`us-east-1`, `us-east-2`) and confirmed by its **tooltip**, not by its badge text. That distinction matters:

**The "complete" branch's tooltip omits the `noun`.** Only the amber (`unreachable`) and degraded branches
interpolate it. So two complete badges on one page both render the identical string `2 regions` and are
*indistinguishable* — you cannot prove which component read which response by scraping text. The reliable technique
is `page.route` interception of **one** endpoint, injecting `unreachable: ['eu-west-1']` into just its `regions`
block. That flips only that mount to amber, and the amber tooltip names the `noun`:

```
"2 of 3 governed regions answered. No response from eu-west-1, so Profile counts
 shown here are a floor, not a count."
```

Nothing but the response body is touched — no backend change, no AWS call, no governed-region change.

Two scraping traps cost real time here, both worth avoiding next drive:

- **`document.body.innerText` does not reliably surface `<th>` text**, and Tailwind `uppercase` means headers come
  back as `ROUTES TO` / `LISTED IN`. Use `$$eval('th', …)` and compare case-insensitively.
- **Sub-tabs render `role="tab"`, not `role="button"`** (`SubTabButton` in `ModelManagement.tsx`), and a bare
  `getByText('Compliance')` can hit the sidebar link and navigate away instead of switching tabs. Scope to
  `getByRole('tab', {name: …})`.

Gating paths, since three of these are several levels deep and read as "missing" otherwise:

| Mount | How to reach it |
|---|---|
| `ModelLifecycle` | `/govern/models` → tab **Compliance** → sub-tab **Lifecycle** |
| `ConcentrationRiskCard` | `/govern/risk` → tab **Third Party** → sub-tab **Analytics** |
| `FleetScaleView` breakdown (`inventoryRegions`) | `/govern/agents` → tab **Registry at Scale** → check **Use real registry data**. Only the `registry` variant renders it; the `/govern/fleet` Scale view does not. |
| `FleetScaleView` queue (`queueRegions`) | `/govern/fleet` → **Scale** |
| the three `ModelManagement` badges + `Routes To` / `Listed In` / `By Region` | `/govern/models` → tab **Availability & Routing** |

**A drive must widen the governed set to 2+ first.** At the single-region baseline `RegionCoverageBadge`, `Listed In`
and `By Region` all collapse to nothing by design, so an unwidened drive looks exactly like a broken one.

**Three of those are not on a landing page**, which is worth knowing before concluding a badge is missing: a drive
of `/govern/data` and `/govern/prompt-governance` found nothing because `KnowledgeBaseGovernance` sits behind the
**Knowledge Bases** tab, `LiveRuntimeSafety` behind the `/govern/safety/runtime` and `/govern/safety/evals` routes,
and `LiveBedrockEvals` behind `/govern/safety/evals` and `ModelManagement`'s `model-evals` sub-tab. Same class of
mistake as `FleetScaleView` being invisible until `fleetView === 'scale'`.

Provenance reaches components through the hooks that own the fetch: `useFleetScaleServer().regions`,
`useAgentRegistry().discoveredRegions`, `useGuardrailMetrics().regions`. All three are `AwsRegionProvenance | null`.

Verifying the amber/degraded branches does **not** require breaking the account. Intercept the surface's own
endpoint with Playwright `page.route`, mutate only the `regions` block, and leave everything else live — that is
how `LiveBedrockEvals` was distinguished from `LiveRuntimeSafety` on a page that renders both.

### Guardrail Telemetry: One Request, and the Window Matters

Three hooks used to loop `guardrailsApi.getMetrics(template_id)` — one HTTP call per guardrail, all of which
404'd while the template store was unreadable. They now share `guardrailTelemetryMetrics.ts`, which derives the
per-template map from a single `governGuardrailsApi.telemetry(days)` call. `guardrailsApi.getMetrics` is kept
**only** for single-guardrail detail views (`GuardrailObservability.tsx`); never loop it over a fleet.

- **Windows are deliberately different, and are not interchangeable.** `useGuardrailMetrics` requests **30 days**
  and returns `windowDays` — read it rather than hard-coding a label (`FleetOverview` tooltips are template
  literals over it). `useGovernanceAggregator` and `useDataGovernance` request **1 day** because they feed
  `guardrailEvents24h`, `recentGuardrailBlocks` and the "Events (24h)" cards. Widening those silently inflates a
  number whose label claims 24 hours.
- **`interventions` is not `blocked`.** An intervention includes PII masking that still returns a response;
  `blocked` counts refusals only, so `blocked <= interventions` always. Measured at 24h: 307 invocations,
  301 interventions, **0 blocked**.
- **`anonymized_count` is 0 per template on purpose.** CloudWatch has no per-guardrail masking metric. Use
  `anonymizedFromPolicies(telemetry)` for the real account-wide `SensitiveInformationPolicy` count (263 measured)
  and label it account-wide.
- **A template whose Bedrock guardrail was deleted is absent from the map**, not zero. Absent means *no
  measurement*; rendering it as `0` would report a quiet fleet where there is no fleet.

### Mock Fallback Behavior
When AWS integrations are unavailable, components fall back to mock data:
1. API call returns error or empty data
2. Component catches error in useEffect
3. Falls back to mock data from `mockData.ts`
4. Displays `MockDataBadge` indicator

### Data Source Indicators
- `LiveDataBadge` - Green indicator for live AWS data
- `MockDataBadge` - Amber dashed indicator for demo data

### Autonomy Levels
Autonomy levels use a single canonical source (`AGENT_SCOPE_META` in `autonomyLadder.ts`):
- Level 1: Assisted - Human approves every action
- Level 2: Semi-autonomous - Human approves high-risk actions
- Level 3: Supervised - AI acts, human monitors
- Level 4: Autonomous - AI acts independently within guardrails

See `AUTONOMY_LADDER_RECONCILIATION.md` for reconciliation details.

---

## Getting Started

### For New Users

1. **Start at the Landing Page** (`/govern`)
   - View all 17 governance modules as cards
   - Use "Core Only" filter to focus on essential 9 modules
   - Check the Shadow AI alert banner for urgent issues

2. **Begin with Command Center** (`/govern/command-center`)
   - Get the executive view of your AI governance posture
   - See trust scores, compliance status, and risk exposure

3. **Explore by Pillar**
   - **See It**: Start with Agent Registry and Model Management to inventory your AI estate
   - **Govern It**: Use Compliance Center to assess your regulatory posture
   - **Show It**: Check Audit & Incidents for traceability

### For Administrators

1. **Connect AWS** - Use the Connection Wizard on the landing page
2. **Review Data Sources** - Expand the Data Sources panel to see integration status
3. **Configure Live Data** - Enable AWS integrations for real-time governance

### Module Guides

Each module includes inline help:
- **How to Use Guide** - Step-by-step usage instructions
- **Go Live Guide** - Instructions for enabling live AWS data
- **Setup Guidance** - Configuration requirements

---

## Key Files

| File | Purpose |
|------|---------|
| `CoreBadge.tsx` | Core badge component, pillar legend, module registry |
| `GovernWrapper.tsx` | Shared layout wrapper for all Govern pages |
| `GovernPageLayout.tsx` | Standard page layout component |
| `DataSourceIndicator.tsx` | Live/Mock/Pending badge components + the "AWS Data Sources" panel, whose 50 rows are driven by measured probes (see below) |
| `ConnectionWizard.tsx` | Per-source setup guidance over the same probe results; imports the catalog from `DataSourceIndicator` rather than restating it |
| `CommandCenter.tsx` | Command Center module |
| `GovernanceCommandCenter.tsx` | Main command center / observability hub |
| `AgentRegistry.tsx` | Agent inventory and discovery |
| `FleetOverview.tsx` | Fleet-wide metrics and monitoring |
| `FleetIdentitySection.tsx` | AgentCore workload identities surface on the Fleet page |
| `ModelManagement.tsx` | Model catalog and governance |
| `FinOps.tsx` | Cost tracking and FinOps capabilities |
| `ComplianceCenter.tsx` | Framework compliance and attestations |
| `PromptGovernance.tsx` | Prompt guardrails and PII controls |
| `AuditIncidents.tsx` | Audit trail and incident management |
| `RiskManagement.tsx` | Risk register and controls |
| `ShadowAI.tsx` | Shadow AI detection |
| `TrustStackPage.tsx` | Trust Stack 3-layer model |
| `AgenticGovernancePlaybook.tsx` | Governance playbook |
| `MultiCloudGovernance.tsx` | Multi-cloud governance |
| `DevToolsGovernance.tsx` | Agentic coding governance |
| `DeveloperAiUsageView.tsx` | Developer AI usage tracking |
| `PathJailEditor.tsx` | Path jailing rule editor |
| `PolicyDriftDashboard.tsx` | Policy-reality drift detection |
| `LlmMonitoringPatterns.tsx` | LLM quality monitoring guidance |
| `autonomyLadder.ts` | Canonical autonomy level definitions |
| `mockData.ts` | Mock data definitions for fallback |

### Sub-module Directories

| Directory | Purpose |
|-----------|---------|
| `safety/` | AI Safety sub-modules (RAI dimensions, frontier, MAESTRO) |
| `data/` | Data Governance sub-modules (quality, lineage, GraphRAG) |
| `finops/` | FinOps sub-components (ROI, token economics, chargeback, capacity) |
| `risk/` | Risk sub-components (register, dashboard, TPRM) |
| `metrics/` | Metrics panels and scorecard components |

### New Files (Recent Additions)
| File | Purpose |
|------|---------|
| `finops/CapacityManagement.tsx` | AWS Service Quotas monitoring for AI services |
| `PathJailEditor.tsx` | Path jailing rule CRUD and pattern testing |
| `PolicyDriftDashboard.tsx` | Policy vs reality drift detection and remediation |
| `LlmMonitoringPatterns.tsx` | LLM quality monitoring patterns and CloudWatch integration |
| `risk/VendorIAMAccess.tsx` | Real vendor IAM permissions audit (IAM + IAM Access Analyzer) |
| `LivePromptTelemetry.tsx` | Live guardrail aggregates + metadata-only per-invocation table |
| `ModelLineageViewer.tsx` / `useModelLineage.ts` | SageMaker ML Lineage graph viewer and hook |
| `operations/RunbookCenter.tsx` | Operations Runbooks tab incl. read-only SSM Fleet Manager |
| `data/KnowledgeBaseGovernance.tsx` | Live Bedrock Knowledge Base inventory (Data Governance → Knowledge Bases tab) |
| `operations/ServiceMap.tsx` | Live X-Ray service map, trace table, and segment-tree detail drawer (Operations → Traces (X-Ray) tab) |

---

## Core Module Implementation

Core badges appear on module cards and page headers via `CoreBadge.tsx`. Users can filter to "Core Only" view on the Govern landing page. All Core modules are wired to live AWS APIs with graceful mock fallback.

Module definitions in `CoreBadge.tsx`:

```typescript
export const CORE_MODULES: Record<string, { isCore: true; pillar: 'see' | 'govern' | 'show' }> = {
  'command-center': { isCore: true, pillar: 'see' },
  'agents': { isCore: true, pillar: 'see' },
  'fleet': { isCore: true, pillar: 'see' },
  'models': { isCore: true, pillar: 'see' },
  'finops': { isCore: true, pillar: 'see' },
  'compliance': { isCore: true, pillar: 'govern' },
  'prompt-governance': { isCore: true, pillar: 'govern' },
  'audit': { isCore: true, pillar: 'show' },
  'data': { isCore: true, pillar: 'show' },
};
```

---

## Wave-4 Deep-Audit Remediation

A 122-finding deep audit of the Govern module drove this remediation. Batch 1 (correctness and honesty
gating, committed as `1f88cd33`) and Batch 2 (derived metrics) are landed, and their effects are folded into
the module sections above rather than kept in a separate changelog. The module-wide rules they established are
listed under [Data Provenance & Hardening](#data-provenance--hardening); the read-only IAM additions the live
routes depend on are enumerated in `platform/control_plane/docs/ava-govern-iam-permissions.md`.

### Still open (Batch 3, wire-live)

Each of these is currently rendered honestly (unmeasured, badged, or explicitly labelled a projection) and is
tracked to be wired to a real source:

- **Real fleet uptime.** The fleet surfaces a point-in-time healthy/total ratio, not uptime over a window.
- **Measured SLA current-values.** The SLA tab's current-values (99.95 / 150 / 0.1) are hardcoded targets.
- **Per-agent fleet enrichment.** Scope level, environment, model, and policy are hardcoded by the live
  mapper, so every fleet distribution built on them is synthesized rather than observed.
- **Per-agent cost attribution.** Requires an activated cost-allocation tag; until then Cost Explorer cannot
  split spend per agent, and per-agent `avgCostPerDay` stays `0` and badged rather than estimated.
- **MTTD.** `DescribeAlarmHistory` supplies usable onset timestamps, but 0 of 85 alarms in the account cover
  AI/Bedrock/AgentCore, so an alarm has to exist before a detection time can be measured.
