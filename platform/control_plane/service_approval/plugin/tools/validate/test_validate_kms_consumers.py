"""Unit tests for validate_kms_consumers.py.

Covers the four scenarios called out in the MR7 review:

    1. CFN + TF happy path (consumer with correct key policy passes).
    2. Missing principal (consumer references key but no matching Service in
       Allow statement → KMS-CONSUMER error citing missing principal).
    3. Missing action (principal present but required action missing →
       KMS-CONSUMER error citing missing action).
    4. Unknown consumer type emits KMS-CONSUMER-UNKNOWN warning.

Also covers:

    5. _load_specs() silent-no-op no longer silent — a missing data file
       emits a stderr warning (review item 2).
    6. validate_kms_consumers() dispatcher only inspects IaC files.

Tests use real consumer types loaded from the shipped
`data/kms-consumer-specs.json` so the fixtures
stay in sync with the actual spec.
"""

from __future__ import annotations

import json
import os
import tempfile

from validate_kms_consumers import (
    _action_covered,
    _load_specs,
    _principal_matches,
    check_cloudformation,
    check_terraform,
    validate_kms_consumers,
)


# ------------------------------------------------------------------
# Shared fixtures
# ------------------------------------------------------------------


def _write(path: str, text: str) -> None:
    with open(path, "w") as fh:
        fh.write(text)


def _cfn_template(key_policy_stmts: list[dict], consumer_yaml: str = "") -> str:
    """Build a minimal CFN template with a Key + an optional consumer.

    `key_policy_stmts` is the list of Statement dicts for the Key's
    KeyPolicy (serialized as JSON inside the YAML — valid YAML).
    `consumer_yaml` is a raw YAML string appended under Resources. It MUST
    use short-form intrinsic tags (e.g. `!GetAtt MyKey.Arn`) because that's
    what the CFN validator regex matches.
    """
    import json as _json

    stmts_json = _json.dumps(key_policy_stmts)
    body = f"""AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyKey:
    Type: AWS::KMS::Key
    Properties:
      KeyPolicy:
        Version: '2012-10-17'
        Statement: {stmts_json}
{consumer_yaml}
"""
    return body


def _make_cfn_path(content: str) -> str:
    """Write a CFN template to a temp path under an iac/cloudformation dir."""
    base = tempfile.mkdtemp(prefix="kms-test-")
    cfn_dir = os.path.join(base, "controls", "iac", "cloudformation")
    os.makedirs(cfn_dir, exist_ok=True)
    path = os.path.join(cfn_dir, "compliant-resource.cfn.yaml")
    _write(path, content)
    return path


def _make_tf_path(content: str) -> str:
    base = tempfile.mkdtemp(prefix="kms-test-")
    tf_dir = os.path.join(base, "controls", "iac", "terraform")
    os.makedirs(tf_dir, exist_ok=True)
    path = os.path.join(tf_dir, "main.tf")
    _write(path, content)
    return path


# ------------------------------------------------------------------
# 1. Happy paths — correct key policy passes
# ------------------------------------------------------------------


_CONSUMER_LOGS_YAML = """  MyLogs:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/x
      KmsKeyId: !GetAtt MyKey.Arn
"""

_CONSUMER_SQS_YAML = """  MyQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: q
      KmsMasterKeyId: !GetAtt MyKey.Arn
"""

_CONSUMER_UNKNOWN_YAML = """  MyDb:
    Type: AWS::Timestream::Database
    Properties:
      KmsKeyId: !GetAtt MyKey.Arn
"""


def test_cfn_happy_path_log_group_passes() -> None:
    """CFN LogGroup with a key policy granting logs.<region>.amazonaws.com +
    kms:Encrypt + kms:GenerateDataKey* returns no errors."""
    stmts = [
        {
            "Sid": "AllowLogs",
            "Effect": "Allow",
            "Principal": {"Service": "logs.us-east-1.amazonaws.com"},
            "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
            "Resource": "*",
        }
    ]
    path = _make_cfn_path(_cfn_template(stmts, _CONSUMER_LOGS_YAML))
    assert check_cloudformation(path) == []


def test_tf_happy_path_log_group_passes() -> None:
    tf = '''
resource "aws_kms_key" "mine" {
  description = "test"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowLogs"
        Effect    = "Allow"
        Principal = { "Service": "logs.us-east-1.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "mine" {
  name       = "/aws/x"
  kms_key_id = aws_kms_key.mine.arn
}
'''
    path = _make_tf_path(tf)
    assert check_terraform(path) == []


# ------------------------------------------------------------------
# 2. Missing principal — consumer references key but no Service match
# ------------------------------------------------------------------


def test_cfn_missing_principal_fails_with_clear_error() -> None:
    """Key policy grants kms:* to the account root but no service principal.
    A LogGroup consumer should fail with a principal-missing error."""
    stmts = [
        {
            "Sid": "KeyAdmin",
            "Effect": "Allow",
            "Principal": {"AWS": "arn:aws:iam::111111111111:root"},
            "Action": "kms:*",
            "Resource": "*",
        }
    ]
    path = _make_cfn_path(_cfn_template(stmts, _CONSUMER_LOGS_YAML))
    errors = check_cloudformation(path)
    assert len(errors) == 1
    assert "KMS-CONSUMER" in errors[0]
    assert "does not grant" in errors[0]
    assert "logs." in errors[0]  # principal requirement should be cited


def test_tf_missing_principal_fails_with_clear_error() -> None:
    tf = '''
resource "aws_kms_key" "mine" {
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "KeyAdmin"
        Effect    = "Allow"
        Principal = { "AWS": "arn:aws:iam::111111111111:root" }
        Action    = "kms:*"
        Resource  = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "mine" {
  name       = "/aws/y"
  kms_key_id = aws_kms_key.mine.arn
}
'''
    path = _make_tf_path(tf)
    errors = check_terraform(path)
    assert len(errors) == 1
    assert "KMS-CONSUMER" in errors[0]
    assert "does not grant" in errors[0]


# ------------------------------------------------------------------
# 3. Missing action — principal present but required action absent
# ------------------------------------------------------------------


def test_cfn_missing_action_fails_with_clear_error() -> None:
    """Principal matches but the Allow statement lacks EVERY required action.
    _action_covered uses OR semantics (any-of), so we must omit ALL the
    required actions for this check to fail."""
    # SQS's spec requires any of {kms:Encrypt, kms:GenerateDataKey, ...}.
    # Granting only kms:Describe (none of the required any-of entries) fails.
    stmts = [
        {
            "Sid": "AllowSqsInsufficient",
            "Effect": "Allow",
            "Principal": {"Service": "sqs.amazonaws.com"},
            "Action": ["kms:DescribeKey"],
            "Resource": "*",
        }
    ]
    path = _make_cfn_path(_cfn_template(stmts, _CONSUMER_SQS_YAML))
    errors = check_cloudformation(path)
    assert len(errors) == 1
    assert "KMS-CONSUMER" in errors[0]
    assert "missing required action" in errors[0]


# ------------------------------------------------------------------
# 4. Unknown consumer type → warning, not a deploy blocker
# ------------------------------------------------------------------


def test_cfn_unknown_consumer_type_emits_warning() -> None:
    """A resource type that references a KMS key but is NOT in the spec
    file emits a KMS-CONSUMER-UNKNOWN warning with remediation guidance."""
    stmts = [
        {
            "Sid": "KeyAdmin",
            "Effect": "Allow",
            "Principal": {"AWS": "arn:aws:iam::111111111111:root"},
            "Action": "kms:*",
            "Resource": "*",
        }
    ]
    # AWS::Timestream::Database is NOT in the default spec.
    path = _make_cfn_path(_cfn_template(stmts, _CONSUMER_UNKNOWN_YAML))
    errors = check_cloudformation(path)
    # Warning is reported as an error-list entry but prefixed with -UNKNOWN
    # so the caller can distinguish.
    unknown = [e for e in errors if "KMS-CONSUMER-UNKNOWN" in e]
    blockers = [
        e
        for e in errors
        if "KMS-CONSUMER" in e and "KMS-CONSUMER-UNKNOWN" not in e
    ]
    assert len(unknown) == 1
    assert "AWS::Timestream::Database" in unknown[0]
    assert "WARNING" in unknown[0]
    assert blockers == []


# ------------------------------------------------------------------
# Dispatcher / unit checks
# ------------------------------------------------------------------


def test_validate_kms_consumers_ignores_non_iac_file() -> None:
    """Files outside an iac/ directory are not inspected."""
    path = _make_tf_path("resource \"aws_kms_key\" \"x\" {}")
    # Move to a non-iac path.
    base = tempfile.mkdtemp(prefix="non-iac-")
    moved = os.path.join(base, "main.tf")
    _write(moved, "resource \"aws_kms_key\" \"x\" {}")
    assert validate_kms_consumers(moved) == []


def test_validate_kms_consumers_cfn_dispatches() -> None:
    """An iac/cloudformation/*.yaml path routes to check_cloudformation."""
    path = _make_cfn_path(_cfn_template([]))
    # No consumer in template → returns [] whether we go through dispatcher
    # or check_cloudformation directly.
    assert validate_kms_consumers(path) == check_cloudformation(path)


def test_principal_matches_helpers() -> None:
    """_principal_matches understands string vs list, wildcards, region subs."""
    # Exact match
    assert _principal_matches("sqs.amazonaws.com", ["sqs.amazonaws.com"]) is True
    # No match
    assert _principal_matches("sqs.amazonaws.com", ["lambda.amazonaws.com"]) is False
    # Region placeholder matches concrete region
    assert _principal_matches(
        "logs.{region}.amazonaws.com", ["logs.us-east-1.amazonaws.com"]
    ) is True


def test_action_covered_handles_wildcards() -> None:
    """_action_covered returns True when ANY action in required_any_of is
    covered by granted — it's OR semantics, not AND."""
    assert _action_covered(["kms:Encrypt", "kms:Decrypt"], ["kms:*"]) is True
    assert (
        _action_covered(["kms:GenerateDataKey"], ["kms:GenerateDataKey*"]) is True
    )
    # OR: Decrypt in granted is enough, even though Encrypt is not granted.
    assert _action_covered(["kms:Encrypt", "kms:Decrypt"], ["kms:Decrypt"]) is True
    # Truly missing — neither required action is granted.
    assert _action_covered(["kms:Encrypt", "kms:GenerateDataKey"], ["kms:Decrypt"]) is False


# ------------------------------------------------------------------
# 5. _load_specs surfaces missing / corrupt data files to stderr
# ------------------------------------------------------------------


def test_load_specs_missing_file_warns_to_stderr(monkeypatch, capsys) -> None:
    """If the data file is absent, _load_specs returns empties AND emits a
    stderr warning so the no-op is never silent (MR7 review item 2)."""
    import validate_kms_consumers as mod

    monkeypatch.setattr(mod, "_DATA_FILE", "/tmp/definitely-not-a-file.json")
    result = mod._load_specs()
    assert result == ({}, {}, (), ())
    err = capsys.readouterr().err
    assert "[validate_kms_consumers] WARNING" in err
    assert "missing" in err
    assert "regenerate-kms-consumer-specs.py" in err


def test_load_specs_corrupt_file_warns_to_stderr(monkeypatch, capsys, tmp_path) -> None:
    import validate_kms_consumers as mod

    bogus = tmp_path / "broken.json"
    bogus.write_text("{ this is not valid json ")
    monkeypatch.setattr(mod, "_DATA_FILE", str(bogus))
    result = mod._load_specs()
    assert result == ({}, {}, (), ())
    err = capsys.readouterr().err
    assert "[validate_kms_consumers] WARNING" in err
    assert "corrupt" in err


def test_load_specs_happy_path_is_silent(capsys) -> None:
    """When the real data file loads, no stderr noise."""
    cfn_spec, tf_spec, cfn_props, tf_args = _load_specs()
    assert cfn_spec  # non-empty
    assert tf_spec
    assert cfn_props
    assert tf_args
    # No stderr noise
    assert capsys.readouterr().err == ""
