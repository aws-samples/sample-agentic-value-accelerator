---
name: map-framework-mapping
description: Map generated controls to framework objectives with per-objective analysis, confidence scoring, and strict quality gates. Produces map-framework-mapped.json consumed by map-assemble. The hardest sub-skill — requires careful per-objective reasoning, not batch keyword matching.
disable-model-invocation: false
argument-hint: '[--service=<name>]'
---

# Service Approval — Map: Framework Mapping

Map each generated control to framework objectives individually. This is the most reasoning-heavy
sub-skill in the map pipeline. It produces quality-gated framework mappings with rationale.

**Inputs:**
- `.service-approval/<slug>/04-map/map-framework-parsed.json` — normalized framework objectives
- `.service-approval/<slug>/04-map/map-controls-generated.json` — controls with rich metadata

**Output:** `.service-approval/<slug>/04-map/map-framework-mapped.json`
**Schema:** `schemas/map-framework-mapped.schema.json` — encodes status enum strictly `MAPPED` or `N/A` (iter-14 Class F15-revised), coverage enum, `control_id` pattern matching map-controls-generated, and per-mapping required fields. See also the "Schema rules" section below.

This is one of 4 focused map sub-skills. Each writes to a separate intermediate state file.

---

## Prerequisites

```bash
test -f .service-approval/<slug>/04-map/map-framework-parsed.json && echo "framework: OK" || echo "ERROR"
test -f .service-approval/<slug>/04-map/map-controls-generated.json && echo "controls: OK" || echo "ERROR"
```

Load both inputs:
```bash
python3 -c "
import json
fw = json.load(open('.service-approval/<slug>/04-map/map-framework-parsed.json'))
cg = json.load(open('.service-approval/<slug>/04-map/map-controls-generated.json'))
print(f'Framework: {fw[\"framework\"][\"name\"]} — {len(fw[\"framework_objectives\"])} objectives')
print(f'Controls: {len(cg[\"controls\"])}')
"
```

---

## Context Available to This Skill

For each control, you have access to:
- `description` — what the control does
- `mechanism` — the AWS enforcement mechanism
- `security_rationale` — 2-3 sentence reasoning chain from mitigation goal to enforcement
- `framework_keywords` — domain/mechanism keywords for candidate matching
- `condition_keys`, `actions`, `resource_types` — technical details
- `mitigation_ids`, `parameters_controlled` — traceability

**The `security_rationale` field is your PRIMARY context.** It explains why this control exists
and what security goal it achieves. Use it to reason about framework objective alignment instead
of relying on keyword matching alone.

---

## Phase 1: Map Controls to Framework Objectives

Iterate over EVERY `framework_objectives[]` entry. For each objective:

### 1.1 Per-objective analysis (REQUIRED)

**CRITICAL — Do NOT batch-map controls to entire domains.** Each individual objective MUST be
evaluated separately, even when objectives share a domain. The rationale for mapping CTRL-X to
IAM-01 must be different from IAM-02, because the objectives ask different things.

**Step 1: Read the objective specification.** For each framework objective, read its full title
AND specification text. Understand what the objective actually requires — not just which domain
it's in.

**Step 2: Build candidate control list.** Use `framework_keywords` from each control to build
an initial candidate list. Then read each candidate's `security_rationale` to assess fit.

**Step 3: Evaluate each candidate individually.** For each candidate control:
- Does this control's specific mechanism directly address what the objective is asking for?
- Read the `security_rationale` — does the reasoning chain connect to the objective's requirement?
- Write a 1-sentence `rationale` explaining the SPECIFIC connection.

**Rationale quality rules:**
- GOOD: "SCP denies CreateMemory without KmsKeyArn, directly enforcing encryption key generation requirements"
- BAD: "Addresses Encryption and Key Management Policy and Procedures" (just restating the objective title)
- BAD: "Addresses Key Generation" (too vague, no mechanism mentioned)
- The rationale MUST mention the control's mechanism (SCP deny, Config rule check, KMS key policy, etc.)
- The rationale MUST NOT be the objective title or a rephrasing of it

**Step 4: Assign confidence based on specificity:**
- **High**: The control's mechanism directly implements what the objective requires
  (e.g., KMS key policy -> CEK-10 "Key Generation")
- **Medium**: The control contributes to the objective but doesn't fully implement it
  (e.g., Config CMK check -> CEK-09 "Encryption Audit" — detects but doesn't enforce)
- **Low**: The control is tangentially related through shared domain only
  (e.g., tag policy -> IAM-03 "Identity Inventory" — tags support inventory but aren't identity management)

**Step 5: If no controls have a specific rationale**, mark the objective as:
- **N/A** with a reason (e.g., "Managed by AWS under shared responsibility",
  "Organisational HR control", "No backup/DR API for this service")

### 1.2 Coverage assignment (confidence-coverage consistency)

After mapping controls to an objective, assign coverage using these HARD RULES:

| Highest confidence among mapped controls | Maximum coverage level |
|------------------------------------------|----------------------|
| High                                      | FULL                 |
| Medium (no High)                          | PARTIAL              |
| Low (no Medium or High)                   | SUPPORTS             |
| No controls                               | N/A                  |

- `FULL` requires at least one `High` confidence control
- `PARTIAL` requires at least one `Medium` confidence control
- `SUPPORTS` is the maximum for objectives with only `Low` confidence controls
- Never assign `FULL` when all controls are `Low` confidence

---

## Phase 2: Quality Gates (MANDATORY)

All rules below are HARD RULES — violations are validation failures that MUST be fixed before
writing output.

### Rule 1 — Confidence-coverage consistency
Already enforced in Phase 1 Step 5. Verify with validation script.

### Rule 2 — No domain-level spray mapping
If **any** two consecutive objectives in the same domain have the EXACT same set of control IDs
mapped, this is a spray signal requiring review. If **three or more** consecutive objectives in
the same domain share identical control sets, this is a hard validation failure.

Each objective within a domain asks a different question — the control set SHOULD differ. When
objectives share controls, each mapping MUST have a distinct rationale referencing the specific
objective requirement. Iteration 15 had 13 spray clusters (e.g., AIS-01 through AIS-06 all
mapping to the same 2 controls, BCR-01 through BCR-11 all mapping to 1 control).

**How to fix:** For each spray cluster:
1. Read each objective's specification — they ask different things
2. For objectives where the controls genuinely apply, write unique rationales
3. For objectives where controls DON'T apply, remove the mapping and mark N/A if no other controls fit
4. For domains like BCR (backup/DR) where the service has no relevant API, mark most objectives N/A
   rather than mapping a single weak control to every objective in the domain

### Rule 3 — No single control mapped to >15 objectives
If a control appears in more than 15 framework_mapping entries, review every mapping individually.
Most controls are specific enough that they should map to 3-8 objectives. >15 indicates keyword
spray, not genuine alignment.

**How to fix:** For each mapping where this control appears:
1. Re-read the objective specification
2. Re-read the control's `security_rationale`
3. If you cannot write a specific rationale connecting them, REMOVE the mapping
4. Prioritize: keep the mapping where the control's mechanism most directly addresses the objective
5. Target: each control should map to 3-12 objectives

### Rule 4 — Organizational process domains
Framework objectives about organizational processes MUST NOT be mapped to purely technical controls:

- **BCR domain** (BCR-01 to BCR-11): Cover backup plans, DR exercises, communication plans.
  Only map to controls that DIRECTLY implement backup, replication, or DR capabilities —
  NOT generic infrastructure controls. Multi-AZ != backup. Multi-AZ != DR exercise.
- **HRS, DCS, UEM, STA domains**: Almost always N/A for cloud service technical controls.
- **GRC domain**: Only map to controls implementing governance automation (Config rules for
  compliance, tag policies for classification) — not operational controls.
- **AIS domain**: Application security PROCESSES (design reviews, security testing). Only map
  controls that enforce secure deployment patterns or automated security checks.

### Rule 5 — Rationale required and mechanism-consistent
Every control-to-objective mapping MUST include a `rationale` string. Additionally:

**5a — Rationale-control consistency:** The rationale MUST describe the mechanism of the
MAPPED control, not a different control. After writing each mapping:
1. Look up the mapped `control_id` in the controls
2. Confirm the rationale describes THAT control's specific mechanism
3. If the rationale describes a different control's mechanism, fix the rationale or the control_id
4. Common error: mapping CTRL-RES-PRV-004 (VPC endpoint policy) but writing a rationale about
   aws:SecureTransport (which is CTRL-RES-PRV-003)

### Rule 6 — Max controls per objective at High confidence
If more than 5 controls map to a single objective at `High` confidence, review each individually.
Bulk high-confidence mapping indicates overly broad keyword matching.

### Rule 7 — Orphaned control review
After building the initial mapping, check for controls not mapped to any objective. For each:
1. Read the control's mechanism and `security_rationale`
2. Search framework objectives for alignment by mechanism (not just domain keyword)
3. If a genuine match exists, add the mapping with a specific rationale
4. Only leave a control orphaned if it truly has no framework objective match

---

## Phase 3: Domain Keyword Guide

Use as a STARTING POINT for candidate controls, then apply per-objective evaluation:

| Keywords in objective | Primary domain | Candidate control types |
|----------------------|---------------|----------------------|
| Access/Identity/Role/Principal/Auth | IAM | IAM policies, SCPs, permission boundaries |
| Encryption/KMS/CMK/TLS/Certificate | CEK | KMS key policies, encryption configs |
| Network/VPC/Subnet/Endpoint/Firewall | IVS | VPC endpoints, SGs, network policies |
| Logging/CloudTrail/CloudWatch/Audit | LOG | CloudTrail, CloudWatch, logging configs |
| Tagging/Owner/Classification/Governance | GRC | Tag policies, Config rules |
| Config Rule/Compliance | A&A | Config rules, conformance packs |
| Backup/Recovery/Resilience/Multi-AZ | BCR | Only if service has backup/DR API |
| Change/Configuration/Baseline/Drift | CCC | Config rules, Guard rules, drift detection |
| Vulnerability/Patch/Scan | TVM | Vulnerability scanning, patching automation |
| Incident/Forensics/Response | SEF | CloudTrail, alarms, runbooks |
| Data/Privacy/PII/Classification | DSP | Encryption, tagging, data lifecycle |
| AI/ML/Model/Guardrail/Prompt | AIS | Only secure deployment pattern controls |

---

## Phase 4: Write Output

Write `.service-approval/<slug>/04-map/map-framework-mapped.json`:

```json
{
  "schema_version": "1.0",
  "framework_mapping": [
    {
      "objective_id": "IAM-01",
      "domain": "Identity & Access Management",
      "title": "Identity and Access Management Policy and Procedures",
      "status": "MAPPED",
      "coverage": "FULL",
      "reason": "Multiple preventive and detective controls enforce IAM policies for this service",
      "controls": [
        {
          "control_id": "CTRL-ACC-PRV-001",
          "confidence": "High",
          "rationale": "Permission boundary restricts service actions to approved set, directly implementing least-privilege access provisioning"
        }
      ]
    },
    {
      "objective_id": "DCS-01",
      "domain": "Datacenter Security",
      "title": "...",
      "status": "N/A",
      "coverage": "N/A",
      "reason": "Physical datacenter security is managed by AWS under the shared responsibility model",
      "controls": []
    }
  ],
  "framework_coverage_summary": {
    "total_objectives": 197,
    "mapped": 137,
    "not_applicable": 60,
    "by_domain": {
      "IAM": { "total": 16, "mapped": 14, "not_applicable": 2, "coverage_percentage": 87.5 },
      "CEK": { "total": 21, "mapped": 19, "not_applicable": 2, "coverage_percentage": 90.5 }
    }
  },
  "quality_gate_results": {
    "rule_1_confidence_coverage": "PASS",
    "rule_2_no_spray": "PASS",
    "rule_3_max_15_per_control": "PASS",
    "rule_4_org_process_domains": "PASS",
    "rule_5_rationale_present": "PASS",
    "rule_6_max_5_high_per_objective": "PASS",
    "rule_7_orphan_review": "PASS",
    "orphaned_controls": []
  }
}
```

**Schema rules:**
- `framework_mapping` MUST include ALL objectives (mapped + N/A) — every one from map-framework-parsed.json
- Each entry MUST have: `objective_id`, `domain`, `title`, `status`, `coverage`, `reason`, `controls`
- `status` MUST be EXACTLY `"MAPPED"` or `"N/A"` — case-sensitive, no substitutes.
  Do NOT use `"UNMAPPED"`, `"NOT_APPLICABLE"`, `"n/a"`, or any other variant. Downstream
  validators (`validate_state.py` CHECK-S13 at line 892; `validate_pipeline_integrity.py`
  at line 263) count `status == "N/A"` verbatim for summary metrics and rationale-completeness
  checks; other tokens silently bypass those checks. `validate_state.py` also enum-validates
  `status` at CHECK-S13 — unknown values now fail fast.
- `controls[]` MUST be array of `{control_id, confidence, rationale}` objects
- `confidence` MUST be EXACTLY one of `"High"`, `"Medium"`, `"Low"` — PascalCase, case-sensitive.
  Do NOT emit `"high"`, `"medium"`, `"low"` or any other variant; the schema's enum is tightened
  to PascalCase only (MR-8 review). Every iter-14 through iter-18 archive uses PascalCase
  exclusively, so this rule documents what the skill has always produced.
- `rationale` is REQUIRED on every control mapping
- `framework_coverage_summary` MUST be populated with per-domain breakdown
- `quality_gate_results` MUST report PASS/FAIL for each rule
- `orphaned_controls` lists control IDs not mapped to any objective

---

## Framework-Agnostic Design

This skill works with ANY control framework, not just CCMv4. The framework objectives
come from `map-framework-parsed.json` which is produced by the `map-parse-framework`
sub-skill. Supported formats:
- CCMv4 (Cloud Controls Matrix v4)
- NIST 800-53 rev5
- CIS Benchmarks
- ISO 27001:2022
- Custom frameworks (any Excel/JSON/Markdown with objective IDs + descriptions)

The mapping logic uses the objective's `description` and `control_specification` text
to match against control `rationale` and `description`. No framework-specific keywords
are hardcoded — the same confidence scoring works across all frameworks.

**Quality cap:** No control may map to more than 5 objectives. If a control matches >5,
keep only the 5 highest-confidence matches. This prevents spray-mapping where generic
controls (like tagging) map to every objective.

## Validate Output

Output validation runs automatically via PostToolUse hook. The JSON Schema (see Schema above) hard-fails on status / coverage / control_id drift per the enum details at "Schema rules". `validate_state.py::check_framework_mapped` retains the 7 quality-gate rules (Rule 1 confidence-coverage consistency, Rule 2 domain spray, Rule 3 ≤15 objectives per control, Rule 5 rationale required, Rule 6 ≤5 High per objective, Rule 7 orphaned controls) plus cross-file lookups against map-controls-generated and map-framework-parsed.

## Print Summary

```
Map (Framework Mapping) complete:
  Framework: {name} — {total} objectives
  Mapped: {mapped} ({mapped_pct}%)
  N/A: {na}
  Quality gates: all PASS
  Orphaned controls: {count}
  Output: .service-approval/<slug>/04-map/map-framework-mapped.json
```
