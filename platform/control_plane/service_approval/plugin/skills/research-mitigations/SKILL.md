---
name: research-mitigations
description: Parse input files to extract existing mitigations, build initial asset inventory, and collect assessment gaps. Produces research-mitigations.json consumed by the research merge step.
disable-model-invocation: false
argument-hint: '[./input-folder] [--service=<name>]'
---

# Service Approval — Researcher: Mitigations & Assets

Parse customer-provided input files to extract existing mitigations, build an initial asset
inventory, and collect assessment gaps from the CAF assessment phase.

**Output:** `.service-approval/<slug>/02-research/research-mitigations.json`
**Schema:** `schemas/research-mitigations.schema.json` — encodes `phase: "research-mitigations"` const, mitigation `id` pattern `^M-.+`, assessment-gap `id` pattern `^GAP-`, `assets_partial[].cfn_type` pattern `^AWS::`, and per-mitigation required fields (`id`, `mitigation_goal`, `statement`). `resource_type` is allowed on mitigations but assets MUST use `cfn_type` (see Step 3 and "Quality rules" below).

This is one of 3 focused research sub-skills. The orchestrator merges outputs from all 3
into the final `research.json`.

---

## Prerequisites

Per-service phase directory (`.service-approval/<slug>/02-research/`) is created dynamically using `tools/paths.py::phase_dir(slug, "research")`.

## Inputs

Parse arguments:
- `./input-folder` (optional) — read all `.md`, `.json`, `.xlsx`, `.pdf`, `.docx` files
- `--service=<name>` — AWS service identifier (e.g., `bedrock-agentcore`, `lambda`, `s3`)

If no input folder is provided, skip mitigation extraction (MCP-only mode — mitigations
will be empty). If no --service is provided, ask the user.

---

## Step 1: Parse Input Files

For each file in the input folder:

### JSON files (Mitigation Report)
Look for `entities` key containing mitigation arrays. For each entity:
- Extract resource type
- Extract mitigations with: id, statement, mitigation_goal, request_parameters
- Preserve the FULL statement and goal text — do NOT summarize or truncate

```python
import json
data = json.load(open("<file>"))
for entity in data.get("entities", []):
    resource_type = entity.get("resource_type", "")
    for mit in entity.get("mitigations", []):
        # Extract: id, statement, mitigation_goal, request_parameters[], resource_type
```

### Markdown files (Mitigation Report)

Mitigation reports (e.g. `input/<Service Name> — Mitigation Report.md`)
follow a consistent shape. Parse with the reference spec below — do NOT reinvent on
each run.

**Block delimiter:** each mitigation begins with a level-3 header of shape
`### M-<Entity>.<N> — <title>`. Regex:

```python
BLOCK_RE = re.compile(r"^### M-(?P<entity>[A-Za-z]+)\.(?P<n>\d+) — (?P<title>.+)$", re.MULTILINE)
```

Split the document at each header match; each block runs until the next header or EOF.

**Per-block table:** the first Markdown table inside each block has column 1 as a
bolded label and column 2 as the value. Parse rows keyed by the bolded label:

| Label (col 1)          | Output field           | Notes                                                |
|------------------------|------------------------|------------------------------------------------------|
| `**ID**`               | `id`                   | Prepend `M-` if absent (e.g. `Resource.0` → `M-Resource.0`) |
| `**Statement**`        | `statement`            | Full cell text, preserve sentences.                 |
| `**Mitigation Goal**`  | `mitigation_goal`      | Full cell text, preserve sentences.                 |
| `**Resource Type**`    | `resource_type`        | CFN type string (e.g. `AWS::Bedrock::Agent`).       |
| `**Request Parameters**` | `request_parameters[]` | Split on commas or Markdown list bullets; strip whitespace; JSON paths like `$.encryptionKeyArn`. |

Emit each parsed block as an `existing_mitigations[]` entry with the fields above
plus `source: "<report-basename>"` (e.g. `"source": "<Service Name> — Mitigation Report.md"`) so downstream runs can trace provenance.

**Row parsing pseudocode:**

```python
ROW_RE = re.compile(r"^\|\s*\*\*(?P<label>[^*]+)\*\*\s*\|\s*(?P<value>.+?)\s*\|$", re.MULTILINE)
label_map = {
    "ID": "id",
    "Statement": "statement",
    "Mitigation Goal": "mitigation_goal",
    "Resource Type": "resource_type",
    "Request Parameters": "request_parameters",
}
row_fields = {label_map[m.group("label").strip()]: m.group("value").strip()
              for m in ROW_RE.finditer(block)
              if m.group("label").strip() in label_map}
if "request_parameters" in row_fields:
    row_fields["request_parameters"] = [
        p.strip().lstrip("-* ").strip()
        for p in re.split(r",|\n", row_fields["request_parameters"])
        if p.strip()
    ]
```

**Rationale:** the reports are hand-curated in this exact shape. Parsing via this
spec takes ~20 lines of Python; re-inventing the parser has cost ~15 min of LLM
time on every cold-start run (confirmed across iter-13 and iter-14 runs). If a
new report deviates from this shape, prefer fixing the report over making the
parser tolerant of drift — uniform input shape keeps every downstream step
deterministic.

If the input filename ends in `.md` but the shape diverges significantly, fall
back to the previous bullet-point heuristic (mitigation IDs by pattern, statement
= text between IDs) and log a warning to `mcp-calls.log` noting the deviation.

### XLSX files
Note as framework source file — record path for the Map skill. Do NOT parse framework
content here (that's the Map skill's job).

### PDF / DOCX files
Extract security-relevant content. Look for:
- Mitigation tables
- Security requirements
- Threat descriptions

### Other files
Read for context but do not extract structured data.

---

## Step 2: Build Existing Mitigations

Compile all extracted mitigations into a structured array:

```json
{
  "existing_mitigations": [
    {
      "id": "M-Resource.0",
      "statement": "<full statement text — NOT truncated>",
      "mitigation_goal": "<full goal text — NOT truncated>",
      "request_parameters": ["$.encryptionKeyArn", "$.executionRoleArn"],
      "resource_type": "AWS::<Service>::<Resource>"
    }
  ]
}
```

**Quality rules:**
- Every mitigation MUST have a non-empty `statement` field
- Every mitigation MUST have a non-empty `mitigation_goal` field
- **Truncation guard**: After extraction, verify `mitigation_goal` starts with an uppercase
  letter and forms a complete English phrase. If it starts lowercase or mid-word (e.g.,
  `"ulti-AZ"` instead of `"Multi-AZ"`), the extraction truncated — re-extract from source.
- `request_parameters` must be JSON paths (starting with `$.`)
- `resource_type` should use CloudFormation format (`AWS::<Service>::<Resource>`)
- Preserve ALL mitigations — do not deduplicate or merge similar ones

---

## Step 3: Build Initial Asset Inventory

From the mitigations, derive an initial asset list. Each unique `resource_type` becomes
an asset entry:

```json
{
  "assets_partial": [
    {
      "name": "<ResourceName>",
      "cfn_type": "AWS::<Service>::<Resource>",
      "data_classification": "<from mitigation context — what data does this resource handle?>",
      "trust_boundaries": [],
      "entry_points": [],
      "source": "mitigations"
    }
  ]
}
```

Derive `data_classification` from the mitigation statements — what do they describe the
resource as storing/processing? If unclear, set to `"<needs enrichment from capabilities>"`.

The `trust_boundaries` and `entry_points` will be enriched by the capabilities and
api-surface sub-skills respectively.

---

## Step 4: Collect Assessment Gaps

Check if the `/assess` skill has produced artifacts:

```bash
test -f .service-approval/<slug>/01-assess/assessment-summary.md && echo "OK" || echo "not found"
```

If `assessment-summary.md` exists:
- Parse each `[DOMAIN_GAPS] Compliance Matrix` table
- For every row with status `REQUIREMENT GAP`, `CUSTOMER ACTION REQUIRED`, or `PARTIALLY SUPPORTED`:
  - Record in `assessment_gaps[]` with: domain, requirement, status, details

```json
{
  "assessment_gaps": [
    {
      "domain": "IAM|LOGGING|INFRA|DATA|INCIDENT",
      "requirement": "...",
      "status": "REQUIREMENT GAP|CUSTOMER ACTION REQUIRED|PARTIALLY SUPPORTED",
      "details": "..."
    }
  ]
}
```

If assessment-summary.md does not exist, set `assessment_gaps` to an empty array.

---

## Step 5: Write Output

Write `.service-approval/<slug>/02-research/research-mitigations.json`:

**CRITICAL — Field Name Enforcement:**
- The top-level key MUST be `"phase"` (not `"skill"`, not `"stage"`)
- Each `assets_partial[]` entry MUST use `"cfn_type"` (not `"resource_type"`) and `"name"` (not `"display_name"`)
- These exact field names are required for the merge step to work correctly

```json
{
  "phase": "research-mitigations",
  "service": "<service-name>",
  "existing_mitigations": [...],
  "assets_partial": [
    {
      "name": "<ResourceName>",
      "cfn_type": "AWS::<Service>::<Resource>",
      "data_classification": "...",
      "trust_boundaries": [],
      "entry_points": [],
      "source": "mitigations"
    }
  ],
  "assessment_gaps": [...],
  "input_files_parsed": ["<file1>", "<file2>"],
  "framework_file": "<path-to-xlsx-if-found>"
}
```

## Output Verification

Output validation runs automatically via PostToolUse hook. The JSON Schema (see Schema above) hard-fails on phase-const mismatch, missing `id` / `mitigation_goal` / `statement` on any mitigation, `assets_partial[].cfn_type` not matching `^AWS::`, or any assessment-gap `id` not matching `^GAP-`. `validate_state.py::check_research_mitigations` delegates entirely to the schema — no additional hand-rolled checks remain.

## MITRE ATT&CK Threat Overlay (optional)

If `data/attack-cloud-matrix.json` exists, enrich mitigations
with MITRE ATT&CK technique mappings:

1. Load the cloud matrix (Tactics: Initial Access → Impact, ~70 techniques)
2. For each mitigation, match its `category` and `description` keywords against technique
   names and descriptions
3. Assign `mitre_technique_ids` (e.g., `["T1078", "T1190"]`) to each mitigation
4. Add a `threat_overlay` section to the output:
```json
"threat_overlay": {
  "techniques_mapped": 18,
  "tactics_covered": ["Initial Access", "Execution", "Persistence", "Privilege Escalation"],
  "technique_to_mitigation": {"T1078": ["MIT-001", "MIT-003"], ...}
}
```

This is optional — if the matrix file is absent, skip silently. The threat overlay
feeds into controls-catalog.md and the APPROVAL-REPORT.md threat coverage section.

## MITRE ATT&CK Threat Overlay (optional)

If `data/attack-cloud-matrix.json` exists, enrich mitigations
with MITRE ATT&CK technique mappings:

1. Load the cloud matrix (Tactics: Initial Access → Impact, ~70 techniques)
2. For each mitigation, match its `category` and `description` keywords against technique
   names and descriptions
3. Assign `mitre_technique_ids` (e.g., `["T1078", "T1190"]`) to each mitigation
4. Add a `threat_overlay` section to the output:
```json
"threat_overlay": {
  "techniques_mapped": 18,
  "tactics_covered": ["Initial Access", "Execution", "Persistence", "Privilege Escalation"],
  "technique_to_mitigation": {"T1078": ["MIT-001", "MIT-003"], ...}
}
```

This is optional — if the matrix file is absent, skip silently. The threat overlay
feeds into controls-catalog.md and the APPROVAL-REPORT.md threat coverage section.

## Print Summary

```
Research (mitigations) complete:
  Mitigations extracted:   {N}
  Assets identified:       {N}
  Assessment gaps:         {N}
  MITRE techniques:        {N} (or "skipped — no matrix file")
  Input files parsed:      {N}
  Framework file:          {path or "none"}
  Output: .service-approval/<slug>/02-research/research-mitigations.json
```
