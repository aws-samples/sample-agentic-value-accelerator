"""Unit tests for validate_deployable.py — currently covers the CloudFormation
parameter-file skip rule (MR-8 review: prove the bundled F-R5 fix works).

Parameter files (`*-params.json`, `*-parameters.json`) live next to
CloudFormation templates in `controls_dir/iac/cloudformation/` but are the
consumer of a template, not a template themselves — the shape is a JSON list
of `{ParameterKey, ParameterValue}` objects. Before F-R5, the collector in
`check_t1_cfnlint` and `check_t2_cfn_validate` globbed every `*.json` and
handed each one to cfn-lint / cloudformation validate-template, which then
failed with "no Resources block" — a false-positive CRITICAL.

These tests pin the skip behaviour: a dir containing one real template and
one params file must collect exactly one template for validation.
"""
from __future__ import annotations

import json
import os
from unittest.mock import patch

import pytest


# ------------------------------------------------------------------
# Test fixture: isolated cloudformation/ dir with one template + one
# params file next to it.
# ------------------------------------------------------------------


@pytest.fixture
def controls_dir_with_params(tmp_path):
    """Create `tmp_path/iac/cloudformation/` containing:
    - template.yaml — a minimal valid CFN template
    - stack-params.json — a CFN parameters file (JSON list shape)
    - stack-parameters.json — alternate spelling
    - extra.json — a non-params JSON "template" (edge case: JSON CFN templates
      do exist; the skip rule must only exclude suffix-matching files)
    """
    cfn_dir = tmp_path / "iac" / "cloudformation"
    cfn_dir.mkdir(parents=True)
    (cfn_dir / "template.yaml").write_text(
        "AWSTemplateFormatVersion: '2010-09-09'\n"
        "Resources:\n"
        "  NoOp:\n"
        "    Type: AWS::CloudFormation::WaitConditionHandle\n"
    )
    (cfn_dir / "stack-params.json").write_text(
        json.dumps([{"ParameterKey": "Foo", "ParameterValue": "bar"}])
    )
    (cfn_dir / "stack-parameters.json").write_text(
        json.dumps([{"ParameterKey": "Baz", "ParameterValue": "qux"}])
    )
    (cfn_dir / "extra.json").write_text(
        json.dumps({"AWSTemplateFormatVersion": "2010-09-09", "Resources": {}})
    )
    return str(tmp_path)


# ------------------------------------------------------------------
# check_t1_cfnlint — skip params files
# ------------------------------------------------------------------


def test_t1_cfnlint_skips_params_files(controls_dir_with_params, tmp_path) -> None:
    """Only the .yaml template and the non-params .json are handed to cfn-lint.
    stack-params.json and stack-parameters.json must not appear in any _run call."""
    import validate_deployable

    # Fake venv_bin with a stub cfn-lint so the fn doesn't early-return.
    venv_bin = tmp_path / "venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "cfn-lint").write_text("#!/bin/sh\nexit 0\n")
    (venv_bin / "cfn-lint").chmod(0o755)

    captured_templates: list[str] = []

    def fake_run(cmd, timeout=None, env=None):
        # cmd shape: [cfn_lint, "-f", "json", template]
        captured_templates.append(cmd[-1])
        return (0, "", "")

    with patch.object(validate_deployable, "_run", side_effect=fake_run):
        errors = validate_deployable.check_t1_cfnlint(
            controls_dir_with_params, str(venv_bin)
        )

    # No errors — all invocations returned 0.
    assert errors == [], f"unexpected errors: {errors}"

    # Exactly two templates were linted: template.yaml and extra.json.
    # Neither params file is present in the invocation list.
    basenames = sorted(os.path.basename(p) for p in captured_templates)
    assert basenames == ["extra.json", "template.yaml"], (
        f"cfn-lint should have been called on the template + the non-params JSON only, "
        f"but got: {basenames}. The params-skip rule is broken."
    )
    assert not any(
        os.path.basename(p).endswith(("-params.json", "-parameters.json"))
        for p in captured_templates
    ), f"params file leaked into cfn-lint invocation: {captured_templates}"


# ------------------------------------------------------------------
# check_t2_cfn_validate — skip params files
# ------------------------------------------------------------------


def test_t2_cfn_validate_skips_params_files(controls_dir_with_params) -> None:
    """Same rule for the T2 cloudformation validate-template collector.
    We only exercise the file-collection portion — the actual AWS call is
    mocked out because it needs credentials + a template body that round-trips."""
    import validate_deployable

    captured_templates: list[str] = []

    def fake_run(cmd, timeout=None, env=None):
        # Any aws cli call — capture what file was referenced.
        for arg in cmd:
            if "cloudformation" in str(arg) and (arg.endswith(".json") or arg.endswith(".yaml")):
                captured_templates.append(arg)
            elif "file://" in str(arg):
                captured_templates.append(str(arg).replace("file://", ""))
        return (0, '{"Parameters": []}', "")

    with patch.object(validate_deployable, "_run", side_effect=fake_run):
        validate_deployable.check_t2_cfn_validate(
            controls_dir_with_params, profile=None
        )

    # No params file should have been passed to aws cloudformation validate-template.
    assert not any(
        os.path.basename(p).endswith(("-params.json", "-parameters.json"))
        for p in captured_templates
    ), f"params file leaked into cloudformation validate-template: {captured_templates}"
