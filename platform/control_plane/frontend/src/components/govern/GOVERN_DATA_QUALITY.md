# Govern — Pre-Merge Data-Honesty Review

Read-only review of the branch delta vs origin.
Scope: `git diff --name-only origin/gsorrels/feature/govern-audit-backend...HEAD`, restricted to
`govern/*`, `govern/operations/*`, `govern/finops/*`, `govern/risk/*`, `govern/data/*` `.tsx`,
plus `useGovernanceAggregator.ts` and `api/client.ts` (contract/live-flag shapes).
Theme: **"no mock-as-live"** — every green Live badge/label/pulse must sit over data whose own
`.live` flag is true; mock/illustrative data must be Demo-badged; pooled rates must be recomputed
from summed numerator/denominator; dead controls must be honest.

- First pass: 2026-08-31 · **Last updated: 2026-09-14** (MUST-FIX count 9 → 0; see the OPEN
  section at the end for what remains, and read that section before quoting any figure from this
  document to a third party)
- Frontend root: `platform/control_plane/frontend`
- Real API contract: `src/api/client.ts` (every backend response type carries `live: boolean`;
  control eval carries a per-source `sources: Record<string,{live}>` map at client.ts:3147-3151)

---

# Pre-release gate (policy round) — 2026-09-02

Focused data-honesty pass on the two surfaces that consume newly-seeded real policy data:
**A2AGovernance.tsx** (Trust Policies tab → `governA2AApi.listPolicies()` → `/govern/a2a-trust/policies`, 4 real policies)
and **FleetOverview.tsx** (Policies card + trust-score → aggregator `policies` → `policiesApi.list()` → `/policies`, 3 real Cedar policies).
Cross-checked rendered field shapes against the backend contract (`models/govern_a2a_trust.py`, `client.ts` `TrustPolicy`/`PolicyRecord`).

## MUST-FIX (data-honesty violations): 0 — both surfaces are honest

### Verified CLEAN — A2AGovernance Trust Policies tab
- **Live badge is gated on the REAL 200 signal.** `policiesLive` is set `true` only inside the
  `governA2AApi.listPolicies().then(...)` (A2AGovernance.tsx:549-564). The axios response interceptor
  (client.ts:53-66) resolves only on 2xx and rejects everything else, so a non-2xx/network failure lands in
  `.catch()` → `policiesLive=false` → `<MockDataBadge/>`. The in-tab badge (642-644)
  `policiesLive ? <LiveDataBadge source="DynamoDB"/> : <MockDataBadge/>` therefore never claims Live over mock.
- **4 real policies render correctly, no fabricated fields under Live.** `livePolicyToDisplay` (523-535) maps
  only fields the backend actually returns — `policy_id, name, source_pattern, target_pattern, allowed_actions,
  effect, max_delegated_autonomy, enabled`. Verified against backend `TrustPolicyBase` (govern_a2a_trust.py:65-76):
  every field exists, and the response uses `enabled: bool` (not `status`) — the UI honestly derives
  `status = enabled ? 'active' : 'disabled'` (531). The provider-only fields (`rateLimit`, `maxChainDepth`,
  `dataClassifications`, `requiresAuthentication/Encryption`) are left **unset** on the live path, and the card
  renders them only `!= null` (704-705, 733-766) — so live policy cards show NO fabricated rate limits / chain
  depth / data classes. This is the key honesty win of the DisplayPolicy design.
- **Honest empty state.** A 200 with `[]` keeps the Live badge and shows the "store connected but empty"
  message (664-673) — it does NOT fall back to mock. (`GET /policies` uses `response_model=List[TrustPolicy]`,
  so a null body that could strand a Live badge over mock is not reachable.)
- **No shape mismatch → no blank render.** All consumed fields exist on `client.ts` `TrustPolicy` (2244-2247).

### Verified CLEAN — FleetOverview Policies card
- **Real Cedar policies, correct shapes.** `useGovernanceAggregator` maps `PolicyRecord[]` → `PolicySummary[]`
  (useGovernanceAggregator.ts:545-559) preserving `policy_id, name, status, rules_count, blocking_rules`. The
  compact Policies list (FleetOverview.tsx:1762-1775) filters `status==='active'` and renders `p.name` +
  `{p.rules_count}r` — all fields present on `PolicyRecord` (client.ts:717-732). No blank-render risk.
- **"Live AVA Data" banner** (1639-1645) counts `{policies.length} policies` from a real internal API; only
  shows when data is present. Consistent with this doc's accepted stance on internal-API "live" data.
- **Trust-score is a transparent derivation of REAL counts, not a fabricated score.** The `access` pillar
  (1654-1656) = `min(50, workloadIdentities*2) + guardrailsActive*15 + policies.length*10`, capped 100 — every
  input is a real count; no fake number is asserted.
  > **SUPERSEDED 2026-09-04 (§3-109).** The point formula was replaced by a real ratio — see
  > "Resolved 2026-09-04" below. `access` is now `scope_coverage_pct` from the resource-tag scan.

## ACCEPTED-WARNING (not counted; recommend fixing)

- **A2AGovernance.tsx:584-614 — live "Trust Policies" stat under a blanket Demo badge.** The 5-card header grid
  sits under one `<MockDataBadge/>` (586). Four cards are genuinely mock (AGENT_NODES=7; success-rate / denied /
  185ms latency from `A2A_EVENTS`), but the "Trust Policies" card (596-597, `activePolices` /
  `{displayPolicies.length} total defined`) is **live-derived** when `policiesLive`. So a real count (4) is
  labeled Demo. This is an *under-claim* (safe direction), not a violation. Fix: badge the Trust Policies card
  separately, or split it out from the Demo-badged mock cards.
- **FleetOverview.tsx:1695 & 1707 — `policiesEnforced`/`policiesActive` pass total count, not active count.**
  Both pass `policies.length` (all statuses) where the label says "Active"/"Enforced". With the current seed
  (3/3 active) the rendered number is correct, so there is no current false claim — but it would over-count if
  any policy were `draft`/`disabled`. (The compact list at 1765 already filters correctly.) Fix: pass
  `policies.filter(p => p.status === 'active').length`.
- **FleetOverview.tsx:1654-1661 — `access` pillar heuristic is unlabeled.** The weighting (`*10`, `*15`, `*2`)
  is arbitrary and the pillar is NOT in `illustrativePillars` (1661), so it presents as a "real" score. It is
  derived from real inputs (no fabricated data), so it is not a violation, but consider a "derived/heuristic"
  marker or a methodology note for parity with `AIQualityMonitor`'s "Derived heuristic" badges.
  > **RESOLVED 2026-09-04 (§3-109)** — replaced with a measured ratio, not labelled. See below.
- **FleetOverview.tsx:1705-1710 — `GovernanceDimensionsCard auditEnabled/identityConfigured` hardcoded `true`.**
  Pre-existing (already logged in the 2026-08-31 pass); unchanged this round.

## Resolved 2026-09-04 — audit §3-109 (fleet posture pillars) + §3-67 (hallucination denominator)

**§3-109 — `registry`/`access` pillars were saturated point formulas under a Live badge that named them.**
Measured before the fix: `registry` = `min(100, 50 + min(40, 37*2) + 0*5)` = **90** (the inner `min(40, …)`
caps at 20 agents, so 37 agents and 200 agents both score 90); `access` =
`min(100, min(50, 40*2) + 7*15 + 3*10)` = `min(100, 185)` = **100** (saturates at ≥4 active guardrails).
Neither could move with the fleet, and `FleetPostureSection.tsx`'s `LiveDataBadge` detail explicitly named
"Registry, Access & Security" while only `security` was a real ratio.

Both are now real coverage ratios over the scanned AI estate, from
`GET /governance/resource-tags` (`resourcegroupstaggingapi:GetResources`, carries its own `live` flag):

| pillar | formula | source field | before → after |
|---|---|---|---|
| `registry` | `governance_tagged / total_ai_resources` | `tag_coverage_pct` | 90 → **49** (29/59) |
| `access` | `with_scope / total_ai_resources` | `scope_coverage_pct` | 100 → **25** (15/59) |
| `visualization` | `useCases.length > 0 ? 80 : 40` (illustrative) | — | 40 → 40 |
| `interoperability` | `effectiveGuardrailsActive > 0 ? 70 : 30` (illustrative) | live guardrail count | 30 → **70** |
| `security` | `implemented / total` controls | `controlStats.percentage` | unchanged |

`workloadIdentities / agentcoreRuntimes` was rejected as the `access` numerator: 40 > 29 so the ratio exceeds 1,
and `/agentcore/workload-identities` returns a flat list with only `total` — no per-runtime join key.

Both pillars are gated on the tag scan's own `live` flag. When it is not live they degrade to `0` (rendered
`—`, with an "Unavailable — the live signal backing this pillar could not be read" tooltip) and drop out of
the new `livePillars` prop, rather than falling back to a point formula.

Badge copy is no longer hardcoded. `FleetPostureSection.tsx` derives both badge strings from the actual key
sets via `pillarLabelList()`, so the Live badge can only name pillars in `livePillars` and the Demo badge can
only name pillars in `illustrativePillars` — the previous hardcoded `"Monitoring & Integrations scoring,
30-day trend"` could have described the wrong pillars after any list change.

**Contradictory guardrail counts on one page (same fix).** `guardrailsApi.list()` (AVA template table) returns
`[]` while `governGuardrailsApi.telemetry()` reports 7 READY Bedrock guardrails. The page rendered "0
guardrails" in the Live-AVA banner and the Security Controls counter while the posture card reported 7
healthy. Every user-facing "guardrails" number now uses the live telemetry count; the AVA template list is
relabelled **"AVA-Managed Templates"** (with an explicit "None — 7 guardrails active directly in Bedrock"
note), and the template-scoped invocation counter is relabelled "template calls".

**Single fetch, one source of truth.** The resource-tag scan is fetched once in `FleetOverview` and passed to
`GovernanceTagCoverage` as props (it was self-fetching), so the card and the pillars cannot disagree and no
duplicate network call was added.

**§3-67 — hallucination-rate denominator: comment + guard only, no numeric change (verified).** The audit
asked for the denominator to be filtered to guardrails carrying contextual grounding. That would have been a
**no-op** (7/7 live guardrails report `contextual_grounding.enabled === true`, so the filtered denominator is
bit-identical) **and dimensionally wrong**: `by_policy` comes from CloudWatch `InvocationsIntervened` grouped
by `GuardrailPolicyType` + `Operation=ApplyGuardrail` with **no `GuardrailArn` dimension**
(`govern_guardrails_service._per_policy_metrics`), so the CG numerator is inherently account-wide and cannot
be attributed per guardrail. The existing account-wide-over-account-wide ratio is the dimensionally matched
pairing. `useLiveMetrics.ts` now documents that at the fetch site and adds an honesty guard: if contextual
grounding is absent from the policy breakdown entirely, `groundingFailures` is `null` and the
grounding/hallucination metrics keep their illustrative values instead of publishing a fabricated 0% under
`[LIVE]`. Rate unchanged: **286 / 21,362 = 1.339%**. The guard deliberately does not cover a *mixed* fleet
(some guardrails without CG) because that needs the policy config from `governGuardrailsApi.list()`, an extra
`get_guardrail` call per guardrail on a page-load path — tradeoff recorded in the code comment.

## No NEW regressions
The A2A live-policy wiring in A2AGovernance.tsx is a **new** addition and is honest (correct 200-gating, correct
field mapping, no fabricated fields, honest empty/mock fallback). FleetOverview's policy provenance is unchanged.

## Resolved 2026-09-14 — compliance coverage semantics + framework double-count

Both fixes moved to the **server**, so the split has one authoritative definition instead of being
invented per consumer. That is not the same as every consumer reading it: `useReportsLiveData.ts` still
sums `passCount + inProgressCount + failCount` over its own deduplicated framework list rather than
taking `total_assessed`, deliberately, so the figure holds whether or not the server has excluded the
alias ids. The two definitions agree exactly, and preserving that agreement is the constraint on
editing either side. The frontend-only mitigation recorded under *"Avg Compliance hid its denominator"*
in `README.md` is superseded by this; that entry's "Currently latent" note is also no longer true — the
account now carries 24 real attestations, so the live branch renders.

**A pass rate was labelled as coverage.** `coverage_pct` divides by the *assessed* population and reduces
to `pass / (pass + in_progress + fail)` — `total_controls` cancels out of `total_controls -
not_started_count` entirely. The denominator was a local named `applicable` that was never returned, so
"100% compliance" could be published off 2 of 16 controls with no way for any caller to see it. The
service now returns `assessed_count` and `assessed_pct` per framework, and `total_assessed` /
`total_not_assessed` / `overall_assessed_pct` on the posture, all derived from the same summaries so
there is one definition. `assessed_count` is clamped to `[0, total_controls]` because `total_controls`
comes from `FRAMEWORK_META`, which the route documents as informational while the frontend is
authoritative — when more controls are attested than the metadata counts, the raw arithmetic makes
`not_started_count` negative.

Measured on the live endpoint after the change: **`total_assessed` 24, `total_not_assessed` 257,
`overall_assessed_pct` 8.5%**. SR 26-2 previously read a bare `100%`; it now also reports `assessed_pct`
**12.5%**. The Reports header chip reads *"100% of 24 assessed controls pass (24 of 281 assessed, 24
auto-detected)"* — verified in the running app, with the bare string "100% avg compliance" confirmed
absent.

**Three frameworks were registered twice, inflating the estate.** `FRAMEWORK_META` carried alias pairs
(`osfi-e-23`/`osfi-e23`, `naic-model-bulletin`/`naic-ai`, `colorado-sb-205`/`colorado-ai-act`), so
`/posture` double-counted to 17 frameworks / 318 controls. A `FRAMEWORK_ALIAS_IDS` set now excludes one
side from **aggregation only** → **14 frameworks / 281 controls**. The excluded side is deliberately the
spelling the frontend never calls: attestations partition by framework id (`pk = COMPLIANCE#{id}`), so
aggregating the *unused* spelling would read an empty partition and report a real framework as entirely
unassessed. All six partitions were confirmed empty before landing, so no stored row changed bucket.
The membership gates at `/summary`, `/attestations` and the attestation `PUT` still read the **full**
17-entry dict — removing the aliases outright would 404 those ids. Verified: all 8 ids still 200 on all
three routes, a bogus id still 404s, and `mitre-atlas` / `nist-genai-profile` are preserved.

**Known-stale, deliberately not changed:** `FRAMEWORK_META`'s comment claims its control counts match the
frontend's `mockData`. They do not — the frontend's authoritative total is **806**, not 281, and 11 of 14
per-framework counts disagree (e.g. `cri-fs-ai-rmf` 45 vs 274). `assessed_pct` is therefore a ratio over
the backend's own control inventory, not the UI's. Reconciling the two inventories is a larger change than
this fix.

## Resolved 2026-09-14 — a completed assessment was visible only in the tab that computed it

`handleComplete` persisted the result via `saveAssessmentResult`, and `useAssessmentState` already read it
back — but `App.tsx` renders `<GovernanceAssessment />` with no `initialResult`, so every reload dropped
the finished assessment and restarted the 15-step wizard at step 1. The score reached `localStorage`,
`/govern`, and the role cards, yet `/govern/assessment` itself always showed "Step 1 of 15, 0% Complete".

`loadAssessmentResult()` (a synchronous counterpart to `saveAssessmentResult`, since the hook's effect is
one render too late to choose an initial view) now seeds both `view` and `result` in lazy initial state. An
explicit `initialResult` prop still wins, so an embedding caller can override what is on disk.

That created a second defect which is fixed in the same change: `handleStartNew` cleared only the *draft*,
so with rehydration in place "New Assessment" would appear to work and then be silently undone by the next
reload. It now calls `clearAssessmentResult()` too, which also clears the stale score out of the consumers
that read it.

Verified in the running app, fresh browser profile per leg: seed present → opens on the results view;
no seed → still opens the wizard (rehydration does not invent a result); "New Assessment" → clears
storage **and** stays in the wizard across a reload. No page errors.

Scope of that verification, stated precisely because the distinction matters: the driver
(`verify_assessment_seed.mjs`) asserts the results view by matching the heading text
`/Domain Breakdown|Maturity by Domain/i` on the rendered page. It does **not** assert the Assessment
Scope banner, the Regulatory Framework Coverage rows, or that any particular maturity/compliance
percentage rendered. "Opens on the results view instead of step 1 of 15" is what was measured; the
correctness of the individual figures on that view was not.

## Resolved 2026-09-14 — one `region` field served two regions, and the Live badge covered for it

MUST-FIX (A) by this document's own rubric: a Live badge over a wrong number. The Operations Hub
reported a **1-agent fleet** while the account actually runs 36 (fleet-status now reads
"7 Bedrock | 29 AgentCore"), and nothing in the UI could have shown it — because the failure is
**silent at the AWS layer**. A Bedrock/AgentCore/CloudWatch call issued against the wrong region
succeeds and returns *that* region's inventory. There is no exception to catch, no `live: false` to
propagate, and no note to render. The honest-degrade triple cannot protect against this class: the
response genuinely is live and genuinely is measured, and it is measured in the wrong place.

Root cause: one `region` field was doing two unrelated jobs — addressing a control-plane DynamoDB
table (in us-east-2, where the tables live) and constructing governed-fleet AWS clients (in
us-east-1, where the fleet lives). `GovernOperationsService` built `_cw`, `_sq`,
`_bedrock_agent_client` and `_agentcore_client` from the incidents table's region. `GovernCostService`
had the mirror-image problem and now carries **three** distinct regions: `region` pinned to us-east-1
for Cost Explorer, `spend_table_region` for the control-plane spend table, and `govern_region` for the
fleet's CloudWatch and Service Quotas reads. Passing the Cost Explorer pin as the table region is what
made `/govern/cost/by-use-case` return `ResourceNotFoundException` against a table that exists.

The tiers are now declared in one place (`backend/src/core/region_config.py`) rather than re-derived
per service: `table_region("<KEY>")` for tier-1 control-plane tables (`<KEY>_TABLE_REGION` →
`CONTROL_PLANE_TABLE_REGION` → `AWS_REGION`), `GOVERN_AWS_REGION`/`get_governed_regions()` for the
tier-2 read-only fleet, and `resolve_service_region()` for tier-3 pinned services.

**Lesson for this document's purpose:** badge honesty is necessary but not sufficient. It certifies
*provenance* — that a number came from a real API — not *identity*, that the API was asked about the
right estate. A wrong-region read is indistinguishable from a correct one at the response boundary,
so the only defence is verifying measured values against the account out-of-band. That is how this was
found: counting Bedrock agents and AgentCore runtimes per region with the CLI before changing any code.

Two honesty defects in the incidents notes were fixed in the same round. The "store unreachable" note
asserted a specific diagnosis (table not provisioned, or access denied), but `_table_ok` is a one-way
latch shared by every DynamoDB operation on the service and never resets — a single transient throttle
on an unrelated SLA write pins incidents to that arm, and to that confidently-wrong diagnosis, for the
process lifetime. The note now names those as likely causes rather than stating one as fact. Separately,
the measured-zero note said "for this window", but the underlying query is unwindowed (the whole
`INCIDENT` partition) with the `days` cutoff applied afterwards, so an empty result means "none at all";
it now says so.

**The latch itself is now fixed too** (`govern_operations_service.py:281-366`). `_table_ok` is paired
with `_table_failed_at` and a `_TABLE_RETRY_COOLDOWN_SECONDS` cool-off, so a failure suppresses
retries for that window and then re-probes, instead of pinning the service degraded for the whole
process lifetime. `_mark_table_ok()` clears the pending cool-off, so one success fully restores the
path. A genuinely unconfigured table still short-circuits without probing, which is the case the
latch existed for in the first place.

Measured after the fix: `/govern/operations/incidents?days=30` → `live: true`,
`source: "dynamodb"`, note *"No incidents recorded in the Operations store."*, 0 rows — an honest
measured zero, which **is** live data. `/govern/cost/by-use-case?days=30` → `live: false`,
`source: "finops-spend-store"` with a note naming what would populate it.

---

## Resolved 2026-09-14 — a page-size argument is a correctness argument

Same defect class as the region bug above, and it fails the same way: **silently, behind a 200, under
a Live badge.** A capped AWS read whose result feeds a *count* publishes a ceiling as a measurement.
Nothing raises, because the request is legal — it just answers a smaller question than the caller
asked.

### The severe form: CloudTrail clamps, it does not reject

`LookupEvents` was being called with `MaxResults=500`. CloudTrail's real maximum is **50**, and it
**clamps** rather than rejecting: the call returns 50 events plus a `NextToken`, which the code then
discarded. So "events in the last 24h" could never exceed 50 per lookup attribute however busy the
account was.

The reason this survived review is worth recording. `botocore`'s `range_check()` validates a shape's
`min` and **never its `max`**, so an over-maximum page size serialises cleanly and reaches the wire.
**The SDK model is not authoritative for maximums** — only the service's own `ValidationException`,
or observed clamping, is. (Confirmed again while writing the tests for this round: `Stubber` rejected
a 5-character `ModelArn` for violating `valid min length: 20`, and accepted every over-max value put
to it.)

### The triage, including a negative result

A resolver was run over every capped `list_*`/`lookup_*` call in the backend, checking each page-size
argument against botocore's own service model. Excluding `MaxResults=1` existence probes, **53 capped
sites** were found:

| Class | Count | Verdict |
|---|---|---|
| Already paged correctly | 7 | no change |
| Feeds an existence check only | 19 | **sound as written** — see below |
| Unpaged, feeds a count or a full iteration | 27 | fixed this round |
| **Page size above the service maximum** | **0** | the severe form does not recur |

That last row is the important one and it is a *negative* result: outside CloudTrail, nothing in the
backend asks for more than a service allows. The remaining 27 were the milder "unpaginated only"
class, and saying so mattered more than making the finding count look larger.

**One caveat on the 53, stated rather than smoothed over.** The resolver's own file list is no longer
available to re-check, so whether its sweep reached `src/api/routes/` cannot now be confirmed. One
route-level site (`api/routes/guardrails.py`, the `aws-summary` twin described below) was found while
fixing the service layer, not by the resolver. Read the table as **service-layer counts plus at least
one route site**, and treat 53 as a floor on the population rather than a census. The per-class
*verdicts* do not depend on the total.

Four further sites in `govern_compliance_service.py` belong to the same class and are worth naming
because of how they hide: `describe_alarms(MaxRecords=10)` and `get_rest_apis(limit=10)` are visibly
capped, but `list_guardrails()`, `list_agents()` and `describe_config_rules()` were called with **no
page-size argument at all**. Nothing in the source shows a ceiling exists — they take the service
default page size and discard the token. That is this defect in its most invisible form, and it is
the reason the triage resolved *operations* rather than grepping for `maxResults`. All seven of that
file's evidence strings now run through one `_count_phrase` helper that prefixes `"at least "` only
when the walk did not complete.

The 19 existence-only sites are **correct as written**. `if policies:` is true of the first page
exactly when it is true of the whole list, so a cap cannot change the answer — a compliance PASS/FAIL
built on one is sound. What *was* wrong at two of them (`govern_compliance_service.py:804/830`) is the
evidence *string*: `"10 custom IAM policies defined"` is a floor presented as a total. The verdict
stayed; the sentence changed.

### One implementation, not three

Paging was extracted into two siblings rather than open-coded per call site, because three copies of a
paging loop is three places for the same bug to survive:

- **`backend/src/core/cloudtrail_paging.py`** — CloudTrail needs one walk per lookup-attribute value,
  so it gets its own module.
- **`backend/src/core/aws_paging.py`** — the ordinary case. `paginate_bounded()` returns a
  `PageResult` carrying `items` plus `truncated` / `timed_out` / `failed`, a `complete` property, and
  a `note` that is **`None` when and only when the count is exact**.

`paginate_bounded_manual()` exists for a residue that surprised us: a few operations return a
`NextToken` but have **no paginator in botocore's model**, so `can_paginate()` is `False`.
`glue:list_data_quality_rulesets` is one. Reading its first page and counting it is the same defect,
so it gets the same disclosure rather than an exemption. Conversely `bedrock:list_foundation_models`
and `cloudtrail:describe_trails` have no output token *at all* and need no paging fix — inventing a
bound for them would have been its own small fiction.

### A dependency was measured instead of trusted

The first design detected truncation by breaking out of the paginator loop and reading
`PageIterator.resume_token`. The name says exactly what was wanted. **Measured on botocore 1.43.10,
it is `None` after a manual `break` whether or not more data remains** — so that design would have
reported every floor as a total, shipping the same class of bug it was written to fix.

The fix is to pass `PaginationConfig={"MaxItems": N}` and let the iterator stop itself, after which
`resume_token` is populated only when data actually remains. Verified including the edge case that
matters most: `MaxItems=3` against exactly 3 items leaves `resume_token` `None`, so **an exact count
acquires no false caveat.** `test_manual_break_cannot_detect_truncation` pins the botocore behaviour
itself, because if a future version changes it the module's reasoning stops being true.

This measurement paid for itself twice — a parallel agent had already drafted the `resume_token`
version and discarded it on being shown the result.

Related, from the same round: on `bedrock-agent` and `bedrock-agentcore-control` the continuation
token is spelled **`nextToken`, lowercase**. A hand-rolled `NextToken` loop reads page one, sees no
`NextToken`, and concludes it is done — the original bug, reintroduced by the fix. The paginator reads
the field name out of the service model and cannot make that mistake.

### Rules the `PageResult` contract encodes

- **A caveat that does not apply is its own dishonesty**, and an unfalsifiable one: a reader cannot
  tell a reflexive caveat from a real one. `note is None` is load-bearing — it is the difference
  between "this is the total" and "this is a floor".
- **Failure is not emptiness.** A call that raised returns `failed=True`, and its empty `items` is an
  artifact of the failure, never a fact about the account. `_evaluate_cloudtrail` now branches three
  ways — exact count / `"at least N"` / *"count unavailable (CloudTrail lookup failed)"* — where it
  used to print `"0 events in last 24h"`, a number nobody measured, at `confidence=0.95`.
- **`ParamValidationError` is re-raised before the broad handler.** It subclasses `BotoCoreError`, so
  `except (ClientError, BotoCoreError)` would report a malformed request *this code built* as an
  AWS-side outage — degrading "honestly" to a conclusion that is wrong for a reason nobody can see.
- **Deadlines use `time.monotonic()`**, so an NTP step cannot silently extend or expire a budget.

### A sixth CloudTrail call site, in a fourth service

An earlier pass in this branch claimed the CloudTrail fix covered "all five call sites in three
services". **That was wrong.** `govern_controls_service.py:182` is a sixth site in a fourth service;
the triage resolver found it. It is recorded here rather than quietly folded in, because a
completeness claim that turns out to be false is exactly the kind of thing this document exists to
catch.

That site also had a bare `except: pass` around `get_trail_status`, which is invisible even to full
log aggregation — and a trail whose status cannot be read drops out of `active_trails` and can flip
the control to **FAIL**. Failing closed is defensible; doing it silently is not. It logs at WARNING now.

One judgment call was made rather than a silent semantic change: the lookup still queries on
`EventSource`, not `EventName`. The control asks whether the trail is recording AI-service activity,
which control-plane calls demonstrate, and `InvokeModel`/`Converse` are CloudTrail **data** events —
with data events disabled, an `EventName` axis reports 0 (measured: 50 control-plane events plus a
`NextToken`, zero invocations). The evidence wording changed to "API calls" so the number cannot be
misread as invocations.

### The truthiness form of the same bug

`live = len(agents) > 0` in `_fetch_agents` was the same error wearing different clothes. An account
that genuinely runs no agents is a **measured zero from two reachable APIs**, and that is live data.
Two consequences, one of them non-obvious:

1. It reported `live: false` for a correct answer, which the UI renders as a mock-data badge.
2. `get_or_load(..., should_cache=lambda r: r.live)` therefore **never cached it**, so both AWS calls
   re-issued on *every single request*.

It is now `live = len(errors) < 2` — `live` answers "did the APIs answer", not "was the answer
interesting". **Truthiness (`bool(r)`, `len(x) > 0`) is always the wrong predicate for a liveness
flag.** The note was wrong in the same place: it said "none deployed or access denied", which are
*opposite* facts — one a clean bill of health, one a broken integration. Both detectors answered, so
it now says so without hedging.

Two adjacent fixes fell out of the same file. `_fetch_gateways_list` had a dead
`hasattr(ac, "get_paginator")` branch — always true on a boto3 client, so its `maxResults=100`
fallback was unreachable *and* the two arms disagreed about what they returned. And
`_fetch_gateway_targets` walks two independently truncatable levels (gateways, then each gateway's
targets), so its note now merges caveats from both instead of asserting a flat "discovered across N
gateway(s)". A gateway whose target list fails is **counted and disclosed**, not silently skipped;
an unreadable gateway list degrades to `live: false` rather than publishing "0 targets across 0
gateways", which would be a fabricated zero.

### The one site where truncation caused a wrong write, not a wrong number

The triage classified capped reads by what they feed: a count, a per-item loop, or an existence check.
One site escapes all three, and it is the most dangerous in the sweep.

`guardrail_service.reconcile_orphans` read `list_guardrails(maxResults=100)`, diffed
`tracked - aws_ids`, and with `dry_run=false` wrote every element of that difference to `status:
DELETED` in DynamoDB. A truncated listing does not undercount anything: it makes every guardrail past
the truncation point look **absent from AWS**, so live guardrails' rows get closed, and the response
reports a smaller `aws_guardrails` count as the justification.

The pre-existing guard fired only on an *empty* result (`if not aws_ids`). That is the one failure mode
a truncated read never has, because a truncated read comes back full. The abort now covers
incompleteness of any kind: `truncated`, `timed_out`, or `failed`.

Its read-only twin, `GET /guardrails/aws-summary`, had the same diff at `maxResults=50` and no write.
There the damage is that the endpoint **fabricates drift**: `orphaned = tracked_ids - aws_ids`, so a
live guardrail beyond the bound is reported as a row pointing at nothing, `in_sync` flips to `false`,
and `drift_note` explains at length that enforcement is over-reported. Every word of that is produced
by the page size. `orphaned_templates` and `in_sync` are now `null` rather than `0`/`false` when the
listing did not complete, because an unread tail is indistinguishable from a deleted guardrail, and
`aws_total` is `null` rather than `0` when the listing *failed*. `untracked` is still reported on a
truncated read: an id that *did* come back with no template row is untracked regardless of what lies
beyond the bound, so it is a floor rather than a fabrication.

`discover_aws_guardrails` in the same file was checked and left alone on the correctness axis. It
already threads `nextToken` to completion, so its counts were always exact; only its page size moved
from 50 to 1000, which is pure transport since every item on every page is processed either way.

### Two sites where the premise did not hold as described

Recorded rather than quietly folded in, because a fix invented to match a description is worse than a
correction.

`pipeline_service.get_execution_status` was listed as a capped read feeding a per-item loop. It is
capped (`get_execution_history(maxResults=100)`, real maximum 1000) and it does feed a list, but that
list is not a count, and the method **has no callers anywhere in the repo**, so nothing it returns is
user-visible today. It was still fixed, for a reason specific to it: `reverseOrder=False` returns
oldest-first, so the events truncation drops are the **most recent** ones, exactly the ones that say
how an execution failed. The list simply stopped, with nothing marking it as a prefix. It now returns
`events_complete` and `events_note` alongside `events`.

`glue:list_data_quality_ruleset_evaluation_runs(MaxResults=1)` looks like the `MaxResults=1` existence
probe the triage excluded, but it is not a probe: it wants the single most recent run for a ruleset. One
item genuinely is the whole answer, and paging it would read history nobody consumes. Left as written.

### Two sites that hid behind a real paginator

The triage keyed on the `maxResults=N`-with-no-paging shape, so two sites in
`govern_security_service.py` were skipped: both already used `get_paginator`. Both were still wrong,
and in the two ways this round keeps rediscovering.

`_coverage_count` returned a bare `int` and swallowed **every** error as `return 0`. Its caller reads
`total == 0 and covered == 0` as *"Inspector2 not enabled or has no scan coverage in this region."*
So an account with Inspector2 enabled, a genuinely clean bill of health, and no
`inspector2:ListCoverage` permission was reported as **not running Inspector2 at all** — a missing
permission laundered into a confident claim about the estate. This is the `_fetch_agents` truthiness
bug wearing a different coat: failure is not emptiness. It now returns a `PageResult`, and the
enablement verdict carries a `cov_read.complete` term, which is the whole fix — a coverage read that
failed or timed out also yields zero items, and that zero is not evidence.

One nuance worth recording, because it cuts the other way from the rest of this section: the bound on
the coverage walk barely matters. The verdict only asks whether coverage is **non-zero**, and the
first page settles that regardless of what follows — the same reasoning that made
`govern_compliance_service`'s `if policies:` sound. It is the *displayed* count that can be a floor,
so that is what is disclosed. The page size did move, though: `ListCoverage`'s real `maxResults`
maximum is **200**, and `100` had been sitting there reading like a deliberate ceiling.

`_fetch_vulnerabilities` bounded its walk at the caller's `max_findings` (default 100, clamped to
500). Stopping on that ceiling is *expected* — it is a display limit, not a mistake. It became a
defect only because `total=len(findings)` shipped with `note=None`, so a ceiling was rendered as a
total. It now discloses the floor, and `ParamValidationError` is re-raised ahead of the broad
`except (ClientError, BotoCoreError, ...)` so a malformed `filterCriteria` cannot masquerade as
"Inspector2 unreachable".

The negative tests matter more than the positive ones here. `"not enabled"` had to stay *reachable*
when both reads succeed and both are empty, or the fix would have traded a false negative for a
permanent false positive. Likewise `test_an_exact_read_that_lands_on_the_ceiling_carries_no_caveat`:
two findings against a ceiling of exactly two acquires no floor language.

### Verification

90 tests across nine new files, all passing in the backend container:
`test_aws_paging` (10), `test_aws_paging_manual` (12), `test_cloudtrail_paging` (14),
`test_govern_agentcore_paging` (12), `test_guardrail_reconcile_paging` (10),
`test_pipeline_history_paging` (8), `test_govern_controls_cloudtrail` (6),
`test_guardrail_aws_summary_paging` (6), `test_govern_security_inspector_paging` (12).

They drive **botocore's own `Stubber` against real service models**, not hand-written fakes — the
whole module rests on a claim about how botocore's paginator reports truncation, so a fake paginator
would prove nothing about the one actually shipped against. The `reconcile_orphans` test is the one to
read: it calls `dry_run=False` against a truncated listing and asserts `table.writes == []`, so the
destructive path is covered rather than reasoned about.

Full backend suite: **314 passed, 1 skipped, 0 failed** in the container. pyflakes was measured
**per file, before and after** (`git show "HEAD:./<path>"` against the worktree) across all 76 changed
source files: **59 → 46, no file regressed**. A whole-tree number is not usable as a gate here — the
repo-wide baseline is ~134-149 — so only the per-file delta is defensible. Eight test files are excluded as **pre-existing**
breakage, unrelated to this round: `test_pipeline_service`, `test_property_based`,
`test_template_catalog`, `test_template_job_service`, `test_iac_filtering`,
`test_iac_filtering_standalone`, `test_bootstrap_engine`, `test_template_validator`. They import
`PatternType` / `Job` from `models/template.py`, which **never defined either symbol at `HEAD`**, and
none of their sources are modified by this branch.

One genuine regression in this round was caught by that suite and fixed:
`test_llm_gateway_master_key.py` hand-builds a stub `core` package to isolate the route from the full
backend, and the new `from core import region_config` import broke it. The stub was extended (and now
records which table key was asked for) rather than the source being reverted — the region fix it
depends on is real: the route built its DynamoDB resource from `AWS_REGION` while `litellm.py` read
the **same table** via `DEPLOYMENTS_TABLE_REGION`, so one reader saw the gateway instances and the
other got an empty list rather than an error.

**Lesson for this document's purpose:** a page-size argument is a *correctness* argument, not a
performance knob. Any capped read that feeds a count must either page to completion or say the number
is a floor. A cap is invisible on a small account and becomes wrong at exactly the moment the estate
grows — the worst possible moment for a governance dashboard to start understating.

---

## Resolved 2026-09-14 — a measured absence was published as an unmeasured failure

The inverse of every other finding in this round, and found by driving the rebuilt stack rather than
by reading code. Elsewhere a *failed call* was published as a *fact* ("0 agents", "Inspector2 not
enabled"). Here a *fact* was published as a *failure*.

`/api/v1/govern/llm-quality/status` came back `live: false`, `source: "aws-apis-partial"`, with
`note: "Could not check whether the AVA-LLM-Quality dashboard exists."` The container log said
otherwise: `GetDashboard` had answered, unambiguously, `ResourceNotFound — Dashboard
AVA-LLM-Quality does not exist`.

The probe was guarded with `except cw.exceptions.DashboardNotFoundError`, which reads like exactly
the right handler and is **dead code**. Measured against the installed botocore:

- The service model *does* map error code `ResourceNotFound` → error shape `DashboardNotFoundError`.
  That is why the handler looked correct.
- botocore nonetheless keys the class it **raises** on the wire *code*, so the raised class is named
  `ResourceNotFound`. It *also* synthesises a separate attribute for the *shape* name. Both
  `cw.exceptions.DashboardNotFoundError` and `cw.exceptions.ResourceNotFound` exist, are **distinct
  classes, and neither inherits from the other**. So the guard could never fire, and every missing
  dashboard fell through to the generic failure branch.

The damage was not `dashboard_deployed`, which is `False` either way. It was the caveat, which was
simply **untrue** — and because `live = not caveats` gates the whole payload, the honest measurements
of guardrail monitoring, custom metrics and alarm state *all* lost their Live badge to it. A false
caveat is not a harmless caveat: it is the same unfalsifiability problem as a caveat on an exact
count, and here it also cost three real measurements their provenance.

Fixed by matching on the error **code** (`_DASHBOARD_ABSENT_CODES`). Verified live after rebuild:
`live: true`, `source: "aws-apis"`, `note: null`, `dashboard_deployed: false` — now an honest measured
absence. Three tests cover it, plus one that pins botocore's code-vs-shape behaviour itself so a
future version that unifies the two names fails the suite instead of silently invalidating the
comment that explains the fix. The negative test matters as much: `AccessDeniedException` is *not* an
absence and must still drop off Live, or the fix would trade a false caveat for a missing one.

**Note on the LLM banner.** The banner text keys on `custom_metrics_active`, which was already
`true`, so it already read "Full LLM Quality Monitoring Active" before this fix. What changed is the
Live badge and the removal of the untrue note — not the banner copy.

**Lesson:** the service model is not authoritative for what botocore *raises*. `client.exceptions.X`
resolving to a real class is not evidence that `X` is the class you will catch.

---

## Resolved 2026-09-14 — "no AI tools in use" was a measured zero that had never been measured

Same family as the region bug above: a **silent failure at the AWS layer**, where the response is
genuinely live, genuinely measured, and measured against the wrong thing. Three services asked
CloudTrail `LookupEvents` for `MaxResults=500` (one for 200), took the first page, and reported it
as the whole window.

Two facts kept this invisible for as long as it lasted:

- **CloudTrail clamps `MaxResults`; it does not reject it.** Asking for 500 returns 50 events plus a
  `NextToken`. No exception, no warning, nothing to propagate into `live: false`.
- **botocore does not catch the over-max value either.** Its `range_check()` validates a parameter's
  `min` and never its `max`, so an out-of-range `MaxResults` serialises cleanly and reaches the wire.
  The SDK model is therefore **not authoritative for maximums** — only the service's own
  `ValidationException`, or observed clamping, is. Worth stating plainly because "the SDK would have
  told me" is the assumption that let this ship three separate times.

The **lookup axis** turned out to be the larger defect, and measuring it is what corrected the
original diagnosis. The first framing of this finding was "each site sees about 10% of the window."
Measured against the demo account over 30 days, the truth was worse by an order of magnitude:

| Lookup | Result |
| --- | --- |
| `EventSource=bedrock.amazonaws.com` | 50 control-plane events (`ListEvaluationJobs`, `ListDataSources`, `GetKnowledgeBase`, …) plus a `NextToken` — **zero invocations** |
| `EventSource=bedrock-runtime.amazonaws.com` | **0 events at all** |

`InvokeModel`/`Converse` are CloudTrail **data** events, and data events are not enabled on this
account, so they appear under no `eventSource` these services could query. Every site then filtered
its page for exactly those four event names. So the filter matched nothing, on every request, and
harness/tool detection reported *"no AI coding tools in use"* as a measured fact from a lookup that
had never pointed anywhere it could find one. A false negative under a Live badge, which by this
document's rubric is MUST-FIX (A).

Fixed by looking up **by `EventName`**, which finds invocations wherever they landed, and re-checking
each event's `eventSource` afterwards so a same-named event from another service cannot be miscounted
as Bedrock usage.

The paging, the bounds, and the disclosure now live in one place, `backend/src/core/cloudtrail_paging.py`
(`lookup_events_paged` → `LookupResult`). Three copies of that loop existed and all three had shipped
the same bug independently, which is the argument for extracting it: the next caller inherits the fix
instead of re-discovering the clamp. `LookupResult` separates three outcomes that a single boolean
would have flattened — `capped` (hit the 40-page / 40s bound), `at_target` (stopped at the caller's
requested limit), and `failed` (the lookup raised) — and `note` is `None` **only** when every value
was walked to the end of the window. That `None` is load-bearing: it is the difference between "these
are the totals" and "these are a floor," and a floor presented without saying so reads as a total.

Sites fixed: `govern_developer_ai_service.py` (two call sites, via the shared cached
`_lookup_bedrock_invocation_events`), `govern_aidlc_service.py:_detect_from_cloudtrail`, and
`govern_trail_service.py` (`_fetch_ai_activity`, `_fetch_ai_callers`).

Four smaller defects were fixed in the same round, each worth recording on its own:

- **A `should_cache` truthiness predicate, the 138th of its kind on this branch.**
  `_lookup_bedrock_invocation_events` cached on `bool(r[0])`, so an account with genuinely no Bedrock
  invocations — a **measured zero, which is live data** — was rejected from the cache every time. The
  quietest accounts therefore paid the largest bill: a full re-page of 4 event names × up to 40 pages
  on every single request, for the entire life of a cache entry that never existed. The predicate is
  now `LOOKUP_FAILED_MARKER not in (r[1] or "")`, because the only genuinely uncacheable outcome is a
  lookup that *failed*, where the emptiness is an artifact of the failure rather than a fact about the
  account.
- **`live=len(agents) > 0`** in the same service, the same confusion in the response rather than the
  cache. Now `live=True` with a note distinguishing a measured zero from a failed lookup.
- **A failure logged at `logger.debug` and swallowed with `continue`.** A per-event-name lookup that
  failed on every request was invisible even to a full `docker compose logs backend` sweep — the
  endpoint simply reported no AI activity. Now `logger.warning`, and the failure is carried in
  `LookupResult.failed` so it reaches the response too. (A corollary of this branch's other lesson: a
  UI route sweep cannot see a defect that degrades behind a 200, and log aggregation cannot see one
  that logs below its threshold.)
- **`ParamValidationError` is now re-raised ahead of the broad handler.** It subclasses
  `BotoCoreError`, so `except (ClientError, BotoCoreError)` reported a malformed request *this code
  built* as an AWS-side outage — degrading honestly to a conclusion that is wrong for a reason nobody
  can see.

`AidlcHarnessResponse` gained the missing `note` field, so the AI-DLC harness endpoint now carries the
full `live`/`source`/`note` triple like the rest of Govern rather than two thirds of it.

**Lesson for this document's purpose:** a page-size argument is a correctness argument. `MaxResults`
reads like a performance knob, so it gets set to a round number and never reviewed, and the one place
that would have flagged it — parameter validation — checks the wrong bound. Any capped read that feeds
a *count* has to say it was capped, or the count is a claim the code cannot support.

---

## Resolved 2026-09-14 — 10 of 24 measured attestations were silently dropped on a control-id mismatch

Recorded here because it is the same failure shape as the region bug above, and it became
reachable only once attestations started persisting. **Now fixed**, and the fix turned out to be
a rename rather than the data migration this entry originally predicted — see the closing note.

`useComplianceAttestations.ts` stores each attestation under the server's `att.control_id` and
then looks it up by the checklist's `ctrl.id`. Those two do not agree for every framework.
Measured against the live backend:

| Framework | Server `control_id` | This checklist's `ctrl.id` | Dropped |
|---|---|---|---|
| `nist-ai-rmf` | `GOVERN 1.6` | `NIST-GV-1.6` | 3 of 3 |
| `finos-air` | `AIR-D-001` | absent entirely | 7 of 11 |
| `owasp-llm-top10` | `LLM01-1` | `LLM01-1` | 0 of 8 |
| `sr26-2` | `GOV-1` | `GOV-1` | 0 of 2 |

**10 of 24 total.** Verified by set-comparing the four frameworks' stored `control_id`s against
every `id:` literal in `mockData.ts` — those 10 strings appear nowhere in the file, so the miss
is certain rather than inferred. (The 14 "join" figure is an upper bound, since the comparison
was global rather than per-framework; the drop count is exact.)

For NIST the value the server sends is present on a *different* field: `ctrl.section` is
`"GOVERN 1.6"` while `ctrl.id` is `"NIST-GV-1.6"`. So this is a key-choice bug, not missing data.

Why it belongs in this document rather than a bug list: **a miss is indistinguishable from
"not assessed."** The control silently keeps its seeded status, and `setLive(allAttestations.size > 0)`
has already flipped the page to LIVE because *some* attestation arrived. A seeded PASS therefore
renders under a Live badge. That is exactly the provenance-vs-identity distinction the
region section above is about: the badge is telling the truth about the *response* and a
falsehood about the *row*.

**Fixed by re-keying the backend's 9 orphaned ids to the frontend namespace**, which is
authoritative because it is the published-identifier side: `GOVERN 1.6` → `NIST-GV-1.6`,
`MANAGE 3.1` → `NIST-MG-3.1`, `MEASURE 1.1` → `NIST-MS-1.1`, `AIR-P-001` → `AIR-PREV-003`,
`AIR-P-002` → `AIR-PREV-017`, `AIR-P-003` → `AIR-PREV-012`, `AIR-P-005` → `AIR-PREV-008`,
`AIR-D-001` → `AIR-DET-001`, `AIR-D-003` → `AIR-DET-004`. Each was matched by meaning, and
several were confirmed by the target control's own `autoDetectSource` declaration rather than by
id spelling. The frontend ripple went with it: 13 dead `FinosAirView.tsx` lookup keys, a
`satisfies` list, two seeded `ComplianceCenter.tsx` rows, the `Documentation.tsx` mirror, and the
KNOWN GAP comment in `useComplianceAttestations.ts` that asserted this was unfixable.

This entry originally predicted a data migration. That was wrong, and the reason is worth keeping:
**all 24 stored attestations are `auto_detected: true`**, verified by table scan before editing.
Nothing was hand-signed, so re-keying destroys no human judgement and the next auto-detection pass
simply rewrites the rows under the new ids. A migration would have been required only if a person
had attested under an old id.

`AIR-D-002` is deliberately left unmapped. No control in the published 46-entry FINOS taxonomy
means "configuration compliance monitoring", and both available shortcuts were rejected: inventing
`AIR-DET-002` would fabricate a published identifier, and re-pointing it at EU AI Act Art. 15 would
mark a legal article PASS off the mere existence of a Config rule.

**User action still outstanding:** the 9 rows stored under the *old* ids are now orphaned in the
table. They are harmless (nothing reads them) but they inflate a raw row count, so they should be
deleted. The exact `aws dynamodb delete-item` loop was supplied to the operator and deliberately
not run from here.

---

## Resolved 2026-09-14 — the trust baseline was inflated by 30 points

`trustScore` **83 → 53** on the live account. The compliance pillar was fed
`overall_coverage_pct`, which is a **pass rate over assessed controls only** and currently reads
100. So "everything we looked at passed" was being published as "we are fully compliant", off 8.5%
of the estate.

The pillar is now `total_pass / total_controls`. That was chosen over the more obvious
`overall_assessed_pct` because `assessed_pct` is blind to outcome — "8.5% assessed, all failed"
would score identically to "8.5% assessed, all passing". `total_pass / total_controls` moves with
both breadth and result, can never exceed `assessed_pct`, and equals the 9% the Command Center
already displays, so the score and the number beside it cannot drift apart.

Ripple, measured: `complianceBaseline` 100 → 9, `frameworksCovered` 4/14 → 0/14,
`frameworksNeedingAttention` 10 → 14. SR 26-2 is now correctly flagged; it had been showing a full
green bar off 2 of 16 assessed controls. Program completeness moved 75% → 73%, crossing no band
(still MANAGED).

**The honest score exposed a calibration break that the inflated one had hidden.** The trend
sparkline clamped its points with `Math.max(50, …)`. At a baseline of 83 that clipped 0 of 30
points and was effectively dead code; at 53 it clips **13 of 30**, rendering `50,50,50,51,52,53…` —
a manufactured "stuck at 50, then improved" narrative. The floor is now 0, the score's natural
domain. This is worth generalising: a defensive clamp that never fires is not proof it is
harmless, only proof that nothing has yet moved into its range.

Two assumptions in the original brief were disproved during the fix and are recorded so they are
not re-asserted: `FleetPostureSection`'s gauge, grade letter and colour band are driven by
`score={controlStats.percentage}`, **not** `trustScore` (verified still 73 / C), and
`WorkflowsPage.tsx` reads only `controlsImplemented` / `controlsTotal` / `deploymentsPending`, none
of which changed.

## Resolved 2026-09-14 — a degraded response could pin an endpoint degraded for its whole TTL

`get_or_load(key, TTL, loader, should_cache=...)` takes an optional predicate, and
`core/ttl_cache.py:83` is `if should_cache is None or should_cache(value):` — so **omitting the
predicate caches unconditionally**. One transient failure therefore cached a `live: false` body and
served it for the full TTL, long after the underlying store recovered.

This was systemic, not local: **15 of 137 call sites** omitted it. All 137 now pass one, verified by
24 behavioural checks proving both directions — a degraded read is absent from the store afterwards,
and a measured zero / empty list / legitimate miss is present.

The load-bearing subtlety: **a measured zero from a reachable store is live data and must still
cache.** So truthiness (`bool(r)`) is always the wrong predicate; the correct one is the response's
own `live` flag. For the sites whose loaders return no in-band provenance, the predicate reads a
closure-local `degraded = {"v": False}` holder rather than a field on the service, because
`should_cache` runs *after* the loader — shared class state can be describing a different call's
provenance by the time it is read.

## Resolved 2026-09-14 — 49 of 155 control-mapping references pointed at nothing

`UNIFIED_CONTROL_MAPPINGS` counted every string in `satisfies[].controls[]` as a distinct
obligation, including strings that match no control id in the named framework's checklist. So the
"distinct obligations" and "Controls Covered" figures counted references that resolve to nothing,
while `crossFrameworkImpact` — keyed by the same raw strings — silently dropped their chips. One
number over-counted and another under-counted from the same broken join.

A `CONTROL_REF_INDEX` built from `COMPLIANCE_CENTER_FRAMEWORKS` itself now resolves references
(no hardcoded exclusion list), and all three consumers count only what resolves. 119 of 155 resolve:
106 by id, plus **13 NIST references resolved by a unique `section` alias** rather than by a
spelling guess — `NIST-GV-1.1` literally carries `section: 'GOVERN 1.1'`, unique within that
framework, so the mapping was already naming the published subcategory and only the lookup key was
wrong. Ambiguous sections resolve to nothing by design, verified: SR 26-2 `'§IV.A'` and OWASP
`'LLM01:2025'` each own several controls and produce no accidental match.

Measured user-visible effect: default selection 24 → **23** obligations and 46% → **43%** reduction;
all 11 frameworks 143 → **109** and 87% → **83%**. The mapping *data* was not edited, and the 36
that still resolve to nothing are now **disclosed rather than silently counted**, per framework, in
the callout, the comparison matrix (`Mapped Refs` / "resolved of written"), the coverage cards and
the expanded task rows.

The selection "EU AI Act + OWASP Agentic" goes 23 → **0**, and gets its own honest empty state
instead of a bare zero — that is the case that would otherwise have silently vanished.

## Resolved 2026-09-14 — fabricated write attribution across 26 route sites

Writes recorded `created_by="user"` (and `assigned_by="control-plane-operator"`, and
`updated_by`/`uploaded_by` query defaults of `"user"`). None named a person. The
`control-plane-operator` variant was the worst of them precisely because it reads like a real
service principal, so nobody went looking.

All now resolve from the `x-user-email` header — the same header `core/rbac.py:88` reads to decide
the role, attached to every request by the interceptor at `client.ts:46` — falling back to
`"unknown"`. `"unknown"` is worse to read and better to trust: it is falsifiable, so a missing
identity surfaces as a gap instead of as a plausible name.

**Precedence rule, applied uniformly: the transport header wins over any caller-asserted body or
query field.** The header is the identity the RBAC layer already acted on to authorize the call; a
body or query field is a string the caller typed. Letting the field win would let an authenticated
operator sign a record in somebody else's name. Those fields are kept, not removed, only so a
header-less server-to-server caller can still attribute its write.

The compliance attestation sites deserve singling out: the query params defaulted to `"user"` and
**no frontend call site ever passed them**, so the default *was* the value on the one table a
regulator would actually ask for. An attestation attributed to a constant is unsigned while still
looking signed.

Values judged honest and deliberately left alone, using the test "does this name *who performed*
the write, or does it *classify* something?": `actor="system"` on automated seed imports (a process
genuinely did perform them), `{"role": "user"}` in Bedrock Converse payloads (wire format),
`"user"` as a provenance class in `transformation_value_model`, IdP group-name matching, and
`'bulk-import'` on the bulk endpoint (it names a mechanism, and the route's own param description
says "Source of bulk update"). `MarketplaceAdmin`'s `approved_by`/`denied_by` fell the other way and
were fixed: they defaulted to `|| 'admin'`, fabricating an approver for a governance decision.

**One of these was a spoof, not merely an inconsistency.** `POST /alerts/silences` took `created_by`
from the request **body** while its siblings took it from the header, and the body won. Reproduced
against working-tree source: with `x-user-email: victim.operator@example.com` and a body claiming
`attacker@example.com`, the stored row read `attacker@example.com`. So an authenticated operator
could attribute a paging suppression to a colleague. The body field was also *required*, so a
header-only server-to-server caller got a 422 and could not call the endpoint at all. Both are fixed
by the precedence rule above; the service re-guards independently, because `created_by` is
serialized into the row's `data` blob and `AlertSilence.created_by` is a required `str`, so a `None`
would have raised before the write and the silence would silently not have happened.

## Resolved 2026-09-14 — `/users/me` reported a fabricated identity in production

`users.py` seeded `email = "admin@example.com"` and used it as the fallback on **every** path. The
production case was real and reachable: a valid Cognito JWT whose claims carry no `email` key
returned `{'email': 'admin@example.com', 'role': 'operator'}` — the dev *admin* literal sitting
beside a non-admin role, which is how badly the two fields had come apart. It now returns
`"unknown"`.

Resolution order, chosen so `email` and `role` can never describe different principals:
`x-user-email` **only when `_is_dev_auth_allowed()`** (that is the header `rbac.py:88` keys the dev
role off, and what the UI's user switcher sets) → the `email` claim of a verified JWT →
`"admin@example.com"` **only on the dev path**, because that is the exact default `rbac.py:88` just
granted the role for → `"unknown"`.

The gate moved from raw `settings.USE_DEV_AUTH` to `_is_dev_auth_allowed()`, which is a
**tightening**: under `ENVIRONMENT=production` with `USE_DEV_AUTH=True`, rbac already refuses the
bypass, so `/users/me` must not honour a caller-supplied identity header either. Verified — a
`x-user-email: spoof@example.com` alongside a valid JWT now returns `email='unknown'`, not the spoof.

One deliberate precedence change inside dev: with a real JWT carrying an email claim *and* a
`dev_user_email` header set, the header now wins where the claim used to. That keeps the user
switcher authoritative and matches rbac, which also checks the header first in dev.

`AlertCenter` additionally treats the literal `'unknown'` as *no* actor, so the new sentinel cannot
enable a control whose own copy promises the action is withheld rather than recorded against a
placeholder. `Sidebar.tsx:442` renders the word plainly — no blank, no crash, no avatar initial
derived from it.

## Resolved 2026-09-14 — a promote or step-down left one roster read stale

`govern_graduation_service._invalidate_caches` invalidated three of its **four** read caches;
`graduation:records:` was missing, so `list_records()` served the pre-write roster for its full TTL.
Reachable in production, not latent — `api/routes/govern_graduation.py:53` exposes it.

It presented as an **inconsistency rather than as staleness**, which is the part that would have
cost the debugging time: `list_graduations()` and `summarize()` compose `_list_records_impl`
directly rather than the cached `list_records()`, so they picked the write up immediately. One
roster read showed the old stage while the roll-up beside it already showed the new one, and the
write itself returned 200 with the record correctly persisted.

---

## Severity rubric (how MUST-FIX was decided)

- **MUST-FIX (A)** — a Live badge/label/pulsing dot rendered over content that is fabricated,
  hardcoded-literal, randomized, or an explicitly-illustrative approximation; OR an
  unconditional/hardcoded-true Live claim on a surface whose data is not guaranteed-live.
- **MUST-FIX (C)** — a dead control that fakes success (`console.log`/`alert`/`setTimeout`→`true`)
  instead of being disabled with an honest Demo/Planned label.
- **MUST-FIX (D)** — a pooled rate/percentage (one that represents an overall rate) computed as an
  unweighted average of per-item rates.
- **ACCEPTED-WARNING** — coarse Live badge gated on a *real* live flag whose fallback tiles show
  `0`/`—`/placeholder (not fabricated non-zero); unconditional badge over genuinely-always-live
  internal-API data with an honest empty state; undisclosed mock with *no* Live claim; a metric
  honestly labeled as an average and computed as one; latent/unused components; correctness bugs;
  avg-of-averages for non-rate measures; toast/no-op buttons on Mock-badged demo surfaces.

---

# MUST-FIX — all 9 closed as of 2026-09-14

Each was re-verified against current source before being marked closed, because several turned out
to be **stale rather than fixed** — the line numbers in the original entries no longer pointed at
the described code. Distinguishing "fixed" from "never real" mattered: manufacturing a fix for a
phantom is how a review document starts lying about the tree it describes.

| # | Item | Class | Outcome |
|---|---|---|---|
| 1 | `GovernanceCommandCenter` unconditional "Live · from your AWS account" banner | A | **FIXED** — `live={healthLive}` (`:527`), and the label itself now swaps to "AWS account not connected" rather than staying green over empty tiles |
| 2 | `GovernanceCommandCenter` External Agents hardcoded provider counts | A | **FIXED** — `:414-415` gate per provider: `multicloudAgentsLive ? (inv?.live ? inv.total : '—') : illustrative`. `mcAgentTotal` no longer exists |
| 3 | `DataGovernance.tsx:343` Live badge over the every-guardrail-on-every-agent approximation | A | **NEVER REAL (stale)** — `DataGovernance.tsx` was deleted and split into `govern/data/*` before this entry was written. The prescribed `integration="per-agent guardrail binding not yet resolved"` string was also retired; the surviving badges unified on `integration="Bedrock agent guardrail associations"`, because `MockDataBadge` renders the prop as `title="Integration needed: <string>"` and the old wording named no source |
| 4 | `finops/CostAnomalies.tsx` `Math.random()` trend charts under a Live badge | A | **FIXED** in `7589e5d8` — the random series is gone, not merely re-badged |
| 5 | `finops/Optimization.tsx` mock opportunities under the section Live badge | A | **NEVER REAL (stale)** — the per-card badge the entry prescribes was already present |
| 6 | `operations/CapacityPlanning.tsx` quota-increase form fakes success | C | **FIXED** — wired to real Service Quotas. See "Resolved — the two fake-success controls" below |
| 7 | `operations/AlertCenter.tsx` fake mutations on live CloudWatch alarms | C | **FIXED** for acknowledge and silence. Alert **rule** mutations remain open and are now recorded honestly — see OPEN below |
| 8 | `operations/FrameworkReportsModule.tsx` pooled compliance % as avg-of-rates in the fallback | D | **FIXED** — `:2136-2143` pools `totalPass / totalApplicable`, with the reason recorded at the site |
| 9 | `ModelMonitoring.tsx` fleet Error Rate as unweighted mean | D | **NEVER REAL as written** — the KPI was already invocation-weighted. A *different* defect was found in the same area and fixed: the backend emits `avg_latency_ms = 0.0` for a model with invocations but no latency datapoint (`govern_models.py:198`), so those rows contributed 0 to the numerator while contributing their full invocations to the denominator. It surfaced as the KPI disagreeing with the "Avg latency (fleet)" tile on the same screen |

---

## Resolved 2026-09-14 — the two fake-success controls now do real work

Both were MUST-FIX (C): enabled buttons operating on **live AWS resources** that fabricated success.
The chosen remedy was to wire them to real AWS APIs rather than to disable them behind honest labels.

**Alert acknowledge / silence.** Writes are durable DynamoDB rows. The response deliberately does
**not** claim the CloudWatch alarm changed, and the two AWS calls that would have made that claim
true were both rejected on record: `SetAlarmState` falsifies alarm history, and
`DisableAlarmActions` is untimed and silently disarms paging. The UI states the scope instead —
*"Suppression applies to this dashboard only. The CloudWatch alarms keep evaluating and their
notification actions stay armed, so anything wired to SNS or a pager still fires."* Acknowledgements
are scoped to the current firing via `alarm_state_epoch`, so an ack does not carry over into the
next one.

Write outcomes go through a 5-arm union (`persisted` / `unpersisted` / `unconfirmed` / `not-found` /
`failed`) so a success state cannot render without the non-durable cases being handled.
`source: "memory"` reads as failure, and a `live: false` + `source: "dynamodb"` contradiction routes
to `unconfirmed` rather than to success.

`Alert.id` changed from ARN to alarm name, because the ARN was being returned unmasked beside an
already-masked `alarm_arn`, bypassing `mask_account_id`. All five frontend consumers were checked
individually: none parsed it as an ARN, so nothing broke.

**Quota increase.** It was reading, and would have *filed*, against the wrong region — `L-5C7643AC`
is absent in us-east-2 and present in us-east-1, and `QuotaArn` is region-scoped, so the increase
would have succeeded against a region nothing runs in. This is the same silent wrong-region class as
the section above. Separately, CloudWatch quotas were never monitored at all: the Service Quotas
service code is `monitoring`, not `cloudwatch`.

A sixth status value `invalid` was added for requests this control plane rejects pre-flight (quota
not adjustable, or requested value not above the current limit). It is distinct from `denied`
(AWS answered and refused) and from `error` (no answer at all), and it carries `live: true` honestly
— the numbers quoted in its message are measured. Each outcome carries `resubmit: safe|unsafe`, and
when unsafe the Submit button is **withdrawn rather than disabled**, so a second press cannot
duplicate a real Support case.

---

# ACCEPTED-WARNING (not counted; recommend fixing)

**Live badge / mock-provenance (real flag, but coarse or undisclosed)**
- **DevToolsGovernance.tsx:2571-2580** — unconditional `LiveDataBadge source="CloudTrail"` + pulsing
  "Real-Time / Live telemetry from CloudTrail" over data that shows `$0.00`/`0` when CloudTrail is
  absent. Near-MUST-FIX; treated as warning only because the enclosing tab may already gate on live —
  verify. Fix: gate the badge + pulse on `costData?.live`.
- **DevToolsGovernance.tsx:822** — `LiveDataBadge source="CloudTrail"` gated on `liveData?.shadow_ai`
  presence, not `isLiveData` (627). Fix: gate on `isLiveData`.
- **operations/OpsOverview.tsx (hero tiles ~296-345, header ~995-999)** — page "Live (Operations APIs)"
  badge is gated on `anyLive`, but SLA/Incidents/MTTR/Alerts tiles fall back to mock with no per-tile
  Demo marker. (Fleet/on-call sections carry correct per-source dots.) Fix: per-tile live gating.
- **GovernanceCommandCenter.tsx:578,582** — Security Findings Critical/High `?? 0` read as "0 live
  findings" when Security Hub is unavailable (Medium/Low correctly show `—` at 586,590). Fix: `—` when `!riskLive`.
- **GovernanceCommandCenter.tsx:937-943** — anomaly count falls back to `summary.costAnomalies`
  (silent-mock aggregator field) with no mock marker under a possibly-Live Budgets card.
- **GovernanceCommandCenter.tsx:989** — unconditional green PulseDot on "Recent Activity" even on mock feed.
- **FleetOverview.tsx:2054-2106** — "Vendor Health" card fabricated specifics (27 vendors; scores
  92/95/88/85; "3 contracts expiring", "2 DDQs overdue") with **no** badge. Fix: `<MockDataBadge integration="TPRM feed"/>`.
- **finops/BusinessMetrics.tsx** — hardcoded KPIs and maturity "L3" with no badge. Fix: Mock-badge them.
- **operations/CapacityPlanning.tsx (Forecast/Requests/Scaling tabs)** — fabricated growth projection +
  hardcoded scaling recommendations under the page `isLive` badge, no Demo marker; Projected Runway
  defaults to 90d. Fix: Demo-badge the forecast/recommendations; leave runway neutral when no trend.
- **operations/AgentResourceInventory.tsx:1759-1765** — live-but-empty masked by Demo-badged mock
  profiles; **:1813-1816** "Export Inventory" button enabled with no `onClick` (no-op dead control).
- **risk/PolicyAsCode.tsx** — `MOCK_POLICIES`/`MOCK_EXECUTIONS` fabricated with no MockDataBadge (no Live
  badge either; dead controls correctly disabled; stats summed not averaged). Fix: add MockDataBadge.
- **data/DataTaxonomy.tsx:329** — unconditional `LiveDataBadge` on "Use Cases by Domain" (real internal
  `prioritizationApi` data, honest empty state, no mock fallback, internal API has no `.live`); Structure
  KPI cards derived from `SAMPLE_TAXONOMY` mock when live absent (no badge); toast-only "coming soon" buttons.
- **DataGovernance.tsx:75** — unconditional page-header `LiveDataBadge` over mixed live/demo tabs (live
  tabs are real AVA APIs with no mock fallback; demo tabs are Mock-badged). Fix: reflect `dg.loading`/`dg.error`.
- **DeploymentGate.tsx** — 100% mock gate verdicts/counts with **no** badge (governance-critical go/no-go). Fix: MockDataBadge.
- **RagEvaluations.tsx** — fully illustrative RAG scores, no Mock badge (no Live badge either). Fix: MockDataBadge.

**Framework MED-wave (verified largely correct; two notes)**
- **CriAiRmfView.tsx:159-177/592, EuAiActView.tsx:184-202/708, OsfiE23View.tsx:133-151/525** — overlay
  and page badge gate on the *global* `controlsLive` flag rather than the per-source
  `sources[autoDetectSource].live` pattern used by OWASP/FINOS/NAIC. No per-control Live badge is
  rendered, so the page badge stays honest (any-source-live), but the overlay relies on the backend not
  returning evaluations for non-live sources. Fix: adopt the `isEvalSourceLive` per-source gate for
  consistency and robustness. (All three preserve `applicable = total − notStarted`.)
- **EuAiActView.tsx (AI_SYSTEMS 111-120, OBLIGATIONS_MATRIX 123-138, CONFORMITY_MILESTONES 150-157,
  GPAI "3 Complete/2 Partial" 566-568) and CriAiRmfView (third-party checklist 493-546, "Evolving Stage
  (Stage 3)" 347)** — fabricated org-specific operational data with no per-section Mock badge; when
  `controlsLive` the page shows a Live badge whose disclaimer covers only "controls." Fix: add
  `MockDataBadge` to these illustrative sections.

**Rate/statistics precision (non-pooled, softer)**
- **GovernanceCommandCenter.tsx:838 & FleetOverview.tsx:2007-2009** — "Avg Latency" is an unweighted
  avg-of-averages under a Live badge. Fix: invocation-weight.
- **GovernanceCommandCenter.tsx:786** — Trust Stack `foundationPct` averages two distinct percentages.
- **ModelMonitoring.tsx** — latency P99 avg-of-averages (non-rate; softer than #9).

**Correctness / latent**
- **FleetOverview.tsx:105-107** — `avgRiskScore` sums `effectiveTopRisky` but divides by
  `effectiveHeatmap.length` (mismatched arrays → wrong mean). Fix: divide by `effectiveTopRisky.length`.
- **FleetOverview.tsx:1705-1706** — `GovernanceDimensionsCard auditEnabled/identityConfigured` hardcoded `true`.
- **ControlPlanePillars.tsx:142-144 (+46-92,114-116)** and **FleetRiskPosture.tsx:81 (+42,107)** —
  unconditional Live pill/badge + fabricated defaults, but **neither component is imported/rendered
  anywhere** (latent, not user-facing). Fix: gate on a real live flag + drop fabricated defaults, or delete.
- **AgentLifecyclePolicies.tsx:756,762,826,854** — Edit/Enable-Disable/Override/Export fire `showToast`
  on a Mock-badged (535) demo surface. Fix: disable with a Demo label.

---

# Verified CLEAN

- **Framework MED-wave (per-source pattern, exemplary):** `OwaspLlmView.tsx` (isEvalSourceLive 26-33,
  overlay 357-366, `anyControlLive` 369-375 gates page badge 780-782, denominator 409),
  `FinosAirView.tsx` (same pattern + correct per-control Live/Mock badges 565-567, 690-692; denom 226),
  `NaicAiView.tsx` (same pattern; denom 151/163; page badge 633-635).
- **Intentionally static (correctly Mock-badged, never wired):** `NistAiRmfView.tsx:819`,
  `MitreAtlasView.tsx:590` — unconditional `MockDataBadge`, no `LiveDataBadge`/`useControlEvaluation` import.
- **useGovernanceAggregator.ts** — cost (`budgetsUsable`/`costModelUsable`/`anomaliesUsable` 633-641),
  models (`modelCatalog.live` 656, `runtime_metrics.live` 657), and posture (frameworks-present 617)
  are all correctly `.live`-gated with graceful mock fallback and pooled `blockRate` (528). **Structural
  note:** the returned `summary` exposes **no** `.live` flag, so its cost/compliance/model fields fall
  back to mock silently — this is the root cause behind consumer findings that badge `summary.*` values
  (e.g. GCC:937-943). Consider surfacing per-field live flags on `summary`.
- **useControlEvaluation.ts** — correct: exposes `live` + per-source `sources` map; `mergeControl`
  only merges controls with a returned evaluation.
- **Agent-swept CLEAN:** `EarnedAutonomyView.tsx` (exemplary — real promote API, honest failures),
  `AIQualityMonitor.tsx` (per-KPI gating + "Derived heuristic" badges), `Iso42001View.tsx` (776 inside
  `liveConformance` block; page badge 912 gated), `HallucinationDetection.tsx` (480/745 gated;
  server-computed intervention rate), `AgentRegistry.tsx` (446 source-gated), `HandoffWorkspace.tsx`
  (Mock-badged demo), `risk/SecurityPostureCard.tsx` (per-source live gating),
  `TrustStack3Layer.tsx` (772 `hasAnyLiveData`), `ProgramProgress.tsx`, `FleetScaleView.tsx` (82 `isLive`),
  `FleetIdentitySection.tsx` (36/64), `useFleetScale.ts` (288-298 per-block `.live`), `DataSourceStatus.tsx`,
  `ModelManagement/Registry/Comparison/Explainability/Lifecycle/Drawer/Evaluations.tsx`,
  `FinOps.tsx` (all feeds per-`.live` gated), `FleetOverview` FleetRiskView/ProviderSummary/ActivityFeed.

---

# Resolved since the prior review pass

- **FleetOverview.tsx (was: "Live" pill over derived data/tool cards)** — `AgentDataToolsView` now uses an
  honest "Inferred" pill. RESOLVED.
- **ComplianceCenter.tsx:922 (was: unconditional "LIVE")** — now `{live ? LIVE : Demo}` (922-924),
  gated on the `live` prop. RESOLVED. (Its `avgScore` at 864-871 averages per-framework scores, but the
  tile is honestly labeled "Avg Framework Score" at 930, so this is a legitimate equal-weight average — not a #3 violation.)
- **GovernanceCommandCenter.tsx (was: Medium/Low findings hardcoded {0} under LIVE)** — Medium/Low now show
  `—` (586,590). PARTIALLY RESOLVED (Critical/High still `?? 0` — see warning above).

---

# Store-provenance round — 2026-09-14 (backend, `govern_operations_service.py`)

Backend-only pass on the Operations store. Two defects, both of which made the **healthy** state
of a working system indistinguishable from a broken one, and one of which silently capped reads.

### 1. `live = len(items) > 0` — a measured zero was reported as a failure

Ten read paths inferred provenance from the row count. That predicate folds four store states into
two and **names the wrong one for two of them**:

| Store state | Was reported as | Is now reported as |
|---|---|---|
| Table answered, 0 rows | `live=false, source="memory", note=null` | `live=true, source="dynamodb"`, note says the zero is measured |
| Table missing / denied / throttled | `live=false, source="memory", note=null` | `live=false, source="memory"`, note names table + region + retry window |
| No table name configured | `live=false, source="memory", note=null` | `live=false, source="not-configured"`, note names the env var |
| Rows returned | `live=true, source="dynamodb"` | unchanged (plus a floor note if the read was capped) |

The first two rows were **byte-identical**, with nothing in the response to tell them apart. The
states most likely to be misreported were the desirable ones: zero SLA breaches, zero pending
changes, zero alert rules, nothing currently silenced.

Two consequences beyond the badge:

- **The response cache was defeated.** `get_or_load(..., should_cache=lambda r: r.live)` refuses to
  cache a `live=false` payload, so a measured zero re-issued its DynamoDB Query on *every request*
  for as long as the store stayed empty. Pinned by a test that counts `query` invocations.
- **A downstream score silently excluded a real input.** `GovernPostureScoreService.
  _calc_incident_response` drops SLA breaches from its denominator whenever `get_sla_breaches`
  reports `live=false`, precisely because it could not tell empty from unreachable. `live=true` now
  means "the table answered", so that exclusion can be narrowed (still open).

The four arms are extracted into `_store_provenance`, and `_store_rows` wraps it for list reads.

**The mirror-image trap `_store_rows` exists to prevent.** Once an empty-but-readable table is
`live=true`, the obvious `rows if read.items else mem.copy()` would serve *unpersisted in-memory
rows under a Live badge* — the same defect from the other side. So memory is substituted only when
`not live`; when the read succeeded, unpersisted rows are **unioned in by id** (dropping them would
make an acknowledged breach reappear as new) and named in the note. Relatedly, every window-empty
caveat is now **appended** rather than assigned: overwriting `store_note` used to drop the
unpersisted-rows caveat exactly when a reader needed both.

### 2. `Limit` without `LastEvaluatedKey` — a page size published as a total

`_query_items` issued one Query with `Limit=limit` and discarded `LastEvaluatedKey`. DynamoDB's
`Limit` caps **what one request reads, not the result set**, and a page is cut at 1 MB regardless.
Every caller rendering `total=len(items)` was therefore publishing a page size as an exact total.
`_query_read` pages to the ceiling and reports `truncated`, which surfaces as a "this count is a
floor rather than a total" note.

**Why each page asks for `max_items - len(items) + 1`.** DynamoDB returns a `LastEvaluatedKey`
whenever it stopped on `Limit` — *including when the next page would be empty*. So the naive
`truncated = bool(start_key)` would stamp a complete count as a floor. The extra probe row makes
`truncated` exact. A caveat that does not apply is its own dishonesty, and an unfalsifiable one.
`test_a_partition_of_exactly_the_ceiling_is_not_a_floor` is the negative case; the `FakeTable`
deliberately reproduces the boundary rather than smoothing it over.

### 3. Read ceilings on lookup-by-id paths — not a shorter list, a wrong answer

Three paths used a display-sized ceiling to find a single record. A ceiling is a legitimate bound on
a *list*; on a lookup it silently returns the wrong answer. All three now read to `_MAX_LOOKUP_SCAN`
and log a warning on a truncated miss.

- **`_find_breach` (was 200)** — the worst of the three. A truncated miss fell through to memory,
  so `_persist_breach` was handed `sort_key=None` and acknowledging a breach past the ceiling would
  **append a phantom in-memory copy while the real DynamoDB row stayed unacknowledged**. Both
  `acknowledge_sla_breach` and `resolve_sla_breach` route here.
- **`_load_silences` (was 200)** — `expire_silence` finds its target by walking this list, so a
  silence past the ceiling could not be ended, and the resulting 404 looked exactly like a silence
  that had already expired.
- **`_load_alert_acks` (was 500)** — its own docstring promises `note` is non-null whenever the map
  may be incomplete. The cap broke that invariant *silently*: acks past it were absent, every alarm
  they covered rendered as unacknowledged, and the note stayed null claiming completeness. The
  docstring already named the consequence — a second operator re-acking an alarm.
- **`get_incident` (was 500)** — same class; a miss is a 404 for a record that exists, and
  `update_incident` / `resolve_incident` both route through it.

### 4. Smaller fixes in the same round

- **PagerDuty outages were published as clean DynamoDB reads.** With a key configured, the
  fall-through note resolved to `null`, so an outage looked like a normal read — and the rota a
  reader then acted on was the *locally stored* one, a different answer from the authoritative rota.
- **A stored rota with nobody covering the current hour** reported `live=false` ("no data") when it
  is in fact the one measurement an operator must act on: *we have a coverage gap right now*.
- **`/sla` and `/sla/error-budgets` disagreed about provenance** from the same read of the same
  table: `source if budgets else "none"` made the list say `dynamodb` and the budget view say
  `none` — which is also self-contradictory beside `live=true`, a measurement sourced from nowhere.
- **Malformed silence rows were skipped with only a log line.** Skipping is right (one bad row must
  not 500 the endpoint) but `total` under-reported under a Live badge and an alarm the dropped row
  silences rendered as un-silenced. Now counted and disclosed.
- **Expired-only silences** now say so, instead of a bare `total=0` indistinguishable from "nothing
  was ever silenced". **Confirmed against the live table**, which holds exactly this state: 2 stored
  silences, both expired, previously reported as a silent zero.
- Two stale SLA notes replaced: one asserted "no SLA targets are stored in DynamoDB yet" (wrong in
  2 of the 4 store states), the other asserted "DynamoDB unavailable" for the not-configured case
  and said nothing at all when the table answered with zero rows.

### Verification

- `tests/test_govern_operations_store_provenance.py` — **29 tests, all passing.** Roughly half are
  negative cases, on the reasoning that a guard which fires when nothing is wrong gets switched off:
  a partition of exactly the ceiling is not a floor, an unreadable table is not live, a complete ack
  read carries no caveat, pending rows are still returned, a failed read still falls back to memory.
- Full backend suite: **348 passed, 1 skipped** (was 319 before this round; +29 new, no regressions).
  Eight test files are excluded as **pre-existing** breakage — they import `PatternType`/`Job` from
  `models/template.py` and fail identically at `HEAD`.
- Per-file pyflakes before/after: 2 findings → 2 findings, both pre-existing unused imports.
- Live-verified against the real `fsi-control-plane-govern-operations` table in us-east-2: all ten
  converted endpoints report `live=true, source=dynamodb` with a measured-zero note, `/sla` and
  `/sla/error-budgets` now agree, and `/alerts/silences` emits the expired-only caveat.

---

# Reassuring-default round — 2026-09-14 (three fixes, one shared shape)

Each of these three defects returns **the answer a reader most wants to see** when the underlying
measurement did not happen. That is what separates them from ordinary bugs: a wrong alarming number
gets investigated, a wrong reassuring number gets believed and closed.

### 1. An unmeasured error budget reported as a *full* one

`SLAComplianceReportResponse.avg_error_budget_remaining_pct` was declared `float = 100.0`. With no
SLA evaluated there was nothing to average, so the response reported **100% of the error budget
remaining** — the single most reassuring value in the field's range — for the state that carries the
*least* information. `live=false` and a note were all that stood against it, and **a note beside a
number does not stop the number being read.**

The field is now `Optional[float] = None` and the service forwards the `None` through, so "not
measured" is expressible rather than approximated. Where the schema still forces a number
(`overall_compliance_pct=0.0`), the note now says in words that it is a placeholder required by the
schema and not a finding.

### 2. The same headline, biased upward on the frontend — the more serious of the two

Independent of the backend default, `SLACenter.tsx` averaged only the budgets where
`remainingPercent > 0`. That filter drops **exactly the SLAs in the worst state**: an exhausted or
overspent budget is a real measurement — `remainingPercent` goes negative, and the rest of the same
file already treats `<= 0` as "budget exhausted → SLA breached". Excluding them cannot lower the
average, only raise it.

With live budgets of 69.9 / 19.4 / **-26.4** / 81.9 the KPI read **57.1%** where the true mean is
**36.2%** — a 21-point overstatement — and the label said only "Remaining", with nothing to disclose
that a quarter of the fleet had been left out of its own summary. Now averaged over every budget,
labelled "Remaining, all SLAs", and `null` rather than `0` when there is nothing to average, because
"no error budgets defined" and "no budget remaining" are opposite readings and `0` asserts the
alarming one.

### 3. Policy drift analysed the wrong region's CloudTrail

`GovernPolicyDriftService.__init__` took `region: str = "us-east-1"`, and its only construction site
(`api/routes/govern_policy_drift.py`) builds it **zero-arg** — so the hardcoded default was what
actually ran and `GOVERN_AWS_REGION` was silently ignored.

This is the branch's central defect class (see the tier round above), in its least detectable form.
**A wrong-region AWS read is the one failure the honest-degrade contract cannot catch.** CloudTrail
`LookupEvents` is per-region and does not error when asked the wrong one — it answers with *that*
region's event history. Every event this service looks up comes from `_AI_SOURCES`
(`bedrock`, `bedrock-runtime`, `sagemaker`), which is the **governed fleet, tier 2**, not the control
plane. So with a fleet outside us-east-1 the analysis reads an empty history and reports **zero
drift findings under `live=true`**. There is no exception to catch and no note to render, because
the read genuinely succeeded.

us-east-1 happens to be `GOVERN_AWS_REGION` in the demo account, so nothing was broken there — which
is precisely why it survived. **A knob honoured everywhere except one surface is worse than no knob:**
moving the fleet would move every other Govern reader and leave drift analysis certifying a clean
bill of health from the region the fleet just left.

Fixed by removing the `region` parameter entirely rather than re-defaulting it, following
`GovernCapacityService`. A `region` argument on this service is always wrong — it invites a caller to
hand the control-plane region to a reader of governed-fleet events — so the fix makes the tier
confusion *unrepresentable* rather than merely discouraged. `self.region` reaches both the boto3
client and the cache key, so a region change cannot serve the previous region's findings from cache.

### The region sweep behind fix 3, including its negative result

The whole tree was swept rather than this one file. 57 service classes default `region` to
`"us-east-1"`; across 88 construction sites, a paren-balanced scan found **exactly one** that passes
no region and reaches a real AWS read — the one above. (A first same-line grep reported 34, all but
one an artefact of multi-line calls; the number is recorded here because the cheap version of this
check is wrong in the direction that creates busywork.) The one remaining zero-arg construction,
`GovernHarnessAuditService()` at `govern_posture_score_service.py:129`, is inert: no bucket name means
`self._s3 = None` and the region is never used.

Five other candidates were cleared, not assumed clean: `GovernHarnessBackendService` and
`GovernHarnessPolicyService` take no region; `GovernCapacityService` and `GuardrailService` already
resolve their tiers internally; `GovernTrustedAdvisorService` pins `_SUPPORT_REGION` and ignores the
argument, which is correct tier 3.

**The other ~56 defaults are latent, not live** — every caller passes a region explicitly today. They
are traps for the next change, not present defects, and are left as such deliberately rather than
reported as fixed.

### 4. A suite that failed red on a healthy codebase

`test_event_service.py::test_detail_type_matches_event_type` failed the full run at **372ms against
Hypothesis's default 200ms per-example deadline**, and passed standalone on the same commit. Not one
of that file's six properties asserts anything about latency — each builds a `MagicMock`, calls
`publish_*`, and inspects the recorded call — so the deadline was not measuring the property. It was
measuring how busy the machine was.

Roughly fifty other `@settings` decorators across `test_api_properties`, `test_deployment_failure`,
`test_deployment_history`, `test_deployment_status_transitions`, `test_outputs_roundtrip`,
`test_script_properties` and `test_transformation_value_model` carry the same latent flake; the one
that fired was chance. So the fix is a single registered profile in a new `tests/conftest.py`
(`deadline=None`, `suppress_health_check=[too_slow]`) rather than fifty inline edits — the failure
mode is a property of the default, not of any one test, and the profile also covers tests added
later. **No assertion is weakened:** every property still runs its full `max_examples`. Only the
clock is gone.

This belongs in a data-honesty document because a suite that cries wolf is a dishonest signal too.
It trains everyone to re-run until green, and re-run-until-green is how a real regression ships.

Six inline `deadline=None` edits were made first and then **reverted** once the profile was proven to
cover them, rather than left in as harmless redundancy.

### Verification

- `tests/test_govern_policy_drift_region.py` — **5 new tests.** The region comes from the governed
  set; CloudTrail is actually queried in that region for *every* `_AI_SOURCES` entry, not just the
  first; the cache key is region-scoped; a caller can no longer inject a region (both positional and
  keyword raise `TypeError`); an empty governed set still yields a region rather than `IndexError`.
- `test_an_unmeasured_error_budget_is_null_not_a_full_one` added to the store-provenance file (now
  **30 tests**).
- **The Hypothesis profile was proven by its negative control, not by passing.** A throwaway probe
  with a bare `@settings(max_examples=3)` and a 300ms sleep passes with the conftest present and
  fails `DeadlineExceeded` with it removed. Hypothesis's precedence for unspecified settings fields
  was verified empirically rather than assumed from the docs; the probe was then deleted.
- Full backend suite: **354 passed, 1 skipped, 0 failed** (was 348 + 1 skipped). Same eight
  pre-existing-breakage exclusions.
- Per-file pyflakes on `govern_policy_drift_service.py` before/after: **4 findings → 4 findings**, all
  pre-existing unused imports (line numbers shift by one from the added import). `conftest.py`,
  `test_govern_policy_drift_region.py` and `models/govern_operations.py` are clean.
- `npx tsc --noEmit -p tsconfig.app.json` — **exit 0.**
- Before changing the shared `avg_error_budget_remaining_pct` type, its consumers were traced: it is
  declared in two TS interfaces and **read by no component**, which is what made the `Optional` change
  low-risk. That trace is also what surfaced defect 2, which was the worse of the pair.

---

# Silent-swallow round — 2026-09-14 (a store that never reported a failure, and two panels that spoke for feeds they had not measured)

Six fixes across four files. The backend four are all in one service and share one shape:
`except Exception: pass`. The frontend two share a different one: a component asserting something
about a measurement it did not take.

## Backend — `govern_validation_service.py`: four swallowed store failures, one of them a fake success

Every one of this service's four DynamoDB call sites caught `Exception` and continued. Nothing at any
layer — return value, log, or HTTP response — distinguished a durable write from a lost one, a
missing panel from an unreadable table, or a completed delete from a failed one. A validation panel is
an **audit artifact**: a record that an adversarial review happened. Those are precisely the claims
that must not be made falsely.

### 1. A failed delete reported 200, logged "Deleted", and left the row in place

The worst of the six, and the only *destructive* one. `except Exception: pass` was followed
**unconditionally** by `logger.info("Deleted validation panel ...")` and `return existing`, so a
failed delete produced a success log, a 200 carrying the panel body, and a cleared in-memory entry —
while the DynamoDB row survived untouched and the very next `get_panel` read it straight back.

Two things made it worse than a wrong number. The operator was told an audit artifact was gone when
it was not; and clearing the memory entry made the *next* attempt less likely to notice, because
`get_panel`'s memory fallback no longer held a copy to compare against. It now raises `RuntimeError`,
and the route translates that to **503 with "was NOT deleted"** rather than letting it become a bare
500, so the response distinguishes "no such panel" (404) from "still there" (503).

Failing loudly is right *here specifically* because the operation is destructive. One carve-out: a
panel that only ever reached memory has no row in DynamoDB to fail to delete, so that case is a
genuine success and does not raise. `_mem.pop` moved to after the delete is known to have taken
effect, so a retry still finds the panel.

### 2. `Limit` on a **filtered** Scan — this branch's central defect in its sharpest form

On a Query, `Limit` caps rows read from one partition. On a **Scan with a `FilterExpression` it caps
rows EXAMINED**, and the filter is applied afterwards. So `scan(FilterExpression=..., Limit=limit)`
could examine `limit` rows, match none of them, and return `[]` while any number of panels sat
further down the table — and this table is pk-prefixed and shared, so non-panel rows consume the
allowance. `LastEvaluatedKey` was dropped, so nothing recorded that the scan had stopped early.

Zero panels is also the *reassuring* reading — "nothing awaiting adversarial validation" — which is
the through-line of the previous round: the unmeasured state returns the answer a reader most wants.

Now pages via `ExclusiveStartKey` until the table is exhausted or `_MAX_SCAN_PAGES` (20) is hit,
which is logged. DynamoDB's `Limit` is gone entirely, so `limit` bounds the **result**. Sorting had to
move for the same reason: `out.sort(...)` then `[:limit]` sorted only whatever survived the truncated
read, so "most recent" meant most recent *of an arbitrary subset*.

### 3. An unreadable table reported "no such panel"

`get_panel`'s `except Exception: pass` threw away the one fact that separates its two `None` cases —
the panel does not exist, or the table could not be read. The route turns either into a 404, so an
unreachable table answered "no such panel" about a panel sitting in DynamoDB, **and nothing was
logged**, so there was no way to find out afterwards either. Now logged, including that a resulting
404 does not mean the panel is absent. It still returns `None` rather than raising, because this path
legitimately falls back to memory in local dev.

### 4. A panel that never reached DynamoDB was reported as created

`_persist` was `except Exception: type(self)._mem[...] = panel` — no log, no return value. So
`create_panel` returned a fully-formed panel with a `panel_id` and the route answered **201 Created**
for a panel that existed only in this process and would vanish on the next restart. The fallback
itself is intended (local dev without DynamoDB has to work); its silence was not. `_persist` now
returns `bool` and warns that the panel "will be lost when this process restarts."

## Frontend — two panels asserting things they had not measured

### 5. `PromptAnalytics` put one feed's tiles under the other feed's Live badge

`const live = guardrailData?.live || invocationData?.live` — a **false-Live** defect. This panel
renders two independent measurements: four guardrail tiles from `/guardrails/telemetry` and four
invocation tiles from `/invocation-safety/telemetry`. Widening with `||` meant one live feed put the
*other* feed's tiles under a Live badge. With CloudWatch guardrail metrics flowing and Bedrock
invocation logging disabled — the actual configuration here — "API Calls (7d) 0 / Input Tokens 0 /
Blocked 0" read as a measured all-clear when nothing had been measured.

Two feeds cannot share one liveness flag. The single `grid-cols-8` was split into two labelled
`grid-cols-4` groups ("Guardrails", "Invocations"), each carrying its own badge and its own `note`;
the header badge is now `every`, not `some`, and names which feed is not measured. Two sub-headings
that hardcoded the claim were also de-hardcoded — "Live Interventions by Policy Type" → flag-driven,
and "7-Day Invocation Trend (Live)" → `{window_days}`-driven — plus an amber disclosure when
`logging_enabled` is false.

### 6. `AIQualityMonitor` discarded the server's `note` and asserted one cause instead

`LlmQualitySnapshot` carries a `note` and this panel threw it away. The only text shown for the empty
state was a hardcoded sentence naming a single cause — "once LLM output-quality custom metrics are
emitting to CloudWatch" — for a state with several (wrong namespace, an access denial, or `live=true`
with zero dimensions returned, which the same branch catches). A confidently-wrong diagnosis is worse
than none: it sends the reader to fix the wrong thing. The `note` is now shown first with the static
sentence as fallback, and *also* when the feed is live, because a live read can still carry the
caveat a reader needs before quoting a number.

### Verification

- `tests/test_govern_validation_store_honesty.py` — **12 new tests**, and **proven by negative
  control**: run against the pre-fix service (`git show HEAD:` swapped in), **9 fail and 3 pass** —
  and the 3 that pass are exactly the negative-control tests, the ones asserting behaviour that must
  *not* have changed (the result is still capped at `limit`; a memory-only panel is still deletable;
  a successful delete is unchanged). A test written after its fix proves nothing until it has been
  shown to fail without it.
- The paging test is built so page one matches **nothing** and both panels are on page two, which is
  the exact state the old single-page scan reported as an empty list. It also asserts
  `"Limit" not in scan_calls[0]` directly, because that is the kind of thing a later edit "tidies"
  back in.
- Full backend suite: **366 passed, 1 skipped, 0 failed** (was 354). Same eight pre-existing-breakage
  exclusions. This also confirms nothing depended on `delete_panel`'s old swallow-and-succeed
  behaviour, which was the risk in making it raise.
- `npx tsc --noEmit -p tsconfig.app.json` — **exit 0**, covering both frontend files.

---

# Partial-read round — 2026-09-15 (four services that proved a service was ON, then reported its contents unread)

One shape, found four times. Each of these services makes an **establishing** call that confirms the
AWS service is enabled and reachable, then several **content** calls that read what is actually in it.
Only the establishing call was ever checked. When a content call was denied, the helper returned `[]`
or wrote nothing, and the response still said `live=True` — so every count derived from that read
rendered as a measured zero under a Live badge.

Zero is the reassuring answer in all four panels. "No sensitive data found." "No policies in this
store." "No public agents." That is the reading a reviewer closes rather than chases, which is why
this class survived so long: the establishing call succeeding made the page look healthy.

| Service | Establishing call | Content reads now able to degrade |
|---|---|---|
| `govern_macie_service.py` | `macie2:GetMacieSession` | `GetFindingStatistics` ×3 (by type, severity, bucket) + `ListFindings`/`GetFindings` |
| `govern_verified_permissions_service.py` | `verifiedpermissions:ListPolicyStores` | `ListPolicies`, `GetSchema`, `ListIdentitySources` per store |
| `govern_agentcore_service.py` | — (6 independent categories) | all six category fetchers, via a 3-tuple `(items, note, failed)` contract |
| `govern_security_service.py` | — (5 independent sources) | all five, via the `PageResult` the paged read already returned |

### The mechanism nobody was catching: `paginate_bounded` does not re-raise

`core/aws_paging.py:158-161` catches `(ClientError, BotoCoreError)` and **returns**
`PageResult(items=items, failed=True, error=..., op=...)`. It is a total function by design. The
consequence is that a caller's own `except (ClientError, BotoCoreError)` arm wrapped around a
`paginate_bounded` call is **unreachable for AWS errors from that call** — the very errors it looks
like it handles. Five call sites in `govern_security_service.py` were written that way, so an
AccessDenied on Security Hub landed as an empty finding list with `live=True` and no note. The fix is
not a new try/except; it is reading the `failed` flag that was being returned and discarded.

### The sentence that had to go

Macie's denied-statistics branch used to emit, verbatim:

> Macie is ENABLED; no findings yet (no sensitive-data or policy findings).

That is a clean bill of health for an account nobody managed to read. It is now suppressed whenever
any sub-read failed, replaced by a note that names the failed call and says explicitly that *zero
here does not mean no sensitive data*. `macie_status` is still reported as `ENABLED`, because that
part genuinely was measured — the fix narrows the claim rather than discarding it.

Verified Permissions had the same problem one level down: with `ListPolicies` denied, the note read
`1 Cedar policy store(s) · 0 policies (0 permit / 0 forbid) · 1 with schema · 1 identity source(s).`
The permit/forbid rollup is no longer restated when the read behind it failed.

### Two distinctions the fix preserves on purpose

- **Measured-empty stays live.** Macie enabled with genuinely zero findings, and a Cedar store that
  exists with no schema attached (`GetSchema` → `ResourceNotFoundException`), are both real
  measurements. Degrading them would trade one wrong answer for another. Both are pinned by tests.
- **`GetPolicyStore` earns a note, not `live=false`.** It only fills Optional fields
  (`cedar_version`, `deletion_protection`) that render as absent rather than as a number, so it is
  tracked in a separate `metadata_failures` list. A caveat is not a fabricated count.

### Verification

- `tests/test_govern_partial_read_honesty.py` — **14 new tests**, both directions per service, and
  **proven by negative control**: the pre-fix services from `git show HEAD:` were loaded as modules
  and given the same stubs. Pre-fix Macie returned `live=True source='macie2' total=0` with the "no
  findings yet" sentence; pre-fix Verified Permissions returned `live=True` with the `0 permit / 0
  forbid` rollup. Both fail there and pass here.
- The harness asserts `macie_mod.boto3 is boto3` and that no client is constructed outside the stub,
  so the result cannot depend on whose credentials the runner has. It also asserts the region reaches
  `_client()`, since a wrong-region read does not raise either.
- `tests/test_govern_agentcore_paging.py` — 12 passed after the 3-tuple refactor.

---

# Portability round — 2026-09-15 (the fixes travelled; the deployment wiring did not)

Prompted by one question: *will all of these fixes work for anyone deploying AVA?* The answer was no,
and not because the fix logic is account-specific — it isn't. The **wiring** was. Six blockers, all
now closed. They share a signature with everything above: a deployer following the repo's own
instructions got a plausible dashboard, not an error.

### 1. Hardcoded regions in `docker-compose.yaml`, and an interpolation form that hid the fix

Three region literals are now interpolated. The form matters more than it looks:

```yaml
- AWS_REGION=${AWS_REGION:-us-east-2}              # colon form
- GOVERN_AWS_REGION=${GOVERN_AWS_REGION-us-east-1} # plain form
- GUARDRAILS_TABLE_REGION=${GUARDRAILS_TABLE_REGION-us-east-1}
```

`${VAR:-default}` substitutes when VAR is unset **or empty**; `${VAR-default}` only when **unset**.
Verified with `docker compose config` against a `.env` holding `VAR=`: colon form yielded
`us-east-1`, plain form yielded `""`.

This was a defect in the first version of this very fix. `.env.example` tells a fresh deployer to
leave `GOVERN_AWS_REGION` empty, meaning "the governed fleet is in `AWS_REGION`" — an intent
`Settings.__init__` resolves. Under the colon form that instruction was **unreachable**: the empty
value came back as `us-east-1`, silently reintroducing the hardcoded region the change existed to
remove. `AWS_REGION` keeps the colon form deliberately, because empty is never an intent there — it
is the terminal fallback for every table, and `boto3.client(region_name="")` does not degrade, it
raises `ValueError: Invalid endpoint: https://sts..amazonaws.com` at client construction (verified in
the backend container).

Compose precedence is **shell environment > `.env`**, so an exported `AWS_REGION` wins over the file.
That is the intended override, but it means `docker compose config` is the only reliable statement of
what the container will actually receive.

### 2. `GOVERN_AWS_REGION` default made its own documented fallback dead code

`config.py` defaulted it to `"us-east-1"`, so `region_config._fallback()`'s documented
`GOVERN_AWS_REGION → AWS_REGION` chain could never reach its second limb. The default is now `""`
with the resolution done explicitly in `Settings.__init__`.

A bare `""` would have been worse than the bug: it flows into ~60 `boto3.client` calls. So the
resolution keeps a terminal literal, and a derived `GOVERN_AWS_REGION_DECLARED: bool` records whether
the deployer actually said anything. That flag matters because
`litellm._default_inference_region()` needs to branch on *declared*, not on *empty* — after
resolution the value is never empty, so an emptiness check would have killed its governed-set limb
and routed customer prompts to the control-plane region.

### 3. Nine control-plane tables existed in no Terraform

`environments/dev` created some tables and read nine others by name from settings. On a fresh account
those nine simply do not exist — and a `Scan` against a missing table is where this gets nasty: it
returns an empty result set rather than an error, so the panels above it render zeros. Added a
`locals.control_plane_tables` map plus a `for_each` `aws_dynamodb_table`, PITR on all nine, the
matching `*_TABLE_NAME` env vars, and the table ARNs (plus `/index/*`) into the task role's DynamoDB
statement.

### 4. `GUARDRAILS_TABLE_REGION` pointed at a region Terraform never created the table in

Now `var.guardrails_table_region != "" ? var.guardrails_table_region : var.aws_region`, with
`govern_aws_region` and `guardrails_table_region` added to `variables.tf` (both defaulting to `""`).

**Action for the demo account:** it must now pass `-var govern_aws_region=us-east-1` and
`-var guardrails_table_region=us-east-1`, or use the new
`environments/dev/terraform.tfvars.example`. Its control plane is in `us-east-2` while its Bedrock
estate and guardrails table are in `us-east-1`; applying without those two lines relocates every
governed read to `us-east-2`, where the AI estate renders as **zero rather than erroring**. The dev
root had no tfvars example at all before this — the one at `infrastructure/terraform.tfvars.example`
belongs to the top-level root and its variables are undeclared here.

### 5. `backend/Dockerfile` never copied `schemas/` — a runtime bug, not a test artifact

This surfaced as 34 container-only collection errors, which is exactly the kind of thing that gets
written off as an environment quirk. It was not. `TemplateValidator.__init__` resolves
`/app/schemas/template_metadata_schema.json` and `_load_schema()` **raises** `FileNotFoundError` when
it is absent, so the deployed image could not construct one at all. Verified against the running
container before the fix (`ls: cannot access '/app/schemas'`).

Two reachable endpoints 500'd: `bootstrap.py:47` (`BootstrapEngine.__init__ → TemplateValidator()`)
and `TemplateCatalog.validate_template()` (`template_catalog.py:187`). Template **listing** was
unaffected, because `TemplateCatalog.__init__` builds no validator — which is why it hid. And the
tests that would have caught it were inside the suite's `--ignore` list, so nobody read the error.

### 6. `README.md` documented two commands that did not do what it said

`cd backend && pytest` did not run zero tests, it exited `INTERNALERROR`: with no `testpaths` pytest
recursed from `/app` into `applications/fsi_foundry/.../adapters/__init__.py` and hit
`ModuleNotFoundError: No module named 'bedrock_agentcore'`. Fixed with a new `backend/pytest.ini`
(`testpaths`, `pythonpath = src`, `--continue-on-collection-errors`).

`--ignore` for the eight broken modules was the obvious move and the wrong one: a suppressed module
reports as a green suite, which is this branch's entire subject matter — and it is literally how the
Dockerfile bug above stayed invisible. The suite now reports **409 passed, 1 skipped, 25 failed, 4
errors**, all confined to eight pre-existing template-subsystem modules, none in Govern. The failure
count went **up** from 10 because fixing the image converted 34 errors into 15 real failures and 15
passes; the suite got healthier, which is worth knowing before reading a rise in `failed` as a
regression. (**409 passed** once the partial-read round's 14 tests landed on the same commit.)

Separately, `npm run build` was documented as a type check. It is `vite build`, which transpiles
through esbuild and strips types **without checking them**, so it emits a bundle from code `tsc`
rejects. `npm run typecheck` is the gate.

### 7. `test_llm_quality_dashboard_absence.py` fell through to a real boto3 client

Line 99 built an unstubbed client, so the test had two broken outcomes depending on the machine: with
no credentials, `NoCredentialsError` is a `BotoCoreError` → adds a `guardrails_caveat` → `live` False
→ the test fails for a reason unrelated to the dashboard; with credentials, it passes while making a
live AWS call. Now every client is stubbed and an unstubbed service name raises `AssertionError`
naming itself.

### 8. Critical/High risk tiles rendered a fabricated `0`

`GovernanceCommandCenter.tsx:722,726` rendered `0` for a null Critical/High count while Medium and Low
in the same block already rendered `—`. Decisively an oversight, not a choice: line 552 of the *same
component* already did `riskCrit === null ? '—'`.

### 9. The IAM gap — documented with the numbers, because it cannot simply be merged

`infrastructure/iam/ava-govern-role.yaml` grants Govern's 172 read actions and **zero** DynamoDB
actions; the dev task role grants DynamoDB by enumerated ARN and **4 Bedrock actions, inference
only**. No Terraform references the CFN template. So `terraform apply` alone yields a control plane
where every Govern panel degrades to `live=false` — honestly now, naming the denied call, but still a
broken deployment where "Security Hub unavailable" reads like a customer misconfiguration.

Merging them fails on measured limits, not preference: 172 actions ≈ 4,795 characters of action
strings, landing near 8-9 KB of the **10,240-character aggregate inline-policy limit per role**, and
the DynamoDB statement would push it past. Converting to managed policies hits the other wall — 12
policies against a default quota of **10 attachments per role**. It needs a Service Quotas increase
first. `infrastructure/iam/README.md` now carries the full per-service comparison table and the
quota arithmetic, and one concrete bug found along the way is fixed: its eksctl instructions used
`--attach-policy-arn` against managed-policy ARNs that cannot exist, since every policy in the
template is an `AWS::IAM::Policy` (inline, no ARN) and would fail with `NoSuchEntity`.

### Verification

- `terraform fmt -check` clean and `terraform validate` **Success** on `environments/dev/`.
- `docker compose config` with `AWS_REGION=eu-west-1 GOVERN_AWS_REGION= GUARDRAILS_TABLE_REGION=` →
  `eu-west-1`, `""`, `""`. The empty values survive, which is the whole point of the plain form.
- Full backend suite on a rebuilt image: **409 passed, 1 skipped, 25 failed, 4 errors** — every
  failure and error pre-existing and confined to the eight template modules.
- `npx tsc --noEmit -p tsconfig.app.json` — **exit 0**.
- `compile()` on all changed Python files — OK. (Not `py_compile`: the read-only bind mount makes it
  fail with `[Errno 30]` trying to write a `.pyc`.)

---

# Region-prompt round — 2026-09-15 (a default is answered silently; a prompt is answered)

The portability round above made the governed-fleet region configurable and gave it a `""` default
meaning "same as `AWS_REGION`". The resolution rule is right and `config.py` still implements it. The
**default** was the wrong shape of fix.

A default is answered silently. The deployer never learns that a second region exists, and the first
symptom is an AI estate rendering as zero under a Live badge — the same silent failure the portability
round set out to remove, relocated one layer down rather than removed. Nor can Terraform discover the
answer: it creates nothing in the governed region, so there is nothing to read it off. The region is
genuinely the deployer's to state, and the way to ask a person something is to ask them.

`var.govern_aws_region` now has **no default**. Four surfaces, because no single one covers every path
a deployer takes into this platform:

| Surface | What it does | What happens if you skip it |
|---|---|---|
| `variables.tf` | No `default` → interactive `plan`/`apply` prompts. **Terraform prints the variable's `description` as the prompt text**, verified on a scratch config, so the description is written as prompt copy for someone who has never opened the file. A `validation` block accepts empty or a region-shaped string. | `-input=false` errors naming the variable. |
| `outputs.tf` | `region_resolution`: three tiers with resolved region, what lives there, and **stated** vs **INHERITED**. | Nothing — reprintable with `terraform output region_resolution`. |
| `scripts/deploy.sh` | `preflight_regions` prompts once when `GOVERN_AWS_REGION` is set neither in the shell nor `.env`, persists to `.env` (gitignored), then prints the tiers read back out of `docker compose config`. | Non-TTY stdin warns naming the fallback region and continues. |
| `region_config.log_resolution()` | Logged at FastAPI startup before `init_db`. Every line prefixed `REGION-TIER`. | Nothing — it always runs. |

**Empty is still accepted**, at both prompts. Verified that Terraform accepts an empty answer to an
undefaulted variable and yields `""`, so the single-region case faces no friction. The change is that
pressing Enter is now a decision instead of an omission.

**`guardrails_table_region` is deliberately not prompted**, though it gained the same validation. It is
a migration artefact of one account, not a decision every deployer makes: a fresh deploy's guardrails
table is created by this root in `var.aws_region`, so `""` is the only correct answer. A question with
one right answer sitting beside the question that genuinely has two trains people to press Enter
through both.

**The preflight does not reimplement Compose interpolation.** `${VAR:-d}` (unset *or empty*) and
`${VAR-d}` (unset only) differ in a load-bearing way here — the plain form is what lets
`GOVERN_AWS_REGION=` mean "same as `AWS_REGION`" instead of being rewritten to `us-east-1`. A second
implementation of that rule in bash would be free to drift from the first, so the preflight asks
`docker compose config` what the containers will actually receive. That also catches what reading
`.env` cannot: **Compose precedence is shell environment > `.env`**, so a stale export outranks the
file with nothing to see in the file.

**Only the backend log reports what actually resolved.** Terraform reports the intent and `deploy.sh`
reports what Compose will pass; neither observes the process. `log_resolution()` calls the same
`control_region()` / `table_region()` / `get_governed_regions()` the services call, so it cannot report
a region the code does not use.

### Two bugs this round's own tests found, both being the failure mode the feature exists to prevent

Worth recording because they were found by running the tests, not by reviewing the code, and both are
this branch's central defect class reproduced *inside the thing built to warn about it*.

1. **The tier-1 row disagreed with its own source field.** It printed `control_region()` — i.e.
   `AWS_REGION` — while labelling the source `CONTROL_PLANE_TABLE_REGION`. But that override wins for
   every control-plane table, so with it set the row named a region no table was in: two regions
   confused in a report whose only job is to keep two regions apart. Fixed by resolving the row through
   `table_region("")`, the same path a table without its own override takes, and saying where the
   ECS/ALB/VPC infra is when the two differ.
2. **The grep marker matched an incomplete subset of its own block.** The header read "grep
   REGION-TIER" while only the tier lines carried the marker, so `grep REGION-TIER` returned the header
   plus half the report and silently dropped every `holds` line. A marker that matches part of its block
   is worse than none: the fragment looks like the whole answer. Every line now carries it.

### Verification

- `test_region_resolution_report` **12 passed**, asserting on `source` rather than `region` throughout —
  a resolved region cannot tell you whether anybody chose it. Both directions asserted: a suite that
  only checked the INHERITED wording would pass against a report hardwired to say INHERITED, which
  would label a correctly-stated region as a guess. **2 of the 12 failed first run and both were real
  bugs** (above), so they are their own negative control.
- The startup report driven live in the backend container, both paths: with `GOVERN_AWS_REGION` set it
  prints `stated explicitly`; with it unset and no persisted set it prints `INHERITED from AWS_REGION`
  **and** emits the warning.
- `deploy.sh` preflight driven in a sandbox holding copies of `docker-compose.yaml` and `.env`, so no
  real `.env` was touched: answered-in-shell (no prompt), non-TTY (warns naming `us-east-1`, no hang, no
  write), `us-east1` rejected then `eu-west-2` accepted and persisted, and Enter → `GOVERN_AWS_REGION=`
  with the fleet reported as inherited. `bash -n scripts/deploy.sh` clean.
- `terraform fmt -check` exit 0, `terraform validate` **Success** after the `variables.tf` /
  `outputs.tf` edits. Note that `validate` passes with the required variable unset; the prompt is a
  `plan`/`apply`-time behaviour.
- Full backend suite: **409 passed, 1 skipped, 25 failed, 4 errors** — failures and errors unchanged
  from baseline and still confined to the eight template modules.

---

# OPEN as of 2026-09-15 (known, deliberately not fixed — flagged rather than hidden)

Ordered by how much a reader could be misled.

### Assessment depth: all 24 assessed controls are existence probes, not efficacy tests
The single most important caveat in this document. A control passes when the AWS resource it names
*exists* — two CloudTrail trails merely existing marks NIST AI RMF MANAGE 3.1 as PASS. Nothing
evaluates whether the trail covers the right events, is delivering, or is monitored. So
`overall_coverage_pct` is a statement about configuration presence, not about control effectiveness,
and it should never be presented to an auditor as the latter without that qualifier.

### Alert **rule** mutations are still failing stubs
Acknowledge and silence are now real (above), but rule create/edit/delete/toggle are not, and unlike
the other two this is not a wiring gap — **the routes do not exist**. `/alerts/rules` has GET and
POST only; there is no PATCH, DELETE, or toggle, and `createAlertRule`'s payload does not match
`AlertRuleCreate`. The blanket honesty comment that used to cover the whole file was replaced with a
narrow one covering only these, verified against the route table.

### 36 of 155 control-mapping references resolve to no control
Disclosed in the UI (above) but not repaired in the data. Breakdown, each checked against the real
id families rather than guessed: **EU AI Act 18 of 18** (mapping uses `EU-TRANS-1`-style ids, the
checklist uses article ids like `EU-ART-9`; mapping a control to an article is a legal judgement),
**OWASP Agentic 6 of 6** (no `OWASP Agentic` framework exists in `COMPLIANCE_CENTER_FRAMEWORKS` at
all — independently confirmed: it appears only as a `framework:` value in mappings and is absent
from both `FRAMEWORK_COLORS` and `FRAMEWORK_METADATA`), **CRI FS 7**, **OSFI 3**, **OWASP LLM 1**,
**NIST 1**. The EU AI Act row means EU AI Act mappings currently contribute nothing to any overlap
figure.

### `FRAMEWORK_META` control counts disagree with the frontend inventory
The backend's comment claims they match `mockData`. They do not: the frontend's authoritative total
is **806** against the backend's 281, and 11 of 14 per-framework counts differ (e.g. `cri-fs-ai-rmf`
45 vs 274). `assessed_pct` is therefore a ratio over the backend's own inventory, not the UI's.
Related and separate: **Compliance Center counts 14 frameworks / 281 controls while the Governance
Assessment wizard's `REGULATORY_FRAMEWORKS` has exactly 11**, and only 7 ids overlap. A "frameworks"
figure is only correct with respect to one of these two inventories, so it must say which.

### Posture score still excludes SLA breaches on a `live=false` read
`GovernPostureScoreService._calc_incident_response` drops SLA breaches from its denominator whenever
`get_sla_breaches` reports `live=false`. That was the right workaround while `live=false` could mean
"empty" as easily as "unreachable". The store-provenance round made `live=true` mean "the table
answered", so the exclusion can now be narrowed to the genuinely unknown cases — deferred rather than
changed blind, because narrowing it moves a score that is already published.

### `AgentCorePostureResponse.live` is `any(c.live ...)`, so one readable category carries the page
The partial-read round fixed the six *categories* — each now reports its own `live` from whether its
fetch failed. The top-level flag above them still aggregates with `any()`, so a response where only
`identities()` succeeded and the other five were denied is published as `live=true`. The per-category
badges are correct and are what the UI renders, so this is not currently a false-Live surface; it is a
pre-existing aggregation that was left alone rather than changed inside a round about something else.
`all()` is not obviously right either — several categories are legitimately empty in most accounts —
which is exactly why it needs a decision rather than an edit.

### Eight template-subsystem test modules are stale and fail on purpose
`pytest` exits non-zero: **25 failed, 4 errors**, all in `test_pipeline_service`,
`test_property_based`, `test_template_catalog`, `test_template_job_service`, `test_iac_filtering`,
`test_iac_filtering_standalone`, `test_bootstrap_engine`, `test_template_validator`. Two causes, both
recorded per-module in `pytest.ini`: (a) `src/models/template.py` once defined `PatternType`,
`Job`, `Framework` and others (see `cd0115a6`) and now defines only `TemplateMetadata`, `Template`
and `ValidationResult` — production code moved with it, so these four test a schema that is gone and
cannot be repaired by an import; (b) no template named `langraph-agentcore` exists, the nearest real
one being `agent-scaffold-langgraph`, a rename these tests never followed. Rewriting them against the
current dict-based shape is the fix. They are deliberately not `--ignore`d, for the reason the
portability round gives. None is in Govern.

### Compliance responses carry no `live` / `source` / `note` triple
The compliance models are the one Govern family without the honest-degrade triple, so `/posture`
cannot report that its numbers came from process memory rather than from DynamoDB. Every other
Govern endpoint can.

### 3 of 93 auto-detectable controls name a source with no evaluator
`secrets-manager`, `cost-explorer` and `api-gateway` are declared as `autoDetectSource` in the
frontend but absent from `govern_controls_service.py`'s dispatch table. The handling is **honest** —
`EvaluationStatus.UNKNOWN`, `confidence=0.0`, and evidence naming the unknown source — so this is
not a false-Live defect. It is recorded because of a side effect: an unmapped source sets
`all_live = False` for the **whole batch**, so one such control drags a page's `live` flag false
even when 25 others evaluated live. That errs safe (under-claim), which is why it is not a
MUST-FIX, but it makes the per-source `sources` map the only trustworthy signal on those pages.
(`config-rules` is *not* affected — it is a registered alias sharing `_evaluate_config`, checked
because it looked like a dead key.)

### `AIR-D-002` is intentionally unmapped
See the attestation section above for why both available shortcuts were rejected. This is a coverage
gap awaiting a decision, not an oversight.

### ~56 service constructors still default `region` to `"us-east-1"`
The sweep recorded above confirms **none is currently reached** — every caller passes a region
explicitly, and the single live defect it found (`GovernPolicyDriftService`) is fixed. So these are
traps for the next change rather than present defects, and they are listed here rather than counted as
bugs.

The hazard is the signature, not today's behaviour: a default that happens to be right in the demo
account is exactly what let the drift service ship reading the wrong region for months without a
single error. Closing this means dropping the parameter wherever the tier is fixed — as
`GovernPolicyDriftService` and `GovernCapacityService` now do — which is mechanical but touches many
files, so it is a churn judgement rather than something to change blind.

### Response-model tidiness
`AlertAckResult`, `AlertSilenceResult` and `AlertSilencesResponse` are defined in the service rather
than in `models/`. Not a bug; noted so it is not mistaken for one.

---

## Operator actions surfaced, deliberately not performed from here

- **PITR is declared in Terraform but DISABLED on both live Govern tables.** They were created
  outside Terraform and appear in no state file, so nothing has reconciled the declaration. Until
  it is enabled, treat the live tables as PITR-off regardless of what the root declares. The nine
  tables added by the portability round declare PITR too, and on a fresh account that declaration is
  the one that will actually apply — the gap is specific to tables that predate the state file.
- **9 orphaned attestation rows** remain under the pre-rename control ids. Harmless but they inflate
  a raw row count.

Both were left to the operator by explicit choice; the exact commands were supplied and not run.

---

## MUST-FIX COUNT: 0 (was 9 — 6 fixed, 3 never real; see the table above)
