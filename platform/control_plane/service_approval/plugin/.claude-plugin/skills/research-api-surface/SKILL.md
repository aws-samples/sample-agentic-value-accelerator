---
name: research-api-surface
description: Discover the complete API surface for an AWS service — all operations (control-plane AND data-plane), parameters, and cross-reference validation against SAR condition keys. Produces research-api-surface.json consumed by the research merge step.
disable-model-invocation: false
argument-hint: '[--service=<name>]'
---

# Service Approval — Researcher: API Surface

Retrieve the COMPLETE API reference for the target AWS service. Every operation from the
Service Authorization Reference must be captured — both control-plane AND data-plane.

**Output:** `.service-approval/<slug>/02-research/research-api-surface.json`
**Schema:** `schemas/research-api-surface.schema.json` — encodes `phase: "research-api-surface"` const, `api_surface.operations[]` inlined (no `_ref` pointers), parameter `path` pattern `^\$\..*`, `gateable_by[]` subset of `{sar, api}`, `mutability` and `security_category` enums.

This is one of 3 focused research sub-skills. The orchestrator merges outputs from all 3
into the final `research.json`.

---

## Prerequisites

```bash
from tools.paths import phase_dir, mcp_log
research_dir = phase_dir(slug, "research")  # .service-approval/<slug>/02-research/
research_dir.mkdir(parents=True, exist_ok=True)
mcp_log(slug).touch()  # .service-approval/<slug>/mcp-calls.log
```

## Inputs

- `--service=<name>` — AWS service identifier (REQUIRED)

## Assessment & Capability Data

Check for data from sibling sub-skills and assessment phase:

```bash
test -f .service-approval/<slug>/01-assess/sar-facts.json && echo "SAR facts: OK" || echo "SAR facts: not found"
test -f .service-approval/<slug>/02-research/research-capabilities.json && echo "Capabilities: OK" || echo "Capabilities: not found (running in parallel)"
```

**If `sar-facts.json` exists**: Use it as the authoritative action list. Every action
in the SAR page MUST appear in either `api_surface.operations[]` or as a permission-only
action. The SAR facts file gives you the complete action inventory to validate against.

**If `research-capabilities.json` exists**: Read `capabilities.iam.condition_keys[]` to
get the `applies_to_actions` lists for cross-reference validation. Also read
`capabilities.iam.permission_only_actions[]` to exclude those from the operations list.

If neither exists yet (running in parallel), you MUST read the SAR page directly via MCP
to get the action list and condition keys for validation.

---

## MCP Call Logging

**Required: emit canonical `mcp:<server>:call` events to `pipeline.log` after EVERY MCP tool invocation.** The Stop hook's P1 check (`tools/validate/validate_pipeline_integrity.py` — see `_MCP_CALL_TOKEN_RE`) anchors on the `[mcp:<server>:call]` token; free-form `[Step N] [API-Surface] ...` lines are NOT counted. The `_hook_log` auto-mirror copies canonical events into `mcp-calls.log` for free.

After each MCP call, run:

```bash
python3 -m tools.validate.log \
    --slug <slug> \
    --phase 02-research \
    --source mcp:<server> \
    --verdict call \
    --message "<tool-name>: <one-line description of query>"
```

Substitute `<server>` with the actual MCP server name (`awsknowledge`, `aws-documentation`, etc.). Issue this command BEFORE the next agent action so a failure mid-run still leaves the audit trail.

---

## Step 1: Get the Authoritative Action List

Build the complete list of IAM actions for this service. This is your target — every action
must be accounted for.

**From sar-facts.json** (preferred):
```python
import json
sar = json.load(open('.service-approval/<slug>/01-assess/sar-facts.json'))
all_actions = [a['action'] for a in sar.get('actions', [])]
permission_only = sar.get('permission_only_actions', [])
api_actions = [a for a in all_actions if a not in permission_only]
```

**From MCP** (if sar-facts.json unavailable):
Use `awsknowledge` MCP to read the SAR page with FULL pagination:
- `start_index=0`, `start_index=30000`, `start_index=60000`, `start_index=85000`
- Extract ALL action names from the actions table
- Identify permission-only actions (those with no API operation)

Record the total action count — this is your completeness target.

---

## Step 2: Retrieve Full API Reference

Use `aws-documentation` MCP to read the API reference:

### 2a: CLI API Index Page
Read the CLI command reference index for the service. This gives you the complete list of
API operations organized by name.

```
Search: "<service> CLI command reference"
Read: CLI index page to get full operation list
```

### 2b: API Reference Pages
Read the service API reference documentation:

```
Search: "<service> API reference"
Read: API reference pages for operation details and parameters
```

### 2c: Data-Plane Operations
Many services separate control-plane and data-plane APIs. Explicitly search for:

```
Search: "<service> data plane API"
Search: "<service> runtime API"
```

Common data-plane patterns to look for:
- `Invoke*`, `Put*`, `Batch*`, `Start*`, `Stop*`, `Send*`
- `Get*` (read operations)
- `List*` (enumerate operations)
- `Create*` / `Delete*` for ephemeral resources (sessions, events, records)

---

## Step 2.5: Botocore Enrichment Overlay

Enrich operations and parameters from the boto3 service model. Botocore provides
machine-readable enums, min/max, patterns, and mutability that are far more
reliable than prose scraping. **SAR-driven inventory is still authoritative** —
this step only fills in per-parameter detail on operations we already know about.

**Preflight — verify the pinned boto3 version is installed:**

```bash
pip install -r tools/research/requirements-research.txt
python3 -c "import boto3; print(boto3.__version__)"
# Expect a 1.40.x version. If missing, install before continuing.
```

### 2.5a: Fetch the botocore schema

```bash
python3 tools/research/fetch_botocore_schema.py <service> \
  -o .service-approval/<slug>/02-research/botocore-schema.json
```

A pre-computed cache exists for common services at
`data/api-surface/<service>.json` (ECS, Lambda, S3).
If the cache is present and matches the target service, prefer it over running
the tool (saves ~5s). Always check the cache's boto3 version in `_metadata`.

Log the MCP-equivalent call to `.service-approval/<slug>/mcp-calls.log`:
```
[Step 2.5] [API-Surface] botocore fetch_botocore_schema.py — service=<name> — N ops, M params
```

### 2.5b: Overlay enum/min/max/pattern onto each operation

For every operation in `api_surface.operations[]` built in Step 3:

1. Look up the matching botocore operation by `operation` name.
2. **If matched:** set `botocore_coverage: true` on the operation, and for every
   parameter whose `path` matches a botocore path, merge these fields from
   botocore onto the parameter record:
   - `enum: list[str]` — allowed string values (only when botocore defines them)
   - `min` / `max` — numeric bound or length bound
   - `pattern` — regex
   - `security_category` — `kms | network | iam | tag | log | auth | tls | policy | null`
     (populated by the keyword classifier in `fetch_botocore_schema.py`)
3. **If the operation is missing from botocore** (e.g., daemon ops, brand-new
   service, permission-only actions): set `botocore_coverage: false`. Retain
   whatever parameter data Step 3 already built from MCP. Do NOT drop the op.

Rule: botocore is an **overlay**, never a replacement. If botocore has an
operation SAR doesn't list, it's ignored. If SAR has an operation botocore
doesn't list, it survives with `botocore_coverage: false`.

### 2.5c: Compute mutability

```bash
python3 tools/research/compute_mutability.py <service> \
  -o .service-approval/<slug>/02-research/botocore-mutability.json
```

For each parameter, merge `mutability: "create_only" | "mutable" | "unknown"`
from the tool's output. `unknown` is the default when the tool can't find a
matching Update-family operation — keep it, don't guess.

### 2.5d: Compute gateable_by (SAR↔parameter cross-match)

```bash
python3 tools/research/compute_gateable_by.py \
  --schema .service-approval/<slug>/02-research/botocore-schema.json \
  --sar-facts .service-approval/<slug>/01-assess/sar-facts.json \
  -o .service-approval/<slug>/02-research/botocore-gateable.json
```

This cross-references parameter paths against SAR condition keys. For each
parameter, merge:

- `gateable_by: list[str]` — subset of `["sar", "api"]`. Always includes `"api"`
  for any parameter that came from botocore. `"sar"` is added only when a SAR
  condition key matches the parameter path with semantic confirmation.
- `sar_condition_key: string | null` — the matched SAR key (e.g.,
  `"ecs:auto-assign-public-ip"`), or `null` when no SAR match.

**Invariant:** if `"sar"` is in `gateable_by`, `sar_condition_key` MUST be
non-null. The validator enforces this.

### 2.5e: Final parameter record shape

After the overlay, a fully enriched parameter looks like:

```json
{
  "path": "$.networkConfiguration.awsvpcConfiguration.assignPublicIp",
  "type": "string",
  "required": false,
  "enum": ["ENABLED", "DISABLED"],
  "description": "Whether the task's ENI receives a public IP.",
  "mutability": "mutable",
  "security_category": "network",
  "gateable_by": ["api", "sar"],
  "sar_condition_key": "ecs:auto-assign-public-ip"
}
```

A parameter that came from MCP-only (botocore doesn't cover the op) looks like:

```json
{
  "path": "$.something",
  "type": "string",
  "required": false,
  "gateable_by": ["api"],
  "sar_condition_key": null
}
```

### 2.5f: Known limitation — sar-facts.json without applies_to_actions

If the existing `sar-facts.json` stores `condition_keys` as strings (not objects
with `applies_to_actions[]`), the cross-match falls back to string-suffix match
without semantic confirmation. Known gap documented in
`.service-approval/gap-report-botocore.md`. Phase C's rollout requires the
assess skill to populate `applies_to_actions[]`; Phase B tolerates the
string-only form.

---

## Step 3: Build Operations List

For EVERY API action (excluding permission-only actions), create an operation entry:

**CRITICAL — Field naming:** The operation name field MUST be `"operation"`, NOT `"action"`.
The downstream merge step and all consumers (Validate, Map, Generate) read
`api_surface.operations[].operation`. Using `"action"` as the key name will break
cross-reference validation and condition key completeness checks.

```json
{
  "operation": "CreateAgentRuntime",
  "parameters": [
    {
      "path": "$.agentRuntimeName",
      "type": "string",
      "required": true
    },
    {
      "path": "$.encryptionKeyArn",
      "type": "string",
      "required": false
    }
  ]
}
```

**Parameter extraction rules:**
- Include ALL parameters, not just security-relevant ones
- Use JSON path notation (`$.fieldName`)
- Mark `required: true/false` based on the API reference
- For nested parameters, use dot notation (`$.configuration.subnets`)
- Flag security-relevant parameters: encryption, auth, network, policy, tagging

**Completeness rule:**
After building the operations list, compare against the authoritative action list from Step 1.

Missing actions fall into 4 categories:
1. **Permission-only actions** — go in the capabilities `permission_only_actions[]` list (NOT here)
2. **API operations you missed** — add them with parameters from the API reference
3. **Actions with no documentation** — add with `"parameters": []` and a note
4. **SAR-only virtual IAM actions** — see rule below

### SAR-only virtual IAM actions

Some services emit IAM actions in the SAR Actions table that have no corresponding
standalone boto3/API operation. They're evaluated by IAM as authorization-layer
sub-actions on top of an underlying data-plane call, not as standalone APIs.

Verified example (DynamoDB): `PartiQLDelete`, `PartiQLInsert`, `PartiQLSelect`,
`PartiQLUpdate`, `ConditionCheckItem` — IAM evaluates these during
`ExecuteStatement` / `BatchExecuteStatement` / `TransactWriteItems`, but there's no
standalone boto3 method for them.

These are DIFFERENT from `permission_only_actions`: permission-only actions (like
`TagResource` on services where tagging has its own API variant) are a separate
bucket with CloudTrail semantics. SAR-only virtual actions evaluate inside another
data-plane call — no independent API, no independent CloudTrail event.

When you encounter a SAR action that is NOT in boto3 AND is NOT in the
permission-only list, emit it in `api_surface.operations[]` with:
- `operation`: the SAR action name verbatim (case-sensitive)
- `parameters: []` (no standalone API accepts them)
- `source: "sar_only_virtual"` marker
- Optional `note`: a single line naming the underlying data-plane call (e.g.,
  `"Evaluated during ExecuteStatement/BatchExecuteStatement"`).

Downstream skills use the `source` field to distinguish real ops from virtual ones
(e.g., `generate-iac` skips parameter generation for virtual ops; `map-generate-controls`
maps them to IAM controls like any other action).

---

## Step 4: Cross-Reference Validation

This is the CRITICAL validation step that catches incomplete API surfaces.

### 4a: SAR Action Coverage
```
Total SAR actions:          {N}
Permission-only actions:    {N}
Expected API operations:    {N - permission_only}
Captured operations:        {N}
Missing:                    {list}
```

If missing > 0, go back to Step 2 and read additional API reference pages.

### 4b: Condition Key Cross-Reference

If condition keys are available (from capabilities sub-skill or SAR page):
- For each condition key's `applies_to_actions[]`, verify every action appears in either:
  - `operations[]` (as an operation name), OR
  - `permission_only_actions[]`
- Actions referenced by condition keys but missing from both lists = CRITICAL gap

```python
# Cross-reference check
condition_keys = [...]  # from capabilities or SAR
op_names = set(op['operation'] for op in operations)
poa = set(permission_only_actions)
all_known = op_names | poa

missing = set()
for ck in condition_keys:
    for action in ck.get('applies_to_actions', []):
        if action not in all_known:
            missing.add(action)

if missing:
    print(f'CRITICAL: {len(missing)} actions missing: {sorted(missing)}')
    # Must fix before proceeding
```

### 4c: Create Operation Coverage

Check that every `Create*` operation has corresponding CRUD operations:
- `Create*` → should also have `Get*`, `List*`, `Delete*`, `Update*` (where applicable)
- Missing CRUD operations may indicate data-plane gaps

---

## Step 5: Write Output

Write `.service-approval/<slug>/02-research/research-api-surface.json`:

**CRITICAL — Output structure:** Operations MUST be nested under `api_surface.operations[]`,
NOT at the top level. Each entry MUST use the key `"operation"` (not `"action"` or `"name"`).
The merge step reads `data["api_surface"]["operations"]` — top-level `operations[]` will be
ignored and produce an empty API surface in research.json.

```json
{
  "phase": "research-api-surface",
  "service": "<service-name>",
  "api_surface": {
    "operations": [
      {
        "operation": "CreateAgentRuntime",
        "botocore_coverage": true,
        "parameters": [
          {
            "path": "$.agentRuntimeName",
            "type": "string",
            "required": true,
            "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
            "mutability": "create_only",
            "gateable_by": ["api"],
            "sar_condition_key": null
          },
          {
            "path": "$.encryptionKeyArn",
            "type": "string",
            "required": false,
            "security_category": "kms",
            "mutability": "mutable",
            "gateable_by": ["api", "sar"],
            "sar_condition_key": "bedrock:encryptionKeyArn"
          }
        ]
      }
    ]
  },
  "completeness": {
    "sar_total_actions": 85,
    "permission_only_actions": 5,
    "expected_operations": 80,
    "captured_operations": 80,
    "missing_operations": [],
    "condition_key_cross_ref_pass": true,
    "missing_from_condition_keys": []
  },
  "botocore_enrichment": {
    "boto3_version": "1.40.x",
    "operations_with_coverage": 78,
    "operations_without_coverage": 2,
    "parameters_total": 540,
    "parameters_with_enum": 105,
    "parameters_gateable_by_sar": 33
  },
  "doc_sources": ["https://docs.aws.amazon.com/..."]
}
```

## Output Verification

Output validation runs automatically via PostToolUse hook. The JSON Schema (see Schema above) hard-fails on phase-const mismatch, operations not inlined under `api_surface.operations[]`, invalid parameter paths, or wrong enum values. `validate_state.py::check_research_api_surface` keeps the checks the schema cannot express: CHECK-17 (botocore_enrichment counter vs per-parameter population), the additive Phase B overlay schema, the `completeness.missing_from_condition_keys` CRITICAL flag, and the cross-field invariant that `gateable_by` containing `"sar"` requires `sar_condition_key != null` (JSON Schema 2020-12 cannot express this conditional).

## Print Summary

```
Research (API surface) complete:
  SAR total actions:            {N}
  Permission-only actions:      {N}
  Expected operations:          {N}
  Captured operations:          {N}
  Botocore coverage:            {N/M} ops ({pct}%)
  Parameters w/ enum (botocore): {N}
  Parameters gateable_by SAR:   {N}
  Missing operations:           {N}
  Condition key cross-ref:      {PASS/FAIL}
  Doc sources:                  {N}
  Output: .service-approval/<slug>/02-research/research-api-surface.json
```
