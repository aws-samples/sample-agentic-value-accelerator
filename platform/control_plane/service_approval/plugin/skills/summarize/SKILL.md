---
name: summarize-v3
description: Produce final APPROVAL-REPORT.md with framework coverage matrix, mitigation traceability, control inventory, test evidence, and verdict
disable-model-invocation: false
---

# Service Approval — Summarizer v3

Read all state files and generate the final approval report at `.service-approval/<slug>/07-summarize/APPROVAL-REPORT.md`.

## Prerequisites

- [ ] **Hard gate — verify the phases summarize depends on:**
  ```bash
  python3 -m tools.validate.check_phase_complete --slug <slug> --phase 01-assess || exit 2
  python3 -m tools.validate.check_phase_complete --slug <slug> --phase 03-validate || exit 2
  python3 -m tools.validate.check_phase_complete --slug <slug> --phase 04-map || exit 2
  test -d .service-approval/<slug>/05-generate || { echo "ERROR: run generator first"; exit 2; }
  ```
  Phase 6 (Test) is OPTIONAL — proceed even if 06-test/ is absent (mark test
  as NOT RUN in the report). The summarize skill must NOT pre-gate Phase 6
  because intake's testing.mode=skip is a legitimate path that skips Phase 5.

## Step 1: Determine verdict

Read `validated.json` for `unverified_count`. Read `test-results.json` if it exists.

| Condition | Verdict |
|-----------|---------|
| `test_results.passed = true` AND `unverified_count = 0` | APPROVED |
| `test_results.passed = true` AND `unverified_count > 0` | APPROVED WITH EXCEPTIONS |
| `test_results.skipped = true` AND `unverified_count = 0` | APPROVED (test not run) |
| `test_results.passed = false` | REQUIRES REMEDIATION |
| `test-results.json` absent | APPROVED (test not run) |

Note: `passed: null` (dry-run) is treated the same as `skipped: true`.

## Step 2: Build framework coverage matrix

Read `mapping-results.json` `framework_mapping[]`. Build a table:

| {Framework} Objective ID | Title | Domain | Satisfied By | Coverage |

Where "Satisfied By" = comma-separated control IDs that map to this framework objective.
Use the framework name dynamically from `mapping-results.json.framework.name`.

## Step 3: Build mitigation traceability matrix

Read `mapping-results.json` `threat_mitigation_map[]`. Build a table:

| Mitigation ID | Statement | Resource Type | Controls | Framework Objectives | Coverage |

Where "Statement" = `statement` field.
Where "Controls" = `control_ids[]` from the mitigation entry (joined, comma-separated).
Where "Framework Objectives" = `framework_objectives[]` from the mitigation entry. If this field
is absent, derive it: for each control id in the mitigation's `control_ids[]`, look up that control
in the top-level `controls[]` and collect its `framework_objectives[]`. Deduplicate and sort.

This shows end-to-end traceability from customer mitigations through controls to framework objectives.

## Step 4: Build control inventory

For each file in `.service-approval/<slug>/05-generate/`, read its `_metadata` or header comments
(lines starting with `# SCOPE:`, `# LAYER:`, `# CONTROLS:`, `# FRAMEWORK:`).

Build a table per layer:
| Layer | Scope | Artifact | Controls | Framework Objectives |

## Step 5: Build artifact manifest

```bash
find .service-approval/<slug>/05-generate -type f | sort
```

## Step 6: Write APPROVAL-REPORT.md

**CRITICAL — Terminology rules for the report:**
The APPROVAL-REPORT.md is a customer-facing document. NEVER use internal/pipeline terms:
- NO: "service approval pipeline", "pipeline generated" → YES: "47 security controls were generated"
- NO: "--skip-test flag", "--clean flag" → YES: "Testing was deferred for this assessment"
- NO: "deployment pipeline" → YES: "deployment process"
- NO: MCP tool names, skill names, agent names
- NO: internal file names ("validated.json", "mapping-results.json", "research.json") → YES: "all capabilities were verified"
- NO: "unverified_count = 0" → YES: "all items verified"
- Apply all terminology rules from CLAUDE.md (see Terminology Rules section)

Write `.service-approval/<slug>/07-summarize/APPROVAL-REPORT.md` with these sections.
Section headings are H2 (`##`) — the report's top-level title `# Service Approval
Report — {Service}` is H1, so all section headers under it are H2. Downstream
consumers (`skills/evidence/SKILL.md` awk extraction, `validate_pipeline_integrity.py`
P6 verdict-consistency check) anchor on H2; writing H3 here silently breaks both.

## Verdict
[Verdict string with date, service name, resource count]

## Executive Summary
[Coverage numbers: N controls generated, N framework objectives covered, N mitigations addressed, test result]

## Security Posture Assessment
**Include this section only if `assessment-summary.md` exists.**
- Extract GAPS Summary from assessment-summary.md (total gaps, total customer actions)
- List each domain's gap count: IAM ({N}), LOGGING ({N}), INFRA ({N}), DATA ({N}), INCIDENT ({N})
- For each REQUIREMENT GAP: show whether a control was generated to address it
  (from mapping-results.json controls with `assessment_gap_ids[]`)
- Include checkpoint verification summary from checkpoint-results.json (if available):
  RCP: {Yes/No}, FIPS: {Yes/No}, Declarative Policies: {Yes/No}, RAM: {Yes/No}

## Framework Coverage Matrix ({framework-name})
[Full table from Step 2 — all framework objectives, mapped or N/A]
Use the framework name dynamically from `mapping-results.json.framework.name`:
- Default (no input, interactive intake): "CSA CCMv4 Coverage Matrix"
- Customer NIST file (CLI `--framework=nist` only): "NIST 800-53 Coverage Matrix"
- Customer CIS file (CLI `--framework=cis` only): "CIS Benchmarks Coverage Matrix"
- Customer ISO file (CLI `--framework=iso` only): "ISO 27001 Coverage Matrix"
- Customer custom file: "Custom Framework Coverage Matrix"

> Note: as of 2026-05-16, interactive runs are narrowed to CCMv4 by intake.
> The non-CCMv4 branches above are reachable only when an advanced operator
> bypasses intake with `--framework=<type>`.

## Mitigation Traceability
[Full table from Step 3 — all customer mitigations with control and framework mappings]
Include coverage summary: N/N mitigations fully covered, N partially covered, N uncovered.

## Threat Model Coverage
**Include this section only if `mapping-results.json` contains `attack_coverage`.**

This section renders threat model coverage regardless of which threat model was used as input
(MITRE ATT&CK, custom STRIDE model, organizational threat catalog, etc.). The section title
and content adapt based on the `attack_coverage` data:

- Read `attack_coverage.attack_matrix_version` for the threat model version
- Read `attack_coverage.attack_matrix_source` for the source file name (if present)
- Use the threat model name from the source file or default to "Threat Model"

**Section title:** Use the threat model name dynamically (mirrors the 5-case
naming-rules table in `skills/research-attack-surface/SKILL.md`):
- If source contains "MITRE" or "ATT&CK" (or is the default `data/attack-cloud-matrix.json`) → "MITRE ATT&CK Threat Coverage (v{version})"
- If source contains "STRIDE" → "STRIDE Threat Coverage"
- If hybrid (multiple sources merged, e.g. MITRE + STRIDE) → "{combined_name} Threat Coverage" (e.g. "MITRE ATT&CK + STRIDE Threat Coverage")
- If source is a custom file → "Threat Model Coverage ({source_filename})"
- If no threat model source can be identified → "Threat Model Coverage"

Build a tactic/category heat map showing control coverage:

```
| Tactic / Category | Techniques | Covered | Coverage |
|-------------------|-----------|---------|----------|
| Initial Access (TA0001) | 3 | 2 | ██████░░ 67% |
| Execution (TA0002) | 2 | 2 | ████████ 100% |
| Persistence (TA0003) | 3 | 1 | ██░░░░░░ 33% |
[repeat for each tactic/category with applicable techniques]
```

Include a "Threat Gaps" sub-section listing uncovered HIGH-applicability techniques/threats:
- Technique/threat ID, name, and which categories it maps to
- Recommended control type to address the gap
- Priority (based on applicability: HIGH = immediate, MEDIUM = short-term)

**If `customer_stride_profile` exists in `research-attack-surface.json`**, also include a
STRIDE coverage summary showing which STRIDE categories have controls addressing them:

```
| STRIDE Category | Mitigations Referenced | Techniques Mapped | Controls Covering |
|-----------------|----------------------|-------------------|-------------------|
| Spoofing | M-AgentRuntime.0, ... | T1078.004, T1199 | CTRL-005, CTRL-006 |
[repeat for each STRIDE category]
```

## Control Inventory
[Per-layer table from Step 4, organized by Controls Matrix cell]

## Test Evidence
[Config rule finding count, Config compliance status, mitigation coverage %, framework coverage % — or "Test not run" if skipped]

## UNVERIFIED Items
[List with reasons, or "None — all items verified" if unverified_count = 0]

## Artifact Manifest
[Full file list from Step 5]

## Evidence & Attestation
**NEW:** If `.service-approval/<slug>/08-evidence/` exists, append this section:

Runtime validation complete. Phase 7 Evidence runner executed CLI probes against deployed resources to verify each control is enforced. See:
- `08-evidence/attestation-report.md` — control x CLI x verdict matrix
- `08-evidence/attestation-results.json` — machine-readable verdicts
- `08-evidence/summary.md` — top-level triage digest

Evidence coverage: {pass_count} / {total_controls} controls verified PASS, {not_cli_validatable_count} NOT_CLI_VALIDATABLE.

Otherwise, omit this section (Evidence phase was not run).

## Next Steps
Deployment order:
1. **Org level**: Apply SCPs, RCPs, tag policies via AWS Organizations
2. **Account level**: Deploy Config conformance pack, Config rules, Access Analyzer
3. **Service level**: Deploy CloudFormation Hooks, Config org rules
4. **Resource level**: Deploy detective controls (EventBridge, CloudWatch alarms, Lambda remediator), then create the compliant resource using the IaC template in `05-generate/iac/`

## Manual Deploy Commands

**Render this section only when `intake-manifest.json.testing.mode == "manual-cli"`.**

The user opted out of automated Phase 5 testing and asked for per-format deploy
commands. Inspect `.service-approval/<slug>/05-generate/iac/` and emit only the commands that
match formats actually present. Always use placeholders (`<STACK_NAME>`,
`<AWS_PROFILE>`, `<AWS_REGION>`) — never substitute a real profile name.

```bash
python3 - <<'PY'
import json
from pathlib import Path

manifest = Path(f".service-approval/{slug}/00-intake/intake-manifest.json")
if not manifest.exists():
    raise SystemExit(0)
mode = json.loads(manifest.read_text()).get("testing", {}).get("mode")
if mode != "manual-cli":
    raise SystemExit(0)

iac = Path(f".service-approval/{slug}/05-generate/iac")
has_cfn       = any(iac.glob("*.cfn.yaml")) or any(iac.glob("*.yaml"))
has_terraform = (iac / "modules").exists()
has_cdk       = any(iac.rglob("*.ts")) and not (iac / "cdktf").exists()
has_cdktf     = (iac / "cdktf").exists() or any(iac.rglob("cdktf.json"))

blocks = []
if has_cfn:
    blocks.append(f"""**CloudFormation:**
```bash
aws cloudformation deploy \\
  --template-file .service-approval/{slug}/05-generate/iac/compliant-resource.cfn.yaml \\
  --stack-name <STACK_NAME> \\
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \\
  --profile <AWS_PROFILE>
```""")
if has_terraform:
    blocks.append(f"""**Terraform:**
```bash
cd .service-approval/{slug}/05-generate/iac
terraform init
terraform plan -out tfplan
terraform apply tfplan
```""")
if has_cdk:
    blocks.append(f"""**CDK TypeScript:**
```bash
cd .service-approval/{slug}/05-generate/iac
npm install
npx cdk bootstrap --profile <AWS_PROFILE>
npx cdk deploy --profile <AWS_PROFILE>
```""")
if has_cdktf:
    blocks.append(f"""**CDK for Terraform:**
```bash
cd .service-approval/{slug}/05-generate/iac/cdktf
npm install
npx cdktf deploy
```""")
if (Path(f".service-approval/{slug}/05-generate/responsive/lambda-remediator/template.yaml")).exists():
    blocks.append(f"""**Detective controls stack (deploy after compliant resource):**
```bash
aws cloudformation deploy \\
  --template-file .service-approval/{slug}/05-generate/responsive/lambda-remediator/template.yaml \\
  --stack-name <STACK_NAME>-detective \\
  --capabilities CAPABILITY_IAM \\
  --profile <AWS_PROFILE>
```""")

print("\n\n".join(blocks) if blocks else "No deployable IaC artifacts found.")
PY
```

Append the rendered blocks to `APPROVAL-REPORT.md` under this heading. Skip the
entire section when `testing.mode` is anything other than `manual-cli`.

## Pipeline-Complete Sentinel

After APPROVAL-REPORT.md is written, emit a terminal-state sentinel to
`pipeline.log`. This signals to the Stop hook (`validate_pipeline_integrity.py`
P1 check) that the run is finalized — the file is frozen, and remediation-only
checks like the MCP-call-count gate cannot be retroactively satisfied.
Without this sentinel, the Stop hook re-fires forever on completed runs that
happen to have a P1 violation in their pipeline.log.

Emit AFTER the report file is closed and AFTER the print summary, only when
Phase 7 Evidence is NOT in scope (Evidence's Step 11 owns the sentinel when
it runs). Detect Phase 7-in-scope by `intake-manifest.json.testing.mode ==
"full-deploy"`.

```bash
# Map verdict to sentinel form. Drop any parenthesized qualifier first so
# "APPROVED (test not run)" canonicalizes to "APPROVED" (the qualifier is
# audit-trail metadata, not a distinct verdict — see "Sentinel canonicalization"
# note below). Then uppercase and fold spaces/hyphens to underscores.
VERDICT_TAG=$(echo "<verdict>" \
    | sed -E 's/ *\(.*\)$//' \
    | tr '[:lower:]' '[:upper:]' | tr ' -' '__')
# e.g., "APPROVED with exceptions" -> "APPROVED_WITH_EXCEPTIONS"
# e.g., "APPROVED (test not run)"  -> "APPROVED"

python3 -m tools.validate.log \
    --slug <slug> \
    --phase 07-summarize \
    --source pipeline:complete \
    --verdict "${VERDICT_TAG}" \
    --message "summarize finalized; verdict=${VERDICT_TAG}"
```

**Sentinel canonicalization:** the validator's closed allowlist is
`APPROVED | APPROVED_WITH_EXCEPTIONS | REQUIRES_REMEDIATION`. Parenthesized
qualifiers in the verdict table (e.g., `APPROVED (test not run)`) are
*informational metadata*, not distinct verdicts — they describe which
subset of validation ran, not whether the run was approved. The sentinel
canonicalizes them away so the gate stays binary; consumers needing the
original qualifier read `APPROVAL-REPORT.md` directly, not the sentinel
token. Adding new parenthesized variants does NOT require validator
allowlist changes; adding a new bare verdict (e.g., a hypothetical
`PENDING`) does.

The validator anchors on the literal token `[pipeline:complete:<VERDICT>]`,
where `<VERDICT>` is uppercase letters with underscores. Mid-flight runs
without the sentinel still get the strict P1 check.

Print:
```
Report written: .service-approval/<slug>/07-summarize/APPROVAL-REPORT.md
Verdict: <APPROVED|APPROVED WITH EXCEPTIONS|REQUIRES REMEDIATION>
Framework: {name} — {mapped} / {total} objectives covered
Mitigations: {covered} / {total} addressed
Threat model: {threat_model_name} — {covered} / {total} techniques covered (if attack_coverage present)
Total control artifacts: N
```
