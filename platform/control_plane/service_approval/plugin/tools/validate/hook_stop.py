#!/usr/bin/env python3
"""
Stop hook: pipeline integrity + cross-artifact + deployability validation.

Runs three validators against `.service-approval/<slug>/05-generate/` when
the agent signals completion:

  - `validate_pipeline_integrity` (P1-P7) — strict-by-default; integrity
    errors always block (exit 2) regardless of VALIDATE_CROSS_STRICT.
  - `validate_cross` — cross-artifact integrity. Warns by default; set
    VALIDATE_CROSS_STRICT=1 to block.
  - `validate_deployable` — deployability. Tier-1 (static) always runs;
    Tier-2 (AWS API) runs only when AWS credentials are present. Warns
    by default; set VALIDATE_DEPLOYABLE_STRICT=1 to block.

Only fires if a service's controls directory exists.

Exit codes:
    0 — pass, or warnings reported (non-blocking)
    2 — strict mode: validation failed (errors on stderr); set
        VALIDATE_STRICT=0 to fall back to warn-only for cross/deploy
        checks. P1-P7 integrity checks always strict-block.

Self-suppression backstop: if the previous N consecutive hook:stop events for
a service are all `fail` with byte-identical `first_integrity` strings AND
nothing else changed in `pipeline.log` between them, exit 0 with a single
`hook:stop:snoozed` event instead of looping forever. This prevents the
17-hour identical-failure loop pathology where the harness re-fires Stop on
an idle agent turn that has no path to remediation. Reset triggers any time
real progress (any non-`hook:stop:fail` event) lands in pipeline.log.
"""

import json
import os
import re
import sys

# Allow sibling imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _hook_log import log_hook_fire  # noqa: E402

# Number of consecutive identical hook:stop:fail entries before snoozing.
# 3 = ~3-5 minutes of repeats (cadence is roughly 1 fire/minute when the
# harness is idle), short enough to act, long enough that a real
# in-progress fix-and-retry won't trip it.
_SNOOZE_THRESHOLD = 3
# Capture the JSON-encoded string value for first_integrity. The log writer
# emits each `extra` value through json.dumps, so the raw substring on the
# log line is itself a valid JSON string (quotes + escapes). Decode it before
# comparing to the in-memory current_first_integrity (which is a plain str).
_FIRST_INTEGRITY_RE = re.compile(r'first_integrity=("(?:[^"\\]|\\.)*")')


def _should_snooze(controls_dir: str, current_first_integrity: str | None) -> bool:
    """Detect the N-identical-fires loop.

    Reads `pipeline.log` at `<controls_dir>/../pipeline.log` (controls_dir
    is `<slug>/05-generate`; pipeline.log lives at `<slug>/pipeline.log`).

    Returns True iff:
      1. Last `_SNOOZE_THRESHOLD` hook:stop entries are all `fail`.
      2. Their `first_integrity` strings are byte-identical to one another
         AND to the current run's first_integrity.
      3. No other event types appear interleaved (real progress would
         emit skill/mcp/script events between hook fires).
    """
    if current_first_integrity is None:
        return False
    pipeline_log = os.path.join(os.path.dirname(controls_dir), "pipeline.log")
    if not os.path.isfile(pipeline_log):
        return False
    try:
        with open(pipeline_log) as f:
            lines = f.readlines()
    except OSError:
        return False

    # Walk backward; collect tail until we have N hook:stop entries OR hit a
    # non-hook:stop event (which resets the snooze).
    #
    # Any non-`hook:stop:fail` event resets — including events that land AFTER
    # the most recent fail (i.e., the most recent log line is a skill:end or
    # mcp:call). Earlier behavior only reset on events between fails, which
    # silently snoozed `[fail, fail, fail, skill:test:start]` and contradicted
    # the docstring's plain reading. Now matches the docstring.
    tail_fails: list[str] = []
    for ln in reversed(lines):
        if "[hook:stop:" in ln:
            if "[hook:stop:fail]" not in ln:
                # A pass/warn/snoozed entry resets — abort snooze check.
                return False
            tail_fails.append(ln)
            if len(tail_fails) >= _SNOOZE_THRESHOLD:
                break
        else:
            # Non-hook:stop event — real progress; reset regardless of
            # whether any fails have been collected yet.
            return False

    if len(tail_fails) < _SNOOZE_THRESHOLD:
        return False

    # All N tail entries must carry the same first_integrity as this run.
    # Log values pass through json.dumps, so decode each match before compare.
    for ln in tail_fails:
        m = _FIRST_INTEGRITY_RE.search(ln)
        if not m:
            return False
        try:
            decoded = json.loads(m.group(1))
        except json.JSONDecodeError:
            return False
        if decoded != current_first_integrity:
            return False
    return True


def main():
    cwd = os.getcwd()
    output_dir = os.path.join(cwd, ".service-approval")
    if not os.path.isdir(output_dir):
        sys.exit(0)

    # Find all service directories with controls
    service_dirs = []
    for item in os.listdir(output_dir):
        if item.startswith("_") or item == "plans":
            continue
        service_path = os.path.join(output_dir, item)
        if not os.path.isdir(service_path):
            continue
        # Check for 05-generate/ with actual control files
        controls_dir = os.path.join(service_path, "05-generate")
        if os.path.isdir(controls_dir):
            has_controls = any(
                os.path.isdir(os.path.join(controls_dir, subdir))
                for subdir in ("preventive", "detective", "responsive", "proactive")
            )
            if has_controls:
                service_dirs.append(controls_dir)

    if not service_dirs:
        sys.exit(0)

    # --- Run validations for each service ---
    from validate_cross import validate_all
    from validate_deployable import validate_deployable, check_aws_credentials
    from validate_pipeline_integrity import validate_pipeline
    from pathlib import Path

    has_creds, _ = check_aws_credentials()
    cross_errors = []
    deploy_errors = []

    for controls_dir in service_dirs:
        # Cross-validation
        cross_errors.extend(validate_all(controls_dir))

        # Deployability validation
        deploy_errors.extend(
            validate_deployable(controls_dir, tier1_only=(not has_creds))
        )

    # Pipeline integrity validation (runs once per repo, iterates services internally)
    integrity_errors = validate_pipeline(Path(cwd))

    all_errors = cross_errors + deploy_errors + integrity_errors

    if not all_errors:
        # Log a pass entry to each service's log so the audit trail isn't
        # silent on a clean run.
        for controls_dir in service_dirs:
            # controls_dir = .../service-approval/<slug>/05-generate
            log_hook_fire(
                "stop",
                "pass",
                "all integrity + cross + deploy checks passed",
                file_path=controls_dir,
            )
        sys.exit(0)

    # Strict-by-default: integrity failures always block.
    # Set VALIDATE_STRICT=0 to fall back to warn-only for cross/deploy checks.
    strict = os.environ.get("VALIDATE_STRICT", "1") != "0" or \
             os.environ.get("VALIDATE_CROSS_STRICT", "0") == "1" or \
             os.environ.get("VALIDATE_DEPLOYABLE_STRICT", "0") == "1" or \
             bool(integrity_errors)

    if strict:
        # Self-suppression check: if the previous N consecutive hook:stop
        # entries for any service in scope are all identical-failure with
        # this run's first_integrity, snooze instead of re-blocking. Audit
        # trail still records the suppression, and the next real progress
        # event (anything other than hook:stop:fail) resets it.
        current_first_integrity = (
            (integrity_errors[0][:200] if integrity_errors else None)
        )
        snooze_dirs = [
            d for d in service_dirs
            if _should_snooze(d, current_first_integrity)
        ]
        if snooze_dirs and len(snooze_dirs) == len(service_dirs):
            for controls_dir in service_dirs:
                log_hook_fire(
                    "stop",
                    "snoozed",
                    f"suppressing identical failure (threshold={_SNOOZE_THRESHOLD}); "
                    f"emit any non-hook:stop event in pipeline.log to reset",
                    file_path=controls_dir,
                    extra={
                        "first_integrity": current_first_integrity,
                        "first_cross": cross_errors[0][:200] if cross_errors else None,
                        "first_deploy": deploy_errors[0][:200] if deploy_errors else None,
                    },
                )
            print(
                f"hook:stop snoozed — {_SNOOZE_THRESHOLD} consecutive identical "
                f"failures with no progress between. Emit any other pipeline.log "
                f"event to re-arm.",
                file=sys.stderr,
            )
            sys.exit(0)

        # Block: send errors to stderr so Claude can auto-fix
        if integrity_errors:
            print(f"PIPELINE INTEGRITY FAILED ({len(integrity_errors)} errors):", file=sys.stderr)
            for e in integrity_errors:
                print(f"  {e}", file=sys.stderr)
        if cross_errors:
            print(f"CROSS-VALIDATION FAILED ({len(cross_errors)} errors):", file=sys.stderr)
            for e in cross_errors:
                print(f"  {e}", file=sys.stderr)
        if deploy_errors:
            print(f"DEPLOYABILITY VALIDATION FAILED ({len(deploy_errors)} errors):", file=sys.stderr)
            for e in deploy_errors:
                print(f"  {e}", file=sys.stderr)
        # Log to each service's audit trail so a post-mortem can find the
        # exact failures without re-grepping the session JSONL.
        for controls_dir in service_dirs:
            log_hook_fire(
                "stop",
                "fail",
                f"integrity={len(integrity_errors)} cross={len(cross_errors)} "
                f"deploy={len(deploy_errors)}",
                file_path=controls_dir,
                extra={
                    "first_integrity": current_first_integrity,
                    "first_cross": cross_errors[0][:200] if cross_errors else None,
                    "first_deploy": deploy_errors[0][:200] if deploy_errors else None,
                },
            )
        sys.exit(2)
    else:
        # Non-blocking: report via stdout JSON for Claude's awareness
        result = {}
        if cross_errors:
            result["cross_validation"] = {
                "decision": "warn",
                "reason": f"Cross-validation found {len(cross_errors)} issue(s). "
                          "Set VALIDATE_CROSS_STRICT=1 to block.",
                "errors": cross_errors,
            }
        if deploy_errors:
            result["deployability"] = {
                "decision": "warn",
                "reason": f"Deployability validation found {len(deploy_errors)} issue(s). "
                          "Set VALIDATE_DEPLOYABLE_STRICT=1 to block.",
                "errors": deploy_errors,
            }
        if not has_creds:
            result["tier2_skipped"] = True
            result["tier2_fix"] = "Run: aws sso login --profile delegated-admin"
        for controls_dir in service_dirs:
            log_hook_fire(
                "stop",
                "warn",
                f"cross={len(cross_errors)} deploy={len(deploy_errors)} "
                f"(non-strict mode)",
                file_path=controls_dir,
            )
        print(json.dumps(result))
        sys.exit(0)


if __name__ == "__main__":
    main()
