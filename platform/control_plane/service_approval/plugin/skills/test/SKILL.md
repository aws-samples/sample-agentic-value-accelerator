---
name: test
description: Deploy compliant resource template and validate zero Config rule findings. Requires AWS credentials.
disable-model-invocation: false
argument-hint: '[--env=<profile>] [--dry-run] [--timeout=<minutes>] [--no-evidence]'
---

# Service Approval — Tester

Deploy the generated compliant resource template and validate that it produces zero Config rule
findings and no Config compliance violations. Write results to `.service-approval/<slug>/06-test/test-results.json`.

## Stack lifecycle (Phase 5 ⇄ Phase 7)

**Phase 5 leaves the deployed stack alive when Phase 7 Evidence is in scope.**
Phase 7 reads `06-test/deployed-resources.json` and probes the stack via AWS CLI
to produce runtime attestation. Tearing down at the end of Phase 5 would leave
Phase 7 with `ResourceNotFoundException` on every probe.

| Condition | Phase 5 teardown |
|---|---|
| Default (Phase 7 in scope) | **DEFERRED** — Phase 5 passes `--keep` to smoke-deploy-test.sh; Phase 7 owns teardown |
| `--no-evidence` flag (Phase 7 skipped) | Phase 5 tears down at end (legacy behavior) |
| `--dry-run` | No deploy, no teardown |

The intake YAML's `testing.keep` field is now consumed by **Phase 7**, not Phase 5.
It controls whether Phase 7 tears down at the end of evidence collection.

## Prerequisites

- [ ] **Hard gate — verify upstream phases produced their outputs:**
  ```bash
  python3 -m tools.validate.check_phase_complete --slug <slug> --phase 04-map || exit 2
  # 05-generate has no flat-file outputs; check the dir is populated:
  test -d .service-approval/<slug>/05-generate || { echo "ERROR: run generator first"; exit 2; }
  ```
  Without this gate, /test would deploy whatever IaC the agent left around
  (or fail silently if nothing exists), wasting AWS resources.

- [ ] Parse flags:
  - `--env=<profile>`: AWS CLI profile (REQUIRED for full mode)
  - `--dry-run`: lint only, no deployment
  - `--timeout=<minutes>`: Config evaluation timeout (default: 30)
  - `--no-evidence`: skip Phase 7 (Phase 5 reverts to legacy teardown-on-success behavior)

## Dry-run mode (--dry-run or no --env)

Run the deployability validator (Tier 1 + Tier 2 if credentials available):

```bash
python3 tools/validate/validate_deployable.py \
  [--profile {env}] [--tier1-only] .service-approval/<slug>/05-generate/
```

**Without `--env`**: Runs Tier 1 only (static checks — JSON, YAML, terraform validate/fmt,
CDK/CDKTF tsc, py_compile, cfn-lint). No AWS credentials needed.

**With `--env=<profile>`**: Runs Tier 1 + Tier 2 (CloudFormation validate-template, IAM
Access Analyzer validate-policy for SCPs, identity policies, resource policies).

If credentials are missing when `--env` is provided, print instructions:
```
Run: aws sso login --profile <profile>
```

Write to `.service-approval/<slug>/06-test/test-results.json`:
```json
{
  "passed": null,
  "skipped": true,
  "skip_reason": "dry-run — deployability validation only",
  "tier1_result": "PASS|FAIL",
  "tier2_result": "PASS|FAIL|SKIPPED",
  "config_findings": null,
  "config_compliance": null,
  "cloudwatch_alarms_triggered": null,
  "deployed_resources": [],
  "teardown_status": "not_attempted"
}
```

## Full mode

### Step 1: Verify credentials

```bash
aws sts get-caller-identity --profile {env}
```
Display account ID and alias. Confirm with user before proceeding.
If account alias contains: prod, prd, production, live → ask for explicit double confirmation.

### Step 2: Deploy + verify via smoke-deploy-test.sh

DO NOT invoke `aws cloudformation deploy` directly — the script handles the
deploy/verify cycle AND substitutes `${ACCOUNT_ID}` placeholders in
`smoke-test-params.json`. Invoking raw `aws deploy` bypasses the substitution
and fails with "ARN in the specified key policy is invalid."

**Default: pass `--keep` so Phase 7 can probe the deployed stack.**
Only omit `--keep` when `--no-evidence` was passed (legacy mode).

```bash
# Default — Phase 7 will tear down later
AWS_PROFILE="{env}" bash scripts/smoke-deploy-test.sh \
  --cloudformation --slug=<slug> --keep

# Legacy mode — Phase 5 tears down at end (no Phase 7)
AWS_PROFILE="{env}" bash scripts/smoke-deploy-test.sh \
  --cloudformation --slug=<slug>
```

The script:
1. Verifies AWS identity and refuses production-alias accounts.
2. Auto-discovers slug from `.service-approval/*/05-generate/iac/` (or uses `--slug`).
3. Resolves `${ACCOUNT_ID}` in `smoke-test-params.json` → a temp file.
4. `aws cloudformation deploy` with `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM`.
5. Verifies stack outputs inline.
6. With `--keep`: prints stack name and exits PASS without teardown.
   Without `--keep`: `aws cloudformation delete-stack` + `wait stack-delete-complete`.

Capture the stack name and outputs from the script's stdout — they're written to
`deployed-resources.json` in Step 6 for Phase 7 to consume.

Exit code 0 = PASS, 1 = deploy failed, 2 = teardown failed (only meaningful
when `--keep` was NOT passed).

### Step 3: Detective-stack deploy (SKIP for now)

Deploying the generated Config rules is handled by
`python3 scripts/smoke-deploy-controls.py --tier 2` as a separate smoke-test
step, not by this skill. The `/test` skill focuses on compliant-resource
deployability + coverage verification. If you need end-to-end Config-rule
evaluation, run `smoke-deploy-controls.py --tier 2` after Step 2 succeeds.

### Step 4: Evaluate results

Script exit code from Step 2:
- 0 → deploy PASSED (and teardown PASSED if no `--keep`; teardown DEFERRED if `--keep`)
- 1 → deploy FAILED (check script stdout for `describe-stack-events` output)
- 2 → teardown FAILED (only when `--keep` was NOT passed; resources may remain)

### Step 4b: Coverage Verification

**Single source of truth for "control has deployed artifact" is
`scripts/smoke-check-traceability.py`.** That script already indexes every
control ID by scanning BOTH filenames AND file contents (first 64KB of each
`.json`, `.yaml`, `.py`, `.tf`, `.ts`, `.rego`, `.guard`, `.md`), which
correctly handles multi-control artifacts like `opa-policies/function.rego`,
`cloudwatch-alarms.json`, `scp-policy.json`, `iam-policies.json` where
`_metadata.controls[]` lists several IDs in one file.

Do NOT re-implement filename-only `_has_deployed_artifact(control_id)` in this
skill. That heuristic produces false negatives when one artifact covers
multiple controls — the symptom is a deflated "framework coverage %" in
`test-results.json`.

**Procedure:**

```bash
# Run the traceability script; it prints control-to-file indexing stats
# AND writes a machine-readable index JSON used below.
python3 scripts/smoke-check-traceability.py > /tmp/traceability.txt
```

Parse `scripts/smoke-check-traceability.py`'s output for:
- `file_control_ids` — the set of control IDs found in ANY file (filename or content).
- `missing_ids` — control IDs in mapping-results with NO deployed artifact.

Then compute the three coverage figures from `mapping-results.json`:

**Mitigation coverage:**
- For every entry in `threat_mitigation_map[]`:
  - `has_artifact = any(cid in file_control_ids for cid in threat.control_ids)`
  - If `coverage == "NONE"` OR no controls have artifacts, flag uncovered.
- `mitigation_coverage = covered / total`.

**Framework coverage:**
- For every entry in `framework_mapping[]` where `status == "MAPPED"`:
  - `has_artifact = any(c.control_id in file_control_ids for c in objective.controls)`
  - If no mapped control has an artifact, flag the objective.
- `framework_coverage = objectives_with_artifacts / total_mapped`.

**Assessment gap coverage (if mapping-results.json references assessment gaps):**
- For controls linked to `assessment_gap_ids[]`, verify presence in `file_control_ids`.
- Flag any assessment gap without at least one deployed control artifact.

Rationale: `smoke-check-traceability.py` is the single authoritative indexer.
Duplicating its logic here leads to silent coverage drift when one skill
evolves and the other doesn't.

### Step 5: Teardown handoff to Phase 7

When this skill ran with `--keep` (default — Phase 7 in scope):
- The CFN stack is **alive**. Do NOT call `delete-stack` here.
- Step 6 records `teardown_status: "deferred_to_phase_7"` in test-results.json.
- Step 6 writes `deployed-resources.json` with the live stack ID + ARNs so
  Phase 7's `synthesize.py` can probe the resources.
- Phase 7 (skills/evidence/SKILL.md, Step 11) tears down at the end of evidence
  collection unless `intake-manifest.json.testing.keep == true`.

When this skill ran without `--keep` (`--no-evidence` mode):
- `smoke-deploy-test.sh` already tore down. If it exited with code 2, teardown
  failed — record the stack name in `test-results.json` under `teardown_status:
  "failed"` so operators can finish cleanup manually.

### Step 6: Write test-results.json

Write `.service-approval/<slug>/06-test/test-results.json`:
```json
{
  "passed": true,
  "skipped": false,
  "skip_reason": null,
  "config_findings": {
    "total": 0,
    "by_resource": {},
    "filtered_ambient": 3
  },
  "config_compliance": {
    "status": "COMPLIANT",
    "non_compliant_rules": []
  },
  "cloudwatch_alarms_triggered": 0,
  "deployed_resources": [
    { "type": "AWS::...", "arn": "arn:aws:..." }
  ],
  "mitigation_coverage": {
    "total": 37,
    "covered": 35,
    "uncovered": ["M-AgentRuntime.15", "M-Gateway.12"],
    "percentage": 94.6
  },
  "framework_coverage": {
    "total_mapped": 112,
    "with_deployed_artifacts": 110,
    "missing": ["CEK-19", "LOG-11"],
    "percentage": 98.2
  },
  "teardown_status": "deferred_to_phase_7"
}
```

`teardown_status` values:
- `"deferred_to_phase_7"` — Phase 5 ran with `--keep`; stack is alive; Phase 7 owns teardown.
- `"completed"` — Phase 5 ran without `--keep` and tore down successfully (`--no-evidence` mode).
- `"failed"` — Phase 5 attempted teardown and `wait stack-delete-complete` errored.
- `"not_attempted"` — Phase 5 was skipped (`--dry-run`).

Also write `.service-approval/<slug>/06-test/deployed-resources.json` (NEW - required for Phase 7 Evidence):

```json
{
  "schema_version": "1.0",
  "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/...",
  "region": "us-east-1",
  "deployed_at": "{ISO-8601 timestamp}",
  "resources": [
    {
      "logical_id": "{CloudFormation logical ID}",
      "cfn_type": "AWS::Lambda::Function",
      "arn": "arn:aws:lambda:us-east-1:123456789012:function:...",
      "name": "{resource name}"
    }
  ]
}
```

This file feeds Phase 7 Evidence runner for CLI probes against deployed resources.

Print summary:
```
Test complete:
  Config rule findings (filtered): N
  Config compliance: COMPLIANT/NON_COMPLIANT
  CloudWatch alarms triggered: N
  Deployed resources: N
  Mitigation coverage: N/N ({percentage}%)
  Framework coverage: N/N ({percentage}%)
  Teardown: deferred_to_phase_7 | completed | failed | not_attempted
  RESULT: PASS/FAIL
```

```bash
```

```bash
```

