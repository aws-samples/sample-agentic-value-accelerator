# Govern Module

> AI Governance, Risk & Compliance - one view.

The Govern module is the AI GRC (Governance, Risk, Compliance) hub for the AVA platform. It provides visibility into your AI estate, control over what it can do, and evidence to demonstrate compliance to auditors and regulators.

## Data Provenance Standard

Every Govern surface adheres to a **data-honesty** contract: a `LiveDataBadge` is shown only when the
rendered data reports `live: true` from its source; mock/illustrative/inferred content is explicitly
badged (`MockDataBadge` / "Inferred" / "Demo") and never presented as live. Where a live source returns
nothing, the surface shows an honest empty state instead of fabricated values.

Reliability & correctness invariants:
- **An honesty badge vouches for everything visually beneath it, so a page-level `LiveDataBadge` must never make a
  claim broader than its narrowest descendant.** Per-panel gating is defeated by any ancestor badge that overclaims:
  a header badge gated on one endpoint's `live` flag silently certifies every unbadged card on the page. Found on
  `DevToolsGovernance.tsx`, whose header read "Live team breakdown and usage data" while most cards were illustrative
  and no team dimension exists in any source. A page-level badge must either (a) name only the specific surfaces its
  endpoint feeds and explicitly disclaim the rest, or (b) not exist, leaving provenance to the panels. Corollary: an
  unbadged panel is not neutral — it inherits whatever the nearest ancestor badge claims.
  - **`LiveDataBadge` is opt-in and its default is green.** `DataSourceIndicator.tsx:558-565` degrades to
    `MockDataBadge` only on an explicit `live === false`; omitting `live` renders the green Live pill. Measured
    2026-09-04: of **278** call sites in the module, **16** pass a `live` prop and **262 (94%) pass none**.
    `live={true}` appears **0** times, so grepping for it is falsely reassuring — the risk surface is the sites
    with no prop, which look innocuous in review. **Always pass `live={…}` explicitly**, even when you believe the
    data is live; an un-gated badge is indistinguishable from a deliberate claim.
  - **Reachability is measured, never declared.** The "AWS Data Sources" panel
    (`DataSourceIndicator.tsx`, mounted on `GovernLanding.tsx:736`) previously defined 50 sources with a hardcoded
    `status`, 47 of them `'live'`, and rendered **"47/50 connected"** in emerald before any AWS call. It now holds only
    the static facts (id, name, API, description) and reads every status from
    `GET /api/v1/govern/data-sources/status`, which runs **one real AWS call per source** via
    `backend/src/services/govern_data_source_probes.py`. Seven statuses: `connected`, `connected_empty`, `degraded`,
    `access_denied`, `not_enabled`, `error`, `not_probed`. Counting rules — numerator = `connected` +
    `connected_empty`; denominator = `probed` = total − `not_probed`; emerald **only** when every probed source is
    connected and none are unprobeable; `—/— checking` while loading and "status unavailable" on fetch failure, never
    a number. A catalog id the backend does not probe renders `not_probed`, so there is no code path that turns a
    missing measurement into a green dot. **Do not add a `live: boolean` back to this contract** — the route used to
    send `'live': live if live is not None else True`, and coercing unknown to true is what produced the original
    overclaim; a boolean also cannot separate reachable-and-empty (counts) from reachable-but-disabled (does not).
    In the response, the numerator is `summary.reachable` and the per-status tallies are nested under
    `summary.by_status` (all seven keys always present, zeros included). **Keep those two namespaces apart.** A draft
    published them flat, so `summary.connected` held the numerator (43) beside a `summary.connected_empty` of 7 while
    only 36 rows carried `status == "connected"` — a caller adding the two flat fields got 50, the catalog size, which
    is the exact overclaim this contract removes. Measured in-account 2026-09-14: `reachable` **47**, `probed` 49,
    `not_probed` 1, and `by_status.error` **0**. The response also echoes the region tiers it probed against
    (`summary.regions = {govern: us-east-1, control: us-east-2, global: us-east-1}`), which is the cheapest way to
    see which tier a surface is actually talking to. See [Region Architecture](#region-architecture).
  - **A service's `.live` flag is not a reachability signal.** It answers "do I have rows to render". Eighteen of the
    fifty Govern services return `live=False` after a *successful* call that found nothing, and all of them swallow
    `ClientError` into an empty result. That fail-open used to be demonstrable on AVA's own control plane: four
    endpoints answered `200 []` because the table was not in the region the client had been built for and the
    `ResourceNotFoundException` was caught. **That instance no longer reproduces.** Every control-plane table now
    resolves its home through `table_region()`, so those four sources read `connected` / `connected_empty` instead
    of `error` — that is the `reachable` 43 → 47 move recorded above. The rule is unchanged, because the swallow is
    still in the services and the next misprovisioned table fails open the same way: the probes call AWS (or
    DynamoDB) directly and own their own `try/except`; forwarding `.live` would inherit the fail-open.
  - **The service-side counterpart is a reachability latch, not a row count.** A service can make the same
    distinction the probes make, and `GovernOperationsService._fetch_incidents` now does: it reads a `_table_ok`
    latch (set True after a successful query, False after a `ClientError`/`BotoCoreError`) instead of inferring
    "no store" from zero rows. So an empty-but-reachable table returns `live: true, source: "dynamodb"` with the
    note "No incidents recorded in the Operations store." — **a measured zero from a reachable store is live
    data** — while `source: "memory"` keeps its narrower meaning: a DynamoDB call failed earlier in this process
    and rows are NOT being persisted. The latch is a one-way, class-level flag shared by every DynamoDB operation
    on the service, so its note is hedged deliberately: it can say a call failed, not that the table is missing.
  - **Never compose liveness by OR-ing hooks.** `isLive = a || b || c` at page level is the dominant defect shape:
    one live signal paints a green pill over everything else. It also silently defeats deliberate downstream gates —
    `ComplianceCenter.tsx` gated its header on `apiLive || controlEvalsLive` while its data selector used `apiLive`
    alone, overriding the honesty gate `useComplianceAttestations.ts:101-105` was written specifically to enforce.
    Gate each surface on the flag belonging to the data it renders.
  - **A child that hides its badge in `embedded` mode is relying on its parent's.** Twelve framework views under
    `ComplianceCenter.tsx` do `if (embedded) return body;`, dropping provenance exactly where a page badge is most
    likely to overclaim. Render the badge in both modes.
- **App-wide `ErrorBoundary`** (`src/components/ErrorBoundary.tsx`) wraps all routes with a `path="*"`
  catch-all, so a component error degrades gracefully instead of white-screening the SPA.
- **Type gate** — `tsc -p tsconfig.app.json --noEmit` (`npm run typecheck`) is the source of truth; the
  esbuild-based Vite build does not type-check. The Govern module is kept type-clean.
- **Money math** — cost/chargeback reads are scoped to the AI/Bedrock service footprint; ROI is computed
  over the backend's 4-year horizon; token unit-economics windows are aligned to the cost-explorer window.
- **Account-ID masking** — account-bearing identifiers are masked server-side before they reach the frontend
  via the shared `mask_account_id` helper (`core/security_utils.py`), which uses digit lookarounds
  (`(?<!\d)(\d{12})(?!\d)`) so 12-digit account IDs are masked even when adjacent to `_` (as inside resource
  names / ARNs). It is applied across the security, IAM vendor-access, Bedrock inference-profile / prompt-router,
  governance (KMS / SCP), and AI-estate-inventory endpoints.
- **`null` means unmeasured; `0` means measured zero** — the two must never be conflated. A metric with no
  source emits `null` (typed `Optional[...]` in the Pydantic model, `number | null` in `client.ts`) and renders
  as an em-dash with a tooltip, never as `0`, `$0.00`, or a green "excellent" state. Consequently, guards use
  `x == null` / `is not None`, never truthiness — a truthiness check silently reclassifies a real measured `0`
  as unmeasured. Aggregates must not let a `null` coerce to `0` inside a `reduce`/`sum` under a Live badge.
- **Estimates never masquerade as measurements, and never as fallbacks** — there is no "default" pricing rate,
  no `|| 1` denominator, and no error-path that invents an inventory. When a rate or source is missing, the
  value is `null` and the response `note` says which basis was unavailable.
- **Internal consistency is not evidence of correctness** — making several views of a number agree with each
  other can *remove* the discrepancy that would have exposed a shared fabrication. Reconcile against an
  independent source instead (e.g. developer-AI token sums are checked against `/invocation-safety/telemetry`).
- **Swallowed exceptions are a data-honesty bug, not just an error-handling one** — a bare
  `.catch(() => {})` / `except Exception: pass` on a call that feeds a badged number renders "0" as if it were
  the measured answer. Degrade explicitly with `live: false` + a `note` instead.
- **A backend `T` → `Optional[T]` change is a breaking frontend change, and `tsc` will not catch it.** If the
  `client.ts` interface still declares the field non-nullable, the wire type is simply lying and the compiler
  stays silent while `null.toFixed()` / `null.toLocaleString()` throw at render. The Pydantic model, the
  `client.ts` DTO, and every consuming component's guard must land in the **same** commit. Worked example —
  `CostByModel.input_tokens`/`output_tokens`: the producer coerced with `(tok.input or 0) if tok else 0`, which
  flattened *two* distinct unmeasured cases (no invocation-log join at all; a model that emits no output-token
  field, e.g. embeddings) into the `0` a genuine measured zero produces. 7 of 11 real models read as "served
  1,531 requests, consumed zero tokens" under a Live badge. `or 0` on a measured field is the tell: it cannot
  tell absent from zero, which is the whole distinction.
- **Formatters own the null case.** Widen shared formatters to `(n: number | null | undefined)` and return the
  em-dash centrally rather than guarding N call sites; use explicit JSX guards only where a tooltip is needed.
  Formatters must also distinguish a real sub-threshold value from zero (`4e-06` renders `<$0.01`, not `$0.00`).
- **Never mutate an object returned from `get_or_load`.** The TTL cache hands back the cached instance itself, so
  `result.note = f"{result.note} - {stamp}"` accretes on every cache hit and the disclosure grows contradictory
  ("Cached 243s ago - Cached 263s ago"). Stamp via `model_copy(update=...)` so the cache entry is untouched.
- **`invalidate()` matches the key EXACTLY; a family of parameterized keys needs `invalidate_prefix()`.** Read
  paths cache under keys that embed their query parameters, so one logical resource occupies many entries
  (`ops:incidents:<table>:open:high:30:50:1`, plus one more per filter combination). A write has no way to
  enumerate them, and `invalidate()` is a `_store.pop`, so passing the bare stem matched **none** of them and
  every cached filter combination stayed stale until its TTL expired. `core/ttl_cache.invalidate_prefix(prefix)`
  drops every key with that prefix and returns how many it dropped.
- **Region coverage is part of provenance, not a deployment detail.** A count from one region and a count merged
  from five render as the same number in the same card, so every surface declares its reach and every fanned-out
  response names the regions it actually reached. See [Region Architecture](#region-architecture). Corollary:
  a surface stays `single-region` until its route really does fan out — the honest default is the narrowest claim.

### Recent live-data wiring

The latest wave extended live coverage across several surfaces, each still honoring the per-payload `live`
contract above:

- **Cross-module baseline** — `useGovernanceAggregator` sources its baseline live from
  `governCommandCenterApi.getData()`, `complianceApi.getPosture()`, `governModelsApi.catalog()`, and `maturityApi`
  (was hardcoded), with mock fallback. Incident summary, savings targets, and models-pending-review remain mock.
- **Framework deep-dives** — OWASP LLM Top 10, FINOS AIR, NAIC AI, CRI FS AI RMF, EU AI Act, and OSFI E-23 overlay
  live control evaluation via `governControlsApi.evaluate()` with per-source gating; NIST AI RMF and MITRE ATLAS stay static.
- **Operations** (`/govern/operations`) — fleet status, CloudWatch alarms, and ops metrics/MTTR are live via
  `governOperationsApi.*`; capacity is live via `governCapacityApi`. **Incidents now have a real control-plane
  store** (`fsi-control-plane-govern-operations`) and report `live: true, source: "dynamodb"` even when the
  partition is empty. Alert rules, SLAs, on-call and changes write to the same table but still derive `live` from
  the row count rather than from reachability, so an empty partition reports `live: false, source: "memory"`
  (measured 2026-09-14: `/alerts/rules`, `/sla`, `/oncall/*` and `/changes` all `total: 0`) and those tabs stay
  badged Mock.
- **Reports** (`/govern/reports`) — cross-source summary, agent resource inventory, and framework compliance are live
  via `useReportsLiveData` (`useReportsDataSummary` / `useAgentResourceData` / `useFrameworkCompliance`).
- **Vendor IAM, per-invocation telemetry, SageMaker lineage, SSM Fleet Manager** — the latest wave adds real vendor IAM
  access (IAM + IAM Access Analyzer, source `iam+access-analyzer`), metadata-only per-invocation telemetry from Bedrock
  model-invocation logs (source `bedrock-invocation-logs`, never prompt/response content), the live SageMaker ML Lineage
  graph (source `sagemaker-lineage`, honest empty state when the account has none), and a read-only SSM Fleet Manager
  view (source `ssm`, no execution wired). The fabricated ML-SBOM differential-privacy block was removed. A demo SageMaker
  estate later seeded in the account flipped two more surfaces live: the ML Lineage graph now returns ~31 real entities from a
  seeded training->model->endpoint pipeline, and SageMaker Model Monitor **data-quality drift is now live** via an on-demand
  analyzer reading baseline vs monitor-results from S3 (`governSageMakerApi.modelMonitor()`, `GET /govern/sagemaker/model-monitor`;
  Model Monitor *scheduling* is in AWS maintenance mode, so drift comes from the analyzer, not a live schedule). Clarify SHAP
  attributions stay Mock because SageMaker Clarify processing is in AWS maintenance mode (a platform block, not a wiring gap).
- **Phase 2 wave (all account-verified)** — six more surfaces went live: live Bedrock **RAG evaluations** (`governEvalsApi.jobs()`
  filtered to `RagEvaluation` + S3-parsed `scores()`; per-query studio stays Mock); a new **Knowledge Bases** view
  (`governKnowledgeBasesApi.list()`, source `Bedrock Knowledge Bases`); a new **X-Ray Service Map** (`governXRayApi.*`); **real AWS
  Budgets** (`governCostApi.budgets()`, `DescribeBudgets`) driving the Command Center budget card and `useGovernanceAggregator`
  in place of the hardcoded `BU_BUDGETS` mock; **Model Availability & Routing** (`governModelsApi.inferenceProfiles()` /
  `.promptRouters()`, sources `bedrock-list-inference-profiles` / `bedrock-list-prompt-routers`); and **KMS + SCP governance**
  (`governKmsApi.inventory()`, source `kms:...`, and `governScpApi.policies()`, source `organizations:...`, both honest about
  access limits). The illustrative per-case eval studios and other Mock surfaces are unchanged.
- **Follow-up wave (all account-verified)** — three more live capabilities plus three fixes. Live: **AWS Config Rules
  compliance** (`governControlsApi.configRules()`, `GET /govern/controls/config-rules`, source `aws-config`; ~710 real
  Config rules with per-rule compliance surfaced as an "AWS Config Rules" card in Compliance Center's Security Hub tab);
  **Inspector2 vulnerability detail** (`governSecurityApi.vulnerabilities()`, `GET /govern/security/vulnerabilities`, source
  `inspector2`; ~100 findings [5 CRITICAL / 33 HIGH], ~180 covered resources, real CVEs + fix-availability, in
  `risk/SecurityPostureCard.tsx` on the Risk Dashboard + Real-Time Monitoring); and **LLM Output Quality — now live** — a
  backend background producer (`core/llm_quality_producer.py`, started at app startup, interval `GOVERN_LLM_QUALITY_INTERVAL`,
  default 300s) publishes telemetry-DERIVED quality metrics to the `AVA/LLMQuality` CloudWatch namespace the AI Quality
  dashboard (`AIQualityMonitor`) already reads, flipping it from Mock to Live. The metrics are a governance-grade proxy
  derived from guardrail + invocation telemetry + Bedrock evals (not a direct per-response measurement): harmful_rate
  (guardrail `ContentPolicy`), groundedness (guardrail `ContextualGrounding` or Bedrock eval scores when present),
  refusal_rate + tokens_per_response (invocation-safety), latency from `AWS/Bedrock`; eval-quality dims are skipped when
  completed jobs lack those metrics, and each dimension is published only when its signal is genuinely live that cycle.
  Fixes: `GET /govern/data-catalog/summary` (and `/domains`, `/quality`, `/sensitivity`) 500 — a `get_or_load`
  call-signature bug in the Glue/Macie data services (now returns live data); framework attestation 404 for `osfi-e23`,
  `naic-ai`, `colorado-ai-act`, `mitre-atlas`, and `nist-genai-profile` (those frontend framework ids are now registered in
  the backend); and IAM Access Analyzer severity — switched to the v1 `ListFindings` API so the `isPublic` flag works, so
  public external-access findings are classified HIGH instead of always MEDIUM.
- **Latest wave (all account-verified)** — one new live capability plus two hardening fixes. Live: **AI Estate
  Inventory** (`governInventoryApi.resources()`, `GET /govern/governance/inventory`, source
  `resourcegroupstaggingapi:GetResources`) — the "AI Estate Inventory" page at `/govern/data/inventory`
  (`govern/data/AiEstateInventory.tsx`) listing every tagged AWS resource supporting the AI estate (~500 incl.
  bedrock-agentcore / lambda / eks), grouped by service with an `ai_related` flag derived from the service
  namespace (bedrock / sagemaker / etc.) plus ai / genai / llm / agentcore tag heuristics; account IDs are masked
  server-side. Fixes: **cost/by-model 422** — `useLiveMetrics` and `useLiveKPIs` passed `governCostApi.byModel(30)`
  but the endpoint caps months at 12 (→ 422 on the Command Center), now `byModel(12)`; and **account-ID masking
  hardening** — the shared `mask_account_id` helper (`core/security_utils.py`) switched from a `\b` word boundary
  (which missed account IDs adjacent to `_`) to digit lookarounds, with masking also applied to the IAM
  vendor-access ARNs / `resource_scope` and the Bedrock inference-profile / prompt-router ARNs; all govern live
  endpoints verified leak-clean.
- **Deep-audit remediation, Wave 4 (2026-09-04)** — a 122-finding audit of the whole module
  drove two remediation batches. This wave was mostly
  *subtractive*: its main product is the removal of numbers that looked measured and were not. Every magnitude
  below was re-measured against the live account, not inferred from the code.
  - **Batch 1 — correctness + honesty gating** (27 small fixes plus four "wrong number under a Live badge"
    rows): dead `:8001` API fallbacks, a permanently-404 endpoint path, field-name mismatches that rendered
    real 770ms latency as `0ms`, unweighted means presented as fleet rollups, and a Bedrock cost filter that
    omitted the service name carrying nearly all spend.
  - **Batch 2 — derived metrics** (15 findings). Newly live or newly honest:
    **AgentCore compute cost** — was structurally `$0.00`; now the real Cost Explorer "Amazon Bedrock AgentCore"
    service line allocated across runtimes by metered CPU/memory hours, so per-agent figures sum to the actual
    bill (`$0.3033` at 30d; `/cost/agent-costs` `live: true`, source `cost-explorer+cloudwatch-agentcore`).
    **Developer-AI tokens and cost** — a hardcoded `tokens += 1000` and flat `$0.01`/call became real Bedrock
    invocation-log tokens priced at per-model rates (0 events/`$0.00` → 2,280 events/`$11.38`), reconciled
    exactly against `/invocation-safety/telemetry`. **Agent Registry** — demo agents removed from headline KPIs
    (53 → 36 agents) and `governanceStatus` derived from real resource-tag evidence instead of being forced to
    `review_needed` (33 of 36 agents join; Unknown 41 → 3); provider cost for AWS now measured
    (`$10,680/mo` fabricated → `$31,972/mo`). **Command Center** — `risk_posture` was permanently `null`
    because the aggregator called a method that does not exist; `live_sources` 4 → 5. **Data governance** — two
    divergent 7-dimension readiness ladders reconciled onto one scored ladder (landing tile 14% → 38/100).
    **Fleet** — registry and access pillars were saturated formulas (pinned at 90% and 100% for any non-trivial
    fleet); now real ratios (49% tag coverage, 25% scope coverage), and the page no longer reports "0 guardrails"
    and "7 healthy" at the same time.
    Removed rather than fixed: the `approval_bypass` drift type (live UI over a dead code path with no detectable
    signal), a fabricated `infrastructure` capability bucket for a modality that does not exist, the savings and
    ROI series on the value-creation chart (no realised-savings source exists — relabelled "Monthly AWS Spend
    Trend"), and MTTD, which now reports "Not Measured" instead of `0` styled as excellent because nothing in
    the platform measures detection onset.
  - **IAM** — the read-only Govern role gained **82** least-privilege actions across **27** new service prefixes
    that live routes were already calling (81 → 163 unique actions, 7 → 34 prefixes, none removed). No wildcard
    **actions** (0 of 163) and no write actions. Two qualifications, because the short form overstates it:
    `Resource: '*'` *is* used in 38 of 47 statements — unavoidable for Cost Explorer, Security Hub, Config and
    peers that have no resource-level permissions, **except `S3EvaluationOutputRead`, which grants `s3:GetObject`
    on `'*'`** (account-wide object read) and *is* scopeable; and `logs:StartQuery`/`StopQuery` are write-shaped
    verbs kept because they are the required read path for Logs Insights.
    Running `cfn-lint` for the first time then surfaced two real bugs, both now fixed, template **exit 0**:
    - **`bedrock:GetGuardrailPolicy` does not exist.** Confirmed against two independent sources — absent from
      boto3's `bedrock` service model and rejected by `cfn-lint` — with zero backend callers. `GetGuardrail`
      already returns the policy configuration. Removed.
    - **`ComputeType: eks` was an allowed value with no trust-policy branch.** Every `!If` in
      `AssumeRolePolicyDocument` resolved to `AWS::NoValue`, producing an IAM role with an empty `Statement` list,
      which CloudFormation rejects — so a documented, selectable deployment target could not deploy at all. Added
      the EKS **Pod Identity** branch (`pods.eks.amazonaws.com` with `sts:AssumeRole` + `sts:TagSession`, verified
      against AWS documentation) rather than IRSA, so no OIDC-provider parameter is required.
    - **Lesson worth keeping:** the template had never been linted, and both defects were invisible to review —
      one was a plausible-looking action name, the other an absence. Lint IAM templates in CI.
  - **IAM tightening + single canonical role (2026-09-09)** — closes the two qualifications above.
    - **`S3EvaluationOutputRead` is now bounded twice.** `aws:ResourceAccount: ${AWS::AccountId}` is
      unconditional, so it can never read cross-account, and a new `EvaluationOutputBucketArns`
      CommaDelimitedList parameter narrows `Resource` to the exact ARNs supplied. The first attempt derived both
      ARNs per bucket with `!Split`/`!Select`/`!Sub` and **only covered the first bucket** — worse than the broad
      grant, since it looks scoped while dropping the rest. CloudFormation cannot map over a list, so the
      parameter takes full ARNs and the operator passes `arn:…:::b` and `arn:…:::b/*` per bucket.
    - **Write actions are now an opt-in policy, `EnableWriteActions` (default `false`).** Previously the role was
      described as having no write permissions while several features silently needed them. The single
      `AVAGovernWriteActions` policy is not created at all when the flag is false, so
      `aws iam list-role-policies` answers "can this role write?" in one call. Bounds: `bedrock:ApplyGuardrail`
      on `guardrail/*` in this account; `cloudwatch:PutMetricData` conditioned to the `AVA/LLMQuality` namespace;
      `cloudwatch:DeleteAlarms` scoped to `alarm:AVA-*` so it can only delete what it created;
      `PutDashboard`/`PutMetricAlarm` unbounded (both overwrite by name — the widest grant, documented as such);
      `servicequotas:RequestServiceQuotaIncrease`. **`s3:PutObject` is never granted, flag on or off.**
      Aggregate inline-policy size measured at ~9,100 chars read-only and ~9,860 with writes, against IAM's
      10,240 cap.
    - **Two duplicate role definitions deleted**, leaving `infrastructure/iam/ava-govern-role.yaml` as the only
      one. Framed initially as "adopt the parameterised pair, retire the old", which measurement showed was a
      **regression**: 88 actions each against 167, missing 116 including `bedrock:ListAgents` (referenced by 23
      backend services), `bedrock-agentcore:ListAgentRuntimes`, `bedrock:ListInferenceProfiles`,
      `bedrock:ListKnowledgeBases` and every `auditmanager` action. Strict subsets, not alternatives.
      `platform/control_plane/README.md` had live deploy commands pointing at both deleted paths.
  - **Token rates reconciled; a dead, 3x-wrong, circular estimator deleted (2026-09-09)** — three per-1K rate
    tables disagreed by up to 3x on the same model. What the investigation actually found was worse than drift:
    - **`govern_cost_service._BEDROCK_PRICING` was entirely dead.** Its key matcher stripped hyphens from the
      dict key but not the model string, so `"nova-pro"` -> `"novapro"` matched nothing. Simulated against the
      11 model names the code really produces: **11 of 11 fell through to `default`**, so every token estimate
      used one Sonnet rate. Confirmed live by reconciling the payload: Opus 5 cache_read $169.21 ->
      564,027,571 tokens = `169.21 / 0.0003 x 1000`, the default rate.
    - **Its one consumer was circular.** `$/1K = dollars / ((dollars / rate x 1000) / 1000)` reduces to `rate`,
      so "Cost / 1K output" showed exactly **$0.0150 on every account**. The comment claimed a prior fix for
      this; the circularity had only moved.
    - **Deleted, not repaired** - token counts are measured from CloudWatch, so nothing needs inferring from
      spend. `TokenCost.tokens` is now always `None` (field retained for client compatibility); dollars
      unchanged and still measured.
    - **New `core/model_pricing.py`** is the single forward-pricing source, with 17 regression assertions.
    - **Two live mispricings fixed**: Opus 4.5/4.8 were priced at Claude-3-Opus rates (0.015/0.075 vs published
      $5/$25 per 1M) via a bare `claude-opus` family key; and a generic `"titan"` row matching no published
      Titan price overstated Titan Embeddings V2 input **15x** while inventing an output rate for a model with
      no output tokens.
    - **Bare family keys removed.** They cannot match Claude 3 ids (`claude-opus` is not in `claude-3-opus`), so
      they only ever caught current-gen models and priced them at legacy rates. Era models are keyed explicitly;
      an unlisted model returns `None` -> "cost unavailable".
    - **Provenance is now part of the rate data**, because current-gen Claude rates are genuinely unverifiable:
      across all 11,621 `AmazonBedrock` usagetypes in the Price List API the only Anthropic entries are Claude
      2.0, 2.1, 3 Haiku, 3 Sonnet and Instant (Marketplace billing), and the pricing page renders per-model
      tables client-side. Each rate is `VERIFIED` with a named source or `BEST_KNOWN`.
    - **Cache multipliers are provider-specific**: Anthropic write 1.25x / read 0.10x; Nova write **$0.00** /
      read 0.25x. Stated per model, never derived from a single ratio.
    - `gateway/litellm-config-local.yaml` is deliberately left separate - per-token units, and it is the only
      surface whose rates price real production spend.
  - **Agentic coding: AI tool provenance with coverage denominators (2026-09-11)** — step 1 of the shadow-AI
    defence-in-depth design. `core/ai_tool_provenance.py` (pure, 41 tests, 5 mutations verified caught) plus
    `GET /govern/developer-ai/provenance` and a Detection-tab panel. No new AWS infrastructure.
    - **Two classifications, evidence only, each with an explicit unknown.** `call_path` is
      `bedrock | public_api | unknown`; `install_provenance` is
      `managed | managed_runtime | self_installed | unknown_host`.
    - **`public_api` is structurally unreachable without DNS logging.** The classifier accepts a resolver-log
      hostname as its ONLY route to that value, so it cannot be inferred from the absence of a Bedrock call. The
      consequence is stated rather than buried: with 0 of 5 VPCs logging, a tool calling a vendor endpoint
      produces **no record at all** — absent from the counts, not counted as `unknown`.
    - **Three-state install discipline, both directions.** `unknown_host` is not `self_installed` (no endpoint
      coverage ≠ hand-installed), and `managed_runtime` exists because filing a Lambda under `unknown_host`
      counts governed infrastructure as a visibility gap. `managed_hosts=None` (could not read) is kept distinct
      from `set()` (read, nothing managed) — same verdict, different evidence.
    - **Fixed a live false positive.** The prior detector took `user_agent.split("/")[0]` and listed a production
      workload's `Boto3/1.42.97` as a **high-risk local agent**. `tool_class` now separates `coding_tool` from
      `sdk_caller`, and `exec-env/AWS_Lambda_python3.12` in the same string resolves it to an AWS runtime. The
      neighbouring Local Agent Discovery badge also claimed source `CodeCommit` for CloudTrail-derived rows; it
      now reports the real source.
    - **Coverage renders above the findings**, because zero findings at zero visibility and zero findings at full
      visibility are the same number. `pct` is `null` at a zero denominator and shows "no denominator", never 0%.
      `blind_spots` is backend prose printed verbatim, including the one that defuses a complete endpoint ratio
      sitting beside an unattributed caller — that ratio counts EC2, and developer machines are not EC2.
    - **Live measurement**: 52 calls, 1 caller/tool pair over 7d; endpoint 2/2, package inventory 2/2, DNS 0/5.
      `AWS:Application` inventory turned out to be already collecting, so tool-level provenance works today.
    - **Next**: Route 53 Resolver query logging makes `public_api` real. It needs AWS resources created, so it
      belongs in the IAM template and Terraform. Off-corporate-network laptops stay out of scope for cloud
      telemetry and the UI says so.
  - **FinOps: spend period selectable, and the switch no longer flashes (2026-09-11)** — the Cost Explorer
    panels were pinned to a hardcoded 6 months. They now take a five-preset window (month to date, last month,
    3 / 6 / 12 months) defined once in `finops/spendWindow.ts` and sent as `months` + `months_offset`.
    - **A bare `months` number cannot express the set.** Month-to-date and last month are both one calendar
      month; they differ in where the window *ends*. Hence the offset — and it MUST appear in every backend
      cache key and every React effect dep array, or the two presets are indistinguishable and switching
      between them silently no-ops. Both bugs were live before they were caught.
    - **The control is the footer of the AWS Spend card.** As a page-header control and then as its own card
      above the graphic it read as a page-wide filter and was missed.
    - **Stale-while-revalidate, not a skeleton.** `useAwsCost`, `useAwsCostDetail`, `useAwsCostEnhanced` and
      `useTokenCosts` split `loading` ("nothing to display yet", first mount only) from `refreshing` ("fetch in
      flight over rendered figures"). Previous figures stay up, dimmed, with an **"Updating…"** pill. The pill
      is load-bearing: for a moment real numbers from the old period sit under the new period's label.
    - **Panel labels are derived, never literal.** Two `last 6 months` strings survived the first pass and had
      to be replaced with the selected window; capped sources (trend, anomalies, use-case spend, AgentCore at 90
      days; by-resource at 14) state the window they are *actually* on rather than inherit the heading.
    - **Verified live** at 1600x1200 against the running stack: one selector, positioned below the figures and
      43 px off the card bottom; 30 samples over 1.5 s with no blank or skeleton; total moved
      $58,459 (6 months) -> $24,218 (August, `2026-08-01 -> 2026-09-01`).
    - **Deeper than ~13 months needs CUR**, not more offsets — that is Cost Explorer's API retention limit.
      `spendWindow.ts` documents the seam. Enabling CUR does not backfill; history starts at first delivery.
  - **FinOps: cached tokens surfaced, cache dollars separated (2026-09-09)** — cache token support already
    existed end-to-end (CloudWatch `CacheReadInputTokenCount` / `CacheWriteInputTokenCount` through to
    `finops/TokenEconomics.tsx`) but rendered nothing, because the tab requests month-to-date and this account's
    cache activity stops 2026-08-26. Measured live: **0 at 7/9/14 days, 494.8M read / 39.8M write at 30 days**.
    - **The MTD window was preserved**, since it is what keeps token counts and Cost Explorer dollars on the same
      period and makes blended $/1k correct. A dedicated **Prompt Caching** panel takes its own 7/14/30-day
      lookback, states which window it used, and warns against dividing its counts by the MTD dollars.
    - **Cache write is now displayed.** It was computed but never rendered, despite being the dimension billed
      ABOVE the standard input rate — the one that can make caching a net loss. Shown with a read:write ratio.
    - **Cost Explorer cache dollars separated** into `fresh_input_total` / `cache_read_total` /
      `cache_write_total`, additive to an unchanged `input_total`. Both cache dimensions had been folded into
      `input`, making cache spend unrecoverable. On the live account: **$446.79 of $462.01 input dollars were
      cache**, cache write alone $187.81.
    - **Deleted a fabricated savings figure** that multiplied total spend by a token ratio and a hardcoded 0.9
      discount (an open audit finding). A saving is a counterfactual nothing measures; measured spend replaced it.
    - **`absent -> 0` fixed** on the cache metrics: CloudWatch returns an empty `Values` list both for "summed to
      zero" and "never published", which for cache tokens mean opposite things. Now `Optional[int]`, with the
      multi-region merge summing only over regions that measured. 4 of 9 live models correctly read "not measured".
    - **`_BEDROCK_PRICING` cache_read corrected** from 0.25x to the documented 0.10x of the input rate; since the
      rates back-derive counts from dollars, the over-stated rate had been under-stating cached token volume.
    - **Cost Explorer and CloudWatch attribute to different dates** (billing vs usage; these Claude models are
      Marketplace-billed), so the two can legitimately disagree about when cache activity happened. Surfaced as a
      named condition rather than reconciled silently.
    - Root cause of 0% caching today: no `cachePoint` block exists in the backend or gateway, so the platform
      never requests prompt caching. The empty state says so instead of showing a bare "No prompt caching".
  - **One autonomy ladder; readiness scoring rebuilt (2026-09-09)** — `trustTier.ts` defined a second four-point
    scale (T1 Probation → T4 Autonomous) beside the existing L1–L4 scope ladder. **Deleted before it ever reached
    the UI**: two four-point scales over the same agent are ambiguous, and the collision was concrete — "Supervised"
    is L3, the second *highest* scope level, but would have been T2, the second *lowest* trust tier. Three of its
    four mechanics were folded into the graduation model; the fourth, the delegation-chain minimum, already existed
    as the A2A autonomy ceiling `min(source, target, policy.max_delegated_autonomy)`.
    - **Weighted criteria.** `readiness` was `passed / len(criteria) * 100`, so a blocking safety gate moved the
      score exactly as much as an advisory rate: an agent could show **86% readiness with a blocking gate shut**.
    - **Unknown ≠ failed.** An `insufficient` criterion stayed in the denominator, so not-measured scored as
      failed. Unknown criteria now leave the calculation, coverage travels with every score, and readiness is
      `null` below 60% coverage or when a blocking criterion is unknown — never 0.
    - **Hysteresis**, with the bar shown as tested (`>= 92% to earn (90% to hold)`).
    - Three defects caught by testing before shipping: a *relative* margin made **L4 unreachable**
      (`minAgreement` 95 x 1.1 = 104.5%), so bounded percentages now use an absolute 2-point margin capped at 100;
      a float epsilon failed an agent measured at exactly 99 against a 99 bar; and adding an Error-rate criterion
      scored the service's hardcoded `error_rate = 0.0` placeholder as a **pass on a dimension with no feed**, now
      gated on `error_rate_measured`.
    - `insufficient_evidence` became a distinct verdict (previously `conditional`, i.e. "eligible with monitoring",
      for an agent with three logged decisions), and the `client.ts` adapter stopped mapping
      `insufficient -> warning`, which had erased the distinction again at the boundary.
  - **Score transparency: `ScoreDisclosure.tsx` (2026-09-09)** — Govern renders several 0-100 numbers that are not
    comparable: `riskScore` is higher-is-worse, readiness and posture are higher-is-better. A bare "78" meant
    opposite things depending on the panel. Polarity, method, inputs and coverage now travel with the number, via a
    "How this score works" disclosure that names the criteria which could not be evaluated and states whether the
    figures are live or illustrative. Also corrected `Documentation.tsx`, whose "Autonomy Levels" table documented a
    five-level L0–L4 ladder with different names than the four levels `AGENT_SCOPE_META` actually renders.
  - **Guardrail orphan reconciliation (2026-09-09)** — `POST /api/v1/guardrails/reconcile-orphans`, ADMIN-gated,
    `dry_run=true` by default. Four template rows referenced guardrails absent from AWS while still marked
    `active`, so every count derived from template rows over-reported enforcement by four; `/aws-summary` now
    reads `in_sync: true` with `closed_rows: 4`. Three deliberate constraints: it never calls Bedrock beyond
    `ListGuardrails` (the obvious route, `delete_template`, calls `_delete_bedrock_guardrail()` — a **real**
    delete, which would throw on an orphan and would destroy a live guardrail on a mistyped id); it **aborts if
    `ListGuardrails` returns nothing**, since empty is indistinguishable from a permission or wrong-region
    error; and `/aws-summary` excludes `deleted` rows from the comparison, without which a closed row still
    carries its `guardrail_id` and the drift flag never clears.
  - **Still open (Batch 3, wire-live):** real fleet uptime vs point-in-time health, measured SLA current-values,
    per-agent fleet enrichment (scope/environment/model/policy are still hardcoded), and per-agent cost
    attribution via an activated cost-allocation tag.
- **Region honesty + guardrail telemetry (2026-09-04, account-verified)** — see
  [Region Architecture](#region-architecture) for the tier model. Three changes worth carrying forward:
  - **Guardrail metrics: N requests → 1.** `useGuardrailMetrics`, `useGovernanceAggregator` and
    `useDataGovernance` each built their per-template metrics map by looping
    `guardrailsApi.getMetrics(template_id)` — one HTTP call per guardrail, and **every one of them a 404** while
    the template store was unreadable (7 × `404 /api/v1/guardrails/<id>/metrics?hours=24` on one Govern landing
    load). `GET /govern/guardrails/telemetry` already returns the same CloudWatch rollup for the whole account in
    a single request, so the fan-out bought nothing. Shared derivation in
    `govern/guardrailTelemetryMetrics.ts`. Verified by driving the app: `/govern`, `/govern/fleet` and
    `/govern/data` now make 37 / 44 / 31 API calls with **0 failures**, and the only remaining
    `guardrailsApi.getMetrics` caller is `GuardrailObservability.tsx`, a single-guardrail detail view — which is
    what that method is for.
  - **`InvocationsIntervened` is not `InvocationsBlocked`.** An *intervention* includes PII masking that still
    returns a response; only a *block* is a refusal, so `blocked <= interventions` always. Measured in-account at
    24h: 307 invocations, **301 interventions, 0 blocked** — of which 263 are `SensitiveInformationPolicy`
    (masking) and 18 `TopicPolicy`. Labelling interventions as blocks would have reported a 98% block rate on a
    fleet that refused nothing. Relatedly, **CloudWatch has no per-guardrail masking metric**: the old
    per-template endpoint never set `anonymized_count`, so the data-governance card was summing a constant `0`.
    It now reads the account-wide `SensitiveInformationPolicy` dimension (263) and is explicitly labelled
    account-wide, because attributing it to one guardrail would be a guess.
  - **Telemetry windows are load-bearing and deliberately differ.** The old endpoint took `hours=24`; telemetry
    takes `days`. `useGuardrailMetrics` uses **30 days** and reports it back as `windowDays` (`FleetOverview`
    tooltips are template literals reading that value, not the old hard-coded "24h" string); the aggregator and
    data-governance hooks use **1 day** because they feed `guardrailEvents24h`, `recentGuardrailBlocks` and the
    "Events (24h)" cards, whose rendered labels claim 24 hours. Widening those would have silently inflated them.
    Any hook feeding a window-labelled field must request the window its label claims.
  - **Known drift, not a bug in the above:** 11 templates carry a `guardrail_id` but only 7 guardrails exist in
    Bedrock. The four orphans are **absent from the metrics map**, not reported as zero traffic — absent means
    "no measurement", and callers must not read it as a measured zero. Their ids are not listed here because they
    name live guardrails in the reference account; `GET /guardrails/aws-summary` returns them as `orphaned_ids`.

## Region Architecture

"Multi-region" is three different questions in this codebase and only one of them is answered by fanning out.
Every boto3 client the backend builds belongs to exactly one tier; picking the wrong tier is how a
correctly-provisioned table renders as an empty list. Defined in `backend/src/core/region_config.py`.

| Tier | What it reads | Access | Region rule | Helper |
|---|---|---|---|---|
| **1 — Control plane** | AVA's own DynamoDB tables | read-**write** | One home region per table. **Never a union.** | `control_region()`, `table_region(key)` |
| **2 — Governed resources** | The customer's AI estate (Bedrock, AgentCore, SageMaker, and the CloudWatch metrics they emit) | read-**only** | Fan out over the governed set and merge | `get_governed_regions()`, `core.multiregion.run_over_regions` |
| **3 — Global / pinned** | Services with no meaningful per-region view | read-only | One endpoint, pinned in one place | `resolve_service_region(service, requested)` |

**Why tier 1 is not a union.** These tables are written, not just read. A union means an item edited in one region
stays stale in the other, the UI shows duplicate rows with no defined winner, and there is no tie-break to apply.
If a control-plane table genuinely needs to live in more than one region, the answer is DynamoDB **Global Tables**
(multi-active, streams, last-writer-wins) declared in Terraform — not an application-level merge.

**Tier 1 resolution is configured, never discovered.** `table_region(table_key)` resolves most-specific-first:
`<TABLE_KEY>_TABLE_REGION` env var (relocate one table) → `CONTROL_PLANE_TABLE_REGION` setting (relocate all) →
`AWS_REGION`. Probing candidate regions for a matching table name was considered and **rejected**: if the same
name exists in two regions, discovery silently picks one, and a control-plane table picked at random is a
split-brain write target.

| Knob | Scope | Default | Where |
|---|---|---|---|
| `<TABLE_KEY>_TABLE_REGION` | Relocates exactly one table | unset | read from the environment inside `table_region()` |
| `CONTROL_PLANE_TABLE_REGION` | Relocates **every** control-plane table at once | unset — falls through | `core/config.py` setting |
| `AWS_REGION` | The control-plane region itself; the final fallback | `us-east-1` | `core/config.py` setting |

`<TABLE_KEY>` is the settings prefix in front of `_TABLE_NAME`, so the knob name is derivable from the table it
moves: `GOVERN_OPERATIONS_TABLE_NAME` → `GOVERN_OPERATIONS_TABLE_REGION`, and likewise `GOVERN_COMPLIANCE`,
`FINOPS_SPEND`, `GUARDRAILS`, `DEPLOYMENTS`, `GOVERN_AUDIT`. Hyphens are normalized to underscores and the key is
upper-cased. Nothing outside `table_region()` may derive a control-plane table's region — a caller reading
`settings.AWS_REGION` directly is correct only until someone sets one of the two overrides, at which point it
writes to a different table than every other caller reads.

**Measured in the demo account (2026-09-14).** `AWS_REGION=us-east-2` holds the control-plane DynamoDB tables.
`GOVERN_AWS_REGION=us-east-1` holds the governed fleet — `/govern/operations/fleet/status` reports
`source: "7 Bedrock | 29 AgentCore"` — plus the 7 Bedrock guardrails and the CloudWatch alarms behind
`/govern/operations/alerts/active`. `GET /govern/data-sources/status` echoes the whole split back as
`summary.regions`, so the two tiers can be read off one response instead of inferred.

**Two control-plane tables were added by this split**, both resolving their home through `table_region()`:

| Setting | Table | Holds | Was |
|---|---|---|---|
| `GOVERN_OPERATIONS_TABLE_NAME` | `fsi-control-plane-govern-operations` | incidents, alerts, SLAs, changes | `ava-operations-incidents`, which **never existed in any region**. Deliberately **not** aliased: nothing was ever written under it, so there is no data to migrate. |
| `GOVERN_COMPLIANCE_TABLE_NAME` | `fsi-control-plane-govern-compliance` | control attestations and evidence | hardcoded in the route as `ava-govern-compliance` in `us-east-1`, which existed in **neither** region, so every attestation lived in process memory and died on restart. |

An off-convention table name is not a cosmetic problem. `table_region()` derives the relocation knob from the
settings prefix, so a name outside the `fsi-control-plane-*` / `<KEY>_TABLE_NAME` convention had no provisioned
target **and** no way to be pointed at one.

`GovernComplianceService` now takes `region` as a **required** argument for the same reason. It used to default to
`"us-east-1"`, which is not where the table lives, and the failure was silent and sticky: one caller omitting the
kwarg latched the class-level `_table_ok` to `False`, after which every correctly-configured instance in the
process wrote attestations to a dict that dies on restart while still answering `200`.

#### A tier-1 read inside a tier-3 service needs its own region field

This is the pattern the tier split exists to make sayable. A service pinned to a global endpoint still has to read
AVA's own tables, and those two regions are unrelated. `GovernCostService` therefore carries **three**:

| Field | Tier | Resolved by | Reads |
|---|---|---|---|
| `region` | 3 | `resolve_service_region("ce", …)` → `us-east-1` | Cost Explorer, Budgets, STS |
| `spend_table_region` | 1 | `table_region("FINOPS_SPEND")` | the control-plane FinOps spend table |
| `govern_region` | 2 | `GOVERN_AWS_REGION` | CloudWatch `AWS/Bedrock*` and Service Quotas for the fleet |

Passing the Cost Explorer pin as the table region is exactly what made `/govern/cost/by-use-case` fail with
`ResourceNotFoundException` against a table that exists, one region over — and report it to the UI as "table not
provisioned". The cache key for that read is keyed on `spend_table_region`, **not** `region`: relocating the table
must invalidate the entry, and `region` is pinned and never changes.

**Collapsing two of these into one field fails SILENTLY, which is why it survives review.** An AWS read against
the wrong region does not raise. It succeeds and returns that region's inventory, which is usually smaller or
empty, so the wrong answer arrives well-formed and gets badged live. Three instances, each recorded at its fix
site:

- **Operations Hub fleet.** `GovernOperationsService` built its `bedrock-agent`, `bedrock-agentcore-control`,
  `cloudwatch` and `service-quotas` clients from the *incidents table's* region. `ListAgents` in `us-east-2`
  succeeded and returned the one agent that happens to live there instead of the fleet in `us-east-1`, so the Hub
  reported a **1-agent fleet under a Live badge** — and every CloudWatch health metric was read from a region with
  no datapoints and scored as healthy silence. The fleet clients and the fleet cache keys are now on
  `govern_region`.
- **Compliance auto-detection.** `GovernComplianceService` pointed all nine auto-detect scanners at the
  attestation table's region, where the governed fleet does not exist. Detections dropped from 25 to 11 and
  surfaced as a false "no evidence found" rather than an error.
- **Agent cost and forecast.** The `AWS/Bedrock*` and Service Quotas reads in `GovernCostService` inherited the
  Cost Explorer pin, which is correct only while `GOVERN_AWS_REGION` happens to equal `us-east-1`.

Rule: a boto3 client's region comes from the tier of the thing it reads, never from a neighbouring field that
happens to hold a region string.

> **Worked example — the region-split bug.** With `AWS_REGION=us-east-2` (control) and
> `GOVERN_AWS_REGION=us-east-1` (governed), `GET /api/v1/guardrails` returned `200 []` while 11 real templates sat
> in `fsi-control-plane-guardrails`: the table was provisioned in `us-east-1`, the client was built in
> `us-east-2`, and the service swallowed the `ResourceNotFoundException` into an empty list. Fixed by
> `GUARDRAILS_TABLE_REGION=us-east-1` **plus** an honest failure path — `GuardrailService.store_status()`
> (`GET /api/v1/guardrails/store-status`) returns `{table_name, control_region, governed_region, reachable, note}`,
> and a miss names both the table **and** the region searched and tells the operator which env var to set.
> A miss must never be an empty list. The data-source probe for this row resolves through the same
> `table_region()` call (`ProbeSpec("ava-guardrails", …, table_key="GUARDRAILS")`), so the panel and the API can
> never disagree about where the table lives.

**Tier 3 has two sub-cases and they are not interchangeable.** Verified against botocore, not assumed:
- **botocore auto-pins**, so the region you pass is ignored — `ce` → `ce.us-east-1.amazonaws.com`,
  `budgets` → `budgets.amazonaws.com`, `organizations` → `organizations.us-east-1.amazonaws.com`,
  `iam` → `iam.amazonaws.com`. Passing a governed region is harmless but *misleading*: it implies a per-region
  call that cannot happen.
- **botocore does NOT auto-pin**, and the wrong region is a real failure — `health` in `us-east-2` resolves to
  `health.us-east-2.amazonaws.com` and `support` to `support.us-east-2.amazonaws.com`, neither of which serves
  the API. These need an explicit pin, which is why `govern_health_service` and `govern_trusted_advisor_service`
  overwrite any region handed to them.

Cost Explorer is tier 3: **per-region cost comes from CE's `REGION` dimension, never from a client fan-out.**

### Declared scope per surface

`core/region_scope.py` is a registry each route module populates at import time, next to the code it describes:

```python
REGION_SCOPE = region_scope.declare("govern_macie", region_scope.SINGLE_REGION, prefix="/govern/macie")
```

Import-time rather than call-time on purpose: every route module is imported when the app builds its router, so
the registry is complete before the first request. A lazily populated version would report "no single-region
surfaces" until someone happened to load the page that proves otherwise. The key is the route **module** name,
not the router prefix, because prefixes are **not unique** — `govern_models` / `govern_invocations` both mount
under `/govern/models`, `govern_cost` / `govern_cost_resource` under `/govern/cost`, and `govern_governance` /
`govern_resource_tags` under `/govern/governance`. Two modules sharing a prefix can have different scopes, and
collapsing them onto one key would let the wider claim silently overwrite the narrower one. An undeclared
surface defaults to `SINGLE_REGION` — the narrowest claim, because a surface that forgot to declare has almost
certainly not been fanned out.

`GET /api/v1/govern/regions/scope` serves the registry so the UI can label a panel with the reach its data
actually has. Measured 2026-09-04, **all 55 Govern route modules declare a scope**:

| Scope | Count | Meaning for a number on screen |
|---|---|---|
| `multi-region` | 10 | Aggregated across the governed regions; the response names the regions it reached and any it could not. |
| `single-region` | 31 | Reads `GOVERN_AWS_REGION` only. Matching resources in other governed regions are **not** in these counts. |
| `account-pinned` | 3 | One account-wide endpoint (Cost Explorer, Budgets, Organizations, IAM). Already covers every region; fanning out would re-ask the same endpoint and double-count. |
| `control-plane` | 11 | AVA's own state. Where that state is a DynamoDB table it has one home region; where it is in-process (`govern_path_jail`, `govern_harness_policy`), region has no meaning at all. |

The ten `multi-region` surfaces: `govern_agentcore`, `govern_evals`, `govern_fleet`, `govern_guardrails`,
`govern_invocation_safety`, `govern_knowledge_bases`, `govern_models`, `govern_regions`, `govern_risk_posture`,
`govern_security`. (`govern_regions` probes every *enabled* region, which is wider than the governed set.)

**Nothing in the registry changes behavior.** It is a description, and its only job is to be true.

#### `account-pinned` has the opposite coverage problem, and it is the one that costs money

The three `account-pinned` surfaces are usually treated as the boring case — one endpoint, no fan-out, no
provenance block to attach. But "already covers every region" cuts both ways: Cost Explorer sees spend in regions
the governed set does **not** include, and every other Govern dashboard aggregates over the governed set. So CE is
the one surface positioned to notice AI spend that nothing else in the module is watching.

`CostRegionBreakdown` therefore splits its own total rather than reporting one number:

| Field | Meaning |
|---|---|
| `total` | All AI spend CE reports, every region, governed or not |
| `governed_total` | The portion inside the governed set — the part the rest of Govern can see |
| `ungoverned_total` | The portion outside it. **Non-zero means Govern is not seeing all AI spend.** |
| `governed_regions` | The set the split was computed against, so the claim is auditable |
| `by_region[].governed` | Per-row membership, so an unwatched region can be marked where it appears |

Measured 2026-09-08 with the governed set at `["us-east-1"]`: **$3,443 of $57,685 (6%) was ungoverned** —
`us-east-2`, `us-west-2`, `global`, `sa-east-1`, `ap-south-1`, `ap-northeast-3`. That is not rounding error, and
before this split the Cost by Region panel drew those bars with nothing to distinguish them from watched spend.

Do **not** reach for `RegionCoverageBadge` here. That badge answers "did the fan-out reach everywhere it claimed?"
and is meaningless for a surface that never fanned out. This is the inverse failure: not too little coverage, but
more coverage than the dashboards have, with the surplus being the finding. A pinned surface carrying a
`RegionProvenance` block would be the actual bug.

### Per-region provenance

Any route that fans out attaches a `RegionProvenance` block (`models/govern_region_provenance.py`, built by
`core.multiregion.provenance()`): `queried`, `reachable`, `unreachable`, `degraded`. This is the data-source
probe contract one level up — a fleet count of 38 aggregated from one reachable region out of three reads
exactly like a complete fleet of 38.

- **`reachable` is not `live`.** `degraded` is a **subset of `reachable`**: the region answered, so it is not
  unreachable, but it returned a well-formed `live=False` fallback (service not enabled there, or the role lacks
  the read) and contributed no measured data. Without this distinction, an aggregate over three regions where
  two are dark reads as complete. `complete` therefore requires `not unreachable and not degraded`.
- **`unreachable` makes a total a floor, not a count.** UIs rendering a fanned-out number must say so when it is
  non-empty.
- **Absence of the block means single-region by construction.** It does **not** mean "all regions succeeded".
- `summary()` returns `None` for the ordinary all-live single-region case, so responses are not decorated with
  "1 of 1 regions".
- `run_over_regions` degrades a failed region to `None` rather than raising, so one unreachable region cannot
  blank the whole response; with a single governed region it is a pass-through and behavior is byte-identical to
  the pre-fan-out code.
- **Liveness is read through an injectable `live_of`.** `provenance()` / `live_region_count()` default to reading
  a `live` field off the per-region result, which is right for every fan-out returning a response model. A
  fan-out returning something else **must** pass `live_of`. `GovernFleetService._fetch_region_agents` returns a
  tuple `(agents, live, sources)`; without `live_of` the default read found no `live` field, classified *every*
  region as `degraded`, and `/govern/fleet/summary` returned `live=True` with 36 real agents alongside
  `note: "no live data from us-east-1"` — the exact inversion of what the block exists to convey. `as_dict()`
  now logs a warning naming the offending type rather than absorbing it into `{}`.

**The fan-out is wall-clock bounded (`_FANOUT_TIMEOUT_S = 25s`).** A region that has not answered inside the
budget is reported `unreachable`. This is not a theoretical guard: governing an opt-in region that is **not
enabled on the account** (`me-south-1`) does not fail fast — botocore cannot resolve a usable endpoint and works
through its full retry budget. Every Govern endpoint fanned out to it, the event-loop thread pool was exhausted,
and **the whole backend stopped answering**; recovery required rewriting the region config file inside the
container and restarting it. Two deliberate limits on the fix:

- The timeout applies **only when there is more than one region**, so it cannot change the timing of the ordinary
  single-region request.
- A timed-out worker is **abandoned, not killed** — Python cannot cancel a thread blocked in a socket call, and
  the executor is therefore *not* used as a context manager (`__exit__` joins every worker, re-introducing the
  hang). This bounds the request; thread growth is bounded only because callers are TTL-cached. The complete fix
  is a botocore connect/read timeout on the clients themselves.

**Merge rules that are not sums.** Counts add; these do not:
- **Latency cannot be summed or naively averaged.** Merge with invocation weighting, and only over regions that
  recorded *both* traffic and a latency — a region with zero traffic contributes no latency observation, and
  including its `null` or `0` drags the fleet figure toward zero.
- **Security Hub must not be fanned out when cross-region aggregation is on.** `GetFindings` in the aggregation
  region already includes every linked region, so a client-side fan-out double-counts findings.

### Region discovery and the governed set

The governed set is persisted to `GOVERN_REGIONS_CONFIG_PATH` (atomic temp-file + rename, mtime-cached) so
runtime "pull a region into governance" actions survive restarts; when the file is absent, empty, or unreadable
it falls back to `[GOVERN_AWS_REGION]`, preserving single-region behavior with zero configuration.
`RegionDiscoveryPrompt.tsx` scans enabled regions for governed-AI signals and offers a one-click pull-in.

One gap worth knowing: discovery scans *enabled* regions, but nothing stops `POST /govern/regions/govern` from
being handed a disabled one, which is how the hang above was produced. The 25s fan-out cap makes that survivable
rather than fatal; validating the incoming set against enabled regions would make it impossible.

**Its confirmation message is generated from `/govern/regions/scope`, not written by hand.** It previously read
"aggregates across all governed regions", which was false for 45 of 55 surfaces. It now states how many surfaces
actually fan out and names them from the endpoint. A hard-coded list here is exactly the drift the registry
exists to prevent.

## Govern Core: See It, Govern It, Show It

Nine foundational modules organized into three pillars. They are the evidence surfaces behind the Compliance
Center's **14 frameworks / 281 controls** (measured; see
[Compliance Framework Coverage](#compliance-framework-coverage)). The "~80% coverage across 8 major frameworks"
claim this line used to carry is not restated: neither number matched the inventory, and nothing in the platform
computes framework coverage as a percentage.

### See It
*What AI do we have? What's it doing? What's it costing?*

| Module | Purpose | Live Data Sources |
|--------|---------|-------------------|
| **Command Center** | Aggregated governance view with trust scores, compliance posture, risk exposure, and real-time alerts | `useLiveKPIs` + `useGovernanceAggregator` baseline (`governCostApi.budgets()` for live budget-vs-actual, `governCommandCenterApi.getData()`, `complianceApi.getPosture()`, `governModelsApi.catalog()`, `maturityApi`), per-payload live-gated |
| **Agent Registry** | Centralized inventory of all AI agents, tools, MCP servers, capabilities, and permissions | `governAgentCoreApi.agents()`, `deploymentsApi`, `frontierAgentsApi` |
| **Agentic Fleet** | Fleet-wide governance KPIs, health monitoring, risk heatmap, emergency controls | `governAgentCoreApi.agents()`, computed risk scores |
| **Model Management** | Model registry, lifecycle management, evaluations, monitoring, risk tiers, lineage, availability & routing | `governModelsApi.catalog()`, `governModelsApi.runtimeMetrics()`, `governModelsApi.inferenceProfiles()`, `governModelsApi.promptRouters()`, `governCostApi.byModel()`, `governEvalsApi.jobs()` / `scores()`, `useModelLineage` (SageMaker ML Lineage), `governSageMakerApi.modelMonitor()` (Model Monitor data-quality drift) |
| **Cost & FinOps** | Budget tracking, spend velocity, cost by model/BU, anomaly detection, chargeback | `governCostApi.summary()`, `trend()`, `forecast()`, `byModel()`, `byTag()`, `anomalies()`, `budgets()` (live AWS Budgets) |

### Govern It
*Who can do what? What rules are enforced?*

| Module | Purpose | Live Data Sources |
|--------|---------|-------------------|
| **Compliance Center** | Interactive framework checklists, attestation management, policy observability, conformance tracking | `governPostureApi`, `governConformanceApi`, `complianceApi`, `policiesApi`, `governControlsApi.evaluate()` (framework deep-dives), `governControlsApi.configRules()` (AWS Config rules) |
| **Prompt Governance** | Bedrock guardrails, PII detection, content filtering, grounding verification, invocation safety | `guardrailsApi`, `governGuardrailsApi.telemetry()`, `governInvocationSafetyApi` |

### Show It
*What happened? Can we demonstrate compliance?*

| Module | Purpose | Live Data Sources |
|--------|---------|-------------------|
| **Audit & Incidents** | Guardrail activity feed, incident management, audit logs, compliance evidence | `governAuditApi.list()`, `governTrailApi.aiActivity()` |
| **Data Governance** | Data quality, lineage, provenance, domains, access control, knowledge source registry, Bedrock KB inventory, AI estate inventory | `governDataCatalogApi`, `governDataSourcesApi`, `knowledgeApi`, `governKnowledgeBasesApi.list()`, `governInventoryApi.resources()` |

---

## All Modules

### Command Center
**Route:** `/govern/command-center`

Single pane of glass for executives showing trust scores, compliance posture, risk exposure, and real-time alerts across the entire AI fleet.

**Features:**
- Aggregated KPIs from all Govern modules
- Trust score computation
- Compliance posture strip
- Risk exposure alerts
- Real-time data refresh (60s polling)

**Live Data:** Aggregates from `governAgentCoreApi`, `governGuardrailsApi`, `governSecurityApi`, `governCostApi`, `guardrailsApi`, `policiesApi`, `maturityApi`, `deploymentsApi`, `governAuditApi`

The budget card and the `useGovernanceAggregator` baseline now source monthly spend and budget-vs-actual from live AWS Budgets (`governCostApi.budgets()`, `DescribeBudgets`), replacing the hardcoded `BU_BUDGETS` mock (fallback: Budgets → `governCommandCenterApi.getData()` budgets → Cost Explorer spend → 0).

---

### Agent Registry
**Route:** `/govern/agents`

Centralized registry of all AI agents, tools, MCP servers, capabilities, and permissions across AWS, Azure, GCP, and SaaS platforms.

**Tabs:**
- Agents - Registry with capabilities, scope, owner, rate limits
- Fleet Scale - Registry at scale (10k+ agents)
- Attack Surface - Threat modeling view
- Tools - Tool inventory with risk levels
- MCP Servers - Server inventory with health status
- Permissions - Agent-to-tool authorization matrix
- Human Oversight - HITL gate configuration
- A2A Governance - Agent-to-agent trust policies
- Evaluations - AgentCore evaluation results
- Providers - Multi-cloud provider connectivity

**Live Data:** `governAgentCoreApi.agents()`, `deploymentsApi.list()`, `frontierAgentsApi.list()`

---

### Agentic Fleet
**Route:** `/govern/fleet`

Fleet-wide governance dashboard with KPIs, risk heatmap, emergency controls, and guardrail observability.

**Features:**
- 5-Pillar Control Plane posture (Registry, Access, Visualization, Interop, Security)
- Fleet Risk Posture aligned to AWS Scoping Matrix & OWASP Agentic AI Threats
- Emergency Controls (Kill, Throttle, LOG_ONLY, Restart)
- Guardrail observability with real-time metrics
- Use case risk heatmap

**Live Data:** `governAgentCoreApi.agents()`, computed risk heatmap from agent status/platform type

---

### Model Management
**Route:** `/govern/models`

Comprehensive model governance hub with registry, evaluations, explainability, compliance, and operations.

**Tabs:**
- Dashboard - Live data, KPIs, alerts
- Registry - Model inventory, risk dashboard
- Evaluations - Model evals, RAG evals, deployment gate
- Explainability - Attribution, bias & fairness
- Compliance - Governance, lifecycle, attestations
- Availability & Routing - Foundation-model availability, cross-region inference profiles, prompt routers
- Operations - Monitoring, ops, analysis tools

**Sub-features:** Hallucination detection, MRM Framework Explorer, Model Comparison, Risk Scoring Calculator, Dependency Graph, Model Lineage

**Model Lineage & Provenance:** The Model Lineage viewer (`ModelLineageViewer.tsx` via the `useModelLineage` hook) renders the live SageMaker ML Lineage graph — artifacts, contexts, and associations — from `GET /govern/sagemaker/lineage` (`ListArtifacts` / `ListContexts` / `ListAssociations`, live source `sagemaker-lineage`). A demo SageMaker estate is seeded in the account, so the graph shows ~31 real entities from a seeded training->model->endpoint pipeline (account IDs masked server-side). Accounts with no lineage entities show an honest empty state (still `live: true`). The previously fabricated ML-SBOM differential-privacy block (DP-SGD / PATE / epsilon-delta) has been removed; the ML-SBOM export no longer emits synthetic privacy data.

**Data Quality Drift (now live, on-demand analyzer):** The Data Quality Drift panel (`ModelMonitoring.tsx`) reads a real SageMaker Model Monitor **DATA_QUALITY** analysis from S3 via `governSageMakerApi.modelMonitor()` (`GET /govern/sagemaker/model-monitor`) — baseline constraints / statistics compared against the monitor-results `constraint_violations.json`, surfacing baseline feature count, drift-violation count, analyzer run status, and per-feature baseline-vs-current statistics with a `LiveDataBadge` gated on the payload `live` flag (honest pending / unreachable note otherwise). SageMaker Model Monitor *scheduling* is in AWS maintenance mode (unavailable to new customers), so drift is produced by an **on-demand analyzer processing job** and read from S3, not by a live schedule.

**Still illustrative (Mock):** The other model KPIs — safety and hallucination drift indicators — remain Mock (no live feed). Clarify SHAP / LIME / Anchor feature attributions stay Mock **because SageMaker Clarify processing is in AWS maintenance mode** (unavailable to new customers), so real SHAP cannot be produced in this account — a platform block, not a wiring gap; `ModelExplainability` keeps illustrative SHAP with an honest note, and the Clarify job-list read (`ListProcessingJobs`) remains wired.

**LLM Output Quality (now live, derived proxy):** The `AVA/LLMQuality` custom-metrics namespace is now populated by a backend background producer (`core/llm_quality_producer.py`, started at app startup, interval `GOVERN_LLM_QUALITY_INTERVAL`, default 300s), so the AI Quality dashboard (`AIQualityMonitor`) flips from Mock to Live with no read-path change. The metrics are a governance-grade proxy DERIVED from existing telemetry — not a direct per-response measurement: harmful_rate <- guardrail `ContentPolicy`; groundedness <- Bedrock eval scores when present, else guardrail `ContextualGrounding` (proxy); relevance / coherence / citation_accuracy <- Bedrock evaluation-job per-metric means (completed jobs only); refusal_rate + tokens_per_response <- invocation-safety; latency is sourced by the read path directly from `AWS/Bedrock`. A dimension is published only when its underlying signal is genuinely live that cycle, and eval-quality dims are skipped when completed jobs carry no such metrics. Publish plumbing (`POST /govern/llm-quality/metrics`) is unchanged.

**Availability & Routing (live):** The **Availability & Routing** tab has three live panels: **Foundation Model Availability** (reuses the Bedrock catalog, `ListFoundationModels`, ~121 FMs, by provider / modality / lifecycle), **Inference Profiles** (`governModelsApi.inferenceProfiles()`, `GET /govern/models/inference-profiles`, ~71 cross-region profiles with system/application split, source `bedrock-list-inference-profiles`), and **Prompt Routers** (`governModelsApi.promptRouters()`, `GET /govern/models/prompt-routers`, 3 routers with fallback model, source `bedrock-list-prompt-routers`).

**RAG Evaluations (live):** The Evaluations → RAG sub-tab (`RagEvaluations.tsx`) leads with a live panel over `governEvalsApi.jobs()` filtered to `application_type === "RagEvaluation"` (real `bedrock:ListEvaluationJobs`, source `ListEvaluationJobs`); clicking a completed job loads S3-parsed per-metric mean-score bars via `governEvalsApi.scores(jobName)` (source `S3 eval results`). The per-query RAG "studio" drill-down stays illustrative (Mock) because `scores()` returns aggregated means only; the `ModelEvaluations` embed is unchanged with its sample jobs relabeled illustrative.

**Live Data:** `governModelsApi.catalog()`, `governModelsApi.runtimeMetrics()`, `governModelsApi.inferenceProfiles()`, `governModelsApi.promptRouters()`, `governCostApi.byModel()`, `governEvalsApi.jobs()` / `governEvalsApi.scores()`, `useModelLineage` (`GET /govern/sagemaker/lineage`), `governSageMakerApi.modelMonitor()` (`GET /govern/sagemaker/model-monitor`)

---

### Cost & FinOps
**Route:** `/govern/finops`

AI cost management with budget tracking, spend velocity, anomaly detection, and optimization recommendations.

**Tabs:**
- Dashboard - Real-time spend, KPIs, trend charts
- Planning - Use case cost editor
- ROI - Agent ROI calculator
- Task Fit - Task assessment for AI suitability
- Business Metrics - Business value tracking
- Unit Economics - Per-invocation cost analysis
- Token Economics - Token usage patterns
- Chargeback - Cost allocation by tag/business unit
- Optimization - Savings recommendations

Budget-vs-actual is now sourced live from `governCostApi.budgets()` (`DescribeBudgets`, 1 real budget), replacing the hardcoded `BU_BUDGETS` mock; the same source feeds the Command Center budget card and `useGovernanceAggregator`.

**Live Data:** `governCostApi.summary()`, `trend()`, `forecast()`, `byModel()`, `byUseCase()`, `byTag()`, `tagKeys()`, `anomalies()`, `budgets()`

---

### Compliance Center
**Route:** `/govern/compliance`

Interactive compliance framework management with checklists, attestations, and policy observability.

**Features:**
- Compliance Posture Strip with live metrics
- Governance Program Builder (6-phase wizard)
- Interactive framework checklists
- Evidence attachment and links
- Attestation management
- Config Rules and Guardrails side-by-side view
- Policy Observability (Cedar ALLOW/DENY decisions)
- ISO 42001 Certification Tracker (7-phase certification journey with readiness tracking)
- Conformity Assessment Workflow (EU AI Act Article 43)
- FRIA Wizard (EU AI Act Article 27)

**ISO 42001 Certification Tracker:**
- 7 certification phases: Gap Analysis, Scope Definition, Risk Assessment, Policy Development, Implementation, Internal Audit, Certification Decision
- Collapsible card with circular progress gauge
- Per-phase tracking: status, dates, evidence links, notes
- Links to relevant Govern modules for each phase

**Conformity Assessment Workflow (EU AI Act Article 43):**
Located in the **Conformity** tab. A 6-step workflow for high-risk AI system conformity assessment:
- 6 steps: Risk Classification, Technical Documentation, QMS Verification, Post-Market Monitoring, Declaration of Conformity, CE Marking Readiness
- Per-step tracking: status, evidence checklist, responsible party, target dates, notes
- Visual workflow diagram with clickable nodes
- Progress tracker with overall completion percentage

**FRIA Wizard (EU AI Act Article 27):**
Located in the **FRIA** tab. Fundamental Rights Impact Assessment for high-risk AI systems:
- 8 fundamental rights areas: dignity, privacy, non-discrimination, equality, remedy, expression, administration, workers' rights
- Per-right assessment: impact level, mitigation measures, residual risk rating, evidence links
- Overall FRIA score calculation (0-100)
- High-risk AI systems view (Annex III categories)
- Export report capability, auto-save drafts

**GPAI Model Cards (EU AI Act Article 53):**
Located in the EU AI Act framework view. Transparency documentation for General-Purpose AI models:
- 8 documentation sections: Identity, Intended Use, Training Data, Capabilities, Evaluations, Compute, Mitigations, Known Issues
- Systemic Risk Assessment (Art. 51/55) for high-capability models
- Export capability for compliance-ready GPAI model card documents

**Compliance Gap Guidance:**
Located in the **Gap Guidance** tab. "Beyond the Platform" guidance for non-technical compliance gaps:
- Platform vs Organization split showing what the platform provides vs what the organization must do
- Interactive checklist with progress tracking for organizational gaps
- Framework-specific guidance for EU AI Act, ISO 42001, NAIC AI, and other frameworks
- Also integrated into framework-specific views (EU AI Act, ISO 42001, NAIC AI)

**NAIC AI: Unfair Discrimination Testing:**
Located in the NAIC AI framework view. Addresses NAIC Model Bulletin unfair discrimination requirements:
- 6 protected class tests with Disparate Impact Ratio (4/5ths rule)
- Proxy variable correlation analysis
- Use case selector (Underwriting, Claims, Pricing, Marketing)
- Pass/fail status with remediation guidance per protected class

**Governance Posture: Preventive Controls (SCPs) & KMS Encryption Evidence:**
Two new live posture surfaces. The `PreventiveControlsCard` in `ComplianceCenter.tsx` lists real AWS Organizations Service Control Policies via `governScpApi.policies()` (`GET /govern/governance/scp`, source `organizations:...`) — org-level guardrails that cap account permissions regardless of IAM; it shows an honest note when the account lacks org management / delegated-admin access or when the only policy is the AWS-managed `FullAWSAccess` default. The AI Security Controls panel (`compliance/AISecurityControlsPanel.tsx`) adds a live KMS key inventory via `governKmsApi.inventory()` (`GET /govern/governance/kms`, source `kms:...`): ~20 keys (10 customer-managed with automatic-rotation status, 10 AWS-managed) plus total aliases, complementing the Security-Hub-inferred encryption control (ai-sec-004) with direct `kms:ListKeys` evidence.

**AWS Config Rules (live):**
The Security Hub tab's `AwsConfigRulesCard` (in `ComplianceCenter.tsx`) renders live per-rule AWS Config compliance from `governControlsApi.configRules()` (`GET /govern/controls/config-rules`, source `aws-config`) — ~710 real Config rules bucketed into compliant / non-compliant / not-applicable / insufficient-data with summary tiles. All counts come straight from the live response; the card shows an honest note (and a `MockDataBadge`) when Config is not enabled, `config:Describe*` is not granted, or no rules exist. This complements the framework deep-dive control evaluation and the existing Config-vs-Guardrails side-by-side view.

**Frameworks — 14, 281 controls.** Measured from `GET /api/v1/govern/compliance/posture` on 2026-09-14, per
framework: CRI FS AI RMF (45), AWS RAI Lens (35), FINOS AIR (34), OWASP LLM Top 10 (24), EU AI Act (19),
SR 26-2 (16), ISO 42001 (16), NAIC AI (16), NIST AI RMF (15), OSFI E-23 (15), Data Sensitivity (14),
MITRE ATLAS (14), NIST GenAI Profile (12), Colorado AI Act (6). `COMPLIANCE_CENTER_FRAMEWORKS` (`mockData.ts`) and
`FRAMEWORK_META` (`api/routes/govern_compliance.py`) carry the same 14 ids.

`FRAMEWORK_META` itself holds **17** entries, because `osfi-e23` / `naic-ai` / `colorado-ai-act` are each also
registered under a legacy spelling (`osfi-e-23`, `naic-model-bulletin`, `colorado-sb-205`) that the `/summary`,
`/attestations` and attestation-PUT routes still gate on — removing them would 404 those ids again.
`FRAMEWORK_ALIAS_IDS` excludes the three unused spellings from **aggregation only**, so `/posture` reports the
distinct estate at 14 / 281 instead of double-counting to 17 / 318. The excluded side is deliberately the one the
UI never calls: attestations are partitioned per framework id (`pk = COMPLIANCE#{framework_id}`), so aggregating
an unused spelling would read an empty partition and report a real framework as entirely unassessed.

**This is not the Governance Assessment wizard's list, and the two must not be merged.** The wizard has its own,
smaller `REGULATORY_FRAMEWORKS` (`govern/assessment/governanceAssessmentFramework.ts`) of **11**: NIST AI RMF,
EU AI Act, SR 26-2, SR 11-7, ISO 42001, CRI FS AI RMF, OSFI E-23, NAIC AI Bulletin, MAS FEAT, Singapore Model AI
Governance Framework, APRA CPG 235. Only **7** overlap. The wizard carries 4 the Compliance Center does not
(SR 11-7, MAS FEAT, SG AI Framework, APRA CPG 235) and the Compliance Center carries 7 the wizard does not
(Data Sensitivity, AWS RAI Lens, OWASP LLM Top 10, FINOS AIR, Colorado AI Act, MITRE ATLAS, NIST GenAI Profile).
A bare "framework count" for Govern is therefore ambiguous — always say which inventory it is counting.

**24 of the 281 controls are assessed, and all 24 are auto-detected** (`auto_detected_count: 24`; measured
2026-09-14: FINOS AIR 11, OWASP LLM Top 10 8, NIST AI RMF 3, SR 26-2 2, the other ten frameworks 0). Every
auto-detect rule is an **existence probe, not an efficacy test** — "a CloudTrail trail exists" is what marks
NIST AI RMF MANAGE 3.1 as PASS. It evidences that a control is *present*, never that it *works*, and that
distinction has to survive into anything built on top of it.

**Framework Deep-Dive Live Evaluation:**
Six framework views overlay live control evaluation via `governControlsApi.evaluate()` (through the `useControlEvaluation` hook): **OWASP LLM Top 10, FINOS AIR, NAIC AI, CRI FS AI RMF, EU AI Act, and OSFI E-23**. Controls that carry an `autoDetectSource` are auto-evaluated from their AWS source with per-source `live` gating and latency; controls without one keep their attestation status. **NIST AI RMF and MITRE ATLAS remain static/attestation-only.**

**Live Data:** `governPostureApi.configRuleDetail()`, `governConformanceApi`, `complianceApi`, `policiesApi.getObservability()`, `maturityApi`, `governControlsApi.evaluate()`, `governControlsApi.configRules()` (AWS Config rules + per-rule compliance, source `aws-config`), `governScpApi.policies()` (SCPs, `organizations:...`), `governKmsApi.inventory()` (KMS encryption evidence, `kms:...`)

---

### Prompt Governance
**Route:** `/govern/prompt-governance`

AWS-native prompt compliance and governance built on Bedrock Guardrails.

**4-Layer Defense Architecture:**
1. Real-Time Guardrails (<50ms) - Bedrock native filters
2. Contextual Evaluation (50-200ms) - Grounding & relevance checks
3. Async Observability - Athena queries, trend analysis
4. Formal Verification - Automated Reasoning proofs

**Views:**
- Live Guardrails - Active guardrail configurations
- Invocations - Per-invocation telemetry table (metadata only) plus aggregates
- Heatmap - Violation patterns
- Scorecard - Metrics summary
- AgentCore - Agent-specific metrics
- Analytics - Trend analysis

**Per-Invocation Telemetry (metadata only):** The Invocations view (`LivePromptTelemetry.tsx`) renders a per-invocation table below the aggregates from `governInvocationSafetyApi.invocations()` (`GET /govern/invocation-safety/invocations`, live source `bedrock-invocation-logs`). It reads Bedrock model-invocation CloudWatch logs via CloudWatch Logs Insights and, by design, surfaces metadata only — timestamp, model, operation, stop reason, input/output token counts, and guardrail action — never prompt or response content.

**Live Data:** `guardrailsApi.list()`, `governGuardrailsApi.telemetry()`, `governInvocationSafetyApi.telemetry()`, `governInvocationSafetyApi.invocations()`

---

### Audit & Incidents
**Route:** `/govern/audit`

Guardrail activity feed, incident management, audit logs, and compliance evidence.

**Views:**
- Metrics - Scorecard contribution (MTTR, open incidents, resolution rate)
- Audit Trail - Event log with filtering and export

**Features:**
- Live AI activity from CloudTrail
- Policy enforcement decisions (Cedar)
- Incident lifecycle management
- Trace viewer for debugging
- Evidence export for auditors

**Live Data:** `governAuditApi.list()`, `governTrailApi.aiActivity()`, `governTrailApi.aiCallers()`

---

### Data Governance
**Route:** `/govern/data`

Data quality, lineage, provenance, domains, and access control for AI-ready data.

**Tabs:**
- Dashboard - KPIs, charts, metrics
- Lineage - Data flow visualization
- Quality - Rule-based quality scoring
- Knowledge - Knowledge source registry (Glue, Bedrock KBs, Athena) with RAG Security Controls
- Knowledge Bases - Live Bedrock Knowledge Base inventory (name, status, storage type, embedding model, data sources)
- AI Estate Inventory - Live tagged-resource inventory of the AI estate (Resource Groups Tagging), grouped by service with an AI-related flag
- Assessment - Data maturity assessment

**RAG Security Controls (Knowledge Tab):**
- 8 OWASP LLM08-aligned security controls (5 critical, 3 standard)
- Interactive checklist with compliance status tracking
- Controls cover: input validation, output sanitization, access control, data classification, prompt injection prevention, logging, encryption, and version control

**Sub-routes:**
- `/govern/data/quality` - Data Quality rules and scores
- `/govern/data/metadata` - Metadata management
- `/govern/data/maturity` - Data maturity assessment
- `/govern/data/readiness` - AI readiness scoring
- `/govern/data/lineage` - Data lineage visualization
- `/govern/data/inventory` - AI estate inventory (tagged AWS resources, live)
- `/govern/data/agents` - Agent data profiles
- `/govern/data/access` - Access control policies
- `/govern/data/ontology` - Data ontology editor
- `/govern/data/taxonomy` - Data taxonomy management
- `/govern/data/glossary` - Business glossary
- `/govern/data/graphrag` - GraphRAG visualization

**Knowledge Bases (live):** A "Knowledge Bases" tab (`data/KnowledgeBaseGovernance.tsx`) lists the account's Amazon Bedrock Knowledge Bases via `governKnowledgeBasesApi.list()` (`GET /govern/knowledge-bases`, source `Bedrock Knowledge Bases`): per-KB name, status, storage type, embedding model, and data sources, with summary tiles (total / active / data sources) and breakdowns by storage type and embedding model. Live-but-empty accounts show an honest empty state.

**AI Estate Inventory (live):** The "AI Estate Inventory" page (`/govern/data/inventory` → `govern/data/AiEstateInventory.tsx`, linked from the Data Governance landing's Lineage tab) lists every tagged AWS resource supporting the AI estate via `governInventoryApi.resources()` (`GET /govern/governance/inventory`, source `resourcegroupstaggingapi:GetResources`). It reads AWS Resource Groups Tagging, groups resources by service (sorted by-service bar chart), and flags each row `ai_related` from its service namespace (bedrock, sagemaker, etc.) plus AI-oriented tag heuristics (ai / genai / llm / agentcore). Summary tiles cover total resources, AI-related count, distinct services, and distinct tag keys, with an AI-related-only filter. ~500 resources are returned (incl. bedrock-agentcore, lambda, eks) and account IDs are masked server-side; live-but-empty accounts show an honest empty state.

**Live Data:** `governDataCatalogApi`, `governDataSourcesApi`, `knowledgeApi.list()`, `knowledgeApi.listDatabases()`, `knowledgeApi.listKnowledgeBases()`, `governKnowledgeBasesApi.list()`, `governInventoryApi.resources()`

---

## Additional Modules (Add-ons)

### Risk Management
**Route:** `/govern/risk`

Enterprise risk register with heatmaps, assessments, controls library, and issue tracking aligned to NIST AI RMF.

**Tabs:** Dashboard, Risk Register, Assessments, Controls, Issues, Third-Party Risk, HRAIS, Outcomes

**Outcome Monitoring Dashboard (Outcomes Tab):**
- Post-deployment AI impact tracking with decision distribution analysis
- Demographic parity metrics across protected classes
- Appeal rate monitoring and outcomes tracking
- Drift detection for model and outcome shifts over time
- Consumer harm indicators aligned to CRI FS AI RMF harm categories

**Third-Party Concentration Risk (Third-Party Risk Tab):**
- Vendor dependency breakdown showing % of agents and models per provider
- Single-vendor exposure alerts: Critical (>70% concentration), High (>50%)
- Exit strategy status tracking for concentrated vendor dependencies
- Helps address CRI FS AI RMF and OSFI E-23 third-party risk requirements

**Vendor IAM Access (Third-Party Risk Tab):**
- Real IAM permissions audit (`risk/VendorIAMAccess.tsx`) via `governIamApi.vendorAccess()` (`GET /govern/iam/vendor-access/{vendor_id}`)
- IAM roles/policies (`ListRoles` / `GetRole` with `RoleLastUsed`, attached and inline policy documents) correlated with IAM Access Analyzer findings (`ListAnalyzers` / `ListFindingsV2`, incl. unused-access)
- Risk derived from real signals: external-access findings, wildcard permissions, and stale usage
- Live source `iam+access-analyzer` (falls back to `iam` when Access Analyzer is unreachable); honest mock fallback on missing permissions
- **Fix (this wave):** severity classification switched to the v1 `ListFindings` API so the `isPublic` flag is available — public external-access findings are now classified HIGH instead of always MEDIUM

**AWS Security Posture & Inspector2 Vulnerabilities (Dashboard + Real-Time Monitoring):**
The `SecurityPostureCard` (`risk/SecurityPostureCard.tsx`) rolls up GuardDuty, Macie, Inspector, and IAM Access Analyzer, each pulled from its own API with per-source live badges. It adds an Inspector2 vulnerability detail panel from `governSecurityApi.vulnerabilities()` (`GET /govern/security/vulnerabilities`, source `inspector2`): real CVEs on EC2 / ECR images / Lambda with severity tiles (critical / high / medium / low), fix-availability, and covered-resource counts (~100 findings [5 CRITICAL / 33 HIGH], ~180 covered resources). It complements the existing Inspector "Vulnerabilities" posture dimension with finding-level detail, and shows an honest empty / not-enabled state when Inspector2 is off or not permitted.

**Live Data:** `governIamApi.vendorAccess()` (IAM + IAM Access Analyzer), `governSecurityApi.posture()`, `governSecurityApi.vulnerabilities()` (`GET /govern/security/vulnerabilities`, source `inspector2`), AWS Security Hub findings, computed use-case risk

### AI Safety
**Route:** `/govern/safety`

Capability safety and assurance organized on AWS's 8 Responsible-AI dimensions.

**Sub-routes:**
- `/govern/safety/evals` - Safety evaluations
- `/govern/safety/redteam-pipeline` - Red team testing
- `/govern/safety/capabilities` - Frontier capability thresholds
- `/govern/safety/safety-cases` - Safety case documentation
- `/govern/safety/incidents` - Incident management
- `/govern/safety/runtime` - Runtime safety controls
- `/govern/threat-modeling` - MAESTRO threat modeling

### Shadow AI
**Route:** `/govern/shadow-ai`

Discover unapproved agents, models, tools, and API keys before they become incidents.

**Live Data:** `governDeveloperAiApi.usage()` - `shadow_ai` detection

### Developer AI Usage
**Route:** `/govern/developer-ai`

Monitor developer AI tool consumption (tokens, cost), detect anomalies and shadow usage.

**Live Data:** `governDeveloperAiApi.usage()` - teams, users, anomalies

### Governance Playbook
**Route:** `/govern/playbook`

Decision framework for autonomous agents with autonomy levels, HITL gates, and A2A trust policies.

### Multi-Cloud
**Route:** `/govern/multi-cloud`

Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms.

**Live Data:** `governCostApi.providerConnectors()`

### Agentic Coding
**Route:** `/govern/dev-tools`

Governance for AI-powered coding assistants (Claude Code, Kiro, Copilot, Cursor).

**Live Data:** `governDeveloperAiApi.usage()` - developer tool metrics

### Operations
**Route:** `/govern/operations`

AIOps control room for the agent fleet, grouped into Ops tabs (Overview, Fleet Health, Incidents, On-Call, Changes, Alerts, SLAs, Runbooks, Capacity) and GRC tabs (Compliance, Evidence, Metrics).

**Live Data:** `governOperationsApi.fleetStatus()` (fleet health), `governOperationsApi.activeAlerts()` (firing alerts mapped from CloudWatch Alarms in ALARM state), `governOperationsApi.opsMetrics()` (MTTR, availability), `governCapacityApi.quotas()` / `.alerts()` (AWS Service Quotas + capacity alerts), `governXRayApi.getServiceGraph()` / `.getTraceSummaries()` / `.getTraceDetails()` (X-Ray service map + traces). Each surface is badged live only when its payload reports `live: true`.

**Systems Manager Fleet Manager (Runbooks tab, read-only):** `governOperationsApi.ssmManagedInstances()` / `.ssmRunbooks()` / `.ssmCommandHistory()` back a "Systems Manager Fleet Manager" section (`operations/RunbookCenter.tsx`) — managed instances (`describe_instance_information`), document/runbook catalog (`list_documents`), and command history (`list_commands`), live source `ssm`. Execution is intentionally not wired: no `SendCommand` or `StartAutomationExecution` is issued, and the Run control is disabled with the label "Read-only - execution not enabled in this build".

**Traces (X-Ray) service map (Traces (X-Ray) tab):** `operations/ServiceMap.tsx` renders two live X-Ray views via `governXRayApi`: the service graph (`getServiceGraph()`, `GET /govern/xray/service-graph` — node response time, error rate, throughput, downstream edges) and recent trace summaries (`getTraceSummaries()`, `GET /govern/xray/traces` — duration, HTTP status, fault/error/throttle/partial flags), with a segment-tree detail drawer on row click (`getTraceDetails()`, `GET /govern/xray/traces/detail`). Badges gate on the graph/trace `live` flags with an honest empty state when tracing is not enabled.

**Control-plane store:** one DynamoDB table named by `GOVERN_OPERATIONS_TABLE_NAME` (default
`fsi-control-plane-govern-operations`), in the region resolved by
`region_config.table_region("GOVERN_OPERATIONS")`, partitioned by record type (`INCIDENT`, `ALERT_RULE`,
`ALERT_SILENCE`, `SLA`, `SLA_BREACH`, `ONCALL`, `ONCALL_POLICY`, `CHANGE`). Renamed from
`ava-operations-incidents`, which never existed in any region; the old name is not aliased because nothing was
ever written under it. Incidents, alert rules, silences, SLAs, SLA breaches and changes have write paths; the two
`ONCALL*` partitions are **read-only in this build** — nothing writes a shift or an escalation policy, so they can
only be populated out of band. The fleet, alarm and capacity reads on this service use `govern_region`
(`GOVERN_AWS_REGION`), not the table's region — see
[Region Architecture](#a-tier-1-read-inside-a-tier-3-service-needs-its-own-region-field).

**Live vs Mock, measured 2026-09-14:**
- **Incidents are live.** `GET /govern/operations/incidents` reports `live: true, source: "dynamodb"` with
  `total: 0` and the note "No incidents recorded in the Operations store." — a measured zero from a reachable
  store, distinguished from an unreachable one by the `_table_ok` latch rather than by row count.
- **Alert rules, SLAs, on-call and changes still badge Mock.** They read the same table but derive `live` from the
  row count, so an empty-but-reachable partition reports `live: false, source: "memory"` (`/alerts/rules`, `/sla`,
  `/oncall/current`, `/oncall/schedule`, `/oncall/policies`, `/changes` — all `total: 0`). Note the mismatch with
  the honest-degrade contract: elsewhere `source: "memory"` means persistence has failed. Applying the incidents
  `_table_ok` treatment to these four is the remaining work.
- On-call additionally supports live PagerDuty (`PAGERDUTY_API_KEY`); unset in this account, and the response says
  so in its `note`.
- Alert **mutations** (acknowledge, silence) are not written to CloudWatch; acknowledgement is returned on the
  in-flight object only.

### Reports
**Route:** `/govern/reports`

Board-ready governance reporting that aggregates live evidence across the platform.

**Live Data:** `useReportsDataSummary` (cross-source roll-up across AgentCore, Guardrails, Deployments, Compliance, Security, Risk, Fleet — badged "N/M live sources"), `useAgentResourceData` (agents joined from `governAgentCoreApi.agents()` + `governGuardrailsApi.telemetry()` + `deploymentsApi.list()`), `useFrameworkCompliance` (`complianceApi.getPosture()`).

---

## Compliance Framework Coverage

The Compliance Center's inventory is **14 frameworks / 281 controls**. `Controls` and `Assessed` below are read
straight from `GET /api/v1/govern/compliance/posture`, measured 2026-09-14. *Assessed* means an attestation exists
in one of PASS / IN PROGRESS / FAIL; all 24 today are auto-detected existence probes, so a PASS evidences that a
control is **present**, not that it is effective.

| Framework | Controls | Assessed | Key Modules |
|-----------|---------:|---------:|-------------|
| **CRI FS AI RMF** | 45 | 0 | All Core modules, Risk Management |
| **AWS RAI Lens** | 35 | 0 | Compliance Center (checklist + attestations), AI Safety (AWS's 8 RAI dimensions) |
| **FINOS AIR** | 34 | 11 | Command Center, Prompt Governance |
| **OWASP LLM Top 10** | 24 | 8 | Prompt Governance, Cost & FinOps, Audit, Data Governance (RAG Security) |
| **EU AI Act** | 19 | 0 | Compliance Center (Conformity Assessment, FRIA Wizard, GPAI Model Cards), Audit |
| **SR 26-2** | 16 | 2 | Dedicated compliance view |
| **ISO 42001** | 16 | 0 | Model Management, Audit, Compliance Center (Certification Tracker) |
| **NAIC AI** | 16 | 0 | Agent Registry, Model Management, Unfair Discrimination Testing |
| **NIST AI RMF** | 15 | 3 | Dedicated compliance view |
| **OSFI E-23** | 15 | 0 | Model Management, Audit, Risk Management |
| **Data Sensitivity** | 14 | 0 | Compliance Center (checklist + attestations), Data Governance (Macie sensitivity) |
| **MITRE ATLAS** | 14 | 0 | Command Center, Risk Management |
| **NIST GenAI Profile** | 12 | 0 | Compliance Center (checklist + attestations) |
| **Colorado AI Act** | 6 | 0 | Compliance Center (checklist + attestations) |

Six of the 14 additionally overlay **live** control evaluation — see
[Framework Deep-Dive Live Evaluation](#compliance-center); the rest are attestation-only.

The prior version of this table listed 10 of the 14 and carried a `Coverage` column of `~65%`–`~80%` figures with
**SR 26-2 and NIST AI RMF marked "Full"**. Those percentages had no source anywhere in the platform, and the two
"Full" rows were contradicted by the very endpoint they described (2 of 16 and 3 of 15 controls assessed). Removed
rather than re-estimated: measured control and attestation counts are what the platform can actually evidence.
Framework *coverage* — how much of a framework's intent the module addresses — is a judgement no code in this
repo computes, so it is not asserted here.

---

## Data Integration Architecture

### Live Data Pattern

All Govern modules follow a cascading fallback pattern:

```
Live AWS API → Computed from Live → Mock Fallback
```

1. **Live** - Real data from AWS APIs (Cost Explorer, Bedrock, CloudTrail, etc.)
2. **Computed** - Derived from live data (e.g., risk scores from agent status)
3. **Mock** - Illustrative data when backend is disconnected

Visual indicators:
- `<LiveDataBadge />` - Showing real AWS data
- `<MockDataBadge />` - Showing illustrative data

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useAwsCost()` | Cost Explorer data with caching |
| `useGovernModels()` | Bedrock model catalog + metrics |
| `useModelLineage()` | SageMaker ML Lineage graph (`GET /govern/sagemaker/lineage`) |
| `useAgentRegistry()` | Agent discovery with live fallback |
| `useGuardrailMetrics()` | Guardrail telemetry |
| `useControlEvaluation()` | Live control evaluation for framework deep-dives (`governControlsApi.evaluate()`) |
| `useLiveKPIs()` | Aggregated KPIs for Command Center |
| `useGovernanceAggregator()` | Cross-module baseline (cost, compliance, models, maturity) with per-payload live gating |
| `useOperationsApi` (`useFleetStatus`, `useActiveAlerts`, `useOpsMetrics`, `useCapacityQuotas`, ...) | Operations live data (fleet, CloudWatch alarms, MTTR, Service Quotas) |
| `useReportsLiveData` (`useReportsDataSummary`, `useAgentResourceData`, `useFrameworkCompliance`) | Reports cross-source roll-up, agent inventory, framework coverage |
| `useAuditEvents()` | Audit log with live/mock detection |
| `useDataGovernance()` | Data catalog integration |

### Backend APIs

All govern APIs are defined in `src/api/client.ts`:

- `governCostApi` - Cost Explorer integration
- `governModelsApi` - Bedrock model catalog, runtime metrics, inference profiles, prompt routers
- `governSageMakerApi` - SageMaker models, endpoints, model registry, model cards, Clarify jobs (`ListProcessingJobs`), and Model Monitor data-quality drift (`modelMonitor()`, `GET /govern/sagemaker/model-monitor`, on-demand analyzer from S3); ML Lineage is read via the `useModelLineage` hook (`GET /govern/sagemaker/lineage`)
- `governAgentCoreApi` - AgentCore discovery
- `governGuardrailsApi` - Guardrail telemetry
- `governInvocationSafetyApi` - Invocation safety metrics + per-invocation metadata records (`bedrock-invocation-logs`)
- `governIamApi` - Vendor IAM access (IAM roles/policies + IAM Access Analyzer findings)
- `governAuditApi` - Audit event log
- `governTrailApi` - CloudTrail AI activity
- `governSecurityApi` - Security Hub findings (`posture()`) + Inspector2 vulnerability detail (`vulnerabilities()`, `GET /govern/security/vulnerabilities`, source `inspector2`)
- `governPostureApi` - Config rule compliance
- `governConformanceApi` - Conformance tracking
- `governDeveloperAiApi` - Developer AI usage
- `governDataCatalogApi` - Glue Data Catalog + Macie (`summary()` / `domains()` / `quality()` / `sensitivity()`; the prior 500 from a `get_or_load` call-signature bug is fixed)
- `governEvalsApi` - Bedrock evaluation jobs (`jobs()`) + S3-parsed per-metric scores (`scores()`); Model + RAG
- `governControlsApi` - Live control evaluation for framework deep-dives (`evaluate()`) + AWS Config rules & per-rule compliance (`configRules()`, `GET /govern/controls/config-rules`, source `aws-config`)
- `governCommandCenterApi` - Server-side command center aggregate (cost, budgets, anomalies, runtime metrics)
- `governOperationsApi` - Fleet status, CloudWatch alarms, incidents, SLAs, capacity, ops metrics, SSM Fleet Manager (read-only)
- `governCapacityApi` - Service Quotas usage and capacity alerts
- `governFleetApi` - Server-side fleet aggregation for 10k+ scale
- `governKnowledgeBasesApi` - Bedrock Knowledge Base inventory (source `Bedrock Knowledge Bases`)
- `governXRayApi` - X-Ray service graph, trace summaries, and trace detail
- `governKmsApi` - KMS key + alias inventory (encryption-at-rest evidence, `kms:...`)
- `governScpApi` - Organizations Service Control Policies (preventive controls, `organizations:...`)
- `governInventoryApi` - AI estate inventory: tagged AWS resources supporting the AI estate, grouped by service with an `ai_related` flag (`GET /govern/governance/inventory`, source `resourcegroupstaggingapi:GetResources`)

---

## Getting Started

### For Users

1. Navigate to **Govern** from the AVA home page
2. Start with **Command Center** for the executive overview
3. Use the **Core Only** filter to focus on foundational modules
4. Each module shows `Live` or `Mock` badges indicating data source

### For Administrators

1. Connect AWS account via the Connection Wizard on the Govern landing page
2. Enable Cost Explorer, CloudTrail, and Security Hub integrations
3. Deploy Bedrock Guardrails for prompt governance
4. Configure Cedar policies for agent authorization

### For Developers

Key files:
- `src/components/GovernLanding.tsx` - Hub page with module cards
- `src/components/govern/CoreBadge.tsx` - Core module indicator
- `src/components/govern/useGovernanceAggregator.ts` - Cross-module data aggregation
- `src/components/govern/metrics/` - Shared metric contract
- `src/api/client.ts` - All backend API definitions

---

## Related Documentation

- [Platform Architecture](./platform-architecture.md) - Overall AVA architecture
- [Govern Metrics Integration](./govern-metrics-integration.md) - Shared metric contract
- [AI Safety Module Design](./ai-safety-module-design.md) - Safety module architecture
