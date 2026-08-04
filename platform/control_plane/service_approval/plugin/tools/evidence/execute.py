"""CLI command execution and predicate evaluation for Phase 7 Evidence.

Reads cli-commands.json, runs each CLI command via subprocess.run with
shell=False (argv arrays only), captures stdout+stderr to
<slug>/08-evidence/cli-outputs/<CTRL-ID>--<cmd-slug>.log, evaluates the
predicate, optionally cross-checks the response account against the
deployed stack's account, and emits attestation-results.json.

Predicate types supported:
  - jmespath: JMESPath query against parsed JSON stdout
  - regex: Regular expression match against raw stdout
  - exit_code: Direct comparison of process exit code
  - jsonpath: JSONPath query (future — currently not implemented)

Security: shell=False is non-negotiable. Commands are passed as argv lists
straight from cli-commands.json's `command_argv` field; we never interpolate
through a shell.
"""
from __future__ import annotations

import json
import os
import random
import re
import shlex
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import jmespath
except ImportError:
    jmespath = None  # type: ignore


# ARN: arn:aws:<service>:<region>:<account>:<rest> — account is segment 4 (0-indexed).
_ARN_RE = re.compile(r"^arn:aws[a-z0-9-]*:[a-z0-9-]+:[a-z0-9-]*:(\d{12}):")

# AWS API errors that indicate transient throttling — safe to retry with backoff.
_THROTTLE_ERROR_TOKENS = (
    "Throttling",
    "ThrottlingException",
    "RequestLimitExceeded",
    "TooManyRequestsException",
    "Rate exceeded",
)

# Retry configuration (exponential backoff with jitter).
_RETRY_MAX_ATTEMPTS = 4         # initial + 3 retries
_RETRY_BASE_DELAY_S = 1.0       # 1s, 2s, 4s, 8s (capped)
_RETRY_MAX_DELAY_S = 30.0
_RETRY_JITTER_FRAC = 0.25        # ±25% jitter


def _is_throttle_error(exit_code: int, stderr: str) -> bool:
    """Return True if the command output looks like an AWS throttling error."""
    if exit_code == 0:
        return False
    if not stderr:
        return False
    for token in _THROTTLE_ERROR_TOKENS:
        if token in stderr:
            return True
    return False


def _backoff_delay(attempt: int) -> float:
    """Exponential backoff with jitter: 1s, 2s, 4s, 8s ± jitter, capped at 30s."""
    base = min(_RETRY_BASE_DELAY_S * (2 ** attempt), _RETRY_MAX_DELAY_S)
    jitter = base * _RETRY_JITTER_FRAC * (2 * random.random() - 1)
    return max(0.1, base + jitter)


def _atomic_write_json(path: Path, data: dict) -> None:
    """Write JSON to `path` atomically (write to temp, fsync, rename).

    Crash-safe: a reader sees either the prior file or the new file, never
    a half-written one. Used to persist attestation-results.json after
    every command so a mid-run crash doesn't leave a partial JSON file.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass  # tmpfs / network filesystems may not support fsync
    os.replace(tmp, path)


@dataclass
class ExecutionResult:
    """Result of executing a single CLI command."""
    control_id: str
    verdict: str  # PASS, FAIL, ERROR
    family: str
    command_argv: list[str] = field(default_factory=list)
    exit_code: int = 0
    stdout_size_bytes: int = 0
    stderr_size_bytes: int = 0
    output_log: str = ""
    predicate_result: bool | None = None
    predicate_evaluation: str = ""
    elapsed_ms: int = 0
    timestamp: str = ""
    error_message: str = ""
    retry_log: list[str] = field(default_factory=list)  # populated when AWS throttling triggers retries

    @property
    def command_str(self) -> str:
        return shlex.join(self.command_argv) if self.command_argv else ""


def _write_output_log(
    output_dir: Path,
    log_path: str,
    stdout: str,
    stderr: str,
    exit_code: int,
    command_argv: list[str],
) -> None:
    """Write raw stdout+stderr to a log file.

    The log records the argv as a shlex-joined string so a human can replay
    the command, but consumers should always reach for command_argv in the
    JSON output rather than parsing the log.
    """
    full_path = output_dir / log_path
    full_path.parent.mkdir(parents=True, exist_ok=True)

    with open(full_path, "w") as f:
        f.write("=== COMMAND ===\n")
        f.write(f"{shlex.join(command_argv)}\n\n")
        f.write("=== EXIT CODE ===\n")
        f.write(f"{exit_code}\n\n")
        f.write("=== STDOUT ===\n")
        f.write(stdout if stdout else "(empty)\n")
        f.write("\n=== STDERR ===\n")
        f.write(stderr if stderr else "(empty)\n")


def _evaluate_predicate(
    predicate_type: str,
    predicate_expression: str,
    stdout: str,
    stderr: str,
    exit_code: int,
) -> tuple[bool, str]:
    """Evaluate a predicate against command output."""
    if predicate_type == "exit_code":
        if "==" in predicate_expression:
            expected = int(predicate_expression.split("==")[1].strip())
        else:
            expected = int(predicate_expression.strip())
        result = exit_code == expected
        return result, f"exit_code={exit_code}, expected={expected}"

    if predicate_type == "jmespath":
        if jmespath is None:
            return False, "jmespath library not installed"

        try:
            data = json.loads(stdout) if stdout else {}
        except json.JSONDecodeError as e:
            return False, f"JSON parse error: {e}"

        try:
            result_value = jmespath.search(predicate_expression, data)
            # Boolean-valued expressions (e.g., `KMSKeyArn != null && KMSKeyArn != \`\``)
            # come back as proper True/False; treat them as the source of truth.
            if isinstance(result_value, bool):
                return result_value, f"jmespath({predicate_expression}) = {result_value!r}"
            # Otherwise: non-null, non-empty value is PASS.
            result = bool(result_value) and result_value not in (None, "", [])
            return result, f"jmespath({predicate_expression}) = {result_value!r}"
        except Exception as e:
            return False, f"JMESPath evaluation error: {e}"

    if predicate_type == "regex":
        try:
            pattern = re.compile(predicate_expression)
            match = pattern.search(stdout)
            result = match is not None
            matched_text = match.group(0) if match else ""
            return result, f"regex({predicate_expression!r}) matched: {matched_text!r}"
        except re.error as e:
            return False, f"Regex compilation error: {e}"

    if predicate_type == "jsonpath":
        return False, "jsonpath predicate type not yet implemented"

    return False, f"Unknown predicate type: {predicate_type!r}"


def _check_account_match(stdout: str, expected_account: str) -> tuple[bool, str]:
    """Verify the response account matches the deployed stack's account.

    Walks every ARN-shaped string in the parsed stdout and confirms its
    account segment matches `expected_account`. If no ARNs are present we
    return (True, "no-arn-in-response") — many AWS APIs don't surface ARNs
    in their describe output and that's not failure-grade.
    """
    if not expected_account:
        return True, "no-expected-account"

    try:
        data = json.loads(stdout) if stdout else None
    except json.JSONDecodeError:
        return True, "stdout-not-json"

    if data is None:
        return True, "stdout-empty"

    seen_arns: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, str) and node.startswith("arn:aws"):
            seen_arns.append(node)

    walk(data)

    mismatched: list[str] = []
    for arn in seen_arns:
        m = _ARN_RE.match(arn)
        if m and m.group(1) != expected_account:
            mismatched.append(arn)

    if mismatched:
        return False, (
            f"response contained {len(mismatched)} ARN(s) outside expected account "
            f"{expected_account}: first={mismatched[0]!r}"
        )
    return True, f"all {len(seen_arns)} ARN(s) matched account {expected_account}"


def execute_command(
    cmd_entry: dict,
    output_dir: Path,
    timeout: int = 30,
) -> ExecutionResult:
    """Execute a single CLI command from cli-commands.json.

    Args:
        cmd_entry: CLI command entry. Must contain `command_argv` (array).
        output_dir: Base output directory (08-evidence/)
        timeout: Per-command timeout in seconds

    Returns:
        ExecutionResult with verdict and predicate evaluation.
    """
    control_id = cmd_entry["control_id"]
    command_argv = list(cmd_entry["command_argv"])
    family = cmd_entry["family"]
    predicate = cmd_entry.get("predicate", {})
    predicate_type = predicate.get("type", "")
    predicate_expression = predicate.get("expression", "")
    output_log = cmd_entry["output_log"]
    expected_account = cmd_entry.get("expected_account", "")
    cmd_timeout = int(cmd_entry.get("timeout_seconds") or timeout)

    start_time = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()
    retry_log: list[str] = []

    try:
        # Retry loop for AWS throttling errors. Non-throttle errors break
        # immediately. PASS/FAIL of a non-throttle response also breaks.
        attempt = 0
        while True:
            result = subprocess.run(
                command_argv,
                shell=False,  # Hard-coded: argv only, never shell.
                capture_output=True,
                text=True,
                timeout=cmd_timeout,
            )
            stdout = result.stdout
            stderr = result.stderr
            exit_code = result.returncode

            if not _is_throttle_error(exit_code, stderr) or attempt + 1 >= _RETRY_MAX_ATTEMPTS:
                break
            delay = _backoff_delay(attempt)
            retry_log.append(f"attempt {attempt + 1}: throttled, sleeping {delay:.2f}s")
            time.sleep(delay)
            attempt += 1

        elapsed_ms = int((time.time() - start_time) * 1000)

        _write_output_log(output_dir, output_log, stdout, stderr, exit_code, command_argv)

        pred_result, pred_eval = _evaluate_predicate(
            predicate_type,
            predicate_expression,
            stdout,
            stderr,
            exit_code,
        )

        # Account-match guard — only if the predicate would otherwise pass.
        if pred_result and expected_account:
            ok, account_msg = _check_account_match(stdout, expected_account)
            if not ok:
                pred_result = False
                pred_eval = f"{pred_eval}; account mismatch: {account_msg}"

        # Distinguish AWS API errors (throttle exhausted, auth failure, etc.)
        # from predicate failures. Non-zero exit + AWS error tokens → ERROR
        # (transient/operational); non-zero exit + predicate match → still FAIL
        # (this lets exit_code-type predicates work).
        is_aws_error = exit_code != 0 and not pred_result and any(
            tok in stderr for tok in (*_THROTTLE_ERROR_TOKENS, "AccessDenied", "ExpiredToken", "UnrecognizedClient")
        )
        if is_aws_error:
            verdict = "ERROR"
            error_message = stderr.strip().split("\n")[-1][:500]
        else:
            verdict = "PASS" if pred_result else "FAIL"
            error_message = ""

        return ExecutionResult(
            control_id=control_id,
            verdict=verdict,
            family=family,
            command_argv=command_argv,
            exit_code=exit_code,
            stdout_size_bytes=len(stdout.encode("utf-8")),
            stderr_size_bytes=len(stderr.encode("utf-8")),
            output_log=output_log,
            predicate_result=pred_result,
            predicate_evaluation=pred_eval,
            elapsed_ms=elapsed_ms,
            timestamp=timestamp,
            error_message=error_message,
            retry_log=retry_log,
        )

    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return ExecutionResult(
            control_id=control_id,
            verdict="ERROR",
            family=family,
            command_argv=command_argv,
            exit_code=-1,
            stdout_size_bytes=0,
            stderr_size_bytes=0,
            output_log=output_log,
            elapsed_ms=elapsed_ms,
            timestamp=timestamp,
            error_message=f"Command timed out after {cmd_timeout}s",
        )

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return ExecutionResult(
            control_id=control_id,
            verdict="ERROR",
            family=family,
            command_argv=command_argv,
            exit_code=-1,
            stdout_size_bytes=0,
            stderr_size_bytes=0,
            output_log=output_log,
            elapsed_ms=elapsed_ms,
            timestamp=timestamp,
            error_message=f"Execution error: {e}",
        )


def _result_to_dict(r: Any) -> dict:
    """Convert an ExecutionResult or NCV dict into the attestation results shape."""
    if isinstance(r, ExecutionResult):
        result_dict: dict[str, Any] = {
            "control_id": r.control_id,
            "verdict": r.verdict,
            "family": r.family,
            "command_argv": r.command_argv,
            "command_str": r.command_str,
            "exit_code": r.exit_code,
            "stdout_size_bytes": r.stdout_size_bytes,
            "stderr_size_bytes": r.stderr_size_bytes,
            "output_log": r.output_log,
            "timestamp": r.timestamp,
        }
        if r.predicate_result is not None:
            result_dict["predicate_result"] = r.predicate_result
        if r.predicate_evaluation:
            result_dict["predicate_evaluation"] = r.predicate_evaluation
        if r.elapsed_ms > 0:
            result_dict["elapsed_ms"] = r.elapsed_ms
        if r.error_message:
            result_dict["error_message"] = r.error_message
        if r.retry_log:
            result_dict["retry_log"] = r.retry_log
        return result_dict
    return r


def _recompute_aggregate(attestation_results: dict, ncv_count: int, total_controls: int) -> None:
    """Update counts + overall_verdict based on the current results array.

    Called after every command execution so attestation-results.json on disk
    reflects partial progress accurately.
    """
    pass_count = sum(1 for r in attestation_results["results"] if r.get("verdict") == "PASS")
    fail_count = sum(1 for r in attestation_results["results"] if r.get("verdict") == "FAIL")
    error_count = sum(1 for r in attestation_results["results"] if r.get("verdict") == "ERROR")
    attestation_results["counts"] = {
        "total_controls": total_controls,
        "pass": pass_count,
        "fail": fail_count,
        "not_cli_validatable": ncv_count,
        "error": error_count,
    }
    if fail_count > 0:
        attestation_results["overall_verdict"] = "FAIL"
    elif error_count > 0:
        attestation_results["overall_verdict"] = "ERROR"
    elif pass_count + ncv_count == total_controls:
        attestation_results["overall_verdict"] = "PASS"
    else:
        attestation_results["overall_verdict"] = "PARTIAL"


def execute_all(
    cli_commands_path: Path,
    output_dir: Path,
    timeout: int = 30,
) -> dict[str, Any]:
    """Execute all commands from cli-commands.json and produce attestation-results.json.

    Crash-safe: writes attestation-results.json atomically after every command,
    so a mid-run crash (creds expire, network fails, OOM kill) leaves a
    well-formed JSON file on disk reflecting partial progress. The
    overall_verdict is set to "PARTIAL" until the last command finishes;
    `--replay` mode can resume from this state.
    """
    with open(cli_commands_path) as f:
        cli_commands = json.load(f)

    commands = cli_commands.get("commands", [])
    not_cli_validatable = cli_commands.get("not_cli_validatable", [])
    total_controls = len(commands) + len(not_cli_validatable)
    ncv_count = len(not_cli_validatable)

    attestation_results: dict[str, Any] = {
        "schema_version": "1.0",
        "service": cli_commands.get("service", ""),
        "service_slug": cli_commands.get("service_slug", ""),
        "evidence_run_id": datetime.now(timezone.utc).isoformat(),
        "stack_id": cli_commands.get("stack_id", ""),
        "overall_verdict": "PARTIAL",
        "counts": {
            "total_controls": total_controls,
            "pass": 0,
            "fail": 0,
            "not_cli_validatable": ncv_count,
            "error": 0,
        },
        "results": [],
    }

    # NCV entries first — they're already known and don't fail mid-run.
    for ncv in not_cli_validatable:
        ncv_result: dict[str, Any] = {
            "control_id": ncv["control_id"],
            "verdict": "NOT_CLI_VALIDATABLE",
            "reason_code": ncv.get("reason_code", "unknown-mechanism"),
            "reason": ncv.get("reason", ""),
        }
        if ncv.get("supplemental_evidence"):
            ncv_result["supplemental_evidence"] = ncv["supplemental_evidence"]
        attestation_results["results"].append(ncv_result)

    # Persist initial state with NCVs before running any commands.
    output_path = output_dir / "attestation-results.json"
    _atomic_write_json(output_path, attestation_results)

    # Execute commands one at a time, persisting after each.
    for cmd_entry in commands:
        exec_result = execute_command(cmd_entry, output_dir, timeout)
        attestation_results["results"].append(_result_to_dict(exec_result))
        _recompute_aggregate(attestation_results, ncv_count, total_controls)
        _atomic_write_json(output_path, attestation_results)

    # Final state: results array is complete, recompute terminal verdict.
    _recompute_aggregate(attestation_results, ncv_count, total_controls)
    _atomic_write_json(output_path, attestation_results)

    return attestation_results
