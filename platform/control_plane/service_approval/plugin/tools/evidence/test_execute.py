"""Tests for CLI execution (tools/evidence/execute.py).

Mock subprocess calls to verify predicate evaluation and output capture
without actually running AWS CLI commands. Adapted to the argv shape:
shell=False is enforced everywhere.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest import mock

import pytest

from tools.evidence.execute import (
    execute_command,
    _evaluate_predicate,
    _write_output_log,
    _check_account_match,
)


def test_evaluate_predicate_jmespath():
    stdout = json.dumps({"KMSKeyArn": "arn:aws:kms:us-east-1:123456789012:key/12345678"})
    result, desc = _evaluate_predicate("jmespath", "KMSKeyArn", stdout, "", 0)
    assert result is True
    assert "arn:aws:kms" in desc

    stdout = json.dumps({"KMSKeyArn": None})
    result, desc = _evaluate_predicate("jmespath", "KMSKeyArn", stdout, "", 0)
    assert result is False

    stdout = json.dumps({"KMSKeyArn": ""})
    result, desc = _evaluate_predicate("jmespath", "KMSKeyArn", stdout, "", 0)
    assert result is False


def test_evaluate_predicate_jmespath_boolean_expression():
    """Predicates returning native booleans (e.g., `X != null && X != ''`) must
    be honored as the source of truth — not coerced through bool()-of-value."""
    stdout = json.dumps({"KMSKeyArn": "arn:aws:kms:..."})
    expr = "KMSKeyArn != null && KMSKeyArn != ''"
    result, desc = _evaluate_predicate("jmespath", expr, stdout, "", 0)
    assert result is True

    stdout = json.dumps({"KMSKeyArn": None})
    result, desc = _evaluate_predicate("jmespath", expr, stdout, "", 0)
    assert result is False

    stdout = json.dumps({"KMSKeyArn": ""})
    result, desc = _evaluate_predicate("jmespath", expr, stdout, "", 0)
    assert result is False


def test_evaluate_predicate_exit_code():
    result, desc = _evaluate_predicate("exit_code", "0", "", "", 0)
    assert result is True
    assert "exit_code=0" in desc

    result, desc = _evaluate_predicate("exit_code", "exit_code == 0", "", "", 0)
    assert result is True

    result, desc = _evaluate_predicate("exit_code", "0", "", "", 1)
    assert result is False


def test_evaluate_predicate_regex():
    stdout = "The function is configured with KMS key arn:aws:kms:..."
    result, desc = _evaluate_predicate("regex", r"arn:aws:kms:", stdout, "", 0)
    assert result is True
    assert "arn:aws:kms:" in desc

    result, desc = _evaluate_predicate("regex", r"MISSING", stdout, "", 0)
    assert result is False


def test_check_account_match_no_arn():
    """Responses with no ARN are treated as 'cannot verify' = pass-through."""
    stdout = json.dumps({"Status": "Active", "Count": 1})
    ok, msg = _check_account_match(stdout, "123456789012")
    assert ok is True


def test_check_account_match_correct_account():
    stdout = json.dumps(
        {"FunctionArn": "arn:aws:lambda:us-east-1:123456789012:function:fn"}
    )
    ok, msg = _check_account_match(stdout, "123456789012")
    assert ok is True


def test_check_account_match_wrong_account():
    stdout = json.dumps(
        {"FunctionArn": "arn:aws:lambda:us-east-1:999999999999:function:fn"}
    )
    ok, msg = _check_account_match(stdout, "123456789012")
    assert ok is False
    assert "999999999999" in msg


def test_write_output_log(tmp_path: Path):
    output_dir = tmp_path / "08-evidence"
    log_path = "cli-outputs/test.log"

    _write_output_log(
        output_dir,
        log_path,
        "stdout content",
        "stderr content",
        0,
        ["aws", "lambda", "get-function"],
    )

    log_file = output_dir / log_path
    assert log_file.exists()
    content = log_file.read_text()
    assert "=== COMMAND ===" in content
    assert "aws lambda get-function" in content
    assert "=== EXIT CODE ===" in content
    assert "0" in content
    assert "=== STDOUT ===" in content
    assert "stdout content" in content
    assert "=== STDERR ===" in content
    assert "stderr content" in content


@mock.patch("subprocess.run")
def test_execute_command_passes_argv_with_shell_false(mock_run, tmp_path: Path):
    """Critical 1: subprocess.run MUST be called with shell=False and an argv list."""
    mock_result = mock.Mock()
    mock_result.stdout = json.dumps(
        {"KMSKeyArn": "arn:aws:kms:us-east-1:123456789012:key/12345678"}
    )
    mock_result.stderr = ""
    mock_result.returncode = 0
    mock_run.return_value = mock_result

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": [
            "aws",
            "lambda",
            "get-function-configuration",
            "--function-name",
            "test",
        ],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "PASS"
    # Verify subprocess.run got argv (not a string), shell=False.
    call_args, call_kwargs = mock_run.call_args
    assert call_args[0] == cmd_entry["command_argv"]
    assert call_kwargs["shell"] is False


@mock.patch("subprocess.run")
def test_execute_command_account_mismatch_flips_to_fail(mock_run, tmp_path: Path):
    """High 8: when expected_account is set and the response has the wrong
    account, the result must flip to FAIL even if the predicate passed."""
    mock_result = mock.Mock()
    mock_result.stdout = json.dumps(
        {"FunctionArn": "arn:aws:lambda:us-east-1:999999999999:function:fn"}
    )
    mock_result.stderr = ""
    mock_result.returncode = 0
    mock_run.return_value = mock_result

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "fn"],
        "predicate": {"type": "jmespath", "expression": "FunctionArn"},
        "output_log": "cli-outputs/test.log",
        "expected_account": "123456789012",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)
    assert result.verdict == "FAIL"
    assert "account mismatch" in result.predicate_evaluation


@mock.patch("subprocess.run")
def test_execute_command_success(mock_run, tmp_path: Path):
    mock_result = mock.Mock()
    mock_result.stdout = json.dumps(
        {"KMSKeyArn": "arn:aws:kms:us-east-1:123456789012:key/12345678"}
    )
    mock_result.stderr = ""
    mock_result.returncode = 0
    mock_run.return_value = mock_result

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "test"],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "PASS"
    assert result.control_id == "CTRL-ACC-PRO-001"
    assert result.exit_code == 0
    assert result.predicate_result is True
    assert "arn:aws:kms" in result.predicate_evaluation
    assert (tmp_path / "cli-outputs/test.log").exists()


@mock.patch("subprocess.run")
def test_execute_command_fail(mock_run, tmp_path: Path):
    mock_result = mock.Mock()
    mock_result.stdout = json.dumps({"KMSKeyArn": None})
    mock_result.stderr = ""
    mock_result.returncode = 0
    mock_run.return_value = mock_result

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "test"],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "FAIL"
    assert result.predicate_result is False


@mock.patch("subprocess.run")
def test_execute_command_timeout(mock_run, tmp_path: Path):
    mock_run.side_effect = subprocess.TimeoutExpired("aws", 30)

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "test"],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "ERROR"
    assert "timed out" in result.error_message


@mock.patch("subprocess.run")
def test_execute_command_exception(mock_run, tmp_path: Path):
    mock_run.side_effect = Exception("AWS CLI not found")

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "test"],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "ERROR"
    assert "AWS CLI not found" in result.error_message


# --------------------------------------------------------------------------
# Partial-run recovery (Medium 18): retry on throttle + atomic write
# --------------------------------------------------------------------------

@mock.patch("time.sleep")  # don't actually sleep during tests
@mock.patch("subprocess.run")
def test_execute_retries_on_aws_throttling(mock_run, mock_sleep, tmp_path: Path):
    """ThrottlingException on stderr should trigger retry with backoff."""
    throttle_result = mock.Mock()
    throttle_result.stdout = ""
    throttle_result.stderr = "An error occurred (Throttling) when calling the GetFunction operation: Rate exceeded"
    throttle_result.returncode = 254

    success_result = mock.Mock()
    success_result.stdout = json.dumps({"KMSKeyArn": "arn:aws:kms:us-east-1:123456789012:key/abc"})
    success_result.stderr = ""
    success_result.returncode = 0

    # First two calls throttled, third succeeds
    mock_run.side_effect = [throttle_result, throttle_result, success_result]

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "test"],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }

    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "PASS"
    assert mock_run.call_count == 3
    assert len(result.retry_log) == 2  # two throttle retries before success
    assert "throttled" in result.retry_log[0]


@mock.patch("time.sleep")
@mock.patch("subprocess.run")
def test_execute_aws_error_distinguished_from_predicate_fail(mock_run, mock_sleep, tmp_path: Path):
    """AccessDenied / ExpiredToken should map to ERROR, not FAIL."""
    error_result = mock.Mock()
    error_result.stdout = ""
    error_result.stderr = "An error occurred (AccessDeniedException) when calling the GetFunction operation"
    error_result.returncode = 254
    mock_run.return_value = error_result

    cmd_entry = {
        "control_id": "CTRL-ACC-PRO-001",
        "family": "F1-resource-get",
        "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", "test"],
        "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
        "output_log": "cli-outputs/test.log",
    }
    result = execute_command(cmd_entry, tmp_path, timeout=30)

    assert result.verdict == "ERROR"
    assert "AccessDenied" in result.error_message


def test_atomic_write_json_creates_file_atomically(tmp_path: Path):
    """_atomic_write_json must use temp+rename so a crash mid-write leaves
    either the old file or the new one — never half-written content."""
    from tools.evidence.execute import _atomic_write_json

    target = tmp_path / "subdir" / "results.json"
    _atomic_write_json(target, {"key": "value", "nested": [1, 2, 3]})

    assert target.exists()
    assert json.loads(target.read_text()) == {"key": "value", "nested": [1, 2, 3]}
    # No leftover .tmp file
    assert not (tmp_path / "subdir" / "results.json.tmp").exists()


@mock.patch("subprocess.run")
def test_execute_all_writes_progress_after_each_command(mock_run, tmp_path: Path):
    """execute_all must persist attestation-results.json after every command,
    so a mid-run crash leaves a partial-but-valid JSON file."""
    from tools.evidence.execute import execute_all

    success_result = mock.Mock()
    success_result.stdout = json.dumps({"KMSKeyArn": "arn:aws:kms:us-east-1:123456789012:key/abc"})
    success_result.stderr = ""
    success_result.returncode = 0
    mock_run.return_value = success_result

    cli_commands = {
        "schema_version": "1.0",
        "service": "AWS Lambda",
        "service_slug": "awslambda",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/test/abc",
        "commands": [
            {
                "control_id": f"CTRL-ACC-PRO-00{i}",
                "family": "F1-resource-get",
                "command_argv": ["aws", "lambda", "get-function-configuration", "--function-name", f"f{i}"],
                "predicate": {"type": "jmespath", "expression": "KMSKeyArn"},
                "output_log": f"cli-outputs/test{i}.log",
            }
            for i in range(1, 4)
        ],
        "not_cli_validatable": [],
    }
    cmd_path = tmp_path / "cli-commands.json"
    cmd_path.write_text(json.dumps(cli_commands))

    result = execute_all(cmd_path, tmp_path, timeout=30)

    # Final state — all 3 controls passed
    assert result["counts"]["pass"] == 3
    assert result["overall_verdict"] == "PASS"

    # And the on-disk file matches
    on_disk = json.loads((tmp_path / "attestation-results.json").read_text())
    assert on_disk["counts"]["pass"] == 3
