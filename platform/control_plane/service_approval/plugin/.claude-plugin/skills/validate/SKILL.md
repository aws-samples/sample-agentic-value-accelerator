---
name: validate-v3
description: Verify research.json v3.0 findings via MCP — confirm capabilities, API parameters, condition keys, SCP/RCP expressibility, and mitigation feasibility. Produce validated.json.
disable-model-invocation: false
---

# Service Approval — Validator v3

Read `.service-approval/<slug>/02-research/research.json` (schema v3.0 produced by Researcher v3). Verify
every capability claim, API parameter, and mitigation against live MCP sources.
Produce `.service-approval/<slug>/03-validate/validated.json`.

## Prerequisites

- [ ] Confirm research.json exists (schema validation runs automatically via PostToolUse hook).
  Stop if `.service-approval/<slug>/02-research/research.json` is missing.

- [ ] Check for assessment artifacts (optional — from `/assess` phase):
  ```bash
  test -f .service-approval/<slug>/01-assess/sar-facts.json && echo "SAR facts: OK" || echo "SAR facts: not found"
  test -f .service-approval/<slug>/01-assess/checkpoint-results.json && echo "Checkpoints: OK" || echo "Checkpoints: not found"
  ```
  If present, load them — they provide pre-verified data that accelerates validation.

- [ ] **Decide on MCP refresh (REQUIRED — ask the user).** Validate is the MCP-verification
  step: every condition key, parameter, capability, and mitigation feasibility claim gets
  confirmed against live AWS docs via `awsknowledge` and other MCP servers. The answers flow
  into every downstream artifact (mapping-results.json → generated controls → deployed
  resources), so stale MCP data silently propagates.

  Before Step 1, check whether a prior `validated.json` exists:

  ```bash
  if [ -f .service-approval/<slug>/03-validate/validated.json ]; then
    mtime=$(stat -f "%Sm" -t "%Y-%m-%d" .service-approval/<slug>/03-validate/validated.json 2>/dev/null \
            || stat -c "%y" .service-approval/<slug>/03-validate/validated.json | cut -d' ' -f1)
    echo "Existing validated.json dated $mtime"
  fi
  ```

  If it exists, ask the user verbatim:

  > A prior `validated.json` exists (dated {mtime}). This file contains MCP-verified facts
  > about the service — every downstream artifact (controls, mappings, IaC) depends on it
  > being accurate.
  >
  > Do you want to:
  >   (a) **Re-verify via MCP** (recommended) — slower, catches AWS service changes and
  >       new docs since {mtime}. Required if >7 days old, if research.json changed
  >       materially, or if you are unsure.
  >   (b) **Reuse existing validated.json** — faster, only acceptable when upstream
  >       research/SAR data is unchanged from the run that produced it.
  >
  > Which? [a / b]

  - If the user picks (a) or this is the first run, proceed with full MCP verification
    (Steps 1–6 below).
  - If the user picks (b), skip the per-item MCP calls, write a passthrough validated.json
    preserving existing verification notes, and log `[Validator] MCP skipped — user opted
    to reuse validated.json dated {mtime}` to `mcp-calls.log`.
  - Never silently reuse validated.json without asking. MCP staleness is the single biggest
    driver of downstream artifact drift.

## MCP call logging

**Required: emit canonical `mcp:<server>:call` events to `pipeline.log` after EVERY MCP tool invocation.** The Stop hook's P1 check (`tools/validate/validate_pipeline_integrity.py` — see `_MCP_CALL_TOKEN_RE`) anchors on the `[mcp:<server>:call]` token; free-form `[TIMESTAMP] [Validator] MCP CALL: ...` lines are NOT counted. The `_hook_log` auto-mirror copies canonical events into `mcp-calls.log` for free.

After each MCP call, run:

```bash
python3 -m tools.validate.log \
    --slug <slug> \
    --phase 03-validate \
    --source mcp:<server> \
    --verdict call \
    --message "<tool-name>: <one-line description>"
```

Substitute `<server>` with the MCP server name (`awsknowledge`, `aws-documentation`, `awsiac`, `iam`, etc.). Validate is the MCP-verification skill — expect 30+ canonical events per run.

## Verification note rules

Every `verification_note` must be specific to the item being verified. Do NOT copy-paste a
generic note across items. Include:
- The specific parameter, key, capability, or claim that was checked
- The MCP response detail that confirmed or denied it
- Any caveats

Blanket `verified: true` across all items with identical notes = insufficient verification.

---

## Step 1: Verify API parameters

For each operation in `api_surface.operations[]` and each parameter in `.parameters[]`:
- Call `awsknowledge` MCP: confirm the parameter exists in the live API schema for the operation
- Set `verified: true/false`, `verification_source`, `verification_note`

## Step 2: Verify IAM condition keys

For each condition key in `capabilities.iam.condition_keys[]`:
- Extract condition key name and claimed `applies_to_actions[]`

**If `sar-facts.json` exists** (from `/assess` phase):
- Use `sar-facts.json` → `condition_keys[]` as the **primary verification source** for
  service-specific condition keys. This is already extracted from the SAR page and is authoritative.
- Cross-reference: if a condition key is in research.json but NOT in `sar-facts.json`, mark it
  `verified: false` with note: "Condition key not found in SAR extraction (N keys extracted)."
- For global condition keys (`aws:SourceArn`, `aws:PrincipalOrgID`, etc.), still verify against
  the global condition keys page in the Service Authorization Reference.
- Also use `sar-facts.json` → `wildcard_only_actions[]` to annotate which condition keys
  apply only to wildcard actions.

**If `sar-facts.json` does NOT exist**:
- Look up the key in the **IAM Service Authorization Reference**
  Use `awsknowledge` MCP to read the service-specific authorization reference page
- For global condition keys, confirm against the global condition keys page.

Set `verified: true/false`, `verification_source`, `verification_note` on each condition key.

## Step 2b: Verify SCP and RCP expressibility

Run for every capability in `capabilities.organization_policies`. Results are used by the
Map and Generator skills.

**SCP expressibility**:

1. Call `awsknowledge` MCP: fetch the service authorization reference for the service prefix.
   - Look up each API action
   - Extract the "Condition keys" column — these are the ONLY condition keys that work in an SCP
2. Call `aws-documentation` MCP to verify SCP limitations:
   ```
   URL: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html
   Extract: any service-specific SCP exemptions
   ```
3. Set `scp_expressible: true/false` with specific reasons

**RCP expressibility**:

**If `checkpoint-results.json` exists** (from `/assess` phase):
- Read `checkpoints.rcp_support`. If `supported: false` and `definitive: true`:
  - Set `rcp_expressible: false`
  - Reason: "Service not in RCP supported list (verified by assessment checkpoint)"
  - **Skip** the live docs fetch below — the checkpoint is authoritative.
- If `supported: true`: still verify per-action exemptions via MCP.

**If checkpoint data is NOT available or RCP is supported:**

Step 1 — Fetch current RCP-supported services from live docs:
```
Call aws-documentation MCP:
  URL: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html
  Extract: table of supported services and their service prefixes
```

Step 2 — Set `rcp_expressible: true/false` with specific reason.

**Declarative policy check:**

**If `checkpoint-results.json` exists** and `checkpoints.declarative_policies` has
`supported: false, definitive: true`:
- Set `declarative_policy_expressible: false` immediately — skip the live docs fetch.

**Otherwise:**
```
Call aws-documentation MCP:
  URL: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_declarative.html
  Extract: which services and resource types have declarative policy support
```
Set `declarative_policy_expressible: true/false`.

## Step 2c: Verify ATT&CK attack surface (if present)

Run only if `research.json` contains an `attack_surface` key (populated by the optional
`research-attack-surface` sub-skill). If absent, skip this step entirely — the pipeline
works without it.

### 2c.1 Verify technique applicability

For each technique in `attack_surface.applicable_techniques[]`:
1. Check that every action in `api_surface_evidence[]` exists in `api_surface.operations[].operation`
   - If an action is missing, set `verified: false` with note "Action {action} not found in API surface"
2. Verify `framework_controls[]` and `framework_objectives[]` against the crosswalk data file:
   ```bash
   python3 -c "
   import json
   xw = json.load(open('data/attack-nist-ccm-crosswalk.json'))  # default crosswalk; use custom if --threat-model-file provided
   xw_map = {m['attack_technique_id']: m for m in xw['mappings']}
   # Check each technique's framework mappings
   "
   ```
   - If technique is in crosswalk: confirm `framework_controls` and `framework_objectives` match
   - If technique is NOT in crosswalk: mark `verified: false` with note "Technique not in crosswalk data"

### 2c.2 Cross-reference with mitigations

For each technique with `applicability: "HIGH"`:
1. Check `stride_categories[]` — for each STRIDE category, verify that at least one
   existing mitigation addresses a related threat
2. If a HIGH technique has zero mitigation coverage, flag as an `attack_surface_gap`:
   ```json
   {
     "technique_id": "T1078.004",
     "technique_name": "Cloud Accounts",
     "gap_type": "no_mitigation_coverage",
     "recommendation": "Consider adding mitigation for IAM role assumption controls"
   }
   ```

### 2c.3 Verify STRIDE bridge

For each entry in `attack_surface.stride_to_attack_bridge[]`:
- Confirm every `attack_techniques[]` entry exists in `applicable_techniques[].technique_id`
- Remove bridge technique references that were filtered out (LOW applicability)

Set `verified: true/false` and `verification_note` on each technique and bridge entry.

Add to validated.json output:
```json
{
  "attack_surface": {
    "applicable_techniques": [...],
    "stride_to_attack_bridge": [...],
    "tactic_coverage_summary": {...},
    "customer_stride_profile": {...},
    "attack_surface_gaps": [...],
    "verified_technique_count": 18,
    "unverified_technique_count": 2
  }
}
```

**Backup policy check:**
```
Call awsknowledge MCP: check if <cfn_type> resource is listed as AWS Backup-supported
```
Set `backup_policy_applicable: true/false`.

**AI opt-out policy check:**
```
Call aws-documentation MCP:
  URL: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai_opt_out.html
  Extract: which AI/ML services support opt-out policies
```
Set `ai_optout_applicable: true/false`.

**Permission boundary check:**
Always `true` — applies to all IAM roles and users.
Note which actions from `api_surface` should be scoped into the boundary.

Add verification annotations to `capabilities.organization_policies`:
```json
{
  "scp_expressible": true,
  "scp_verification_note": "...",
  "rcp_expressible": false,
  "rcp_verification_note": "Service not in current RCP supported list",
  "declarative_policy_expressible": false,
  "backup_policy_applicable": false,
  "ai_optout_applicable": false,
  "permission_boundary_applicable": true
}
```

## Step 3: Verify mitigation feasibility

For each mitigation in `existing_mitigations[]`:
- Verify that `request_parameters[]` exist in the API surface:
  - For each parameter path (e.g., `$.encryptionKeyArn`), confirm it appears in
    `api_surface.operations[].parameters[]` for the relevant operation
  - Set `parameter_verified: true/false` for each
- Verify that `mitigation_goal` is achievable given the service capabilities:
  - If goal references encryption: check `capabilities.encryption` supports the claimed mechanism
  - If goal references network isolation: check `capabilities.network` supports VPC mode
  - If goal references access control: check `capabilities.iam` has the needed condition keys
  - If goal references logging: check `capabilities.logging` supports the claimed mechanism
- Set `verified: true/false`, `feasibility_note` on each mitigation
- Flag mitigations where request_parameters don't exist in the API as `verified: false`

## Step 4: Verify capabilities

For each capability sub-object in `capabilities{}`:

**IAM capabilities** (`capabilities.iam`):
- Verify `resource_policies_supported` via MCP (does the service support resource-based policies?)
- Verify `abac_support` level against condition key types
- Verify `cross_account_access` mechanism

**Encryption capabilities** (`capabilities.encryption`):
- Verify KMS CMK support per resource type via `awsknowledge` MCP
- Verify FIPS endpoint availability (use checkpoint if available)
- Verify TLS enforcement

**Network capabilities** (`capabilities.network`):
- Verify VPC endpoint names via `awsknowledge` MCP
- Verify endpoint policy support
- Verify security group applicability

**Logging capabilities** (`capabilities.logging`):
- Verify CloudWatch namespace and metrics via `awsknowledge` MCP
- Verify Config resource types (use checkpoint if available)
- Verify CloudTrail data event support (use checkpoint if available)

**Organization policy capabilities** (`capabilities.organization_policies`):
- Already verified in Step 2b

Set `verified: true/false` with specific `verification_note` on each capability claim.

## Step 5: Verify enrichment opportunities

If research.json contains enrichment-relevant data (e.g., condition keys that could strengthen
mitigations), identify and verify enrichment opportunities:
- For each mitigation, check if additional condition keys could strengthen enforcement
- Call `awsknowledge` MCP to confirm each enhancement is technically feasible
- Record as `enrichment_opportunities[]` with `verified: true/false`

## Step 5b: Verify assessment gap coverage (if assessment data exists)

If `research.json` contains `assessment_gaps[]` (populated from `/assess` phase):
- For each gap with `status` = `REQUIREMENT GAP` or `CUSTOMER ACTION REQUIRED`:
  - Verify the gap description is accurate by cross-referencing with capabilities
  - Check if any existing mitigation already addresses this gap
  - Set `addressed_by_mitigation: true/false` with the mitigation ID if applicable
  - Gaps without mitigation coverage will be addressed by the Map skill during control generation

## Step 5c: Reject unresolved placeholders

Scan the entire research.json for placeholder strings that should have been resolved upstream.
These indicate merge or enrichment failures:

Placeholder scanning runs automatically via PostToolUse hook (validate_state.py Check S2).

For each placeholder found:
- If it's `data_classification`: infer from encryption capabilities (CMK-capable → Confidential,
  AWS-managed → Internal, no encryption → Internal — service-managed resource)
- If it's any other field: flag as unverified item and set `verified: false`

## Step 6: Count and flag unverified items

Count all items with `verified: false` across all sections (capabilities, API params, condition
keys, mitigations, enrichments). Populate top-level `unverified_count` and `unverified_items[]`.

## Step 7: Write output

**CRITICAL — Preserve array structures:**
The `api_surface.operations` field MUST remain as an array of operation objects — copy the full
array from research.json and add verification annotations to individual parameters within each
operation. Do NOT replace the array with a summary string like `"INHERITED_FROM_RESEARCH — ..."`.
Downstream skills (Generate) iterate over `api_surface.operations[]` to build the parameter
coverage matrix. A string value will break the pipeline.

Write `.service-approval/<slug>/03-validate/validated.json` — same root structure as `research.json` with
verification annotations added throughout.

The output preserves the v3.0 schema with these additions:

For `capabilities` sub-objects, add verification annotations:
```json
{
  "verified": true,
  "verification_source": "awsknowledge MCP — <service> documentation",
  "verification_note": "<specific note>"
}
```

For `api_surface.operations[].parameters[]`, add:
```json
{
  "verified": true,
  "verification_source": "awsknowledge MCP — <service> API reference",
  "verification_note": "<specific note>"
}
```

For `existing_mitigations[]`, add:
```json
{
  "verified": true,
  "feasibility_note": "<specific note about whether this mitigation is achievable>",
  "parameter_verification": {
    "$.encryptionKeyArn": true,
    "$.executionRoleArn": true
  }
}
```

For `capabilities.iam.condition_keys[]`, add:
```json
{
  "verified": true,
  "verification_source": "SAR extraction / awsknowledge MCP",
  "verification_note": "<specific note>"
}
```

For `capabilities.organization_policies`, add expressibility annotations (from Step 2b).

For `enrichment_opportunities[]`, add:
```json
{
  "verified": true,
  "verification_source": "awsknowledge MCP",
  "verification_note": "<specific note>"
}
```

**CRITICAL — Root-level expressibility fields:**
Copy `scp_expressible` and `rcp_expressible` from `capabilities.organization_policies` to the
ROOT of validated.json as boolean fields. Downstream skills (Map, Generate) read these from the
root — not from nested capabilities. If the organization_policies sub-object has these values,
duplicate them at the root level.

**CRITICAL — Terminology sanitization:**
Before writing validated.json, sanitize ALL string values (including metadata fields) to replace
MCP tool identifiers with user-facing names per CLAUDE.md terminology rules:
- `mcp__awsknowledge__aws___*` → "AWS Documentation"
- `mcp__aws-documentation__*` → "AWS Documentation"
- `mcp__kb-search__search_*_kb` → "{KB Name} KB"
- `gateway_aws-documentation-mcp___*` → "AWS Documentation"
This applies to `verification_source`, `mcp_sources_used`, and any other string field.

Top-level additions:
```json
{
  "schema_version": "3.0",
  "scp_expressible": true,
  "rcp_expressible": false,
  "unverified_count": 0,
  "unverified_items": [],
  "enrichment_opportunities": []
}
```

Print summary:
```
Validation complete (v3):
  - API parameters verified:     N/N
  - Condition keys verified:     N/N
  - Mitigations verified:        N/N
  - Capabilities verified:       N/N (iam, encryption, network, logging, org-policies)
  - SCP expressible:             Yes/No
  - RCP expressible:             Yes/No
  - Enrichment opportunities:    N verified
  - Assessment gaps:             N (N addressed by mitigations)
  - UNVERIFIED items:            N
  Output: .service-approval/<slug>/03-validate/validated.json
```
