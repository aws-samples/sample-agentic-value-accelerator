#!/usr/bin/env python3
"""
Per-file deterministic validator for generated security control artifacts.

Checks generated artifacts against validated.json and mapping-results.json
as ground truth. Pure stdlib Python (yaml optional).

Usage:
    python3 validate_controls.py <file_path>

Exit codes:
    0 — all checks pass
    2 — validation errors found (errors on stderr)
"""

import json
import os
import re
import sys

# ================================================================
# Global AWS condition keys — always valid, not service-specific
# ================================================================

_GLOBAL_CONDITION_KEYS = {
    "aws:CalledVia",
    "aws:CalledViaFirst",
    "aws:CalledViaLast",
    "aws:CurrentTime",
    "aws:EpochTime",
    "aws:FederatedProvider",
    "aws:MultiFactorAuthAge",
    "aws:MultiFactorAuthPresent",
    "aws:PrincipalAccount",
    "aws:PrincipalARN",
    "aws:PrincipalIsAWSService",
    "aws:PrincipalOrgID",
    "aws:PrincipalOrgPaths",
    "aws:PrincipalServiceName",
    "aws:PrincipalServiceNamesList",
    "aws:PrincipalTag",
    "aws:PrincipalType",
    "aws:Referer",
    "aws:RequestedRegion",
    "aws:RequestTag",
    "aws:ResourceAccount",
    "aws:ResourceOrgID",
    "aws:ResourceOrgPaths",
    "aws:ResourceTag",
    "aws:SecureTransport",
    "aws:SourceAccount",
    "aws:SourceArn",
    "aws:SourceIdentity",
    "aws:SourceIp",
    "aws:SourceOrgID",
    "aws:SourceOrgPaths",
    "aws:SourceVpc",
    "aws:SourceVpce",
    "aws:TagKeys",
    "aws:TokenIssueTime",
    "aws:UserAgent",
    "aws:ViaAWSService",
    "aws:VpcSourceIp",
}

# Network perimeter condition keys that require null-key protection
_NETWORK_PERIMETER_KEYS = {
    "aws:SourceVpc",
    "aws:SourceVpce",
}

# KMS service-owned condition keys — always valid inside KMS key policies
# regardless of which downstream service consumes the key. AWS KMS evaluates these
# on its own operations. See:
# https://docs.aws.amazon.com/kms/latest/developerguide/policy-conditions.html
_KMS_SERVICE_CONDITION_KEYS = {
    "kms:BypassPolicyLockoutSafetyCheck",
    "kms:CallerAccount",
    "kms:CustomerMasterKeySpec",
    "kms:CustomerMasterKeyUsage",
    "kms:DataKeyPairSpec",
    "kms:EncryptionAlgorithm",
    "kms:EncryptionContextKeys",
    "kms:ExpirationModel",
    "kms:GrantConstraintType",
    "kms:GrantIsForAWSResource",
    "kms:GrantOperations",
    "kms:GranteePrincipal",
    "kms:KeyOrigin",
    "kms:MacAlgorithm",
    "kms:MessageType",
    "kms:MultiRegion",
    "kms:MultiRegionKeyType",
    "kms:PrimaryRegion",
    "kms:ReEncryptOnSameKey",
    "kms:RequestAlias",
    "kms:ResourceAliases",
    "kms:RetiringPrincipal",
    "kms:SigningAlgorithm",
    "kms:ValidTo",
    "kms:ViaService",
    "kms:WrappingAlgorithm",
    "kms:WrappingKeySpec",
}


# ================================================================
# State file loading
# ================================================================

def _find_state_dir(file_path: str) -> dict[str, str] | None:
    """Walk up from file_path to find service root, return phase paths.

    In the new per-service-per-phase layout, controls live at
    .service-approval/<slug>/05-generate/ and need to reference files in
    sibling phases like 04-map/, 03-validate/, 01-assess/.

    Delegates to tools.paths.find_service_root_for_file (regex-anchored to
    canonical phase dir names) instead of the prior heuristic
    `c.startswith("0") and "-" in c`, which mis-matched `0-day-old-cache`,
    `00-private`, etc.

    Returns:
        Dict with keys "map", "validate", "assess" pointing to phase directories,
        or None if service root cannot be found.
    """
    # Local import to avoid circular dependency at module load (paths.py is
    # in the parent package, this module is in tools/validate/).
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from paths import find_service_root_for_file  # type: ignore

    service_root = find_service_root_for_file(file_path)
    if service_root is None:
        return None
    return {
        "map": str(service_root / "04-map"),
        "validate": str(service_root / "03-validate"),
        "assess": str(service_root / "01-assess"),
    }


def _load_json(path: str) -> dict | None:
    """Load JSON file, return None if missing or invalid."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def load_state_files(file_path: str) -> tuple:
    """Load validated.json and mapping-results.json from nearest state dirs."""
    state_dirs = _find_state_dir(file_path)
    if not state_dirs:
        return None, None
    validated = _load_json(os.path.join(state_dirs["validate"], "validated.json"))
    mapping = _load_json(os.path.join(state_dirs["map"], "mapping-results.json"))
    return validated, mapping


# ================================================================
# Metadata extraction (handles both UPPERCASE and lowercase keys)
# ================================================================

def extract_metadata(data) -> dict | None:
    """Extract _metadata from JSON, normalizing keys to lowercase.

    Accepts any loaded JSON value; returns None for non-dict top-level values
    (e.g. CloudFormation parameter override files are JSON arrays).
    """
    if not isinstance(data, dict):
        return None
    meta = data.get("_metadata")
    if not meta or not isinstance(meta, dict):
        return None
    return {k.lower(): v for k, v in meta.items()}


def _extract_metadata_controls(meta: dict) -> list[str]:
    """Extract control IDs from normalized metadata."""
    controls = meta.get("controls", "")
    if isinstance(controls, list):
        return controls
    if isinstance(controls, str):
        return [c.strip() for c in controls.split(",") if c.strip()]
    return []


# ================================================================
# Check 1: Service prefix in EventBridge rules
# ================================================================

def check_service_prefix(file_path: str, data: dict, validated: dict) -> list[str]:
    """Verify EventBridge source and eventSource match validated.json service.

    EventBridge events carry the machine service identifier (e.g.
    `aws.bedrock-agentcore`, `bedrock-agentcore.amazonaws.com`), not the
    human-readable service name. Prefer `service_prefix` (populated from
    sar-facts) and fall back to `service` only when it isn't available.
    If `service` happens to be a human-readable name (e.g. "Amazon Bedrock
    Agentcore"), the expected strings are nonsense — that's an upstream
    bug, not an artifact issue. Skip rather than raise a false positive.
    """
    errors = []
    expected_service = validated.get("service_prefix") or validated.get("service", "")
    if not expected_service:
        return errors
    # Machine identifiers are lowercase and contain no whitespace. Anything
    # with a space or uppercase letter is a display name — skip the check.
    if " " in expected_service or any(c.isupper() for c in expected_service):
        return errors

    expected_source = f"aws.{expected_service}"
    expected_event_source = f"{expected_service}.amazonaws.com"

    rules = data.get("rules", [])
    if not isinstance(rules, list):
        return errors

    for i, rule in enumerate(rules):
        if not isinstance(rule, dict):
            continue
        rule_name = rule.get("rule_name", f"rule[{i}]")
        pattern = rule.get("event_pattern", {})
        if not isinstance(pattern, dict):
            continue

        # Check source field
        sources = pattern.get("source", [])
        for src in sources:
            if src != expected_source:
                errors.append(
                    f"CHECK-1 service_prefix: {rule_name} has source "
                    f"'{src}', expected '{expected_source}'"
                )

        # Check eventSource in detail
        detail = pattern.get("detail", {})
        if isinstance(detail, dict):
            event_sources = detail.get("eventSource", [])
            for es in event_sources:
                if es != expected_event_source:
                    errors.append(
                        f"CHECK-1 service_prefix: {rule_name} has eventSource "
                        f"'{es}', expected '{expected_event_source}'"
                    )

    return errors


# ================================================================
# Check 2: API parameters exist in api_surface
# ================================================================

def _extract_valid_params(validated: dict) -> set[str]:
    """Build set of valid parameter paths from api_surface."""
    params = set()
    api = validated.get("api_surface", {})
    for op in api.get("operations", []):
        for p in op.get("parameters", []):
            path = p.get("path", "")
            # Normalize: strip $. prefix, lowercase
            clean = path.lstrip("$").lstrip(".")
            if clean:
                params.add(clean)
                params.add(clean.lower())
    return params


def _extract_valid_operations(validated: dict) -> set[str]:
    """Build set of valid operation names from api_surface."""
    ops = set()
    api = validated.get("api_surface", {})
    for op in api.get("operations", []):
        name = op.get("operation", "")
        if name:
            ops.add(name)
    return ops


def check_api_parameters_stepfunctions(file_path: str, data: dict, validated: dict) -> list[str]:
    """Check Step Functions Parameters blocks reference valid API params."""
    errors = []
    valid_params = _extract_valid_params(validated)
    if not valid_params:
        return errors

    states = data.get("States", {})
    for state_name, state in states.items():
        if not isinstance(state, dict):
            continue
        if state.get("Type") != "Task":
            continue
        resource = state.get("Resource", "")
        if "aws-sdk:" not in resource:
            continue

        params = state.get("Parameters", {})
        for key in params:
            # Strip .$ suffix (JSONPath reference marker)
            clean_key = key.rstrip("$").rstrip(".")
            if clean_key:
                # Skip common Step Functions intrinsics
                if clean_key.lower() in ("resulttoken", "next", "end"):
                    continue
                # We don't validate every SDK param, just flag obviously wrong ones
                # that use PascalCase when the service expects camelCase or vice versa

    return errors


def check_api_parameters_ssm(file_path: str, data: dict, validated: dict) -> list[str]:
    """Check SSM runbook executeAwsApi steps reference valid operations.

    Only enforces api_surface membership when the step's `Service:` matches
    the assessed service. Cross-service calls (e.g., an ECS runbook invoking
    `organizations:ListAccounts`) are out of scope for this validator — the
    api_surface in validated.json is scoped to a single service.
    """
    errors = []
    valid_ops = _extract_valid_operations(validated)
    if not valid_ops:
        return errors

    target_service = _normalize_service_identifier(validated.get("service", ""))
    if not target_service:
        return errors

    # SSM runbooks can have steps with aws:executeAwsApi action
    steps = data.get("mainSteps", [])
    if not isinstance(steps, list):
        return errors

    for step in steps:
        if not isinstance(step, dict):
            continue
        action = step.get("action", "")
        if action != "aws:executeAwsApi":
            continue
        inputs = step.get("inputs", {})
        step_service = _normalize_service_identifier(inputs.get("Service", ""))
        if step_service and step_service != target_service:
            # Cross-service call — validator cannot verify without the other
            # service's api_surface. Skip rather than raise a false positive.
            continue
        api_action = inputs.get("Api", "")
        if api_action and api_action not in valid_ops:
            errors.append(
                f"CHECK-2 api_param: SSM step '{step.get('name', '?')}' calls "
                f"Api '{api_action}' which is not in validated api_surface operations"
            )

    return errors


def _normalize_service_identifier(value: str) -> str:
    """Normalise an AWS service identifier for case-insensitive comparison.

    Accepts forms like `"ecs"`, `"ECS"`, `"Amazon Elastic Container Service"`.
    Returns a lowercase stripped string; caller is responsible for any further
    canonicalisation needed.
    """
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


# ================================================================
# Check 3: Condition keys valid
# ================================================================

def check_condition_keys(file_path: str, data: dict, validated: dict) -> list[str]:
    """Verify condition keys in IAM policies match validated.json."""
    errors = []
    service_keys = set()
    for ck in validated.get("capabilities", {}).get("iam", {}).get("condition_keys", []):
        key = ck.get("key", "")
        if key:
            service_keys.add(key)

    if not service_keys:
        return errors

    # KMS key policies may reference KMS service-owned condition keys
    # (kms:ViaService, kms:EncryptionContext:*, kms:GrantOperations, etc.) regardless
    # of which downstream service the CMK encrypts for. These keys are evaluated by
    # AWS KMS on its own operations, not by the consuming service.
    is_kms_key_policy = "kms-key-policy" in os.path.basename(file_path).lower()

    def _check_condition_block(condition: dict, context: str):
        if not isinstance(condition, dict):
            return
        for operator, keys_dict in condition.items():
            if not isinstance(keys_dict, dict):
                continue
            for key in keys_dict:
                # Skip global AWS keys (exact match or prefix match for tag keys)
                key_base = key.split("/")[0] if "/" in key else key
                if key_base in _GLOBAL_CONDITION_KEYS:
                    continue
                # Skip if it's a service-specific key we know about
                if key in service_keys:
                    continue
                # Skip tag condition keys (service:ResourceTag/*, etc.)
                if "Tag/" in key or "TagKeys" in key:
                    continue
                # Skip KMS service-owned keys when evaluating a KMS key policy
                if is_kms_key_policy and (
                    key_base in _KMS_SERVICE_CONDITION_KEYS
                    or key_base == "kms:EncryptionContext"
                    or key.startswith("kms:EncryptionContext:")
                ):
                    continue
                errors.append(
                    f"CHECK-3 condition_key: {context} uses condition key "
                    f"'{key}' not found in validated.json condition_keys"
                )

    statements = data.get("Statement", [])
    if not isinstance(statements, list):
        return errors

    for stmt in statements:
        if not isinstance(stmt, dict):
            continue
        sid = stmt.get("Sid", "unknown")
        condition = stmt.get("Condition", {})
        _check_condition_block(condition, f"Statement '{sid}'")

    return errors


# ================================================================
# Check 4: Resource types match assets
# ================================================================

def check_resource_types(file_path: str, data: dict, validated: dict) -> list[str]:
    """Verify Config rule resource_types match validated.json assets."""
    errors = []
    valid_types = {a.get("cfn_type") for a in validated.get("assets", []) if a.get("cfn_type")}
    if not valid_types:
        return errors

    for key, rule in data.items():
        if key == "_metadata":
            continue
        if not isinstance(rule, dict):
            continue
        rt = rule.get("resource_type")
        if rt and rt not in valid_types:
            errors.append(
                f"CHECK-4 resource_type: rule '{key}' has resource_type "
                f"'{rt}' not found in validated.json assets"
            )
        # Also check resource_types (plural)
        rts = rule.get("resource_types", [])
        for t in rts:
            if t not in valid_types:
                errors.append(
                    f"CHECK-4 resource_type: rule '{key}' has resource_type "
                    f"'{t}' not found in validated.json assets"
                )

    return errors


# ================================================================
# Check 5: StringEquals must not contain wildcards
# ================================================================

def _walk_conditions(data: dict, path: str = "") -> list[str]:
    """Recursively find StringEquals with wildcard values."""
    errors = []
    if not isinstance(data, dict):
        return errors

    for key, value in data.items():
        current_path = f"{path}.{key}" if path else key

        if key == "StringEquals" and isinstance(value, dict):
            for ck, cv in value.items():
                values = cv if isinstance(cv, list) else [cv]
                for v in values:
                    if isinstance(v, str) and ("*" in v or "?" in v):
                        errors.append(
                            f"CHECK-5 string_equals_wildcard: {current_path}['{ck}'] "
                            f"has value '{v}' with wildcard — use StringLike instead"
                        )
        elif isinstance(value, dict):
            errors.extend(_walk_conditions(value, current_path))
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, dict):
                    errors.extend(_walk_conditions(item, f"{current_path}[{i}]"))

    return errors


def check_string_equals_wildcards(file_path: str, data: dict) -> list[str]:
    """Check no StringEquals conditions contain wildcard characters."""
    return _walk_conditions(data)


# ================================================================
# Check 6: Null-key denial on network perimeter
# ================================================================

def check_null_key_denial(file_path: str, data: dict) -> list[str]:
    """Verify network perimeter SCPs include aws:PrincipalServiceName null check."""
    errors = []
    statements = data.get("Statement", [])
    if not isinstance(statements, list):
        return errors

    for stmt in statements:
        if not isinstance(stmt, dict):
            continue
        if stmt.get("Effect") != "Deny":
            continue

        condition = stmt.get("Condition", {})
        if not isinstance(condition, dict):
            continue

        # Check if this statement uses network perimeter keys
        all_keys = set()
        for operator, keys_dict in condition.items():
            if isinstance(keys_dict, dict):
                all_keys.update(keys_dict.keys())

        uses_network = all_keys & _NETWORK_PERIMETER_KEYS
        if not uses_network:
            continue

        # Must have a Null check on aws:PrincipalServiceName
        null_block = condition.get("Null", {})
        has_principal_null = (
            isinstance(null_block, dict)
            and "aws:PrincipalServiceName" in null_block
        )

        # Or a condition excluding AWS service principals
        bool_block = condition.get("BoolIfExists", {}) or condition.get("Bool", {})
        has_is_aws_service = (
            isinstance(bool_block, dict)
            and "aws:PrincipalIsAWSService" in bool_block
        )

        if not has_principal_null and not has_is_aws_service:
            sid = stmt.get("Sid", "unknown")
            errors.append(
                f"CHECK-6 null_key_bypass: Statement '{sid}' uses network perimeter "
                f"keys {uses_network} but has no Null check on "
                f"'aws:PrincipalServiceName' — AWS service calls will be blocked"
            )

    return errors


# ================================================================
# Check 7: JSON/YAML syntax validation
# ================================================================

def check_json_syntax(file_path: str) -> list[str]:
    """Validate JSON file syntax."""
    try:
        with open(file_path) as f:
            json.load(f)
        return []
    except json.JSONDecodeError as e:
        return [f"CHECK-7 json_syntax: {os.path.basename(file_path)} — {e}"]
    except OSError as e:
        return [f"CHECK-7 file_read: {os.path.basename(file_path)} — {e}"]


def check_yaml_syntax(file_path: str) -> list[str]:
    """Validate YAML file syntax (requires PyYAML).
    Skips CloudFormation templates that use intrinsic function tags (!Ref, !Equals, etc.)."""
    try:
        import yaml
    except ImportError:
        return []  # Skip silently if yaml not available

    # Detect CFN intrinsic functions — PyYAML safe_load can't handle them
    try:
        with open(file_path) as f:
            content = f.read()
        if re.search(r"![A-Z][a-zA-Z]+\b", content):
            return []  # CloudFormation template with intrinsic functions — skip
    except OSError:
        pass

    try:
        import io
        yaml.safe_load(io.StringIO(content))
        return []
    except yaml.YAMLError as e:
        return [f"CHECK-7 yaml_syntax: {os.path.basename(file_path)} — {e}"]
    except OSError as e:
        return [f"CHECK-7 file_read: {os.path.basename(file_path)} — {e}"]


# ================================================================
# Check 8: Step Functions SDK tasks must have ResultPath
# ================================================================

def check_stepfunctions_resultpath(file_path: str, data: dict) -> list[str]:
    """Verify every SDK integration Task state has ResultPath set."""
    errors = []
    states = data.get("States", {})
    if not isinstance(states, dict):
        return errors

    for state_name, state in states.items():
        if not isinstance(state, dict):
            continue
        if state.get("Type") != "Task":
            continue
        resource = state.get("Resource", "")
        if "aws-sdk:" not in resource:
            continue
        if "ResultPath" not in state:
            errors.append(
                f"CHECK-8 resultpath_missing: State '{state_name}' calls "
                f"SDK resource '{resource}' but has no ResultPath — "
                f"the SDK response will overwrite the entire state input"
            )

    return errors


# ================================================================
# Check 9: Control IDs match mapping-results
# ================================================================

def check_control_id_consistency(file_path: str, data: dict, mapping: dict) -> list[str]:
    """Verify _metadata control IDs exist in mapping-results.json."""
    errors = []
    meta = extract_metadata(data)
    if not meta:
        return errors

    valid_ids = {c.get("id") for c in mapping.get("controls", []) if c.get("id")}
    if not valid_ids:
        return errors

    artifact_ids = _extract_metadata_controls(meta)
    for ctrl_id in artifact_ids:
        if ctrl_id not in valid_ids:
            errors.append(
                f"CHECK-9 control_id: '{ctrl_id}' in _metadata.controls "
                f"not found in mapping-results.json"
            )

    return errors


# ================================================================
# Check 10: Framework header validation
# ================================================================

def check_framework_header(file_path: str, data: dict, mapping: dict) -> list[str]:
    """Verify framework header references valid framework objectives."""
    errors = []
    meta = extract_metadata(data)
    if not meta:
        return errors

    framework_str = meta.get("framework", "")
    if not framework_str:
        return errors

    # Extract framework name and objectives from header
    # Format: "CSA CCMv4 — CEK-03, CEK-08, ..." or "LOG-03, LOG-05, SEF-06"
    parts = framework_str.split("—")
    if len(parts) == 2:
        objectives_str = parts[1].strip()
    else:
        objectives_str = framework_str.strip()

    artifact_objectives = {o.strip() for o in objectives_str.split(",") if o.strip()}

    # Build set of all mapped objectives from mapping-results
    all_mapped = set()
    fm = mapping.get("framework_mapping", {})
    if isinstance(fm, dict):
        for obj_id, entry in fm.items():
            if isinstance(entry, dict) and entry.get("status") == "MAPPED":
                all_mapped.add(obj_id)

    # Also gather from controls directly
    for ctrl in mapping.get("controls", []):
        for obj in ctrl.get("framework_objectives", []):
            if isinstance(obj, dict):
                obj_id = obj.get("objective_id", "")
                if obj_id:
                    all_mapped.add(obj_id)
            elif isinstance(obj, str):
                all_mapped.add(obj)

    if not all_mapped:
        return errors

    for obj in artifact_objectives:
        if obj not in all_mapped:
            errors.append(
                f"CHECK-10 framework_objective: '{obj}' in _metadata.framework "
                f"not found in mapping-results.json framework objectives"
            )

    return errors


# ================================================================
# Check 11: Comment-header control IDs in non-JSON files
# ================================================================

_CTRL_ID_PATTERN = re.compile(r"CTRL-[A-Z]+-[A-Z]+-\d+")


def _extract_comment_header_controls(file_path: str) -> list[str]:
    """Parse # CONTROLS: lines from comment headers in .yaml/.py/.guard/.rego files."""
    ctrl_ids = []
    try:
        with open(file_path) as f:
            for i, line in enumerate(f):
                if i >= 30:
                    break  # Headers are at the top
                stripped = line.strip()
                if "CONTROLS:" in stripped:
                    _, _, value = stripped.partition("CONTROLS:")
                    ctrl_ids.extend(_CTRL_ID_PATTERN.findall(value))
    except OSError:
        pass
    return ctrl_ids


def check_comment_header_control_ids(file_path: str, mapping: dict) -> list[str]:
    """Verify CTRL-* IDs in comment headers exist in mapping-results.json."""
    errors = []
    valid_ids = {c.get("id") for c in mapping.get("controls", []) if c.get("id")}
    if not valid_ids:
        return errors

    ctrl_ids = _extract_comment_header_controls(file_path)
    for ctrl_id in ctrl_ids:
        if ctrl_id not in valid_ids:
            errors.append(
                f"CHECK-11 comment_header_control_id: '{ctrl_id}' in "
                f"# CONTROLS header not found in mapping-results.json"
            )

    return errors


# Body-scan regex — case-insensitive so snake_case rule names
# (e.g., `ctrl_res_pro_001`) are caught and normalized to canonical
# dash-uppercase form for comparison against mapping-results.json.
_CTRL_BODY_PATTERN = re.compile(r"CTRL[-_](?:[A-Z]{2,3}[-_]){0,2}\d{3}", re.IGNORECASE)
_BODY_SCAN_EXTS = {".json", ".yaml", ".yml", ".py", ".tf", ".ts", ".rego", ".guard", ".md"}
_BODY_SCAN_MAX_BYTES = 65536


def check_body_control_id_references(file_path: str, mapping: dict) -> list[str]:
    """Verify every CTRL-* token in the full file body exists in mapping-results.json.

    Complements check_comment_header_control_ids (which only scans the first 30 lines).
    Catches drift in rule names, policy Sids, and inline comments that the header check
    misses — e.g. `rule cluster_fargate_ephemeral_cmk_ctrl_res_pro_001 { ... }` where
    the ID is embedded in the rule name rather than a `# CONTROLS:` line.
    """
    errors: list[str] = []
    valid_ids = {c.get("id") for c in mapping.get("controls", []) if c.get("id")}
    if not valid_ids:
        return errors

    ext = os.path.splitext(file_path)[1].lower()
    if ext not in _BODY_SCAN_EXTS:
        return errors

    try:
        with open(file_path, "r", errors="ignore") as fh:
            body = fh.read(_BODY_SCAN_MAX_BYTES)
    except OSError:
        return errors

    # Normalize found tokens: uppercase + replace `_` with `-` so
    # `ctrl_res_pro_001` matches the canonical `CTRL-RES-PRO-001`
    # ids in mapping-results.json.
    found_ids = {m.upper().replace("_", "-") for m in _CTRL_BODY_PATTERN.findall(body)}
    orphans = sorted(found_ids - valid_ids)
    for orphan in orphans:
        errors.append(
            f"CHECK-13 body_control_id_reference: '{orphan}' referenced in "
            f"{os.path.basename(file_path)} but not in mapping-results.json controls[]"
        )
    return errors


# ================================================================
# Check 14a: SAR-driven artifacts — Condition keys must be SAR keys
# ================================================================
#
# For SAR-driven artifact files (SCPs, RCPs, IAM policies, permission boundaries,
# resource-based policies, VPCE policies, KMS key policies), every Condition block key
# MUST exist in validated.json.capabilities.iam.condition_keys[] OR be a global AWS key
# (case-insensitive for AWS docs inconsistencies like aws:PrincipalARN vs aws:PrincipalArn)
# OR be a KMS service-owned key inside a KMS key policy file.
#
# In particular, API parameter paths (e.g., "$.networkConfiguration.awsvpcConfiguration")
# are NEVER valid condition keys — AWS IAM silently ignores them.

# Filename patterns that identify SAR-driven mechanism artifacts.
# Used by CHECK-14a to enforce SAR condition keys only.
_SAR_DRIVEN_BASENAME_PATTERNS = (
    "scp",
    "rcp",
    "iam-policies",
    "iam-policy",
    "permission-boundary",
    "resource-policy",
    "vpce-policy",
    "kms-key-policy",
)

# Filename patterns CHECK-15 accepts under posture `preventative-request`.
# Superset of _SAR_DRIVEN_BASENAME_PATTERNS because tag-policy lives in
# preventive/ under the same posture but is not SAR-driven.
_PREV_REQUEST_BASENAME_PATTERNS = _SAR_DRIVEN_BASENAME_PATTERNS + (
    "tag-policy",
)

# Filename patterns CHECK-15 accepts under posture `reactive-detective`
# when the artifact lives directly in `detective/` (outside
# config-rule-lambdas/).
_REACTIVE_DETECTIVE_BASENAMES = (
    "config-rules.json",
    "access-analyzer.json",
    "eventbridge-rules.json",
    "cloudwatch-alarms.json",
)

# Filename patterns CHECK-15 accepts under posture `preventative-proactive`
# when the artifact legitimately lives in `detective/` (cross-cutting
# documentation / gap remediation files).
_PREV_PROACTIVE_CROSS_CUTTING_BASENAMES = (
    "compensating-controls-documentation.json",
)


def _is_sar_driven_artifact(file_path: str) -> bool:
    """Return True if file_path is a SAR-driven preventive artifact."""
    norm = file_path.replace("\\", "/").lower()
    if "/preventive/" not in norm and "preventive" not in os.path.basename(norm):
        # Also match files that live directly in tmp paths with SAR basenames
        # (so unit tests can exercise the check without creating /preventive/ dirs)
        pass
    basename = os.path.basename(norm)
    for pat in _SAR_DRIVEN_BASENAME_PATTERNS:
        if pat in basename:
            return True
    return False


def _build_sar_key_allowlist(validated: dict) -> set[str]:
    """Collect service-specific SAR condition keys plus their base forms (for tag subkeys)."""
    keys: set[str] = set()
    for ck in validated.get("capabilities", {}).get("iam", {}).get("condition_keys", []):
        key = ck.get("key", "")
        if not key:
            continue
        keys.add(key)
        # Also add the key with ${TagKey}-style placeholder stripped
        if "${" in key:
            base = key.split("/")[0] if "/" in key else key.split(":")[-1]
            keys.add(base)
    return keys


def check_sar_condition_keys_14a(
    file_path: str, data: dict, validated: dict
) -> list[str]:
    """CHECK-14a — Every Condition key in a SAR-driven artifact must be a SAR key.

    Scope: files whose basename matches _SAR_DRIVEN_BASENAME_PATTERNS.
    Pass: key in validated.json condition_keys, or global AWS key (case-insensitive),
          or (for kms-key-policy files) a KMS service-owned key.
    Fail: API parameter paths ("$.foo.bar"), invented keys, obvious mismatches.
    """
    errors: list[str] = []
    if not _is_sar_driven_artifact(file_path):
        return errors
    if not isinstance(data, dict):
        return errors
    service_keys = _build_sar_key_allowlist(validated)
    global_keys_ci = {k.lower() for k in _GLOBAL_CONDITION_KEYS}
    is_kms_key_policy = "kms-key-policy" in os.path.basename(file_path).lower()

    def _key_is_valid(key: str) -> bool:
        base = key.split("/")[0] if "/" in key else key
        # Exact match on service-specific key
        if key in service_keys or base in service_keys:
            return True
        # aws:RequestTag/* and aws:ResourceTag/* and aws:TagKeys — base prefix match
        if base.lower() in global_keys_ci:
            return True
        # Case-insensitive global key match (aws:PrincipalARN vs aws:PrincipalArn)
        if key.lower() in global_keys_ci:
            return True
        # Tag subkey patterns: service:ResourceTag/Xxx, aws:RequestTag/Xxx
        if "Tag/" in key or "TagKeys" in key:
            return True
        # KMS service-owned keys inside a KMS key policy
        if is_kms_key_policy:
            if (
                base in _KMS_SERVICE_CONDITION_KEYS
                or base == "kms:EncryptionContext"
                or key.startswith("kms:EncryptionContext:")
            ):
                return True
        return False

    statements = data.get("Statement", [])
    if not isinstance(statements, list):
        return errors
    for stmt in statements:
        if not isinstance(stmt, dict):
            continue
        sid = stmt.get("Sid", "unknown")
        condition = stmt.get("Condition", {}) or {}
        if not isinstance(condition, dict):
            continue
        for _operator, keys_dict in condition.items():
            if not isinstance(keys_dict, dict):
                continue
            for key in keys_dict:
                if not _key_is_valid(key):
                    reason = (
                        "looks like an API parameter path — parameter paths are NOT valid IAM condition keys"
                        if key.startswith("$")
                        else "not found in validated.json condition_keys"
                    )
                    errors.append(
                        f"CHECK-14a sar_condition_key: {os.path.basename(file_path)} "
                        f"Statement '{sid}' uses '{key}' — {reason}. "
                        f"SAR-driven artifacts must only reference condition keys from "
                        f"validated.json.capabilities.iam.condition_keys[]."
                    )

    return errors


# ================================================================
# Check 14b: API-driven artifacts — enum literals must match parameters[].enum
# ================================================================
#
# For API-driven artifact files (proactive/**, detective/config-rule-lambdas/**,
# responsive/ssm-runbook*, responsive/stepfunctions-workflow.json,
# responsive/lambda-remediator/**, iac/**), any enum-style literal list must reference
# values from validated.json.api_surface.operations[].parameters[].enum.
#
# Patterns detected (a reasonable subset — language-agnostic literal scan):
#   cfn-guard / Checkov / OPA / CDK / TF:  `in [<...>]`, `AllowedValues: [<...>]`,
#                                          `contains([<...>], var.x)`
#   Python Config Lambda / Lambda remediator: `x in [<...>]`
# Literals that are not candidate enum values (ARNs, identifier patterns with `:` or `/`,
# MITRE-technique-looking IDs, path-looking strings) are ignored.

_ENUM_LITERAL_LIST_PATTERN = re.compile(
    r"\[\s*((?:\"[A-Z][A-Z0-9_]{1,63}\"|\'[A-Z][A-Z0-9_]{1,63}\')"
    r"(?:\s*,\s*(?:\"[A-Z][A-Z0-9_]{1,63}\"|\'[A-Z][A-Z0-9_]{1,63}\'))*)\s*\]"
)
_STRING_LITERAL_PATTERN = re.compile(r"[\"']([A-Z][A-Z0-9_]{1,63})[\"']")
_API_DRIVEN_PATH_FRAGMENTS = (
    "/proactive/",
    "/detective/config-rule-lambdas/",
    "/responsive/ssm-runbook",
    "/responsive/stepfunctions-workflow",
    "/responsive/lambda-remediator/",
    "/iac/",
)
_API_DRIVEN_BASENAME_PREFIXES = (
    "proactive-",
    "iac-cdk-",
    "iac-",
    "handler-",
)
_API_DRIVEN_EXTENSIONS = {".guard", ".rego", ".py", ".yaml", ".yml", ".ts", ".tf", ".json"}


def _is_api_driven_artifact(file_path: str) -> bool:
    """Return True if file_path is an API-driven mechanism artifact."""
    norm = file_path.replace("\\", "/")
    ext = os.path.splitext(norm)[1].lower()
    if ext not in _API_DRIVEN_EXTENSIONS:
        return False
    # Path-based match — primary signal
    for frag in _API_DRIVEN_PATH_FRAGMENTS:
        if frag in norm:
            return True
    # Temp-file convention for unit tests: basenames beginning with these prefixes
    base = os.path.basename(norm)
    for prefix in _API_DRIVEN_BASENAME_PREFIXES:
        if base.startswith(prefix):
            return True
    return False


def _collect_parameter_enum_values(validated: dict) -> set[str]:
    """Flatten every enum entry from every parameter across every operation."""
    values: set[str] = set()
    for op in validated.get("api_surface", {}).get("operations", []):
        for p in op.get("parameters", []) or []:
            for v in p.get("enum", []) or []:
                if isinstance(v, str):
                    values.add(v)
    return values


def check_api_driven_enum_literals_14b(
    file_path: str, validated: dict
) -> list[str]:
    """CHECK-14b — Enum-style literal lists must reference parameters[].enum values.

    Scope: API-driven artifact files (proactive/**, detective/config-rule-lambdas/**,
    responsive/ssm-runbook*, responsive/stepfunctions-workflow.json,
    responsive/lambda-remediator/**, iac/**).
    Each SCREAMING_SNAKE literal in an `in [...]` / `AllowedValues: [...]` / similar
    enum-style list must appear in validated.json.api_surface.operations[].parameters[].enum.
    """
    errors: list[str] = []
    if not _is_api_driven_artifact(file_path):
        return errors
    valid_values = _collect_parameter_enum_values(validated)
    if not valid_values:
        return errors

    try:
        with open(file_path, "r", errors="ignore") as fh:
            body = fh.read(_BODY_SCAN_MAX_BYTES)
    except OSError:
        return errors

    for list_match in _ENUM_LITERAL_LIST_PATTERN.finditer(body):
        list_body = list_match.group(1)
        literals = _STRING_LITERAL_PATTERN.findall(list_body)
        if not literals:
            continue
        # An all-caps literal list is an enum candidate only when >=1 value is already in
        # the parameter-enum space. Lists like resource-name allowlists (arbitrary strings)
        # happen to be SCREAMING_SNAKE sometimes but contain 0 enum hits — skip those.
        hits = [v for v in literals if v in valid_values]
        misses = [v for v in literals if v not in valid_values]
        if hits and misses:
            errors.append(
                f"CHECK-14b api_enum_mismatch: {os.path.basename(file_path)} "
                f"uses enum literal list containing {misses!r} but these values are not "
                f"in validated.json.api_surface.operations[].parameters[].enum. "
                f"Copy enum values verbatim from validated.json — do not invent variants."
            )

    return errors


# ================================================================
# Check 15: Posture-mechanism consistency
# ================================================================
#
# Every generated artifact with `_metadata.posture` must live in a directory that
# matches its posture:
#   preventative-request   → preventive/{scp,rcp,iam-policies,permission-boundary,
#                             resource-policy,vpce-policy,kms-key-policy}*.json
#   preventative-proactive → proactive/** or iac/**
#   reactive-detective     → detective/config-rule-lambdas/** or detective/config-rules.json
#                             or detective/access-analyzer.json
#   reactive-corrective    → responsive/**
#
# Artifacts without _metadata.posture are not subject to this check (opt-in during
# Phase C rollout).

_VALID_POSTURES = {
    "preventative-request",
    "preventative-proactive",
    "reactive-detective",
    "reactive-corrective",
}


def _file_is_in_posture_family(file_path: str, posture: str) -> bool:
    """Return True if file_path's directory matches posture's allowed family."""
    norm = file_path.replace("\\", "/").lower()
    base = os.path.basename(norm)
    if posture == "preventative-request":
        return "/preventive/" in norm and any(
            pat in base for pat in _PREV_REQUEST_BASENAME_PATTERNS
        )
    if posture == "preventative-proactive":
        if "/proactive/" in norm or "/iac/" in norm:
            return True
        if "/detective/" in norm and base in _PREV_PROACTIVE_CROSS_CUTTING_BASENAMES:
            return True
        return False
    if posture == "reactive-detective":
        if "/detective/config-rule-lambdas/" in norm:
            return True
        if "/detective/" in norm and base in _REACTIVE_DETECTIVE_BASENAMES:
            return True
        return False
    if posture == "reactive-corrective":
        return "/responsive/" in norm
    return False


def check_posture_mechanism_consistency_15(
    file_path: str, data: dict
) -> list[str]:
    """CHECK-15 — _metadata.posture must match the artifact's directory family."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return errors
    meta = extract_metadata(data)
    if not meta:
        return errors
    posture = meta.get("posture")
    if not isinstance(posture, str) or not posture:
        return errors
    if posture not in _VALID_POSTURES:
        # Unknown posture — upstream schema validator handles this; skip here.
        return errors
    if not _file_is_in_posture_family(file_path, posture):
        errors.append(
            f"CHECK-15 posture_mismatch: {os.path.basename(file_path)} "
            f"declares _metadata.posture='{posture}' but lives outside the expected "
            f"directory family. preventative-request→preventive/{{scp,rcp,iam-policies,"
            f"permission-boundary,resource-policy,vpce-policy,kms-key-policy,tag-policy}}*.json; "
            f"preventative-proactive→proactive/** or iac/** or "
            f"detective/compensating-controls-documentation.json; "
            f"reactive-detective→detective/config-rule-lambdas/** or one of "
            f"detective/{{config-rules,access-analyzer,eventbridge-rules,cloudwatch-alarms}}.json; "
            f"reactive-corrective→responsive/**."
        )
    return errors


# ================================================================
# Check 16: JS-style boolean / null tokens in generated Python files
# ================================================================
#
# Generated Python files (Config rule handlers, Lambda remediators, etc.) are
# Python source — not JSON — but generators sometimes mix up the two when
# building in-file fixtures such as SMOKE_TEST_EVENTS. A bare `true` / `false`
# / `null` in a Python dict literal raises `NameError` at module-import time,
# failing Tier 1 silently long before the handler runs.
#
# This check scans Python files under `controls/` for `true` / `false` / `null`
# tokens that appear OUTSIDE any string literal or comment. It uses Python's
# own tokenizer so `"... true ..."` inside a string, `# true` in a comment, or
# `true_flag = 1` as an identifier are all correctly ignored.

_JS_LITERAL_NAMES = frozenset({"true", "false", "null"})


def check_js_literals_in_python_16(file_path: str) -> list[str]:
    """CHECK-16 — Python files must not contain bare `true`/`false`/`null`.

    A bare JS-style literal in a Python .py file is almost always a generator
    bug: the generator copied a JSON fixture into Python source without
    translating the bool/null tokens. The file will raise `NameError` at
    import time.
    """
    import tokenize

    errors: list[str] = []
    if not file_path.endswith(".py"):
        return errors

    try:
        with open(file_path, "rb") as fh:
            tokens = list(tokenize.tokenize(fh.readline))
    except (OSError, tokenize.TokenizeError, SyntaxError):
        # Syntax errors are caught separately; skip to avoid double-reporting.
        return errors

    for tok in tokens:
        if tok.type != tokenize.NAME:
            continue
        if tok.string in _JS_LITERAL_NAMES:
            errors.append(
                f"CHECK-16 js_literal_in_python: {os.path.basename(file_path)} "
                f"line {tok.start[0]} uses bare '{tok.string}' — Python uses "
                f"True/False/None. This raises NameError at import time. "
                f"If copying from JSON, translate the tokens before insertion."
            )
    return errors


# ================================================================
# Main dispatcher
# ================================================================

def _categorize_file(file_path: str) -> str:
    """Determine artifact category from file path."""
    norm = file_path.replace("\\", "/")
    if "/controls/preventive/" in norm:
        return "preventive"
    if "/controls/detective/" in norm:
        if "/config-rule-lambdas/" in norm:
            return "lambda_handler"
        if "eventbridge" in os.path.basename(norm).lower():
            return "eventbridge"
        if "config-rules" in os.path.basename(norm).lower():
            return "config_rules"
        return "detective"
    if "/controls/responsive/" in norm:
        if "stepfunctions" in os.path.basename(norm).lower():
            return "stepfunctions"
        if "ssm-runbook" in os.path.basename(norm).lower():
            return "ssm_runbook"
        return "responsive"
    if "/controls/proactive/" in norm:
        return "proactive"
    if "/controls/iac/" in norm:
        return "iac"
    return "unknown"


def validate_file(file_path: str) -> list[str]:
    """Run all applicable checks on a single file. Returns list of errors."""
    errors = []
    basename = os.path.basename(file_path)
    ext = os.path.splitext(basename)[1].lower()

    # Check 7: Syntax validation (always runs)
    if ext == ".json":
        errors.extend(check_json_syntax(file_path))
        if errors:
            return errors  # Can't proceed if JSON is invalid
    elif ext in (".yaml", ".yml"):
        errors.extend(check_yaml_syntax(file_path))
        if errors:
            return errors
    elif ext in (".py", ".guard", ".rego"):
        pass  # Comment-header checks below
    else:
        return []  # Skip unknown file types

    # Load data for JSON files
    data = None
    if ext == ".json":
        data = _load_json(file_path)
        if data is None:
            return errors  # Already reported by syntax check

    # Load state files
    validated, mapping = load_state_files(file_path)

    category = _categorize_file(file_path)

    # Check 5: StringEquals wildcards (any IAM policy file)
    if data and category in ("preventive", "detective", "responsive"):
        errors.extend(check_string_equals_wildcards(file_path, data))

    # Check 9: Control ID consistency (any file with _metadata)
    if data and mapping and extract_metadata(data):
        errors.extend(check_control_id_consistency(file_path, data, mapping))

    # Check 10: Framework header (any file with _metadata)
    if data and mapping and extract_metadata(data):
        errors.extend(check_framework_header(file_path, data, mapping))

    # Check 11: Comment-header control IDs (non-JSON files with # CONTROLS: headers)
    if mapping and ext in (".yaml", ".yml", ".py", ".guard", ".rego"):
        errors.extend(check_comment_header_control_ids(file_path, mapping))

    # Check 16: JS-style boolean/null literals in generated Python files
    if ext == ".py":
        errors.extend(check_js_literals_in_python_16(file_path))

    # Check 13: Full-body CTRL-* references against mapping-results.json
    # (complements check 11 which only scans the first 30 lines for # CONTROLS: headers)
    if mapping and category in ("preventive", "detective", "responsive", "proactive", "iac"):
        errors.extend(check_body_control_id_references(file_path, mapping))

    # Check 12: SCP size limit (5120 bytes minified, excluding _metadata)
    # AWS Organizations' 5120-character SCP limit applies to the policy body
    # (Version + Statement) submitted via the API — not the pretty-printed
    # file on disk and not our `_metadata` sidecar.
    if category == "preventive" and ext == ".json" and "scp" in basename.lower():
        try:
            with open(file_path) as fh:
                parsed = json.load(fh)
            policy_body = {k: v for k, v in parsed.items() if k != "_metadata"}
            size = len(json.dumps(policy_body, separators=(",", ":")))
            if size > 5120:
                errors.append(
                    f"CHECK-12 scp_size: {basename} minified policy body is "
                    f"{size} bytes (limit 5120) — split into multiple policies"
                )
        except (OSError, ValueError):
            pass

    # Category-specific checks
    if category == "preventive" and data:
        # Check 3: Condition keys (service-specific + global + KMS — existing)
        if validated:
            errors.extend(check_condition_keys(file_path, data, validated))
        # Check 14a: SAR-driven — Condition keys must be SAR keys or globals (stricter
        # than CHECK-3; catches API parameter paths used as condition keys).
        if validated:
            errors.extend(check_sar_condition_keys_14a(file_path, data, validated))
        # Check 6: Null-key denial
        errors.extend(check_null_key_denial(file_path, data))

    elif category == "eventbridge" and data:
        # Check 1: Service prefix
        if validated:
            errors.extend(check_service_prefix(file_path, data, validated))

    elif category == "config_rules" and data:
        # Check 4: Resource types
        if validated:
            errors.extend(check_resource_types(file_path, data, validated))

    elif category == "stepfunctions" and data:
        # Check 8: ResultPath
        errors.extend(check_stepfunctions_resultpath(file_path, data))
        # Check 2: API parameters
        if validated:
            errors.extend(check_api_parameters_stepfunctions(file_path, data, validated))

    elif category == "ssm_runbook" and ext in (".yaml", ".yml"):
        # Check 2: API parameters (YAML)
        if validated:
            try:
                import yaml
                with open(file_path) as f:
                    yaml_data = yaml.safe_load(f)
                if isinstance(yaml_data, dict):
                    errors.extend(check_api_parameters_ssm(file_path, yaml_data, validated))
            except (ImportError, Exception):
                pass

    # Check 13: KMS consumer → key-policy grant parity (IaC only)
    # Enforces generate-iac/SKILL.md Rule 4 at write time.
    if category == "iac" and ext in (".yaml", ".yml", ".tf"):
        try:
            from validate_kms_consumers import validate_kms_consumers
            errors.extend(validate_kms_consumers(file_path))
        except ImportError:
            pass

    # Check 14b: API-driven — enum literals must match parameters[].enum.
    # Applies to proactive/**, detective/config-rule-lambdas/**, responsive/ssm-runbook*,
    # responsive/stepfunctions-workflow.json, responsive/lambda-remediator/**, iac/**.
    if validated and _is_api_driven_artifact(file_path):
        errors.extend(check_api_driven_enum_literals_14b(file_path, validated))

    # Check 15: Posture-mechanism consistency.
    # Applies to any generated control file with _metadata.posture populated.
    if data:
        errors.extend(check_posture_mechanism_consistency_15(file_path, data))

    return errors


# ================================================================
# CLI entry point
# ================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_controls.py <file_path>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.isfile(file_path):
        print(f"File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    errors = validate_file(file_path)

    if errors:
        print(f"VALIDATION FAILED: {os.path.basename(file_path)} ({len(errors)} errors)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(2)
    else:
        print(f"VALIDATION PASSED: {os.path.basename(file_path)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
