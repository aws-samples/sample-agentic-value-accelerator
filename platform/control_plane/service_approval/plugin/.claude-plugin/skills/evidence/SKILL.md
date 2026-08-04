---
name: evidence
description: Run live AWS CLI probes against deployed compliant resources to prove each mapped control is enforced. Produces control x CLI x verdict matrix. Phase 7 of the pipeline.
disable-model-invocation: false
argument-hint: '[--service=<slug>] [--env=<profile>] [--with-negative-tests] [--replay] [--dry-run]'
---

# Evidence Skill — Phase 7 Runtime Verification

Run service-agnostic AWS CLI probes against deployed compliant resources to prove each mapped control is actually enforced at runtime. Produces a control → CLI → verdict matrix with raw command output logs.

## Inputs

### Required (from prior phases)
- `<slug>/06-test/test-results.json` — MUST have `test_results.passed == true`
- `<slug>/06-test/deployed-resources.json` — stack ID + per-resource ARNs
- `<slug>/04-map/mapping-results.json` — control roster
- `<slug>/03-validate/validated.json` — API surface + gateable_by metadata
- `<slug>/01-assess/sar-facts.json` — service_prefix

### Arguments
- `--service=<slug>` — service slug (e.g., `awslambda`). Defaults to reading from intake-manifest if only one service exists.
- `--env=<profile>` — AWS profile for CLI calls (defaults to `AWS_PROFILE` env var)
- `--with-negative-tests` — (optional) Deploy intentionally non-compliant resources and verify guardrails fire
- `--replay` — (optional) Re-run CLI commands without re-deploying (for debugging)
- `--dry-run` — (optional) Synthesize cli-commands.json but do NOT execute (for audit review)

## Preconditions

**Hard gate — Phase 7 needs Map outputs (control roster, framework
mapping) and Test outputs (deployed stack ARNs). Halt the run if either
phase is incomplete.**

```bash
SERVICE_SLUG="awslambda"  # or from --service flag

python3 -m tools.validate.check_phase_complete --slug "$SERVICE_SLUG" --phase 04-map || exit 2
python3 -m tools.validate.check_phase_complete --slug "$SERVICE_SLUG" --phase 06-test || exit 2

# Phase 5 contract — full-deploy must have produced deployed-resources.json
# (the explicit Phase 5 check_phase_complete above already gates on
# test-results.json, but deployed-resources.json is conditional on
# full-deploy mode and lives in 06-test/ — same phase dir, different file):
DEPLOYED_RESOURCES=".service-approval/${SERVICE_SLUG}/06-test/deployed-resources.json"
if [ ! -f "$DEPLOYED_RESOURCES" ]; then
  echo "ERROR: deployed-resources.json missing. Phase 7 needs it for stack ARN and resource list."
  echo "  If you ran /test in dry-run or skip mode, Phase 7 cannot proceed."
  echo "  Re-run /test in full-deploy mode (intake.testing.mode=full-deploy) first."
  exit 2
fi

# Confirm Phase 5 actually passed (no point probing a failed deploy):
PASSED=$(jq -r '.test_results.passed' ".service-approval/${SERVICE_SLUG}/06-test/test-results.json")
if [ "$PASSED" != "true" ]; then
  echo "ERROR: Phase 5 tests failed. Fix deployment before running evidence."
  exit 2
fi
```

## Steps

### Step 1: Service resolution

If `--service` is provided, use it directly. Otherwise:

```bash
# Find all service directories
SERVICE_DIRS=$(ls -d .service-approval/*/ 2>/dev/null | grep -v "_staging")
SERVICE_COUNT=$(echo "$SERVICE_DIRS" | wc -l | tr -d ' ')

if [ "$SERVICE_COUNT" -eq 1 ]; then
  SERVICE_SLUG=$(basename "$(echo "$SERVICE_DIRS" | head -1)")
else
  echo "ERROR: Multiple services found. Specify --service=<slug>"
  ls -d .service-approval/*/
  exit 1
fi
```

### Step 2: Load control roster

```python
import json
from tools.paths import phase_dir

slug = "awslambda"  # from Step 1
mapping_results_path = phase_dir(slug, "map") / "mapping-results.json"
with open(mapping_results_path) as f:
    mapping_results = json.load(f)

controls = mapping_results["controls"]
print(f"Loaded {len(controls)} controls from mapping-results.json")
```

### Step 3: Synthesize CLI commands

For each control, synthesize a CLI command or NOT_CLI_VALIDATABLE entry:

```python
from tools.evidence.synthesize import synthesize_all
from tools.paths import phase_dir
import json

# Load inputs
validated_path = phase_dir(slug, "validate") / "validated.json"
deployed_path = phase_dir(slug, "test") / "deployed-resources.json"
sar_path = phase_dir(slug, "assess") / "sar-facts.json"

with open(validated_path) as f:
    validated = json.load(f)
with open(deployed_path) as f:
    deployed = json.load(f)
with open(sar_path) as f:
    sar = json.load(f)

# Synthesize
cli_checks, not_cli_validatable = synthesize_all(
    mapping_results,
    validated,
    deployed,
    sar,
)

print(f"Synthesized {len(cli_checks)} CLI commands + {len(not_cli_validatable)} NOT_CLI_VALIDATABLE")
```

### Step 4: Write cli-commands.json

```python
from datetime import datetime, timezone
from tools.paths import phase_dir

evidence_dir = phase_dir(slug, "evidence")
evidence_dir.mkdir(parents=True, exist_ok=True)

cli_commands = {
    "schema_version": "1.0",
    "service": sar["service"],
    "service_slug": slug,
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "stack_id": deployed["stack_id"],
    "deployed_resources_ref": "../06-test/deployed-resources.json",
    "commands": [
        {
            "control_id": c.control_id,
            "family": c.family,
            "synthesis_source": c.synthesis_source,
            "command": c.command,
            "predicate": {
                "type": c.predicate_type,
                "expression": c.predicate_expression,
            },
            "expected_pass": c.expected_pass,
            "expected_fail": c.expected_fail,
            "output_log": c.output_log,
            "timeout_seconds": c.timeout_seconds,
        }
        for c in cli_checks
    ],
    "not_cli_validatable": [
        {
            "control_id": n.control_id,
            "reason": n.reason,
            "supplemental_evidence": n.supplemental_evidence,
        }
        for n in not_cli_validatable
    ],
}

cli_commands_path = evidence_dir / "cli-commands.json"
with open(cli_commands_path, "w") as f:
    json.dump(cli_commands, f, indent=2)

print(f"Wrote {cli_commands_path}")
```

### Step 5: Integrity gate

Validate cli-commands.json against its schema and verify 100% coverage:

```python
from tools.validate.validate_evidence import check_cli_commands

with open(cli_commands_path) as f:
    cli_commands_data = json.load(f)

errors = check_cli_commands(cli_commands_data)
if errors:
    print("ERROR: cli-commands.json validation failed:")
    for err in errors:
        print(f"  - {err}")
    exit(1)

# Verify 100% coverage
total_controls = len(controls)
total_synthesized = len(cli_commands_data["commands"]) + len(cli_commands_data["not_cli_validatable"])
if total_synthesized != total_controls:
    print(f"ERROR: Coverage gap — {total_controls} controls but only {total_synthesized} synthesized")
    exit(1)

print(f"✓ 100% coverage: all {total_controls} controls accounted for")
```

### Step 6: Execute probes (unless --dry-run)

If `--dry-run` is set, skip to Step 10. Otherwise:

```python
from tools.evidence.execute import execute_all

if not dry_run:
    print("Executing CLI commands...")
    attestation_results = execute_all(
        cli_commands_path,
        evidence_dir,
        timeout=30,
    )
    
    attestation_results_path = evidence_dir / "attestation-results.json"
    with open(attestation_results_path, "w") as f:
        json.dump(attestation_results, f, indent=2)
    
    print(f"Wrote {attestation_results_path}")
    print(f"Overall verdict: {attestation_results['overall_verdict']}")
else:
    print("Dry-run mode: skipping CLI execution")
```

### Step 7: Copy IaC-time evidence

Copy IaC validation logs from Phase 4/5 into 08-evidence/iac-time-evidence/:

```bash
mkdir -p "$EVIDENCE_DIR/iac-time-evidence"

# Copy logs if they exist
for log in cfn-guard.log opa-eval.log checkov.log cfn-lint.log; do
  if [ -f "$TEST_DIR/deploy-logs/$log" ]; then
    cp "$TEST_DIR/deploy-logs/$log" "$EVIDENCE_DIR/iac-time-evidence/"
  fi
done
```

### Step 8: Copy deploy evidence

Hardlink/copy deploy logs into 08-evidence/deploy-evidence/:

```bash
mkdir -p "$EVIDENCE_DIR/deploy-evidence"
cp -r "$TEST_DIR/deploy-logs/"* "$EVIDENCE_DIR/deploy-evidence/" 2>/dev/null || true
```

### Step 9: Render reports

```python
from tools.evidence.render_report import render_attestation_report, render_summary
from tools.evidence.render_attestation import render_attestation_guide

# attestation-report.md
render_attestation_report(
    attestation_results,
    evidence_dir / "attestation-report.md",
)

# summary.md
render_summary(
    attestation_results,
    evidence_dir / "summary.md",
)

# <slug>/attestation.md (reviewer's guide)
render_attestation_guide(
    slug,
    attestation_results,
    sar,
    mapping_results,
)

print("Rendered attestation reports")
```

### Step 10: Validate evidence outputs

```python
from tools.validate.validate_evidence import check_attestation_results

with open(evidence_dir / "attestation-results.json") as f:
    attestation_data = json.load(f)

errors = check_attestation_results(attestation_data)
if errors:
    print("ERROR: attestation-results.json validation failed:")
    for err in errors:
        print(f"  - {err}")
    exit(1)

print("✓ All evidence artifacts validated")
```

### Step 11: Teardown handoff

Phase 5 deferred teardown to Phase 7 (`teardown_status: "deferred_to_phase_7"`
in `06-test/test-results.json`). At this point, evidence has been collected;
the stack can be torn down unless the user explicitly opted to keep it.

**Read the user's keep preference from intake:**

```python
import json
from pathlib import Path

intake_path = Path(f".service-approval/{slug}/00-intake/intake-manifest.json")
keep = False
if intake_path.exists():
    with open(intake_path) as f:
        intake = json.load(f)
    keep = intake.get("testing", {}).get("keep", False)
```

**If `keep == true`:** skip teardown. Record `teardown_status:
"skipped_keep_true"` in `attestation-results.json`. Print stack name + ARN
prominently so the user knows what to clean up later.

**If `keep == false` (default):** tear down the stack referenced in
`06-test/deployed-resources.json`.

```bash
STACK_ID=$(jq -r '.stack_id' "<slug>/06-test/deployed-resources.json")
STACK_NAME="${STACK_ID##*/}"  # strip ARN prefix to get stack name
STACK_NAME="${STACK_NAME%/*}"  # strip stack id suffix

echo "Tearing down deployed stack: $STACK_NAME"
aws cloudformation delete-stack --stack-name "$STACK_NAME" --no-cli-pager
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --no-cli-pager
TEARDOWN_EXIT=$?

if [ $TEARDOWN_EXIT -eq 0 ]; then
  TEARDOWN_STATUS="completed"
  echo "✓ Stack $STACK_NAME deleted"
else
  TEARDOWN_STATUS="failed"
  echo "CRITICAL: stack delete failed — $STACK_NAME may remain."
  echo "Manual cleanup: aws cloudformation delete-stack --stack-name $STACK_NAME"
fi
```

**Update `attestation-results.json` with the teardown_status field:**

```python
attestation_data["teardown_status"] = teardown_status  # "completed" | "skipped_keep_true" | "failed"
attestation_data["stack_id"] = stack_id  # already there from earlier; ensure preserved
with open(evidence_dir / "attestation-results.json", "w") as f:
    json.dump(attestation_data, f, indent=2)
```

A `failed` teardown is a non-blocking warning — evidence is still valid; only
the cleanup step needs operator follow-up.

### Step 11b: Pipeline-Complete Sentinel

Phase 7 owns the terminal-state sentinel when Phase 5 ran in full-deploy mode
(otherwise summarize emitted it). The sentinel signals to the Stop hook
(`validate_pipeline_integrity.py` P1 check) that the run is finalized — the
file is frozen, and remediation-only checks cannot be retroactively
satisfied. Without this sentinel, the Stop hook re-fires forever on
completed runs.

Emit AFTER teardown completes (or is skipped) and AFTER attestation-results
is rewritten with the final teardown_status:

```bash
# Read the verdict from APPROVAL-REPORT.md (Phase 6 wrote it). The actual
# format is `## Verdict` H2 followed by a blank line and a bare bold line
# `**APPROVED WITH EXCEPTIONS**`. Strip the bold markers, drop any
# parenthesized qualifier (e.g., "APPROVED (test not run)" -> "APPROVED"
# for sentinel purposes), uppercase, fold spaces and hyphens to underscores.
VERDICT_TAG=$(awk '/^## Verdict/{getline; getline; print; exit}' \
    .service-approval/<slug>/07-summarize/APPROVAL-REPORT.md \
    | sed -E 's/^\*+//; s/\*+$//; s/ *\(.*\)$//' \
    | tr '[:lower:]' '[:upper:]' | tr ' -' '__')
# e.g., "**APPROVED WITH EXCEPTIONS**" -> "APPROVED_WITH_EXCEPTIONS"
# e.g., "**APPROVED (test not run)**" -> "APPROVED"

# Defensive guard: empty VERDICT_TAG fails loudly rather than emitting a
# malformed sentinel that the validator can't close P1 against.
if [ -z "${VERDICT_TAG}" ]; then
    echo "ERROR: could not extract verdict from APPROVAL-REPORT.md" >&2
    exit 1
fi

python3 -m tools.validate.log \
    --slug <slug> \
    --phase 08-evidence \
    --source pipeline:complete \
    --verdict "${VERDICT_TAG}" \
    --message "evidence finalized; teardown_status=${TEARDOWN_STATUS}; verdict=${VERDICT_TAG}"
```

The validator anchors on the literal token `[pipeline:complete:<VERDICT>]`.
If summarize already emitted the sentinel for this run (full-deploy + Phase 7
combination should not double-emit; intake-manifest gating prevents it), the
duplicate is harmless — the validator only checks for presence.

## Outputs

All written to `<slug>/08-evidence/`:

- `cli-commands.json` — synthesized CLI commands (pre-execution)
- `attestation-results.json` — post-execution verdicts
- `attestation-report.md` — human-readable control × verdict matrix
- `summary.md` — 2-paragraph triage digest
- `cli-outputs/*.log` — raw stdout/stderr per command (one file per control)
- `iac-time-evidence/*.log` — supplemental IaC validation logs from Phase 3/4
- `deploy-evidence/*.log` — deploy logs from Phase 5 (Test)

Plus at service root:

- `<slug>/attestation.md` — reviewer's audit guide (describes every artifact in the tree)

## Post-Execution Summary

Print a summary after completion:

```bash
PASS_COUNT=$(jq -r '.counts.pass' "$ATTESTATION_RESULTS")
FAIL_COUNT=$(jq -r '.counts.fail' "$ATTESTATION_RESULTS")
ERROR_COUNT=$(jq -r '.counts.error' "$ATTESTATION_RESULTS")
NCV_COUNT=$(jq -r '.counts.not_cli_validatable' "$ATTESTATION_RESULTS")
OVERALL=$(jq -r '.overall_verdict' "$ATTESTATION_RESULTS")

echo "===== Phase 7 Evidence Complete ====="
echo "Overall Verdict: $OVERALL"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo "  ERROR: $ERROR_COUNT"
echo "  NOT_CLI_VALIDATABLE: $NCV_COUNT"
echo ""
echo "Review:"
echo "  - $EVIDENCE_DIR/summary.md (quick triage)"
echo "  - $EVIDENCE_DIR/attestation-report.md (control matrix)"
echo "  - $SERVICE_ROOT/attestation.md (reviewer's guide)"
echo ""
echo "To re-run without re-deploying:"
echo "  python3 tools/evidence/replay.py --service=$SERVICE_SLUG --all"
```

## Error Handling

- **Missing Phase 5 outputs:** Fail fast with clear message to run `/test` first
- **Coverage gap:** If any control is silently dropped (not in commands[] or not_cli_validatable[]), HALT
- **CLI execution errors:** Verdict = ERROR, log error message, continue to next control
- **Schema validation failure:** HALT, print errors
- **AWS CLI not installed:** Verdict = ERROR with clear remediation message

## Debugging

To replay a single control's CLI command:

```bash
python3 tools/evidence/replay.py --service=awslambda --control=CTRL-ACC-PRO-010
```

To audit commands before execution:

```bash
/evidence --service=awslambda --dry-run
# Review 08-evidence/cli-commands.json
# If acceptable, re-run without --dry-run
/evidence --service=awslambda
```

## Notes

- **Service-agnostic:** All synthesis is by (mechanism, category, scope), never by service name
- **100% coverage invariant:** Every control MUST appear in either commands[] or not_cli_validatable[]
- **No AWS credentials required for --dry-run:** Synthesis only, no CLI execution
- **CLI commands are ARN-scoped:** Never broad — use deployed-resources.json as authoritative list
- **Raw output preservation:** Stdout/stderr stored verbatim; predicate evaluation is separate

## Success Criteria

Phase 7 succeeds if:
1. cli-commands.json validates against schema
2. 100% control coverage (no silently dropped controls)
3. attestation-results.json validates against schema
4. Overall verdict is PASS or acceptable PARTIAL (some NOT_CLI_VALIDATABLE but no FAIL)
5. All artifacts written to 08-evidence/

---

**Next Phase:** None — Phase 7 is the final verification step. The `/summarize` skill may optionally re-run to append evidence section to APPROVAL-REPORT.md.
