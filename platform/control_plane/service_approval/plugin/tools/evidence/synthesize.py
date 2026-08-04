"""Service-agnostic CLI command synthesis for Phase 7 Evidence.

Dispatches control metadata to 6 synthesis families (F1-F6) based on
(mechanism, category, scope) tuples. All synthesis is service-agnostic —
no hardcoded "lambda", "s3", "kms" identifiers anywhere.

Core primitive: decode_parameter_path("$.lambda/CreateFunction.KMSKeyArn")
  -> ("lambda", "CreateFunction", "KMSKeyArn")

Family dispatch rules (§4 of evidence-attestation.md):
  F1 - Resource GET probe (describe API -> check property non-null)
  F2 - IAM simulate (simulate-principal-policy with context-entries)
  F3 - Config compliance (configservice describe-compliance-by-config-rule)
  F4 - SSM document check (describe-document status)
  F5 - CloudWatch alarm (describe-alarms state)
  F6 - IaC-time supplemental (NOT_CLI_VALIDATABLE with evidence ref)

Security: every CLI is built as an argv list (never a shell string) and
passed to subprocess.run with shell=False. Untrusted strings (physical_id,
role-arn, property values) cannot escape into the shell.
"""
from __future__ import annotations

import json
import os
import re
import shlex
from dataclasses import dataclass, field
from typing import Any


# Reason codes mirror the schema enum in cli-commands.schema.json so callers
# (validators, dashboards) key off a single source of truth.
REASON_IAC_TIME = "iac-time-only"
REASON_POLICY_ONLY = "policy-only-no-describe-api"
REASON_ORG_TRAIL = "requires-org-trail-correlation"
REASON_MISSING_METADATA = "missing-metadata"
REASON_MISSING_PRINCIPAL = "missing-principal-arn"
REASON_NO_DEPLOYED_RESOURCE = "no-deployed-resource"
REASON_UNKNOWN_MECHANISM = "unknown-mechanism"


# Mechanism families recognized for F6 (intentional IaC-time-only). F6 is
# selected ONLY by these mechanisms or by an explicit `iac_only: true` on the
# control — never as a fallback for failed F1 dispatch.
F6_IAC_ONLY_MECHANISMS = ("Checkov",)


@dataclass
class CliCheck:
    """A synthesized CLI check for a single control.

    Either contains a command_argv + predicate OR a NOT_CLI_VALIDATABLE
    verdict with a reason_code + reason.
    """
    control_id: str
    family: str | None = None
    synthesis_source: str | None = None
    command_argv: list[str] = field(default_factory=list)
    predicate_type: str | None = None  # jmespath, regex, exit_code, jsonpath
    predicate_expression: str | None = None
    expected_pass: str | None = None
    expected_fail: str | None = None
    output_log: str | None = None
    timeout_seconds: int = 30
    expected_account: str | None = None
    verdict: str | None = None  # NOT_CLI_VALIDATABLE, ERROR
    reason_code: str | None = None  # one of REASON_* constants
    reason: str | None = None  # for NOT_CLI_VALIDATABLE
    supplemental_evidence: str | None = None  # for NOT_CLI_VALIDATABLE

    @property
    def command_str(self) -> str:
        """shlex.join of command_argv — for human-readable display only."""
        return shlex.join(self.command_argv) if self.command_argv else ""


def decode_parameter_path(pc: str) -> tuple[str, str, str]:
    """Decode a parameters_controlled path into (service_prefix, operation, property).

    Args:
        pc: Path like "$.lambda/CreateFunction.KMSKeyArn"

    Returns:
        Tuple of (service_prefix, operation, property_path).
        Example: ("lambda", "CreateFunction", "KMSKeyArn")

    Raises:
        ValueError: If path format is invalid.
    """
    if not pc.startswith("$."):
        raise ValueError(f"Invalid parameter path (must start with $.) : {pc!r}")

    rest = pc[2:]
    if "/" not in rest:
        raise ValueError(f"Invalid parameter path (missing /): {pc!r}")
    service_prefix, op_and_prop = rest.split("/", 1)

    if "." in op_and_prop:
        operation, prop_path = op_and_prop.split(".", 1)
    else:
        operation = op_and_prop
        prop_path = ""

    return service_prefix, operation, prop_path


# Stack ARN: arn:aws:cloudformation:<region>:<account>:stack/<name>/<id>
_STACK_ARN_RE = re.compile(
    r"^arn:aws:cloudformation:(?P<region>[a-z]{2}-[a-z]+-\d{1}):(?P<account>\d{12}):stack/"
)


def _extract_region_from_stack_id(stack_id: str) -> str | None:
    """Pull the region segment out of a CloudFormation stack ARN.

    Returns None if stack_id is malformed; callers fall back to leaving
    --region off the argv (operator's default region applies).
    """
    if not stack_id:
        return None
    m = _STACK_ARN_RE.match(stack_id)
    return m.group("region") if m else None


def _extract_account_from_stack_id(stack_id: str) -> str | None:
    """Pull the 12-digit account ID out of a CloudFormation stack ARN."""
    if not stack_id:
        return None
    m = _STACK_ARN_RE.match(stack_id)
    return m.group("account") if m else None


def _stack_region(deployed: dict) -> str | None:
    """Resolve the deployment region from deployed-resources.json.

    Prefer the explicit `region` field; fall back to parsing it out of
    `stack_id` so older Phase 5 outputs keep working.
    """
    region = deployed.get("region")
    if region:
        return region
    return _extract_region_from_stack_id(deployed.get("stack_id", ""))


class CfnDescribeMapError(RuntimeError):
    """Raised when data/cfn-to-describe-api.json is missing or corrupt.

    A missing/corrupt mapping file is a configuration bug, not a degradation
    case — silently returning {} caused every F1 control to emit
    NOT_CLI_VALIDATABLE with reason "CFN type X not found", masking the
    real "the mapping file is broken" problem. Fail loudly.
    """


def _load_cfn_describe_map() -> dict[str, dict]:
    """Load data/cfn-to-describe-api.json mapping.

    Raises:
        CfnDescribeMapError: If the file is missing, unreadable, or invalid JSON.
            Distinguishes "config bug" from "this CFN type isn't in the
            mapping" (the latter is the caller's job to handle).
    """
    data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "data",
    )
    path = os.path.join(data_dir, "cfn-to-describe-api.json")
    if not os.path.isfile(path):
        raise CfnDescribeMapError(
            f"data/cfn-to-describe-api.json is missing (looked at {path}). "
            "This file is required for F1 (resource-get) probe synthesis; "
            "without it, every PRO control with CFN Guard / Hook / OPA "
            "mechanism falls back to NOT_CLI_VALIDATABLE. Restore from git."
        )
    try:
        with open(path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        raise CfnDescribeMapError(
            f"data/cfn-to-describe-api.json is corrupt or unreadable: {e}. "
            "Restore from git history."
        ) from e
    return data.get("mappings", {})


def _find_deployed_for_control(
    deployed: dict,
    control_id: str,
    cfn_type: str,
) -> dict | None:
    """Locate the deployed resource that implements this control.

    Linkage strategy:
      1. _metadata.controls contains control_id (preferred — explicit link
         emitted by Phase 5 generators).
      2. Fallback: logical_id contains the control_id (case-insensitive
         substring match of CTRL-XXX-YYY-NNN suffix).
      3. Fallback: a single resource of cfn_type exists in the stack.

    Returns None if no match — caller emits NOT_CLI_VALIDATABLE.
    """
    candidates = [
        r for r in deployed.get("resources", []) if r.get("cfn_type") == cfn_type
    ]
    if not candidates:
        return None

    # Strategy 1: explicit metadata
    for r in candidates:
        meta = r.get("_metadata") or {}
        if control_id in (meta.get("controls") or []):
            return r

    # Strategy 2: logical_id substring (case-insensitive)
    cid_lower = control_id.lower().replace("-", "")
    for r in candidates:
        logical = (r.get("logical_id") or "").lower().replace("-", "").replace("_", "")
        if cid_lower in logical:
            return r

    # Strategy 3: exactly one of this type in the stack
    if len(candidates) == 1:
        return candidates[0]

    return None


_MIN_NCV_REASON_CHARS = 20


def _ncv(
    control_id: str,
    reason_code: str,
    reason: str,
    supplemental_evidence: str | None = None,
) -> CliCheck:
    """Helper: build a NOT_CLI_VALIDATABLE CliCheck.

    Enforces the same ≥20-char reason length the schema demands, in code,
    so a code path that bypasses schema validation still can't slip a
    short or empty reason through. Reasons should explain WHAT metadata
    is missing and HOW to fix it — short reasons mean a developer didn't
    bother.
    """
    if not reason or len(reason) < _MIN_NCV_REASON_CHARS:
        raise ValueError(
            f"NOT_CLI_VALIDATABLE reason for control {control_id!r} is too short "
            f"(len={len(reason or '')}, min={_MIN_NCV_REASON_CHARS}). "
            f"Got: {reason!r}. "
            f"Reasons must explain what metadata is missing and how to fix it."
        )
    return CliCheck(
        control_id=control_id,
        verdict="NOT_CLI_VALIDATABLE",
        reason_code=reason_code,
        reason=reason,
        supplemental_evidence=supplemental_evidence,
    )


def f1_resource_get_probe(
    control: dict,
    deployed: dict,
    svc: str,
    op: str,
    prop: str,
) -> CliCheck:
    """Family F1: Resource GET probe via describe API.

    For PRO controls that guard a create-time property, the runtime evidence
    is that the resource was deployed WITH the property set compliant.

    Args:
        control: Control dict from mapping-results.json
        deployed: Deployed resources dict from 06-test/deployed-resources.json
        svc: Service prefix (e.g., "lambda")
        op: Operation name (e.g., "CreateFunction")
        prop: Property path (e.g., "KMSKeyArn")

    Returns:
        CliCheck with argv to probe the deployed resource.
    """
    resource_types = control.get("resource_types", [])
    if not resource_types:
        return _ncv(
            control["id"],
            REASON_MISSING_METADATA,
            "F1 dispatch failed: resource_types is empty. Add resource_types "
            "(e.g., ['AWS::Lambda::Function']) to mapping-results.json so the "
            "synthesizer can locate the deployed resource and pick a describe API.",
        )

    cfn_type = resource_types[0]
    deployed_resources = deployed.get("resources", [])
    matching = [r for r in deployed_resources if r.get("cfn_type") == cfn_type]
    if not matching:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F1 dispatch failed: no deployed resource of type {cfn_type} found "
            f"in 06-test/deployed-resources.json. Phase 5 must deploy at least one "
            f"resource of this type for runtime probing to be meaningful.",
        )

    resource = matching[0]
    physical_id = resource.get("physical_id", "")

    cfn_map = _load_cfn_describe_map()
    if cfn_type not in cfn_map:
        return _ncv(
            control["id"],
            REASON_MISSING_METADATA,
            f"F1 dispatch failed: CFN type {cfn_type} not registered in "
            f"data/cfn-to-describe-api.json. Add an entry mapping the type to "
            f"its describe verb and name flag to enable F1 synthesis.",
        )

    desc = cfn_map[cfn_type]
    if desc.get("service") is None:
        # e.g., AWS::Lambda::Permission — policy-only, no direct describe.
        alt_probe = desc.get("alternative_probe", "")
        return _ncv(
            control["id"],
            REASON_POLICY_ONLY,
            f"F1 dispatch failed: CFN type {cfn_type} has no direct describe API. "
            f"{alt_probe} Capture this evidence at IaC-time or via the alternative "
            f"probe and reference it in supplemental_evidence.",
            supplemental_evidence=f"iac-time-evidence/{control['id']}.log",
        )

    # Build argv as a list — never serialize through a shell.
    argv: list[str] = [
        "aws",
        desc["service"],
        desc["verb"],
        desc["name_flag"],
        physical_id,
        "--output",
        "json",
    ]
    region = _stack_region(deployed)
    if region:
        argv.extend(["--region", region])

    expected_account = _extract_account_from_stack_id(deployed.get("stack_id", ""))

    jmespath_expr = prop if prop else "@"
    # Predicate: property is non-null AND non-empty. Both halves of the && return
    # actual booleans (unlike not_null(...) which returns the value), so the
    # conjunction reduces to True/False cleanly. Using single-quoted '' for the
    # empty-string literal — JMESPath's modern syntax (the older backtick form
    # `''` is pending-deprecation).
    predicate_expr = f"{jmespath_expr} != null && {jmespath_expr} != ''"

    return CliCheck(
        control_id=control["id"],
        family="F1-resource-get",
        synthesis_source=f"parameters_controlled[0]={control.get('parameters_controlled', [''])[0]}",
        command_argv=argv,
        predicate_type="jmespath",
        predicate_expression=predicate_expr,
        expected_pass=f"{prop} is set to a non-null, non-empty value",
        expected_fail=f"{prop} is null or empty",
        output_log=f"cli-outputs/{control['id']}--{desc['service']}-{desc['verb'].replace('get-', '').replace('describe-', '')}.log",
        expected_account=expected_account,
    )


def f2_iam_simulate(control: dict, deployed: dict) -> CliCheck:
    """Family F2: IAM simulate-principal-policy.

    For PRV controls (SCPs, IAM policies, permission boundaries), the evidence
    is that the non-compliant action is DENIED when simulated against the
    control's principal.

    Principal resolution:
      1. control.principal_arn (explicit, preferred)
      2. The single deployed AWS::IAM::Role (auto-resolved when unambiguous)
      3. Otherwise NOT_CLI_VALIDATABLE with reason_code=missing-principal-arn
    """
    actions = control.get("actions", [])
    if not actions:
        return _ncv(
            control["id"],
            REASON_MISSING_METADATA,
            "F2 dispatch failed: actions[] is empty for PRV control. Populate "
            "actions in mapping-results.json (e.g., 'lambda:CreateFunction') "
            "so the simulator knows which action to evaluate.",
        )

    action = actions[0]

    # Build context entries for the negative case (parameter MISSING).
    pc_list = control.get("parameters_controlled", [])
    context_entries: list[str] = []
    if pc_list:
        try:
            svc, op, prop = decode_parameter_path(pc_list[0])
            context_key = f"{svc}:{prop}"
            context_entries.append(
                f"ContextKeyName={context_key},ContextKeyValues=,ContextKeyType=string"
            )
        except ValueError:
            pass

    # Principal resolution.
    principal_arn = control.get("principal_arn")
    if not principal_arn:
        deployed_resources = deployed.get("resources", [])
        role_resources = [
            r for r in deployed_resources if r.get("cfn_type") == "AWS::IAM::Role"
        ]
        if len(role_resources) == 1:
            principal_arn = role_resources[0].get("arn", "")
        elif len(role_resources) == 0:
            return _ncv(
                control["id"],
                REASON_MISSING_PRINCIPAL,
                "F2 dispatch failed: control has no principal_arn and no "
                "AWS::IAM::Role is deployed. Add `principal_arn` to the control "
                "in mapping-results.json (e.g., the role this SCP is meant to "
                "constrain) — the synthesizer cannot guess.",
            )
        else:
            role_ids = ", ".join(r.get("logical_id", "?") for r in role_resources)
            return _ncv(
                control["id"],
                REASON_MISSING_PRINCIPAL,
                f"F2 dispatch failed: control has no principal_arn and {len(role_resources)} "
                f"IAM roles are deployed ({role_ids}); refusing to pick arbitrarily. "
                f"Set `principal_arn` on the control in mapping-results.json.",
            )

    if not principal_arn:
        return _ncv(
            control["id"],
            REASON_MISSING_PRINCIPAL,
            "F2 dispatch failed: resolved principal has no ARN. Ensure the IAM "
            "Role's `arn` field is populated in deployed-resources.json or set "
            "`principal_arn` on the control directly.",
        )

    region = _stack_region(deployed)
    expected_account = _extract_account_from_stack_id(deployed.get("stack_id", ""))

    argv: list[str] = [
        "aws",
        "iam",
        "simulate-principal-policy",
        "--policy-source-arn",
        principal_arn,
        "--action-names",
        action,
    ]
    if context_entries:
        argv.extend(["--context-entries", context_entries[0]])
    argv.extend(["--output", "json"])
    if region:
        argv.extend(["--region", region])

    predicate_expr = "EvaluationResults[0].EvalDecision"

    return CliCheck(
        control_id=control["id"],
        family="F2-iam-simulate",
        synthesis_source=f"actions[0]={action}",
        command_argv=argv,
        predicate_type="jmespath",
        predicate_expression=predicate_expr,
        expected_pass="EvalDecision is 'implicitDeny' or 'explicitDeny'",
        expected_fail="EvalDecision is 'allowed'",
        output_log=f"cli-outputs/{control['id']}--iam-simulate.log",
        expected_account=expected_account,
    )


def f3_config_compliance(control: dict, deployed: dict) -> CliCheck:
    """Family F3: AWS Config compliance check.

    The Config rule must be discoverable in deployed-resources.json — Phase
    5 rarely emits rules with predictable names, so we resolve via
    _metadata.controls (preferred) or logical_id substring fallback.
    """
    resource = _find_deployed_for_control(
        deployed, control["id"], "AWS::Config::ConfigRule"
    )
    if resource is None:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F3 dispatch failed: no AWS::Config::ConfigRule resource in "
            f"06-test/deployed-resources.json links to {control['id']}. "
            f"Either tag the deployed rule with _metadata.controls=[\"{control['id']}\"] "
            f"or include the control_id in its logical_id.",
        )

    rule_name = resource.get("physical_id", "")
    if not rule_name:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F3 dispatch failed: deployed Config rule for {control['id']} "
            f"has no physical_id; cannot synthesize get-compliance-details-by-config-rule.",
        )

    region = _stack_region(deployed)
    expected_account = _extract_account_from_stack_id(deployed.get("stack_id", ""))

    argv: list[str] = [
        "aws",
        "configservice",
        "get-compliance-details-by-config-rule",
        "--config-rule-name",
        rule_name,
        "--output",
        "json",
    ]
    if region:
        argv.extend(["--region", region])

    predicate_expr = "EvaluationResults[?ComplianceType=='COMPLIANT'] | length(@) > `0`"

    return CliCheck(
        control_id=control["id"],
        family="F3-config-compliance",
        synthesis_source=f"deployed AWS::Config::ConfigRule logical_id={resource.get('logical_id', '')}",
        command_argv=argv,
        predicate_type="jmespath",
        predicate_expression=predicate_expr,
        expected_pass="At least one resource is COMPLIANT",
        expected_fail="No resources are COMPLIANT",
        output_log=f"cli-outputs/{control['id']}--config-compliance.log",
        expected_account=expected_account,
    )


def f4_ssm_doc_check(control: dict, deployed: dict) -> CliCheck:
    """Family F4: SSM Automation document check."""
    resource = _find_deployed_for_control(
        deployed, control["id"], "AWS::SSM::Document"
    )
    if resource is None:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F4 dispatch failed: no AWS::SSM::Document resource in "
            f"06-test/deployed-resources.json links to {control['id']}. "
            f"Either tag the deployed document with _metadata.controls=[\"{control['id']}\"] "
            f"or include the control_id in its logical_id.",
        )

    doc_name = resource.get("physical_id", "")
    if not doc_name:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F4 dispatch failed: deployed SSM document for {control['id']} "
            f"has no physical_id; cannot synthesize describe-document.",
        )

    region = _stack_region(deployed)
    expected_account = _extract_account_from_stack_id(deployed.get("stack_id", ""))

    argv: list[str] = [
        "aws",
        "ssm",
        "describe-document",
        "--name",
        doc_name,
        "--output",
        "json",
    ]
    if region:
        argv.extend(["--region", region])

    predicate_expr = "Document.Status"

    return CliCheck(
        control_id=control["id"],
        family="F4-ssm-doc",
        synthesis_source=f"deployed AWS::SSM::Document logical_id={resource.get('logical_id', '')}",
        command_argv=argv,
        predicate_type="jmespath",
        predicate_expression=predicate_expr,
        expected_pass="Document.Status is 'Active'",
        expected_fail="Document does not exist or Status is not 'Active'",
        output_log=f"cli-outputs/{control['id']}--ssm-doc.log",
        expected_account=expected_account,
    )


def f5_cloudwatch_alarm(control: dict, deployed: dict) -> CliCheck:
    """Family F5: CloudWatch alarm state check."""
    resource = _find_deployed_for_control(
        deployed, control["id"], "AWS::CloudWatch::Alarm"
    )
    if resource is None:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F5 dispatch failed: no AWS::CloudWatch::Alarm resource in "
            f"06-test/deployed-resources.json links to {control['id']}. "
            f"Either tag the deployed alarm with _metadata.controls=[\"{control['id']}\"] "
            f"or include the control_id in its logical_id.",
        )

    alarm_name = resource.get("physical_id", "")
    if not alarm_name:
        return _ncv(
            control["id"],
            REASON_NO_DEPLOYED_RESOURCE,
            f"F5 dispatch failed: deployed CloudWatch alarm for {control['id']} "
            f"has no physical_id; cannot synthesize describe-alarms.",
        )

    region = _stack_region(deployed)
    expected_account = _extract_account_from_stack_id(deployed.get("stack_id", ""))

    argv: list[str] = [
        "aws",
        "cloudwatch",
        "describe-alarms",
        "--alarm-names",
        alarm_name,
        "--output",
        "json",
    ]
    if region:
        argv.extend(["--region", region])

    predicate_expr = "MetricAlarms[0].StateValue"

    return CliCheck(
        control_id=control["id"],
        family="F5-cw-alarm",
        synthesis_source=f"deployed AWS::CloudWatch::Alarm logical_id={resource.get('logical_id', '')}",
        command_argv=argv,
        predicate_type="jmespath",
        predicate_expression=predicate_expr,
        expected_pass="Alarm state is 'OK' or 'INSUFFICIENT_DATA'",
        expected_fail="Alarm state is 'ALARM' or alarm does not exist",
        output_log=f"cli-outputs/{control['id']}--cw-alarm.log",
        expected_account=expected_account,
    )


def f6_iac_time(control: dict) -> CliCheck:
    """Family F6: IaC-time supplemental evidence.

    Selected ONLY when the control is intentionally template-time only —
    either via mechanism in F6_IAC_ONLY_MECHANISMS (Checkov today) or via
    explicit `iac_only: true` on the control. Never used as a fallback for
    failed F1 dispatch — that path emits NOT_CLI_VALIDATABLE with
    reason_code=missing-metadata so the operator can fix the upstream data.
    """
    mechanism = control.get("mechanism", "")
    evidence_file = "iac-time-evidence/cfn-guard.log"

    if "OPA" in mechanism:
        evidence_file = "iac-time-evidence/opa-eval.log"
    elif "Checkov" in mechanism.lower():
        evidence_file = "iac-time-evidence/checkov.log"

    return _ncv(
        control["id"],
        REASON_IAC_TIME,
        f"{mechanism} operates at template-parse time; runtime verification "
        f"is not applicable. Evidence captured from Phase 4/5 IaC validation "
        f"(see supplemental_evidence path).",
        supplemental_evidence=evidence_file,
    )


def synthesize_cli(
    control: dict,
    validated: dict,
    deployed: dict,
    sar: dict,
) -> CliCheck:
    """Synthesize a CLI check for a single control.

    Dispatches to families F1-F6 based on (mechanism, category, scope).
    Service-agnostic — no hardcoded service names.

    Returns a CliCheck with either argv or a NOT_CLI_VALIDATABLE verdict
    that includes a reason_code from the schema enum.
    """
    scope = control.get("scope", "")
    category = control.get("category", "")
    mechanism = control.get("mechanism", "")
    pc_list = control.get("parameters_controlled", [])
    iac_only = bool(control.get("iac_only", False))

    # Decode first parameter to get (service_prefix, operation, property)
    svc: str | None = None
    op: str | None = None
    prop: str | None = None
    if pc_list:
        try:
            svc, op, prop = decode_parameter_path(pc_list[0])
        except ValueError:
            pass

    if not svc:
        svc = sar.get("service_prefix", "")

    # F6 (intentional IaC-time) — selected ONLY by explicit signal, never as
    # a fallback. Checked BEFORE F1 so a control flagged iac_only doesn't
    # accidentally land in F1's branch.
    if iac_only or mechanism in F6_IAC_ONLY_MECHANISMS:
        return f6_iac_time(control)

    # F1 — Resource GET probe (PRO controls with CFN Guard / Hook / OPA).
    if (
        mechanism in ("CloudFormation Guard", "CloudFormation Hook", "OPA Policy")
        and category == "PRO"
    ):
        if pc_list and svc and op and prop is not None:
            return f1_resource_get_probe(control, deployed, svc, op, prop)
        # Missing metadata — surface it loudly instead of masquerading as F6.
        return _ncv(
            control["id"],
            REASON_MISSING_METADATA,
            f"F1 dispatch failed: parameters_controlled is empty for PRO control "
            f"with mechanism={mechanism}. Add parameters_controlled (e.g., "
            f"['$.<svc>/<Op>.<Prop>']) to mapping-results.json to enable F1 "
            f"synthesis, or set iac_only=true if this control is intentionally "
            f"template-time only.",
        )

    # F2 — IAM simulate (PRV controls with SCP / IAM policy / Permission boundary).
    if (
        mechanism in ("SCP", "IAM Identity Policy", "IAM Permission Boundary")
        and category == "PRV"
    ):
        return f2_iam_simulate(control, deployed)

    # F3 — Config compliance (DET controls with AWS Config Rule).
    if mechanism == "AWS Config Rule" and category == "DET":
        return f3_config_compliance(control, deployed)

    # F4 — SSM document check (COR controls with SSM Automation / Lambda Remediation).
    if (
        mechanism in ("SSM Automation", "Lambda Remediation")
        and category == "COR"
    ):
        return f4_ssm_doc_check(control, deployed)

    # F5 — CloudWatch alarm (DET controls with CloudWatch Alarm).
    if mechanism == "CloudWatch Alarm" and category == "DET":
        return f5_cloudwatch_alarm(control, deployed)

    # Fallback: NOT_CLI_VALIDATABLE with reason_code=unknown-mechanism.
    return _ncv(
        control["id"],
        REASON_UNKNOWN_MECHANISM,
        f"No synthesis rule for mechanism '{mechanism}' at (scope={scope}, "
        f"category={category}). Add a dispatch rule to synthesize.py if this "
        f"mechanism should be CLI-validatable, or mark the control iac_only=true.",
    )


def synthesize_all(
    mapping_results: dict,
    validated: dict,
    deployed: dict,
    sar: dict,
) -> tuple[list[CliCheck], list[CliCheck]]:
    """Synthesize CLI checks for all controls in mapping-results.json.

    Returns (cli_checks, not_cli_validatable). Every control appears in
    exactly one of the two lists — no silent drops.
    """
    controls = mapping_results.get("controls", [])
    cli_checks: list[CliCheck] = []
    not_cli_validatable: list[CliCheck] = []

    for control in controls:
        check = synthesize_cli(control, validated, deployed, sar)
        if check.verdict == "NOT_CLI_VALIDATABLE":
            not_cli_validatable.append(check)
        else:
            cli_checks.append(check)

    return cli_checks, not_cli_validatable
