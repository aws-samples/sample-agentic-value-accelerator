"""Tests for CLI synthesis (tools/evidence/synthesize.py).

Tests families F1-F6 synthesis correctness and 100% coverage invariant.
Corresponds to regression tests R8-R11 from evidence-attestation.md §7.
"""
from __future__ import annotations

import json
import re

import pytest
from pathlib import Path

from tools.evidence.synthesize import (
    REASON_IAC_TIME,
    REASON_MISSING_METADATA,
    REASON_MISSING_PRINCIPAL,
    REASON_NO_DEPLOYED_RESOURCE,
    REASON_UNKNOWN_MECHANISM,
    decode_parameter_path,
    synthesize_cli,
    synthesize_all,
    f1_resource_get_probe,
    f2_iam_simulate,
    f3_config_compliance,
    f4_ssm_doc_check,
    f5_cloudwatch_alarm,
    f6_iac_time,
    _extract_region_from_stack_id,
    _extract_account_from_stack_id,
)


@pytest.fixture
def fixture_dir() -> Path:
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def sar_facts(fixture_dir: Path) -> dict:
    with open(fixture_dir / "sar-facts.json") as f:
        return json.load(f)


@pytest.fixture
def validated(fixture_dir: Path) -> dict:
    with open(fixture_dir / "validated.json") as f:
        return json.load(f)


@pytest.fixture
def deployed(fixture_dir: Path) -> dict:
    with open(fixture_dir / "deployed-resources.json") as f:
        return json.load(f)


@pytest.fixture
def mapping_results(fixture_dir: Path) -> dict:
    with open(fixture_dir / "mapping-results.json") as f:
        return json.load(f)


def _control_by_id(mapping_results: dict, cid: str) -> dict:
    for c in mapping_results["controls"]:
        if c["id"] == cid:
            return c
    raise KeyError(cid)


# ===== Helper / primitive tests =====
def test_decode_parameter_path():
    """Test parameter path decoder — core service-agnostic primitive."""
    svc, op, prop = decode_parameter_path("$.lambda/CreateFunction.KMSKeyArn")
    assert svc == "lambda"
    assert op == "CreateFunction"
    assert prop == "KMSKeyArn"

    svc, op, prop = decode_parameter_path("$.s3/PutObject.ServerSideEncryption")
    assert svc == "s3"
    assert op == "PutObject"
    assert prop == "ServerSideEncryption"

    svc, op, prop = decode_parameter_path("$.lambda/CreateFunction")
    assert svc == "lambda"
    assert op == "CreateFunction"
    assert prop == ""

    with pytest.raises(ValueError):
        decode_parameter_path("lambda/CreateFunction.KMSKeyArn")

    with pytest.raises(ValueError):
        decode_parameter_path("$.CreateFunction.KMSKeyArn")


def test_stack_arn_helpers():
    """Region + account extraction from a CloudFormation stack ARN."""
    arn = "arn:aws:cloudformation:us-west-2:111122223333:stack/my-stack/abc-123"
    assert _extract_region_from_stack_id(arn) == "us-west-2"
    assert _extract_account_from_stack_id(arn) == "111122223333"

    assert _extract_region_from_stack_id("") is None
    assert _extract_account_from_stack_id("not-an-arn") is None


# ===== R8: F1 synthesis =====
def test_f1_synthesis_emits_argv(deployed: dict, mapping_results: dict):
    """R8: F1 must emit a clean argv (no shell concatenation), with --region threaded."""
    control = _control_by_id(mapping_results, "CTRL-ACC-PRO-001")
    assert control["mechanism"] == "CloudFormation Guard"

    svc, op, prop = decode_parameter_path(control["parameters_controlled"][0])
    check = f1_resource_get_probe(control, deployed, svc, op, prop)

    assert check.control_id == "CTRL-ACC-PRO-001"
    assert check.family == "F1-resource-get"
    # argv shape: ["aws", "lambda", "get-function-configuration", "--function-name", "test-function", "--output", "json", "--region", "us-east-1"]
    assert check.command_argv[0] == "aws"
    assert "lambda" in check.command_argv
    assert "get-function-configuration" in check.command_argv
    assert "--function-name" in check.command_argv
    assert "test-function" in check.command_argv
    assert "--region" in check.command_argv
    assert "us-east-1" in check.command_argv
    # No shell metacharacters smuggled in.
    for arg in check.command_argv:
        assert not any(c in arg for c in (";", "&&", "|", "`", "$(", "${"))
    assert check.predicate_type == "jmespath"
    # Predicate must be the proper non-null && non-empty form (Low 30 fix).
    assert "!= null" in check.predicate_expression
    assert "!= ''" in check.predicate_expression
    assert "KMSKeyArn" in check.predicate_expression
    assert check.expected_account == "123456789012"


def test_f1_no_resource_types_returns_missing_metadata(deployed: dict, mapping_results: dict):
    """Critical 4: missing resource_types must surface missing-metadata, not silent F6."""
    control = _control_by_id(mapping_results, "CTRL-ACC-PRO-001").copy()
    control["resource_types"] = []
    svc, op, prop = decode_parameter_path(control["parameters_controlled"][0])
    check = f1_resource_get_probe(control, deployed, svc, op, prop)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_MISSING_METADATA


# ===== R9: F2 synthesis =====
def test_f2_synthesis_uses_explicit_principal(deployed: dict, mapping_results: dict):
    """R9 + High 9: F2 must consume control.principal_arn when set."""
    control = _control_by_id(mapping_results, "CTRL-ORG-PRV-001")
    assert control["principal_arn"] == "arn:aws:iam::123456789012:role/test-role"

    check = f2_iam_simulate(control, deployed)

    assert check.family == "F2-iam-simulate"
    assert "aws" in check.command_argv and "iam" in check.command_argv
    assert "simulate-principal-policy" in check.command_argv
    assert "--policy-source-arn" in check.command_argv
    idx = check.command_argv.index("--policy-source-arn")
    assert check.command_argv[idx + 1] == control["principal_arn"]
    assert "lambda:CreateFunction" in check.command_argv
    assert "--region" in check.command_argv


def test_f2_zero_roles_no_principal_returns_missing_principal(mapping_results: dict):
    """High 9: zero IAM roles + no principal_arn -> missing-principal-arn."""
    control = _control_by_id(mapping_results, "CTRL-ORG-PRV-001").copy()
    control.pop("principal_arn", None)
    deployed_no_role = {
        "schema_version": "1.0",
        "service_slug": "awslambda",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/test/abc",
        "resources": [
            {"cfn_type": "AWS::Lambda::Function", "logical_id": "X", "physical_id": "x"}
        ],
    }
    check = f2_iam_simulate(control, deployed_no_role)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_MISSING_PRINCIPAL


def test_f2_multiple_roles_no_principal_returns_missing_principal(mapping_results: dict):
    """High 9: multiple IAM roles + no principal_arn -> refuse to guess."""
    control = _control_by_id(mapping_results, "CTRL-ORG-PRV-001").copy()
    control.pop("principal_arn", None)
    deployed_two_roles = {
        "schema_version": "1.0",
        "service_slug": "awslambda",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/test/abc",
        "resources": [
            {
                "cfn_type": "AWS::IAM::Role",
                "logical_id": "RoleA",
                "physical_id": "role-a",
                "arn": "arn:aws:iam::123456789012:role/role-a",
            },
            {
                "cfn_type": "AWS::IAM::Role",
                "logical_id": "RoleB",
                "physical_id": "role-b",
                "arn": "arn:aws:iam::123456789012:role/role-b",
            },
        ],
    }
    check = f2_iam_simulate(control, deployed_two_roles)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_MISSING_PRINCIPAL
    assert "RoleA" in check.reason and "RoleB" in check.reason


def test_f2_single_role_auto_resolves(mapping_results: dict):
    """High 9: exactly one deployed IAM role auto-resolves."""
    control = _control_by_id(mapping_results, "CTRL-ORG-PRV-001").copy()
    control.pop("principal_arn", None)
    deployed_one_role = {
        "schema_version": "1.0",
        "service_slug": "awslambda",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/test/abc",
        "resources": [
            {
                "cfn_type": "AWS::IAM::Role",
                "logical_id": "RoleA",
                "physical_id": "role-a",
                "arn": "arn:aws:iam::123456789012:role/role-a",
            },
        ],
    }
    check = f2_iam_simulate(control, deployed_one_role)
    assert check.family == "F2-iam-simulate"
    assert "arn:aws:iam::123456789012:role/role-a" in check.command_argv


# ===== R10: F3-F6 synthesis =====
def test_f3_synthesis_uses_deployed_rule(deployed: dict, mapping_results: dict):
    """R10 + High 10: F3 resolves the Config rule from deployed-resources, not invented."""
    control = _control_by_id(mapping_results, "CTRL-ACC-DET-001")
    check = f3_config_compliance(control, deployed)
    assert check.family == "F3-config-compliance"
    assert "lambda-kms-config-rule-deployed" in check.command_argv
    assert "config-rule" not in [a for a in check.command_argv if a.startswith("config-rule-")]
    assert "--region" in check.command_argv


def test_f3_no_deployed_rule(mapping_results: dict):
    """High 10: F3 emits no-deployed-resource when no rule links to the control."""
    control = _control_by_id(mapping_results, "CTRL-ACC-DET-001")
    deployed_no_rule = {
        "schema_version": "1.0",
        "service_slug": "awslambda",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/test/abc",
        "resources": [{"cfn_type": "AWS::Lambda::Function", "logical_id": "X", "physical_id": "x"}],
    }
    check = f3_config_compliance(control, deployed_no_rule)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_NO_DEPLOYED_RESOURCE


def test_f4_synthesis_uses_deployed_doc(deployed: dict, mapping_results: dict):
    """R10 + High 10: F4 resolves the SSM document from deployed-resources."""
    control = _control_by_id(mapping_results, "CTRL-ACC-COR-001")
    check = f4_ssm_doc_check(control, deployed)
    assert check.family == "F4-ssm-doc"
    assert "Remediate-Lambda-NoKms-Doc" in check.command_argv
    assert "--region" in check.command_argv


def test_f5_synthesis_uses_deployed_alarm(deployed: dict, mapping_results: dict):
    """R10 + High 10: F5 resolves the CloudWatch alarm from deployed-resources."""
    control = _control_by_id(mapping_results, "CTRL-ACC-DET-002")
    check = f5_cloudwatch_alarm(control, deployed)
    assert check.family == "F5-cw-alarm"
    assert "test-stack-LambdaErrorAlarm-XYZ" in check.command_argv
    assert "--region" in check.command_argv


def test_f6_synthesis_returns_iac_time(mapping_results: dict):
    """R10: F6 only fires for intentional IaC-time controls (iac_only=true here)."""
    control = _control_by_id(mapping_results, "CTRL-ACC-PRO-002")
    assert control.get("iac_only") is True
    check = f6_iac_time(control)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_IAC_TIME
    assert len(check.reason) >= 20
    assert check.supplemental_evidence  # required when reason_code is iac-time-only


# ===== R11: 100% coverage invariant — no tautologies =====

# Dispatch matrix: (mechanism, category, scope) -> expected family or NCV reason_code.
# This matrix is the single source of truth for synthesizer dispatch behavior.
DISPATCH_MATRIX = [
    # (mechanism, category, scope, expected_family_or_NCV)
    ("CloudFormation Guard", "PRO", "ACC", "F1-resource-get"),
    ("CloudFormation Hook", "PRO", "ACC", "F1-resource-get"),
    ("OPA Policy", "PRO", "ACC", "F1-resource-get"),
    ("SCP", "PRV", "ORG", "F2-iam-simulate"),
    ("IAM Identity Policy", "PRV", "ACC", "F2-iam-simulate"),
    ("IAM Permission Boundary", "PRV", "ACC", "F2-iam-simulate"),
    ("AWS Config Rule", "DET", "ACC", "F3-config-compliance"),
    ("SSM Automation", "COR", "ACC", "F4-ssm-doc"),
    ("Lambda Remediation", "COR", "ACC", "F4-ssm-doc"),
    ("CloudWatch Alarm", "DET", "ACC", "F5-cw-alarm"),
    ("Checkov", "PRO", "ACC", f"NCV:{REASON_IAC_TIME}"),
    ("UnknownMechanism", "PRO", "ACC", f"NCV:{REASON_UNKNOWN_MECHANISM}"),
]


@pytest.mark.parametrize("mechanism,category,scope,expected", DISPATCH_MATRIX)
def test_dispatch_matrix(
    mechanism: str,
    category: str,
    scope: str,
    expected: str,
    deployed: dict,
    sar_facts: dict,
    validated: dict,
):
    """Matrix-driven dispatch test.

    Documents every (mechanism, category, scope) tuple supported by the
    synthesizer. Any change to the dispatch table requires a matrix update —
    no silent regression is possible. The matrix replaces the previous
    tautological `len(cli_checks)+len(ncv) == len(controls)` check (R11).
    """
    # Synthetic control. Set principal_arn and resource_types so F1/F2/F3/F4/F5
    # have what they need to actually emit a command — the test asserts the
    # *family*, not whether NCV fallbacks fire from missing metadata.
    ctrl_id = f"CTRL-{scope}-{category}-999"
    control = {
        "id": ctrl_id,
        "mechanism": mechanism,
        "scope": scope,
        "category": category,
        "parameters_controlled": ["$.lambda/CreateFunction.KMSKeyArn"],
        "actions": ["lambda:CreateFunction"],
        "resource_types": ["AWS::Lambda::Function"],
        "principal_arn": "arn:aws:iam::123456789012:role/test-role",
    }

    # For the F3/F4/F5 cases we need a deployed resource that links back to
    # the synthetic control. Inject one into a copy of the fixture.
    cfn_for_family = {
        "F3-config-compliance": "AWS::Config::ConfigRule",
        "F4-ssm-doc": "AWS::SSM::Document",
        "F5-cw-alarm": "AWS::CloudWatch::Alarm",
    }
    if expected in cfn_for_family:
        deployed = json.loads(json.dumps(deployed))  # deep copy
        deployed["resources"].append({
            "cfn_type": cfn_for_family[expected],
            "logical_id": f"Test{expected.replace('-', '')}",
            "physical_id": f"test-physical-{ctrl_id.lower()}",
            "_metadata": {"controls": [ctrl_id]},
        })

    check = synthesize_cli(control, validated, deployed, sar_facts)

    if expected.startswith("NCV:"):
        expected_code = expected[len("NCV:"):]
        assert check.verdict == "NOT_CLI_VALIDATABLE", (
            f"Expected NCV for ({mechanism}, {category}, {scope}); got family={check.family}"
        )
        assert check.reason_code == expected_code, (
            f"Expected reason_code={expected_code}, got {check.reason_code}; "
            f"reason={check.reason!r}"
        )
    else:
        assert check.family == expected, (
            f"({mechanism}, {category}, {scope}) -> expected {expected}, got "
            f"family={check.family} verdict={check.verdict} reason={check.reason!r}"
        )
        assert check.command_argv, "Expected non-empty command_argv"


def test_dispatch_explicit_iac_only_takes_precedence(
    deployed: dict, sar_facts: dict, validated: dict
):
    """Critical 4: iac_only=true short-circuits to F6, even if mechanism would
    normally pick F1."""
    control = {
        "id": "CTRL-ACC-PRO-998",
        "mechanism": "CloudFormation Guard",
        "scope": "ACC",
        "category": "PRO",
        "parameters_controlled": ["$.lambda/CreateFunction.KMSKeyArn"],
        "actions": [],
        "resource_types": ["AWS::Lambda::Function"],
        "iac_only": True,
    }
    check = synthesize_cli(control, validated, deployed, sar_facts)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_IAC_TIME


def test_dispatch_pro_with_empty_parameters_controlled_emits_missing_metadata(
    deployed: dict, sar_facts: dict, validated: dict
):
    """Critical 4: PRO + Guard/Hook/OPA + empty parameters_controlled MUST NOT
    silently downgrade to F6. It must surface missing-metadata.
    """
    control = {
        "id": "CTRL-ACC-PRO-997",
        "mechanism": "CloudFormation Guard",
        "scope": "ACC",
        "category": "PRO",
        "parameters_controlled": [],
        "actions": [],
        "resource_types": ["AWS::Lambda::Function"],
    }
    check = synthesize_cli(control, validated, deployed, sar_facts)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_MISSING_METADATA


def test_no_silent_drops(
    mapping_results: dict, validated: dict, deployed: dict, sar_facts: dict
):
    """Each control must materialize as exactly one CliCheck — no duplicates,
    no silent drops. This replaces the tautological coverage assertion.
    """
    cli_checks, ncvs = synthesize_all(mapping_results, validated, deployed, sar_facts)

    seen: dict[str, int] = {}
    for c in cli_checks + ncvs:
        seen[c.control_id] = seen.get(c.control_id, 0) + 1

    expected_ids = {c["id"] for c in mapping_results["controls"]}
    assert set(seen.keys()) == expected_ids, (
        f"Control set mismatch: missing={expected_ids - set(seen.keys())}, "
        f"unexpected={set(seen.keys()) - expected_ids}"
    )
    duplicates = {cid: n for cid, n in seen.items() if n != 1}
    assert not duplicates, f"Duplicate dispatches: {duplicates}"


def test_synthesize_cli_dispatcher(
    mapping_results: dict, validated: dict, deployed: dict, sar_facts: dict
):
    """Spot-check dispatch on each fixture control."""
    fixture_expectations = {
        "CTRL-ACC-PRO-001": ("family", "F1-resource-get"),
        "CTRL-ORG-PRV-001": ("family", "F2-iam-simulate"),
        "CTRL-ACC-DET-001": ("family", "F3-config-compliance"),
        "CTRL-ACC-COR-001": ("family", "F4-ssm-doc"),
        "CTRL-ACC-PRO-002": ("ncv", REASON_IAC_TIME),
        "CTRL-ACC-DET-002": ("family", "F5-cw-alarm"),
    }
    for control in mapping_results["controls"]:
        check = synthesize_cli(control, validated, deployed, sar_facts)
        kind, expected = fixture_expectations[control["id"]]
        if kind == "family":
            assert check.family == expected, f"{control['id']}: {check.family} != {expected}"
        else:
            assert check.verdict == "NOT_CLI_VALIDATABLE"
            assert check.reason_code == expected


# ===== Edge cases =====
def test_synthesize_unknown_mechanism(deployed: dict, sar_facts: dict, validated: dict):
    control = {
        "id": "CTRL-ACC-PRO-999",
        "mechanism": "UnknownMechanism",
        "scope": "ACC",
        "category": "PRO",
        "parameters_controlled": [],
        "actions": [],
        "resource_types": [],
    }
    check = synthesize_cli(control, validated, deployed, sar_facts)
    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_UNKNOWN_MECHANISM
    assert len(check.reason) >= 20


def test_f1_missing_deployed_resource(deployed: dict, mapping_results: dict):
    control = _control_by_id(mapping_results, "CTRL-ACC-PRO-001").copy()
    control["resource_types"] = ["AWS::DynamoDB::Table"]

    svc, op, prop = decode_parameter_path(control["parameters_controlled"][0])
    check = f1_resource_get_probe(control, deployed, svc, op, prop)

    assert check.verdict == "NOT_CLI_VALIDATABLE"
    assert check.reason_code == REASON_NO_DEPLOYED_RESOURCE


# ===== Critical 1: shell-injection-shaped physical_id is locked out by argv shape =====
def test_f1_argv_immune_to_shell_metacharacters(
    deployed: dict, mapping_results: dict, monkeypatch
):
    """Even if a malicious physical_id leaks past the schema pattern, argv
    isolation means the shell never sees it."""
    deployed = json.loads(json.dumps(deployed))
    # Inject a malicious physical_id (this would be rejected by the schema,
    # but we want to prove the argv path doesn't allow injection even if it
    # somehow lands here).
    for r in deployed["resources"]:
        if r["cfn_type"] == "AWS::Lambda::Function":
            r["physical_id"] = "test-function;rm -rf /;#"

    control = _control_by_id(mapping_results, "CTRL-ACC-PRO-001")
    svc, op, prop = decode_parameter_path(control["parameters_controlled"][0])
    check = f1_resource_get_probe(control, deployed, svc, op, prop)

    # The malicious value must appear as a SINGLE argv element — not as part
    # of a concatenated shell string.
    assert "test-function;rm -rf /;#" in check.command_argv
    # And there must be no joined string that would let the shell see it.
    for arg in check.command_argv:
        if arg == "test-function;rm -rf /;#":
            continue  # the value itself, intact
        assert ";rm" not in arg
        assert "&&" not in arg
