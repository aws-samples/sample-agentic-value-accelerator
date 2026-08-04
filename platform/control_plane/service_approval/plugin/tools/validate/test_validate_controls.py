"""Unit tests for validate_controls.py.

Covers CHECK-* validator rules in one place. Add new tests here when you add
or fix a CHECK-* rule; keep fixture reuse in mind (SAMPLE_VALIDATED below).

Current coverage:
- CHECK-2:   SSM executeAwsApi steps reference valid operations (skipped for
             cross-service calls where inputs.Service ≠ validated.service).
- CHECK-12:  SCP size limit applied to minified policy body, excluding
             _metadata.
- CHECK-14a: SAR-driven artifacts (SCPs, RCPs, IAM policies, permission
             boundaries, resource-based policies, VPCE policies, KMS key
             policies) — every Condition key must appear in
             validated.json.capabilities.iam.condition_keys[] or be a global
             AWS key (case-insensitive) or a KMS service-owned key inside a
             KMS key policy.
- CHECK-14b: API-driven artifacts (proactive/**,
             detective/config-rule-lambdas/**, responsive/ssm-runbook*,
             responsive/stepfunctions-workflow.json,
             responsive/lambda-remediator/**, iac/**) — any enum-style
             literal list must reference values from
             validated.json.api_surface.operations[].parameters[].enum.
- CHECK-15:  posture-mechanism consistency — a generated artifact's
             `_metadata.posture` must match the directory family it lives in,
             with explicit allowlists for tag-policy, eventbridge-rules,
             cloudwatch-alarms, and compensating-controls-documentation.
- CHECK-16:  generated Python files must not contain bare `true`/`false`/`null`
             tokens (JSON-style). These raise NameError at import time.

CHECK-1, 3-11, and 13 do not yet have unit tests. Add them to this file.
"""
from __future__ import annotations

import json
import os
import tempfile

from validate_controls import (
    check_sar_condition_keys_14a,
    check_api_driven_enum_literals_14b,
    check_posture_mechanism_consistency_15,
)


# ------------------------------------------------------------------
# Shared fixtures
# ------------------------------------------------------------------

SAMPLE_VALIDATED = {
    "service": "ecs",
    "capabilities": {
        "iam": {
            "condition_keys": [
                {"key": "ecs:auto-assign-public-ip", "applies_to_actions": ["ecs:CreateService"]},
                {"key": "ecs:capacity-provider", "applies_to_actions": ["ecs:CreateService"]},
                {"key": "ecs:task-cpu", "applies_to_actions": ["ecs:RegisterTaskDefinition"]},
                {"key": "ecs:privileged", "applies_to_actions": ["ecs:RegisterTaskDefinition"]},
                {"key": "ecs:fargate-ephemeral-storage-kms-key", "applies_to_actions": ["ecs:CreateCluster"]},
            ]
        }
    },
    "api_surface": {
        "operations": [
            {
                "operation": "CreateCluster",
                "parameters": [
                    {
                        "path": "$.configuration.executeCommandConfiguration.logging",
                        "type": "string",
                        "enum": ["NONE", "DEFAULT", "OVERRIDE"],
                    },
                    {
                        "path": "$.defaultCapacityProviderStrategy[].capacityProvider",
                        "type": "string",
                    },
                ],
            },
            {
                "operation": "CreateService",
                "parameters": [
                    {
                        "path": "$.networkConfiguration.awsvpcConfiguration.assignPublicIp",
                        "type": "string",
                        "enum": ["ENABLED", "DISABLED"],
                    },
                    {
                        "path": "$.launchType",
                        "type": "string",
                        "enum": ["EC2", "FARGATE", "EXTERNAL"],
                    },
                    {
                        "path": "$.propagateTags",
                        "type": "string",
                        "enum": ["TASK_DEFINITION", "SERVICE", "NONE"],
                    },
                ],
            },
        ]
    },
}


# ------------------------------------------------------------------
# CHECK-14a — SAR-driven: Condition keys must exist in SAR
# ------------------------------------------------------------------


def _tmp_file(suffix: str, content: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    return path


def test_14a_scp_with_valid_sar_key_passes() -> None:
    scp = {
        "_metadata": {"posture": "preventative-request"},
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "DenyPublicIp",
                "Effect": "Deny",
                "Action": "ecs:CreateService",
                "Resource": "*",
                "Condition": {
                    "StringEquals": {"ecs:auto-assign-public-ip": "ENABLED"},
                    "ArnNotLike": {"aws:PrincipalARN": ["arn:*:iam::*:role/BreakGlassRole"]},
                },
            }
        ],
    }
    path = _tmp_file("_scp-policy.json", json.dumps(scp))
    try:
        errors = check_sar_condition_keys_14a(path, scp, SAMPLE_VALIDATED)
        assert errors == [], f"expected no errors, got {errors}"
    finally:
        os.unlink(path)


def test_14a_scp_with_api_parameter_path_fails() -> None:
    """SCP that cites an API parameter path (not a SAR key) must fail."""
    scp = {
        "_metadata": {"posture": "preventative-request"},
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "DenyBadParam",
                "Effect": "Deny",
                "Action": "ecs:CreateService",
                "Resource": "*",
                "Condition": {
                    # This is a parameter path, NOT a SAR condition key
                    "StringEquals": {
                        "$.networkConfiguration.awsvpcConfiguration.assignPublicIp": "ENABLED"
                    }
                },
            }
        ],
    }
    path = _tmp_file("_scp-policy.json", json.dumps(scp))
    try:
        errors = check_sar_condition_keys_14a(path, scp, SAMPLE_VALIDATED)
        assert len(errors) == 1
        assert "CHECK-14a" in errors[0]
        assert "$.networkConfiguration" in errors[0]
    finally:
        os.unlink(path)


def test_14a_global_key_case_insensitive_passes() -> None:
    """Both aws:PrincipalARN and aws:PrincipalArn should pass — AWS accepts both."""
    for variant in ("aws:PrincipalARN", "aws:PrincipalArn", "aws:principalarn"):
        scp = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "S",
                    "Effect": "Deny",
                    "Action": "ecs:CreateService",
                    "Resource": "*",
                    "Condition": {"ArnNotLike": {variant: ["arn:*"]}},
                }
            ],
        }
        path = _tmp_file("_scp-policy.json", json.dumps(scp))
        try:
            errors = check_sar_condition_keys_14a(path, scp, SAMPLE_VALIDATED)
            assert errors == [], f"{variant} should pass, got {errors}"
        finally:
            os.unlink(path)


def test_14a_kms_key_policy_accepts_kms_service_keys() -> None:
    """KMS key policy files may reference kms:* service-owned keys."""
    kms_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowLogs",
                "Effect": "Allow",
                "Principal": {"Service": "logs.us-east-1.amazonaws.com"},
                "Action": ["kms:Encrypt"],
                "Resource": "*",
                "Condition": {
                    "ArnLike": {
                        "kms:EncryptionContext:aws:logs:arn":
                            "arn:aws:logs:us-east-1:123456789012:log-group:*"
                    }
                },
            }
        ],
    }
    path = _tmp_file("_kms-key-policy.json", json.dumps(kms_policy))
    try:
        errors = check_sar_condition_keys_14a(path, kms_policy, SAMPLE_VALIDATED)
        assert errors == [], f"expected no errors, got {errors}"
    finally:
        os.unlink(path)


def test_14a_non_sar_file_is_skipped() -> None:
    """Files outside SAR-driven paths must not be evaluated by CHECK-14a."""
    # Place the file outside preventive/ (tempfile paths are in /tmp/...)
    # check_sar_condition_keys_14a returns [] for any path not matching SAR-driven names
    scp = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "S",
                "Effect": "Deny",
                "Action": "ecs:CreateService",
                "Resource": "*",
                "Condition": {
                    "StringEquals": {"$.some.api.parameter": "X"}
                },
            }
        ],
    }
    # Filename doesn't match SAR-driven patterns — no error
    path = _tmp_file("_someother.json", json.dumps(scp))
    try:
        errors = check_sar_condition_keys_14a(path, scp, SAMPLE_VALIDATED)
        assert errors == []
    finally:
        os.unlink(path)


def test_14a_permission_boundary_validates() -> None:
    """Permission boundary files are SAR-driven and must enforce."""
    pb = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "S",
                "Effect": "Allow",
                "Action": "ecs:*",
                "Resource": "*",
                "Condition": {
                    "StringEquals": {"nonsense:not-a-real-key": "x"}
                },
            }
        ],
    }
    path = _tmp_file("_permission-boundary.json", json.dumps(pb))
    try:
        errors = check_sar_condition_keys_14a(path, pb, SAMPLE_VALIDATED)
        assert len(errors) == 1
        assert "CHECK-14a" in errors[0]
    finally:
        os.unlink(path)


def test_14a_no_condition_block_is_valid() -> None:
    """Statement with no Condition block is not flagged."""
    scp = {
        "Version": "2012-10-17",
        "Statement": [{"Sid": "S", "Effect": "Deny", "Action": "ecs:*", "Resource": "*"}],
    }
    path = _tmp_file("_scp-policy.json", json.dumps(scp))
    try:
        errors = check_sar_condition_keys_14a(path, scp, SAMPLE_VALIDATED)
        assert errors == []
    finally:
        os.unlink(path)


def test_14a_tag_subkey_passes() -> None:
    """Tag condition keys like aws:RequestTag/Owner pass on the base key match."""
    scp = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "S",
                "Effect": "Deny",
                "Action": "ecs:CreateService",
                "Resource": "*",
                "Condition": {"Null": {"aws:RequestTag/Owner": "true"}},
            }
        ],
    }
    path = _tmp_file("_scp-policy.json", json.dumps(scp))
    try:
        errors = check_sar_condition_keys_14a(path, scp, SAMPLE_VALIDATED)
        assert errors == []
    finally:
        os.unlink(path)


# ------------------------------------------------------------------
# CHECK-14b — API-driven: enum literals must match parameters[].enum
# ------------------------------------------------------------------


def test_14b_cfn_guard_enum_matching_passes() -> None:
    """cfn-guard `in [...]` using values from parameters[].enum passes."""
    content = """
    rule ecs_cluster_logging {
      AWS::ECS::Cluster {
        Properties.Configuration.ExecuteCommandConfiguration.Logging in ["DEFAULT","OVERRIDE"]
      }
    }
    """
    fd, path = tempfile.mkstemp(suffix=".guard", prefix="proactive-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    try:
        errors = check_api_driven_enum_literals_14b(path, SAMPLE_VALIDATED)
        # Match — DEFAULT and OVERRIDE both appear in parameter enum
        assert errors == [], f"expected no errors, got {errors}"
    finally:
        os.unlink(path)


def test_14b_cfn_guard_enum_mismatch_fails() -> None:
    """cfn-guard `in [...]` using a value not in any parameter enum fails."""
    content = """
    rule bad_enum {
      AWS::ECS::Service {
        Properties.LaunchType in ["EC2","LAMBDA"]
      }
    }
    """
    # LAMBDA is not in the launchType enum — should fail
    fd, path = tempfile.mkstemp(suffix=".guard", prefix="proactive-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    try:
        errors = check_api_driven_enum_literals_14b(path, SAMPLE_VALIDATED)
        assert len(errors) >= 1
        assert "CHECK-14b" in errors[0]
        assert "LAMBDA" in " ".join(errors)
    finally:
        os.unlink(path)


def test_14b_cdk_allowed_values_passes() -> None:
    """CDK TypeScript AllowedValues matching parameter enum passes."""
    content = """
    const launchType = new CfnParameter(this, 'LaunchType', {
      AllowedValues: ["EC2", "FARGATE", "EXTERNAL"],
    });
    """
    fd, path = tempfile.mkstemp(suffix=".ts", prefix="iac-cdk-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    # Simulate path under iac/
    target = path.replace(os.path.basename(path), "iac/cdk/" + os.path.basename(path))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    os.rename(path, target)
    try:
        errors = check_api_driven_enum_literals_14b(target, SAMPLE_VALIDATED)
        assert errors == [], f"expected no errors, got {errors}"
    finally:
        os.unlink(target)


def test_14b_python_in_list_passes_when_values_match() -> None:
    """Python Config Lambda `if x in [...]` matching parameter enum passes."""
    content = """
def _evaluate(ci):
    logging_mode = ci['configuration'].get('executeCommandConfiguration', {}).get('logging')
    if logging_mode in ["NONE", "DEFAULT", "OVERRIDE"]:
        return "COMPLIANT", ""
    return "NON_COMPLIANT", "invalid logging mode"
    """
    fd, path = tempfile.mkstemp(suffix=".py", prefix="handler-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    # simulate config-rule-lambdas path
    target = path.replace(os.path.basename(path), "detective/config-rule-lambdas/r/handler.py")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    os.rename(path, target)
    try:
        errors = check_api_driven_enum_literals_14b(target, SAMPLE_VALIDATED)
        assert errors == [], f"expected no errors, got {errors}"
    finally:
        os.unlink(target)


def test_14b_non_api_driven_path_skipped() -> None:
    """Preventive SCP (SAR-driven) — CHECK-14b does not evaluate it."""
    content = """
    "Condition": {"StringEquals": {"key": ["BOGUS_VALUE"]}}
    """
    fd, path = tempfile.mkstemp(suffix=".json", prefix="preventive-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    # simulate preventive/ path
    target = path.replace(os.path.basename(path), "preventive/scp-policy.json")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    os.rename(path, target)
    try:
        errors = check_api_driven_enum_literals_14b(target, SAMPLE_VALIDATED)
        assert errors == []
    finally:
        os.unlink(target)


def test_14b_no_enum_literals_returns_no_errors() -> None:
    """File with no enum-style `in [...]` patterns passes silently."""
    content = """
    rule r {
      AWS::ECS::Cluster {
        Properties.ClusterName !empty
      }
    }
    """
    fd, path = tempfile.mkstemp(suffix=".guard", prefix="proactive-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    try:
        errors = check_api_driven_enum_literals_14b(path, SAMPLE_VALIDATED)
        assert errors == []
    finally:
        os.unlink(path)


def test_14b_arn_like_literals_not_flagged() -> None:
    """Literal strings that look like ARNs / identifiers are not treated as enums."""
    content = """
    resource_arn_whitelist = ["arn:aws:iam::123456789012:role/MyRole"]
    """
    fd, path = tempfile.mkstemp(suffix=".py", prefix="handler-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    target = path.replace(os.path.basename(path), "detective/config-rule-lambdas/r/handler.py")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    os.rename(path, target)
    try:
        errors = check_api_driven_enum_literals_14b(target, SAMPLE_VALIDATED)
        assert errors == []
    finally:
        os.unlink(target)


# ------------------------------------------------------------------
# CHECK-15 — Posture-mechanism consistency
# ------------------------------------------------------------------


def test_15_preventative_request_scp_passes() -> None:
    """posture=preventative-request in preventive/scp*.json passes."""
    data = {"_metadata": {"posture": "preventative-request"}}
    target = "/tmp/fake-controls/preventive/scp-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_reactive_detective_config_rule_passes() -> None:
    """posture=reactive-detective in detective/config-rule-lambdas/ passes."""
    data = {"_metadata": {"posture": "reactive-detective"}}
    target = "/tmp/fake-controls/detective/config-rule-lambdas/my-rule/handler.py"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_reactive_detective_scp_fails() -> None:
    """posture=reactive-detective in preventive/scp*.json must fail."""
    data = {"_metadata": {"posture": "reactive-detective"}}
    target = "/tmp/fake-controls/preventive/scp-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert len(errors) == 1
    assert "CHECK-15" in errors[0]
    assert "reactive-detective" in errors[0]


def test_15_preventative_request_config_lambda_fails() -> None:
    """posture=preventative-request in detective/config-rule-lambdas/ must fail."""
    data = {"_metadata": {"posture": "preventative-request"}}
    target = "/tmp/fake-controls/detective/config-rule-lambdas/r/handler.py"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert len(errors) == 1
    assert "CHECK-15" in errors[0]


def test_15_reactive_corrective_ssm_passes() -> None:
    data = {"_metadata": {"posture": "reactive-corrective"}}
    target = "/tmp/fake-controls/responsive/ssm-runbook.yaml"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_reactive_corrective_scp_fails() -> None:
    data = {"_metadata": {"posture": "reactive-corrective"}}
    target = "/tmp/fake-controls/preventive/scp-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert len(errors) == 1
    assert "CHECK-15" in errors[0]


def test_15_preventative_proactive_guard_passes() -> None:
    data = {"_metadata": {"posture": "preventative-proactive"}}
    target = "/tmp/fake-controls/proactive/cfn-guard-rules.guard"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_preventative_proactive_iac_passes() -> None:
    data = {"_metadata": {"posture": "preventative-proactive"}}
    target = "/tmp/fake-controls/iac/cloudformation/compliant-resource.cfn.yaml"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_no_posture_metadata_passes() -> None:
    """Files without _metadata.posture are not subject to CHECK-15 (opt-in)."""
    data = {"_metadata": {"scope": "account"}}
    target = "/tmp/fake-controls/preventive/scp-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_rcp_valid_for_preventative_request() -> None:
    data = {"_metadata": {"posture": "preventative-request"}}
    target = "/tmp/fake-controls/preventive/rcp-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_vpce_policy_valid_for_preventative_request() -> None:
    data = {"_metadata": {"posture": "preventative-request"}}
    target = "/tmp/fake-controls/preventive/vpce-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_kms_key_policy_valid_for_preventative_request() -> None:
    data = {"_metadata": {"posture": "preventative-request"}}
    target = "/tmp/fake-controls/preventive/kms-key-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_invalid_posture_value_is_ignored() -> None:
    """Unknown posture values do not crash — they just produce no assertion."""
    data = {"_metadata": {"posture": "unknown-bucket"}}
    target = "/tmp/fake-controls/preventive/scp-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    # Not a valid posture label — skip; upstream schema validator catches this.
    assert errors == []


# ------------------------------------------------------------------
# CHECK-15 — extended allowlist (F1 regression coverage)
# ------------------------------------------------------------------


def test_15_tag_policy_valid_for_preventative_request() -> None:
    """tag-policy.json is a preventive artifact; posture=preventative-request
    must be accepted even though the policy is not SAR-driven."""
    data = {"_metadata": {"posture": "preventative-request"}}
    target = "/tmp/fake-controls/preventive/tag-policy.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_eventbridge_rules_valid_for_reactive_detective() -> None:
    data = {"_metadata": {"posture": "reactive-detective"}}
    target = "/tmp/fake-controls/detective/eventbridge-rules.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_cloudwatch_alarms_valid_for_reactive_detective() -> None:
    data = {"_metadata": {"posture": "reactive-detective"}}
    target = "/tmp/fake-controls/detective/cloudwatch-alarms.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_compensating_controls_doc_valid_for_preventative_proactive() -> None:
    """compensating-controls-documentation.json is a cross-cutting gap-coverage
    artifact that lives in detective/ despite carrying a preventative-proactive
    posture — CHECK-15 must accept this specific filename."""
    data = {"_metadata": {"posture": "preventative-proactive"}}
    target = "/tmp/fake-controls/detective/compensating-controls-documentation.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert errors == []


def test_15_arbitrary_json_in_detective_still_fails() -> None:
    """Only whitelisted filenames are accepted in detective/ — other .json
    with reactive-detective posture must still fail."""
    data = {"_metadata": {"posture": "reactive-detective"}}
    target = "/tmp/fake-controls/detective/some-random-file.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    assert len(errors) == 1
    assert "CHECK-15" in errors[0]


def test_15_compensating_controls_doc_outside_detective_fails() -> None:
    """Cross-cutting filename is only accepted in detective/, not elsewhere."""
    data = {"_metadata": {"posture": "preventative-proactive"}}
    target = "/tmp/fake-controls/preventive/compensating-controls-documentation.json"
    errors = check_posture_mechanism_consistency_15(target, data)
    # preventative-proactive expects proactive/** or iac/** or the specific
    # detective/ cross-cutting file — preventive/ is wrong.
    assert len(errors) == 1
    assert "CHECK-15" in errors[0]


# ------------------------------------------------------------------
# CHECK-2 — cross-service SSM api_param (F4 regression coverage)
# ------------------------------------------------------------------


def test_check_2_skips_cross_service_ssm_call() -> None:
    """An ECS SSM runbook calling organizations:ListAccounts must not fail
    CHECK-2 — the api_surface is scoped to the one assessed service."""
    from validate_controls import check_api_parameters_ssm

    runbook = {
        "mainSteps": [
            {
                "name": "remediateAccount",
                "action": "aws:executeAwsApi",
                "inputs": {"Service": "organizations", "Api": "ListAccounts"},
            }
        ]
    }
    validated = {
        "service": "ecs",
        "api_surface": {
            "operations": [
                {"operation": "CreateCluster"},
                {"operation": "UpdateService"},
            ]
        },
    }
    errors = check_api_parameters_ssm("/tmp/fake-ssm.yaml", runbook, validated)
    assert errors == []


def test_check_2_still_flags_same_service_unknown_api() -> None:
    """A same-service call to an unknown API must still fail CHECK-2."""
    from validate_controls import check_api_parameters_ssm

    runbook = {
        "mainSteps": [
            {
                "name": "bad",
                "action": "aws:executeAwsApi",
                "inputs": {"Service": "ecs", "Api": "NotAnApi"},
            }
        ]
    }
    validated = {
        "service": "ecs",
        "api_surface": {
            "operations": [
                {"operation": "CreateCluster"},
            ]
        },
    }
    errors = check_api_parameters_ssm("/tmp/fake-ssm.yaml", runbook, validated)
    assert len(errors) == 1
    assert "NotAnApi" in errors[0]


def test_check_2_missing_service_field_still_validates() -> None:
    """A step with no explicit Service: field is assumed to target the assessed
    service (same behaviour as before F4). Unknown Api must still fail."""
    from validate_controls import check_api_parameters_ssm

    runbook = {
        "mainSteps": [
            {
                "name": "legacy",
                "action": "aws:executeAwsApi",
                "inputs": {"Api": "UnknownOp"},
            }
        ]
    }
    validated = {
        "service": "ecs",
        "api_surface": {"operations": [{"operation": "CreateCluster"}]},
    }
    errors = check_api_parameters_ssm("/tmp/fake-ssm.yaml", runbook, validated)
    assert len(errors) == 1
    assert "UnknownOp" in errors[0]


# ------------------------------------------------------------------
# CHECK-12 — SCP minified-body size (F2 regression coverage)
# ------------------------------------------------------------------


def test_check_12_large_metadata_does_not_trigger_scp_size() -> None:
    """A pretty-printed SCP with a large _metadata sidecar but a tiny policy
    body must NOT fail CHECK-12 — the 5120-char limit applies only to the
    minified policy body submitted to AWS Organizations."""
    from validate_controls import validate_file

    # ~2KB of metadata, ~200B of policy body.
    data = {
        "_metadata": {
            "controls": ",".join(f"CTRL-ORG-PRV-{i:03d}" for i in range(50)),
            "framework": "CCMv4 — " + ",".join(f"FW-{i}" for i in range(200)),
            "mitigations": ",".join(f"M-Node.{i}" for i in range(50)),
        },
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Deny",
                "Action": "ecs:CreateService",
                "Resource": "*",
                "Condition": {"Null": {"ecs:cluster": "true"}},
            }
        ],
    }

    # Create a real temp file in .../controls/preventive/ so _categorize_file
    # returns "preventive" and CHECK-12 is reached.
    preventive_dir = os.path.join(
        tempfile.mkdtemp(prefix="fake-"), "controls", "preventive"
    )
    os.makedirs(preventive_dir, exist_ok=True)
    final_path = os.path.join(preventive_dir, "scp-policy-part1.json")
    with open(final_path, "w") as fh:
        json.dump(data, fh, indent=2)

    raw_size = os.path.getsize(final_path)
    # Sanity check: raw bytes would trigger the old CHECK-12 if > 5120.
    # We don't depend on this — F2 requires that _metadata inflation never
    # triggers the size check.
    assert raw_size > 0

    errors = validate_file(final_path)
    # The only CHECK-12 failure would be scp_size. We assert it is absent.
    check_12_errors = [e for e in errors if "CHECK-12" in e]
    assert check_12_errors == [], (
        f"CHECK-12 false positive with large _metadata: {check_12_errors}"
    )


def test_check_12_oversized_policy_body_still_fails() -> None:
    """If the minified policy body itself exceeds 5120 bytes, CHECK-12 fails."""
    from validate_controls import validate_file

    # Build a policy body > 5120 bytes minified.
    big_statements = [
        {
            "Effect": "Deny",
            "Action": f"ecs:FakeAction{i}",
            "Resource": "arn:aws:ecs:*:*:*",
            "Condition": {"StringEquals": {"ecs:fake-key": "v" * 50}},
        }
        for i in range(40)
    ]
    data = {
        "_metadata": {"posture": "preventative-request"},
        "Version": "2012-10-17",
        "Statement": big_statements,
    }

    preventive_dir = os.path.join(
        tempfile.mkdtemp(prefix="fake-"), "controls", "preventive"
    )
    os.makedirs(preventive_dir, exist_ok=True)
    path = os.path.join(preventive_dir, "scp-policy.json")
    with open(path, "w") as fh:
        json.dump(data, fh, indent=2)

    minified = json.dumps(
        {k: v for k, v in data.items() if k != "_metadata"},
        separators=(",", ":"),
    )
    assert len(minified) > 5120  # precondition for the regression test

    errors = validate_file(path)
    check_12_errors = [e for e in errors if "CHECK-12" in e]
    assert len(check_12_errors) == 1, check_12_errors
    assert "minified policy body" in check_12_errors[0]


# ------------------------------------------------------------------
# CHECK-16 — JS-style booleans / null in generated Python files (F6)
# ------------------------------------------------------------------


def test_check_16_js_false_in_python_dict_fails() -> None:
    from validate_controls import check_js_literals_in_python_16

    src = '''
SMOKE = {
    "compliant": {"privileged": false},
}
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert len(errors) == 1
    assert "CHECK-16" in errors[0]
    assert "'false'" in errors[0]


def test_check_16_js_true_and_null_both_caught() -> None:
    from validate_controls import check_js_literals_in_python_16

    src = '''
x = {"a": true, "b": null}
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert len(errors) == 2
    names = {e.split("'")[1] for e in errors}
    assert names == {"true", "null"}


def test_check_16_ignores_literals_inside_strings() -> None:
    """A JS-token inside a quoted string is valid — don't flag it."""
    from validate_controls import check_js_literals_in_python_16

    src = '''
import json
EVENTS = {
    "compliant": {
        "invokingEvent": json.dumps({"privileged": True}),
        "raw": '{"privileged": true}',
    }
}
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert errors == []


def test_check_16_ignores_comments() -> None:
    from validate_controls import check_js_literals_in_python_16

    src = '''
# note: true vs false is the JSON convention
x = True
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert errors == []


def test_check_16_ignores_python_identifiers() -> None:
    """`true_flag` or `null_value` as identifiers are fine — the NAME token
    string is the full identifier, not just `true`/`null`."""
    from validate_controls import check_js_literals_in_python_16

    src = '''
true_flag = 1
null_value = 2
false_positive_count = 0
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert errors == []


def test_check_16_python_booleans_pass() -> None:
    from validate_controls import check_js_literals_in_python_16

    src = '''
x = {"a": True, "b": False, "c": None}
'''
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert errors == []


def test_check_16_non_python_files_skipped() -> None:
    """CHECK-16 only applies to .py files."""
    from validate_controls import check_js_literals_in_python_16

    src = '{"privileged": true}\n'
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        fh.write(src)
        path = fh.name
    errors = check_js_literals_in_python_16(path)
    assert errors == []


# ------------------------------------------------------------------
# CHECK-1 — EventBridge service_prefix (iter-14 Class B fix)
# ------------------------------------------------------------------


def test_check_1_uses_service_prefix_when_available() -> None:
    """validated.service_prefix (machine identifier) should win over
    validated.service (human display name)."""
    from validate_controls import check_service_prefix

    data = {
        "rules": [
            {
                "rule_name": "rule1",
                "event_pattern": {
                    "source": ["aws.bedrock-agentcore"],
                    "detail": {"eventSource": ["bedrock-agentcore.amazonaws.com"]},
                },
            }
        ]
    }
    validated = {
        "service": "Amazon Bedrock Agentcore",
        "service_prefix": "bedrock-agentcore",
    }
    assert check_service_prefix("/tmp/eventbridge-rules.json", data, validated) == []


def test_check_1_flags_mismatch_against_prefix() -> None:
    from validate_controls import check_service_prefix

    data = {
        "rules": [
            {
                "rule_name": "bad",
                "event_pattern": {
                    "source": ["aws.ecs"],  # wrong prefix
                    "detail": {"eventSource": ["bedrock-agentcore.amazonaws.com"]},
                },
            }
        ]
    }
    validated = {
        "service": "Amazon Bedrock Agentcore",
        "service_prefix": "bedrock-agentcore",
    }
    errors = check_service_prefix("/tmp/eventbridge-rules.json", data, validated)
    assert len(errors) == 1
    assert "CHECK-1" in errors[0]
    assert "aws.bedrock-agentcore" in errors[0]


def test_check_1_skips_when_only_display_name_available() -> None:
    """If only the display name exists (contains whitespace / uppercase),
    skip the check — don't produce nonsensical 'aws.Amazon Bedrock Agentcore'
    expectations."""
    from validate_controls import check_service_prefix

    data = {
        "rules": [
            {
                "rule_name": "rule1",
                "event_pattern": {"source": ["aws.bedrock-agentcore"]},
            }
        ]
    }
    validated = {"service": "Amazon Bedrock Agentcore"}  # no service_prefix
    # Skip rather than assert against the display name.
    assert check_service_prefix("/tmp/eventbridge-rules.json", data, validated) == []


def test_check_1_falls_back_to_service_when_it_is_machine_prefix() -> None:
    """Some pipelines store the machine prefix directly in `service` (ECS
    iter-11 stored "ecs"). Fall back to it only when it looks like a
    machine identifier."""
    from validate_controls import check_service_prefix

    data = {
        "rules": [
            {
                "rule_name": "rule1",
                "event_pattern": {"source": ["aws.ecs"]},
            }
        ]
    }
    validated = {"service": "ecs"}  # no service_prefix, but `service` is machine form
    assert check_service_prefix("/tmp/eventbridge-rules.json", data, validated) == []
