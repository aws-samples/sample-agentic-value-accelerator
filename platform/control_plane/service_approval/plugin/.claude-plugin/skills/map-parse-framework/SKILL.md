---
name: map-parse-framework
description: Parse a customer-provided control framework file (xlsx/json/md) into normalized framework_objectives[]. Produces map-framework-parsed.json consumed by map-assemble. Supports CCMv4, NIST 800-53, CIS Benchmarks, ISO 27001.
disable-model-invocation: false
argument-hint: '[--framework=<ccmv4|nist|cis|iso>] [--framework-file=<path>]'
---

# Service Approval — Map: Parse Framework

Parse a customer-provided control framework file into a normalized array of framework objectives.
This is the smallest, most deterministic sub-skill in the map pipeline.

> **Scope note (as of 2026-05-16):** the `intake` skill narrows interactive
> runs to CCMv4-only. Multi-framework parsing (NIST 800-53 / CIS / ISO 27001)
> remains available behind the `--framework=<type>` CLI flag for advanced
> operators who bypass intake. See `skills/intake/SKILL.md` for the rationale.

**Input:** Framework file (xlsx/json/md) or built-in CCMv4 reference
**Output:** `.service-approval/<slug>/04-map/map-framework-parsed.json`

This is one of 4 focused map sub-skills. Each writes to a separate intermediate state file.

---

## Prerequisites

```bash
mkdir -p .service-approval/<slug>/04-map
```

## Inputs

Parse arguments:
- `--framework=<type>` — framework identifier (default: auto-detect from file)
- `--framework-file=<path>` — explicit path to framework file (overrides auto-detection)

### Auto-detect framework file

If `--framework-file` is not provided, scan the input folder for framework files:
- `.xlsx` files containing "CCMv4", "ccmv4", "CSA", "cloud controls matrix" in filename -> CCMv4
- `.xlsx` files containing "NIST", "800-53" in filename -> NIST 800-53
- `.xlsx` files containing "CIS" in filename -> CIS Benchmarks
- `.xlsx` files containing "ISO", "27001" in filename -> ISO 27001
- `.json` files with top-level `framework` or `controls` key -> parse and detect
- `.md` files with framework headers -> parse and detect

If multiple framework files found, ask the user which to use.
If no framework file found and `--framework` is set, use built-in domain reference.

---

## Step 1: Parse Framework File

### For `.xlsx` files (e.g., CCMv4_LightningLane.xlsx):

```bash
python3 -c "
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
for sheet in wb.sheetnames:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if rows:
        headers = [str(h).strip() if h else '' for h in rows[0]]
        print(f'Sheet: {sheet}, Columns: {headers}')
        for row in rows[1:6]:
            print([str(c)[:80] if c else '' for c in row])
" "<framework-file>"
```

Adapt column mapping based on detected framework:
- **CCMv4**: Control ID, Control Domain, Control Title, Control Specification
- **NIST 800-53**: Control Identifier, Control Family, Control Name, Control Description
- **CIS**: Recommendation #, Section, Title, Description, Level
- **ISO 27001**: Clause, Control, Objective, Implementation Guidance

### For `.json` files:

```python
import json
data = json.load(open("<framework-file>"))
# Detect structure and extract objectives
```

### For `.md` files:

Parse markdown headers and tables to extract framework objectives.

---

## Step 2: Build Normalized framework_objectives[]

Regardless of source format, produce a normalized array where every objective has:

```json
{
  "id": "IAM-01",
  "domain": "Identity & Access Management",
  "title": "Identity and Access Management Policy and Procedures",
  "specification": "Establish, document, approve, communicate, apply, evaluate...",
  "keywords": ["access", "identity", "authentication", "policy"]
}
```

### Keyword extraction rules

Extract keywords from the specification text to aid downstream matching:
- Domain-specific terms (access, encryption, network, logging, etc.)
- Action verbs (restrict, monitor, audit, enforce, validate, protect)
- AWS-relevant terms (key management, multi-factor, least privilege, classification)
- De-duplicate and lowercase
- Max 10 keywords per objective — pick the most specific, not generic

---

## Step 3: CCMv4 Built-in Fallback

If framework is CCMv4 but no xlsx is parseable, use this built-in domain reference:

| Prefix | Domain Name | Range |
|--------|-------------|-------|
| AIS | Application & Interface Security | AIS-01 to AIS-07 |
| A&A | Audit & Assurance | A&A-01 to A&A-06 |
| BCR | Business Continuity Management & Operational Resilience | BCR-01 to BCR-11 |
| CCC | Change Control & Configuration Management | CCC-01 to CCC-09 |
| CEK | Cryptography, Encryption & Key Management | CEK-01 to CEK-21 |
| DCS | Datacenter Security | DCS-01 to DCS-15 |
| DSP | Data Security & Privacy Lifecycle Management | DSP-01 to DSP-19 |
| GRC | Governance, Risk & Compliance | GRC-01 to GRC-08 |
| HRS | Human Resources | HRS-01 to HRS-13 |
| IAM | Identity & Access Management | IAM-01 to IAM-16 |
| IPY | Interoperability & Portability | IPY-01 to IPY-04 |
| IVS | Infrastructure & Virtualization Security | IVS-01 to IVS-09 |
| LOG | Logging & Monitoring | LOG-01 to LOG-13 |
| SEF | Security Incident Management & Forensics | SEF-01 to SEF-08 |
| STA | Supply Chain Management & Accountability | STA-01 to STA-14 |
| TVM | Threat & Vulnerability Management | TVM-01 to TVM-10 |
| UEM | Universal Endpoint Management | UEM-01 to UEM-14 |

**NEVER invent control IDs outside these ranges.**

When using built-in fallback, each objective gets:
- `id`: from the range (e.g., "IAM-01")
- `domain`: from the table above
- `title`: domain-level title (enriched if xlsx provided partial data)
- `specification`: domain-level specification (may be minimal if no xlsx)
- `keywords`: derived from domain name

---

## Step 4: Write Output

### Framework Name Rules (CRITICAL for output titles)

The `framework.name` field flows into ALL downstream output titles (e.g., "CSA CCMv4 Control
Mapping — {service}", "NIST 800-53 Coverage Matrix", "Threat Model Coverage for MITRE ATT&CK").
Set it using these rules:

| Source | `framework.name` value | Example output title |
|--------|----------------------|---------------------|
| Built-in CCMv4 fallback (no file provided) | `"CSA CCMv4"` | "CSA CCMv4 Control Mapping — Amazon S3" |
| Customer xlsx with "CCMv4" in filename | `"CSA CCMv4"` | "CSA CCMv4 Control Mapping — Amazon ECS" |
| Customer xlsx with "NIST" or "800-53" in filename | `"NIST 800-53"` | "NIST 800-53 Control Mapping — AWS KMS" |
| Customer xlsx with "CIS" in filename | `"CIS Benchmarks"` | "CIS Benchmarks Control Mapping — Amazon RDS" |
| Customer xlsx with "ISO" or "27001" in filename | `"ISO 27001"` | "ISO 27001 Control Mapping — Amazon EKS" |
| Customer file that doesn't match any known pattern | `"Custom Framework"` | "Custom Framework Control Mapping — Amazon Lambda" |
| `--framework=ccmv4` flag (no file) | `"CSA CCMv4"` | "CSA CCMv4 Control Mapping — ..." |
| `--framework=nist` flag (no file) | `"NIST 800-53"` | "NIST 800-53 Control Mapping — ..." |
| `--framework=cis` flag (no file) | `"CIS Benchmarks"` | "CIS Benchmarks Control Mapping — ..." |
| `--framework=iso` flag (no file) | `"ISO 27001"` | "ISO 27001 Control Mapping — ..." |

**Rule:** If the customer provides a file with a recognizable framework name in its content
(headers, sheet names, or first-row data), prefer that over filename-based detection. For
example, a file named `security-controls.xlsx` whose first column header is "NIST Control ID"
should produce `framework.name = "NIST 800-53"`.

**Rule:** If the file cannot be classified into any known framework, set
`framework.name = "Custom Framework"`. Never leave it empty or null.

Write `.service-approval/<slug>/04-map/map-framework-parsed.json`:

```json
{
  "schema_version": "1.0",
  "framework": {
    "name": "CSA CCMv4",
    "version": "4.0",
    "source_file": "<path or 'built-in'>",
    "total_objectives": 197
  },
  "framework_objectives": [
    {
      "id": "A&A-01",
      "domain": "Audit & Assurance",
      "title": "Audit and Assurance Policy and Procedures",
      "specification": "...",
      "keywords": ["audit", "assurance", "policy", "compliance"]
    }
  ]
}
```

**Schema rules:**
- `framework` MUST be an object with keys: `name`, `version`, `source_file`, `total_objectives`
- `framework_objectives` MUST be a non-empty array
- Every objective MUST have: `id`, `domain`, `title`, `specification`, `keywords`
- `total_objectives` MUST equal `len(framework_objectives)`
- Objectives MUST be sorted by `id` (alphabetical)

---

## Validate Output

Output validation runs automatically via PostToolUse hook (validate_state.py Check S10).

## Print Summary

```
Map (Parse Framework) complete:
  Framework: {name} v{version}
  Source: {source_file}
  Objectives: {total_objectives}
  Domains: {count unique domains}
  Output: .service-approval/<slug>/04-map/map-framework-parsed.json
```
