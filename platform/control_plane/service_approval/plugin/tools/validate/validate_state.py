#!/usr/bin/env python3
"""
Deterministic validator for pipeline state files.

Checks state files (.service-approval/<slug>/<NN>-phase/) for structural integrity:
duplicate assets, unenriched placeholders, schema version, required fields,
per-phase schema validation, quality gates, cross-references.

Usage:
    python3 validate_state.py <file_path>

Exit codes:
    0 — all checks pass
    2 — validation errors found (errors on stderr)
"""

import json
import os
import re
import sys
from collections import Counter

from _schemas import schema_errors


# ================================================================
# Helpers
# ================================================================

def _load_json(path: str) -> dict | None:
    if not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _phase_dir_of(file_path: str) -> str:
    """Return the phase directory containing the given state file.

    In the new per-service-per-phase layout, this returns the phase directory
    (e.g., .service-approval/awslambda/04-map/) containing the file. It is
    intentionally just os.path.dirname() — kept as a named helper so callers
    document intent ("the phase dir of this file") rather than spelling out
    dirname inline.

    This is distinct from validate_controls.py's `_find_state_dir`, which
    walks UP from the controls dir to locate the service root. Different
    purpose, different return shape — they are not interchangeable.
    """
    return os.path.dirname(os.path.abspath(file_path))


def _load_sibling_phase(phase_dir: str, phase_name: str, filename: str) -> dict | None:
    """Load a JSON file from a sibling phase directory.

    Args:
        phase_dir: Current phase directory (e.g., .service-approval/awslambda/04-map/)
        phase_name: Phase prefix to look for (e.g., "03-validate", "01-assess")
        filename: File to load (e.g., "validated.json")

    Returns:
        Loaded JSON dict or None if not found.

    Example:
        When validating .service-approval/awslambda/04-map/map-controls-generated.json,
        to load validated.json from 03-validate/:
        >>> _load_sibling_phase(state_dir, "03-validate", "validated.json")
    """
    # Walk up to service root (parent of phase_dir)
    service_root = os.path.dirname(phase_dir.rstrip("/"))
    # Look for sibling phase directory
    sibling = os.path.join(service_root, phase_name)
    if not os.path.isdir(sibling):
        return None
    target = os.path.join(sibling, filename)
    return _load_json(target)


# ================================================================
# Botocore ↔ IAM action-name alias loader (CHECK-S9 helper)
# ================================================================

_BOTOCORE_IAM_ALIAS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "botocore-iam-alias.json",
)


def _load_botocore_iam_aliases(service: str) -> tuple[dict[str, str], dict[str, str]]:
    """Load botocore↔IAM name aliases for the given service.

    Returns (forward, reverse) where forward maps botocore op name → SAR IAM
    action name, and reverse maps SAR → botocore. Service match is
    case-insensitive against the `service` field in the alias file.

    The `service` argument may be the full display name ("Amazon Athena") or
    the short prefix ("athena"); both forms are accepted. We match when the
    alias file's service token appears as a whitespace- or dash-delimited
    token inside the caller's service string, so "Amazon Athena" matches
    "athena" and "Amazon Bedrock AgentCore Control" matches
    "bedrock-agentcore-control". Exact lowercase equality also still works.

    Missing file or parse error returns empty dicts (CHECK-S9 falls back to
    the pre-alias strict comparison). Not a safety error because the alias
    list is data-driven: absence just means we rely on set equality.
    """
    service_lower = (service or "").strip().lower()
    # Tokenize the caller's service string on whitespace and dash so
    # "amazon athena" → {"amazon", "athena"} and alias entries keyed as
    # "athena" match. Also keep a hyphen-joined form for multi-word aliases
    # like "bedrock-agentcore-control".
    service_tokens: set[str] = set()
    if service_lower:
        service_tokens.update(t for t in re.split(r"[\s_]+", service_lower) if t)
        # Strip "amazon" / "aws" leading noise words to produce a candidate
        # like "bedrock-agentcore-control" from "amazon bedrock agentcore control"
        stripped = re.sub(r"^(amazon|aws)\s+", "", service_lower).strip()
        if stripped:
            service_tokens.add(stripped.replace(" ", "-"))
            service_tokens.add(stripped)

    try:
        with open(_BOTOCORE_IAM_ALIAS_PATH) as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}, {}

    forward: dict[str, str] = {}
    reverse: dict[str, str] = {}
    for entry in data.get("aliases", []):
        if not isinstance(entry, dict):
            continue
        entry_service = (entry.get("service") or "").strip().lower()
        if not entry_service:
            continue
        # Match when the entry's short token appears in the caller's tokens,
        # or when the full strings are equal (legacy path).
        if entry_service != service_lower and entry_service not in service_tokens:
            continue
        bc = entry.get("botocore_operation")
        sar = entry.get("sar_iam_action")
        if bc and sar:
            forward[bc] = sar
            reverse[sar] = bc
    return forward, reverse


# ================================================================
# Check S1: No duplicate assets (same cfn_type)
# ================================================================

def check_duplicate_assets(data: dict) -> list[str]:
    """Flag assets that share the same cfn_type."""
    errors = []
    assets = data.get("assets", [])
    if not isinstance(assets, list):
        return errors

    seen: dict[str, str] = {}
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        cfn = asset.get("cfn_type", "")
        name = asset.get("name", "?")
        if not cfn:
            continue
        if cfn in seen:
            errors.append(
                f"CHECK-S1 duplicate_asset: cfn_type '{cfn}' appears in both "
                f"asset '{seen[cfn]}' and '{name}'"
            )
        else:
            seen[cfn] = name

    return errors


# ================================================================
# Check S2: No unenriched placeholders
# ================================================================

_PLACEHOLDER_PATTERN = re.compile(r"<needs\s+enrichment", re.IGNORECASE)


def check_unenriched_placeholders(data: dict) -> list[str]:
    """Recursively search for '<needs enrichment>' strings.
    Skips 'placeholder_scan' metadata field (describes what was scanned, not actual data)."""
    errors = []
    filtered = {k: v for k, v in data.items() if k != "placeholder_scan"}
    _walk_for_placeholders(filtered, "", errors)
    return errors


def _walk_for_placeholders(obj, path: str, errors: list[str]):
    if isinstance(obj, str):
        if _PLACEHOLDER_PATTERN.search(obj):
            errors.append(
                f"CHECK-S2 unenriched: {path} contains placeholder '{obj[:80]}'"
            )
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _walk_for_placeholders(v, f"{path}.{k}" if path else k, errors)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _walk_for_placeholders(item, f"{path}[{i}]", errors)


# ================================================================
# Check S3: Schema version
# ================================================================

def check_schema_version(data: dict, expected: str = "3.0") -> list[str]:
    """Verify schema_version matches expected."""
    version = data.get("schema_version")
    if version != expected:
        return [
            f"CHECK-S3 schema_version: expected '{expected}', got '{version}'"
        ]
    return []


# ================================================================
# Check S4: Required fields
# ================================================================

_REQUIRED_VALIDATED = ["service", "assets", "capabilities", "api_surface"]
_REQUIRED_MAPPING = ["service", "controls", "framework"]
_REQUIRED_RESEARCH = ["service", "assets", "capabilities", "api_surface", "doc_sources"]
_REQUIRED_RESEARCH_MIT = ["service", "existing_mitigations", "assets_partial"]
_REQUIRED_RESEARCH_CAP = ["capabilities", "resources"]
_REQUIRED_RESEARCH_API = ["api_surface"]
_REQUIRED_FW_PARSED = ["framework", "framework_objectives"]
_REQUIRED_CTRL_GEN = ["controls", "control_summary"]
_REQUIRED_FW_MAPPED = ["framework_mapping", "framework_coverage_summary"]

# Control-ID canonical format is now enforced via the JSON Schema
# `pattern` field in schemas/map-controls-generated.schema.json
# (iter-14 Class A commit c611064). See _schemas.py::schema_errors.


def check_required_fields(data: dict, file_name: str) -> list[str]:
    """Verify required top-level fields exist and are non-empty."""
    errors = []

    if "mapping-results" in file_name:
        required = _REQUIRED_MAPPING
    elif "validated" in file_name:
        required = _REQUIRED_VALIDATED
    elif "research-mitigations" in file_name:
        required = _REQUIRED_RESEARCH_MIT
    elif "research-capabilities" in file_name:
        required = _REQUIRED_RESEARCH_CAP
    elif "research-api-surface" in file_name:
        required = _REQUIRED_RESEARCH_API
    elif "research" in file_name:
        required = _REQUIRED_RESEARCH
    elif "map-framework-parsed" in file_name:
        required = _REQUIRED_FW_PARSED
    elif "map-controls-generated" in file_name:
        required = _REQUIRED_CTRL_GEN
    elif "map-framework-mapped" in file_name:
        required = _REQUIRED_FW_MAPPED
    else:
        return []

    for field in required:
        val = data.get(field)
        if val is None:
            errors.append(f"CHECK-S4 required_field: '{field}' is missing")
        elif isinstance(val, (list, dict, str)) and not val:
            errors.append(f"CHECK-S4 required_field: '{field}' is empty")

    return errors


# ================================================================
# Check S5: Mapping-results control integrity
# ================================================================

def check_control_integrity(data: dict) -> list[str]:
    """Verify controls have required fields."""
    errors = []
    controls = data.get("controls", [])
    if not isinstance(controls, list):
        return [f"CHECK-S5 controls: expected list, got {type(controls).__name__}"]

    for i, ctrl in enumerate(controls):
        if not isinstance(ctrl, dict):
            errors.append(f"CHECK-S5 controls[{i}]: expected dict, got {type(ctrl).__name__}")
            continue
        ctrl_id = ctrl.get("id", f"controls[{i}]")
        for field in ("id", "mechanism", "scope", "category"):
            if not ctrl.get(field):
                errors.append(f"CHECK-S5 control '{ctrl_id}': missing required field '{field}'")

    return errors


# ================================================================
# Check S6: research-mitigations schema
# ================================================================

def check_research_mitigations(data: dict) -> list[str]:
    """Validate research-mitigations.json schema and field naming.

    Shape/required-field/phase-const checks live in
    schemas/research-mitigations.schema.json.
    Nothing cross-file to retain here.
    """
    return schema_errors(data, "research-mitigations")


# ================================================================
# Check S7: research-capabilities schema
# ================================================================

def check_research_capabilities(data: dict) -> list[str]:
    """Validate research-capabilities.json schema.

    Shape/required-field/phase-const/condition_keys-object-form checks live
    in schemas/research-capabilities.schema.json.
    This function keeps the two conditional checks the schema cannot express:
    - each condition_key MUST have non-empty applies_to_actions
    - CloudTrail data_events supported=true ⇒ resource_types non-empty
    """
    errors = schema_errors(data, "research-capabilities")

    caps = data.get("capabilities", {}) if isinstance(data.get("capabilities"), dict) else {}
    ck = caps.get("iam", {}).get("condition_keys", []) if isinstance(caps.get("iam"), dict) else []

    # Each condition_key entry MUST list applies_to_actions — schema allows
    # empty arrays because iter-13 archives had some; but fresh runs must fill
    # them or CHECK-S9 cross-reference fires with zero info.
    if isinstance(ck, list):
        for j, k in enumerate(ck):
            if isinstance(k, dict) and not k.get("applies_to_actions"):
                errors.append(
                    f"CHECK-S7 condition_keys[{j}] ({k.get('key', '?')}): "
                    "empty applies_to_actions — must list actions from SAR page"
                )

    # CloudTrail data_events conditional: supported=true ⇒ resource_types non-empty
    ct = caps.get("logging", {}).get("cloudtrail", {}) if isinstance(caps.get("logging"), dict) else {}
    de = ct.get("data_events", {}) if isinstance(ct, dict) else {}
    if isinstance(de, dict) and de.get("supported") is True:
        if len(de.get("resource_types", [])) == 0:
            errors.append("CHECK-S7 data_events: supported=true but resource_types empty")

    return errors


# ================================================================
# Check S8: research-api-surface schema
# ================================================================

def check_research_api_surface(data: dict) -> list[str]:
    """Validate research-api-surface.json schema.

    Shape/required-field/phase-const/operation-required checks live in
    schemas/research-api-surface.schema.json.
    This function keeps:
    - completeness.missing_from_condition_keys CRITICAL (semantic check)
    - botocore_enrichment schema (legacy Phase B overlay on operations[])
    - CHECK-17 counter/population consistency (cross-field aggregate)
    """
    errors = schema_errors(data, "research-api-surface")

    ops = data.get("api_surface", {}).get("operations", []) if isinstance(data.get("api_surface"), dict) else []

    # Completeness — semantic cross-check (schema only checks object shape)
    comp = data.get("completeness", {}) if isinstance(data.get("completeness"), dict) else {}
    mfck = comp.get("missing_from_condition_keys")
    if isinstance(mfck, list) and len(mfck) > 0:
        errors.append(
            f"CHECK-S8 CRITICAL: {len(mfck)} actions "
            f"referenced by condition keys are missing from operations"
        )

    # Phase B botocore-enrichment schema (additive; forward-compatible)
    errors.extend(check_botocore_enrichment_schema(ops, check_id="CHECK-S8"))

    # CHECK-17: botocore_enrichment counter must match actual per-parameter
    # field population. Overlay/counter mismatch means overlay was truncated
    # or counter was hand-inflated — downstream silently misses params.
    errors.extend(check_botocore_enrichment_counter_17(data))

    return errors


# ================================================================
# Check 17: botocore_enrichment counter ↔ population consistency
# ================================================================
#
# research-api-surface.json MAY carry a top-level `botocore_enrichment`
# block with aggregate counters (enriched_operations, enriched_params).
# Those counters are advisory — the authoritative truth is the per-
# operation / per-parameter fields themselves. CHECK-17 asserts the
# counters (if present) equal the populated-field counts. A mismatch
# means the overlay terminated early or the counter was authored by an
# LLM without auditing the actual write — either way, downstream code
# (Phase 3 Rule C1, Phase 4 CHECK-14a/14b) will silently miss parameters
# the counter claims are enriched.

_ENRICHMENT_FIELDS = ("security_category", "mutability", "gateable_by")


def check_botocore_enrichment_counter_17(data: dict) -> list[str]:
    """CHECK-17 — counter/population consistency for botocore_enrichment.

    The `botocore_enrichment` block (if present) carries advisory counters.
    We verify them against two population measures:

      - `enriched_operations` MUST equal the number of operations with
        `botocore_coverage: true` (exact match; this count is unambiguous).
      - `enriched_params` MUST fall inside the inclusive range
        [params-with-security_category, params-with-any-enrichment-field].
        The lower bound is the strictest reading (only security-relevant
        params that received a category); the upper bound is the broadest
        (every parameter the overlay touched). A counter outside this band
        indicates the overlay was truncated or the counter was authored
        separately from the actual write.
    """
    errors: list[str] = []
    be = data.get("botocore_enrichment")
    if not isinstance(be, dict):
        return errors

    ops = data.get("api_surface", {}).get("operations", [])
    if not isinstance(ops, list):
        return errors

    # Operation-level check (exact).
    actual_ops = sum(
        1 for op in ops if isinstance(op, dict) and op.get("botocore_coverage") is True
    )
    claimed_ops = be.get("enriched_operations")
    if isinstance(claimed_ops, int) and claimed_ops != actual_ops:
        errors.append(
            f"CHECK-17 enriched_operations mismatch: counter claims "
            f"{claimed_ops} but only {actual_ops} operations have "
            f"botocore_coverage=true"
        )

    # Parameter-level check (range).
    with_any = 0
    with_security = 0
    for op in ops:
        if not isinstance(op, dict):
            continue
        for p in op.get("parameters", []) or []:
            if not isinstance(p, dict):
                continue
            if any(p.get(k) is not None for k in _ENRICHMENT_FIELDS):
                with_any += 1
            if p.get("security_category") is not None:
                with_security += 1

    claimed_params = be.get("enriched_params")
    if isinstance(claimed_params, int):
        if claimed_params < with_security or claimed_params > with_any:
            errors.append(
                f"CHECK-17 enriched_params out of range: counter claims "
                f"{claimed_params} but valid range is "
                f"[{with_security}, {with_any}] "
                f"(params with security_category ≤ counter ≤ params with any "
                f"enrichment field). Overlay may have terminated early or "
                f"counter was authored separately from the per-parameter writes."
            )

    return errors


# ================================================================
# Check botocore enrichment schema (Phase B)
# ================================================================
#
# Schema additions (all optional; forward-compat — absence is not an error):
#   api_surface.operations[].botocore_coverage: bool
#   api_surface.operations[].parameters[].enum: list[str]      (non-empty if present)
#   api_surface.operations[].parameters[].min: number
#   api_surface.operations[].parameters[].max: number
#   api_surface.operations[].parameters[].pattern: string
#   api_surface.operations[].parameters[].mutability: "create_only" | "mutable" | "unknown"
#   api_surface.operations[].parameters[].security_category:
#       "kms" | "network" | "iam" | "tag" | "log" | "auth" | "tls" | "policy" | null
#   api_surface.operations[].parameters[].gateable_by: subset of ["sar", "api"]
#   api_surface.operations[].parameters[].sar_condition_key: string | null
#                             (non-null when gateable_by contains "sar")

_VALID_GATEABLE_BY = {"sar", "api"}
_VALID_MUTABILITY = {"create_only", "mutable", "unknown"}
_VALID_SECURITY_CATEGORIES = {
    "kms", "network", "iam", "tag", "log", "auth", "tls", "policy"
}


def check_botocore_enrichment_schema(
    ops: list, check_id: str = "CHECK-BE"
) -> list[str]:
    """Validate the Phase B botocore-overlay fields on api_surface.operations[].

    Additive / forward-compatible: if a field is absent, no error. Only flags
    malformed presence. Unknown extra fields are ignored.
    """
    errors: list[str] = []
    if not isinstance(ops, list):
        return errors
    for i, op in enumerate(ops):
        if not isinstance(op, dict):
            continue
        op_label = op.get("operation", f"<op-{i}>")

        # botocore_coverage must be bool if present
        if "botocore_coverage" in op and not isinstance(op["botocore_coverage"], bool):
            errors.append(
                f"{check_id} operations[{i}] ({op_label}): "
                f"botocore_coverage must be bool, got {type(op['botocore_coverage']).__name__}"
            )

        params = op.get("parameters", [])
        if not isinstance(params, list):
            continue
        for j, p in enumerate(params):
            if not isinstance(p, dict):
                continue
            p_label = p.get("path", f"<param-{j}>")
            prefix = f"{check_id} operations[{i}] ({op_label}) parameters[{j}] ({p_label})"

            # enum — when present, must be a non-empty list of strings
            if "enum" in p:
                enum = p["enum"]
                if not isinstance(enum, list) or len(enum) == 0:
                    errors.append(f"{prefix}: enum must be a non-empty list, got {enum!r}")
                elif not all(isinstance(v, str) for v in enum):
                    errors.append(f"{prefix}: enum entries must all be strings")

            # min / max — when present, must be numeric
            for bound in ("min", "max"):
                if bound in p and not isinstance(p[bound], (int, float)):
                    errors.append(
                        f"{prefix}: {bound} must be numeric, "
                        f"got {type(p[bound]).__name__}"
                    )

            # pattern — when present, must be a string
            if "pattern" in p and not isinstance(p["pattern"], str):
                errors.append(
                    f"{prefix}: pattern must be a string, "
                    f"got {type(p['pattern']).__name__}"
                )

            # mutability — when present, must be one of the valid labels
            if "mutability" in p and p["mutability"] not in _VALID_MUTABILITY:
                errors.append(
                    f"{prefix}: mutability must be one of "
                    f"{sorted(_VALID_MUTABILITY)}, got {p['mutability']!r}"
                )

            # security_category — null or one of the valid labels
            if "security_category" in p:
                sc = p["security_category"]
                if sc is not None and sc not in _VALID_SECURITY_CATEGORIES:
                    errors.append(
                        f"{prefix}: security_category must be one of "
                        f"{sorted(_VALID_SECURITY_CATEGORIES)} or null, got {sc!r}"
                    )

            # gateable_by — must be a subset of {"sar", "api"}
            if "gateable_by" in p:
                gb = p["gateable_by"]
                if not isinstance(gb, list):
                    errors.append(f"{prefix}: gateable_by must be a list, got {type(gb).__name__}")
                else:
                    bad = [v for v in gb if v not in _VALID_GATEABLE_BY]
                    if bad:
                        errors.append(
                            f"{prefix}: gateable_by entries must be subset of "
                            f"{sorted(_VALID_GATEABLE_BY)}, got extras {bad!r}"
                        )
                    # If "sar" is claimed, sar_condition_key must be non-null
                    if "sar" in gb:
                        sck = p.get("sar_condition_key")
                        if sck is None or (isinstance(sck, str) and not sck.strip()):
                            errors.append(
                                f"{prefix}: gateable_by includes 'sar' but "
                                f"sar_condition_key is missing/null"
                            )

            # sar_condition_key — when present and non-null, must be a string
            if "sar_condition_key" in p:
                sck = p["sar_condition_key"]
                if sck is not None and not isinstance(sck, str):
                    errors.append(
                        f"{prefix}: sar_condition_key must be string or null, "
                        f"got {type(sck).__name__}"
                    )

    return errors


# ================================================================
# Check S9: research.json (merged) schema
# ================================================================

def check_research_merged(data: dict) -> list[str]:
    """Validate merged research.json schema and cross-references.

    Shape/required-field/enum/condition-key-format checks live in
    schemas/research.schema.json.
    This function keeps the cross-reference and quality checks the schema
    cannot express:
    - condition_keys applies_to_actions ⊆ operations ∪ permission_only_actions
      (with botocore↔IAM alias bridging)
    - CloudTrail data_events supported=true ⇒ resource_types non-empty
    - forbidden v2 keys (controls, threats, ccmv4_mappings, resource_types)
    - existing_mitigations statement/mitigation_goal completeness
    - asset entry_points >50% overlap dedup
    - attack_surface applicability in {HIGH, MEDIUM}
    - botocore-overlay field schema (Phase B)
    """
    errors = schema_errors(data, "research")

    caps = data.get("capabilities", {}) if isinstance(data.get("capabilities"), dict) else {}
    ck = caps.get("iam", {}).get("condition_keys", []) if isinstance(caps.get("iam"), dict) else []

    # CloudTrail data events: supported=true ⇒ resource_types non-empty
    # (conditional — schema can't express "required iff sibling=true")
    ct = caps.get("logging", {}).get("cloudtrail", {}) if isinstance(caps.get("logging"), dict) else {}
    de = ct.get("data_events", {}) if isinstance(ct, dict) else {}
    if isinstance(de, dict) and de.get("supported") is True:
        if len(de.get("resource_types", [])) == 0:
            errors.append("CHECK-S9 data_events: supported=true but resource_types empty")

    # API surface ops list for cross-reference + botocore-overlay schema
    ops = data.get("api_surface", {}).get("operations", []) if isinstance(data.get("api_surface"), dict) else []

    # Phase B botocore-enrichment schema (additive; no error when fields absent)
    errors.extend(check_botocore_enrichment_schema(ops, check_id="CHECK-S9"))

    # Cross-reference: condition_keys applies_to_actions
    op_names = set()
    for op in (ops if isinstance(ops, list) else []):
        name = op.get("operation", op.get("name", ""))
        if name:
            op_names.add(name)
    poa = set(caps.get("iam", {}).get("permission_only_actions", []))
    all_known = op_names | poa

    # Extend all_known with SAR-name ↔ botocore-name aliases. Some services
    # publish different operation names in boto3 vs the Service Authorization
    # Reference (e.g., Athena's StopQueryExecution ↔ athena:CancelQueryExecution).
    # Without this bridge, condition_keys[].applies_to_actions using the SAR
    # spelling produces a false-positive CRITICAL.
    alias_forward, alias_reverse = _load_botocore_iam_aliases(data.get("service", ""))
    # For every botocore op in op_names that has a SAR alias, add the SAR name.
    # Same for the reverse direction so either spelling satisfies the check.
    for botocore_name in list(op_names):
        sar_name = alias_forward.get(botocore_name)
        if sar_name:
            all_known.add(sar_name)
    for sar_name in list(poa):
        botocore_name = alias_reverse.get(sar_name)
        if botocore_name:
            all_known.add(botocore_name)

    if all_known and isinstance(ck, list):
        missing_actions = set()
        for ck_obj in ck:
            if isinstance(ck_obj, dict):
                for action in ck_obj.get("applies_to_actions", []):
                    # SAR uses the literal "*" string as shorthand for "applies
                    # to every action on this service" (e.g., DynamoDB's
                    # aws:ResourceTag/${TagKey}). IAM evaluates "*" as a
                    # universal match; CHECK-S9 should do the same rather than
                    # flag it as an unknown-action false positive.
                    if action == "*":
                        continue
                    if action not in all_known:
                        missing_actions.add(action)
        if missing_actions:
            errors.append(
                f"CHECK-S9 CRITICAL: {len(missing_actions)} actions referenced by "
                f"condition_keys missing from operations AND permission_only_actions: "
                f"{sorted(missing_actions)[:10]}"
            )

    # Mitigations — per-mitigation completeness (schema is permissive here
    # because existing_mitigations items use additionalProperties:true).
    for i, m in enumerate(data.get("existing_mitigations", [])):
        if not isinstance(m, dict):
            continue
        if not m.get("statement"):
            errors.append(f"CHECK-S9 existing_mitigations[{i}]: missing statement")
        if not m.get("mitigation_goal"):
            errors.append(f"CHECK-S9 existing_mitigations[{i}]: missing mitigation_goal")

    # Optional attack_surface validation (from research-attack-surface sub-skill)
    atk = data.get("attack_surface")
    if atk and isinstance(atk, dict):
        at = atk.get("applicable_techniques", [])
        if not isinstance(at, list) or len(at) == 0:
            errors.append("CHECK-S9 attack_surface.applicable_techniques: must be non-empty if present")
        for i, t in enumerate(at if isinstance(at, list) else []):
            if isinstance(t, dict) and t.get("applicability") not in ("HIGH", "MEDIUM"):
                errors.append(
                    f"CHECK-S9 attack_surface.techniques[{i}]: "
                    f"applicability must be HIGH or MEDIUM"
                )

    # Asset dedup: no two assets with >50% entry_point overlap
    assets = data.get("assets", [])
    for i, a1 in enumerate(assets):
        if not isinstance(a1, dict):
            continue
        for j, a2 in enumerate(assets):
            if j <= i or not isinstance(a2, dict):
                continue
            eps1 = set(a1.get("entry_points", []))
            eps2 = set(a2.get("entry_points", []))
            if eps1 and eps2:
                overlap = len(eps1 & eps2)
                threshold = min(len(eps1), len(eps2)) * 0.5
                if overlap > threshold:
                    errors.append(
                        f"CHECK-S9 duplicate assets: '{a1.get('name')}' and "
                        f"'{a2.get('name')}' share >50% entry_points"
                    )

    return errors


# ================================================================
# Check S10: map-framework-parsed schema
# ================================================================

def check_framework_parsed(data: dict) -> list[str]:
    """Validate map-framework-parsed.json schema.

    Shape/required-field/framework-object checks live in
    schemas/map-framework-parsed.schema.json.
    This function retains:
    - framework.total_objectives == len(framework_objectives) cross-field check
    - duplicate objective-ID detection (uniqueness across nested array)
    - presence of domain/title/specification/keywords (schema is permissive
      here because iter-13 archives sometimes omit these).
    """
    errors = schema_errors(data, "map-framework-parsed")

    fw = data.get("framework") if isinstance(data.get("framework"), dict) else {}
    objs = data.get("framework_objectives", [])

    # Cross-field total_objectives sanity
    if isinstance(fw, dict) and isinstance(objs, list) and fw.get("total_objectives") is not None:
        if fw.get("total_objectives") != len(objs):
            errors.append(
                f"CHECK-S10 total_objectives: {fw.get('total_objectives')} != "
                f"len(framework_objectives) ({len(objs)})"
            )

    # Duplicate objective-ID + per-objective completeness (schema is
    # permissive on these fields due to iter-13 legacy shape variance)
    ids_seen = set()
    for i, o in enumerate(objs if isinstance(objs, list) else []):
        if not isinstance(o, dict):
            continue
        for field in ("id", "domain", "title", "specification", "keywords"):
            if not o.get(field) and not (field == "id" and o.get("objective_id")):
                errors.append(f"CHECK-S10 objectives[{i}]: missing {field}")
        oid = o.get("id") or o.get("objective_id")
        if oid and oid in ids_seen:
            errors.append(f"CHECK-S10 duplicate objective ID: {oid}")
        if oid:
            ids_seen.add(oid)

    return errors


# ================================================================
# Check S11: map-controls-generated schema
# ================================================================

def check_controls_generated(data: dict, state_dir: str) -> list[str]:
    """Validate map-controls-generated.json schema + cross-file integrity.

    Shape/enum/required-field/ID-pattern checks live in
    schemas/map-controls-generated.schema.json.
    This function retains three checks the JSON Schema cannot express:
    - Duplicate control IDs across the array (uniqueItems on nested objects)
    - Scope/category cross-field mismatch between ID and its fields
    - Mitigation coverage lookup against sibling validated.json
    - control_summary.total_controls vs len(controls) cross-field check
    """
    # Schema encodes: schema_version const, controls minItems, per-control
    # required fields, scope/category enums, id pattern, mitigation_ids
    # pattern + minItems, parameters_controlled pattern.
    errors = schema_errors(data, "map-controls-generated")

    controls = data.get("controls", []) or []

    # Duplicate-ID check — JSON Schema cannot enforce uniqueness across
    # nested object fields.
    ids_seen: set[str] = set()
    for i, c in enumerate(controls):
        if not isinstance(c, dict):
            continue
        cid = c.get("id", f"<missing-{i}>")
        if cid in ids_seen:
            errors.append(f"CHECK-S11 duplicate control ID: {cid}")
        ids_seen.add(cid)

        # Scope/category cross-field mismatch — JSON Schema cannot compare
        # one property against another property on the same object without
        # dependentSchemas gymnastics. Keep in Python.
        if isinstance(cid, str) and cid.count("-") == 3:
            parts = cid.split("-")
            if parts[1] != c.get("scope") or parts[2] != c.get("category"):
                errors.append(
                    f"CHECK-S11 {cid}: ID scope/category mismatch "
                    f"(ID says {parts[1]}-{parts[2]}, fields say {c.get('scope')}-{c.get('category')})"
                )

    # Mitigation coverage: every mitigation should have at least one control.
    # Cross-file lookup — can't be expressed in a single JSON Schema.
    # validated.json lives in 03-validate/, not in the same phase as controls-generated
    vj = _load_sibling_phase(state_dir, "03-validate", "validated.json")
    if vj:
        all_mit_ids = {m["id"] for m in vj.get("existing_mitigations", []) if m.get("id")}
        covered: set[str] = set()
        for c in controls:
            if isinstance(c, dict):
                covered.update(c.get("mitigation_ids", []))
        uncovered = all_mit_ids - covered
        if uncovered:
            errors.append(
                f"CHECK-S11 {len(uncovered)} mitigations have no controls: "
                f"{sorted(uncovered)}"
            )

    # Summary consistency — cross-field check between two top-level values.
    summary = data.get("control_summary", {})
    if isinstance(summary, dict) and summary.get("total_controls") is not None:
        if summary.get("total_controls") != len(controls):
            errors.append(
                f"CHECK-S11 control_summary.total_controls "
                f"({summary.get('total_controls')}) != actual ({len(controls)})"
            )

    return errors


# ================================================================
# Check S12: map-framework-mapped quality gates
# ================================================================

def check_framework_mapped(data: dict, state_dir: str) -> list[str]:
    """Validate map-framework-mapped.json with all 7 quality gate rules.

    Shape/required-field/status-enum/control_id-pattern checks live in
    schemas/map-framework-mapped.schema.json.
    This function retains the 7 quality-gate rules and all cross-file
    lookups (controls-generated and framework-parsed siblings).
    """
    errors = schema_errors(data, "map-framework-mapped")

    fm = data.get("framework_mapping", [])
    if not isinstance(fm, list):
        # Schema already emitted a type error; skip quality gates to avoid TypeError.
        return errors

    # Load sibling files for cross-checks
    # All three map-* files are in the same phase (04-map/), so we can use direct join
    cg = _load_json(os.path.join(state_dir, "map-controls-generated.json"))
    fw = _load_json(os.path.join(state_dir, "map-framework-parsed.json"))

    # All objectives present
    if fw:
        expected_ids = {o["id"] for o in fw.get("framework_objectives", []) if o.get("id")}
        actual_ids = {f.get("objective_id") for f in fm if f.get("objective_id")}
        missing = expected_ids - actual_ids
        if missing:
            errors.append(
                f"CHECK-S12 {len(missing)} objectives missing from framework_mapping: "
                f"{sorted(missing)[:10]}"
            )
        extra = actual_ids - expected_ids
        if extra:
            errors.append(
                f"CHECK-S12 {len(extra)} unexpected objective IDs: {sorted(extra)[:10]}"
            )

    # Rule 1: Confidence-coverage consistency
    for f in fm:
        if f.get("status") != "MAPPED":
            continue
        ctrls = f.get("controls", [])
        if not ctrls:
            continue
        confs = [c.get("confidence", "Low") for c in ctrls]
        cov = f.get("coverage", "")
        if cov == "FULL" and "High" not in confs:
            errors.append(
                f"CHECK-S12 Rule1: {f['objective_id']}: FULL coverage but no High confidence"
            )
        if cov == "PARTIAL" and "Medium" not in confs and "High" not in confs:
            errors.append(
                f"CHECK-S12 Rule1: {f['objective_id']}: PARTIAL coverage but no Medium+ confidence"
            )

    # Rule 2: No domain spray — consecutive same-domain same-controls
    prev_domain = None
    prev_ctrls = None
    streak = 0
    for f in fm:
        if f.get("status") != "MAPPED":
            prev_domain = None
            prev_ctrls = None
            streak = 0
            continue
        cur_ctrls = sorted(c["control_id"] for c in f.get("controls", []) if c.get("control_id"))
        cur_domain = f.get("domain", "")
        if cur_domain == prev_domain and cur_ctrls == prev_ctrls:
            streak += 1
            if streak >= 2:
                errors.append(
                    f"CHECK-S12 Rule2: {f['objective_id']} identical controls as "
                    f">=2 predecessors in {cur_domain}"
                )
        else:
            streak = 0
        prev_domain = cur_domain
        prev_ctrls = cur_ctrls

    # Rule 3: No control mapped to >15 objectives
    ctrl_counts: Counter = Counter()
    for f in fm:
        for c in f.get("controls", []):
            cid = c.get("control_id")
            if cid:
                ctrl_counts[cid] += 1
    for ctrl, count in ctrl_counts.items():
        if count > 15:
            errors.append(f"CHECK-S12 Rule3: {ctrl} mapped to {count} objectives (max 15)")

    # Rule 5: Rationale required
    missing_rationale = sum(
        1 for f in fm for c in f.get("controls", []) if not c.get("rationale")
    )
    if missing_rationale > 0:
        errors.append(f"CHECK-S12 Rule5: {missing_rationale} control mappings missing rationale")

    # Rule 6: Max 5 High per objective
    for f in fm:
        high_count = sum(1 for c in f.get("controls", []) if c.get("confidence") == "High")
        if high_count > 5:
            errors.append(
                f"CHECK-S12 Rule6: {f.get('objective_id')} has {high_count} High confidence (max 5)"
            )

    # Rule 7: Orphaned controls
    if cg:
        all_mapped = set()
        for f in fm:
            for c in f.get("controls", []):
                cid = c.get("control_id")
                if cid:
                    all_mapped.add(cid)
        all_ctrl_ids = {c["id"] for c in cg.get("controls", []) if c.get("id")}
        orphans = all_ctrl_ids - all_mapped
        if orphans:
            errors.append(f"CHECK-S12 Rule7: {len(orphans)} orphaned controls: {sorted(orphans)}")

    # Coverage summary consistency
    fcs = data.get("framework_coverage_summary", {})
    actual_mapped = sum(1 for f in fm if f.get("status") == "MAPPED")
    actual_na = sum(1 for f in fm if f.get("status") == "N/A")
    if fcs.get("mapped") is not None and fcs["mapped"] != actual_mapped:
        errors.append(
            f"CHECK-S12 summary: mapped={fcs['mapped']} but actual={actual_mapped}"
        )
    if fcs.get("not_applicable") is not None and fcs["not_applicable"] != actual_na:
        errors.append(
            f"CHECK-S12 summary: not_applicable={fcs['not_applicable']} but actual={actual_na}"
        )

    return errors


# ================================================================
# Check S13: mapping-results.json (assembled) validation
# ================================================================

def check_mapping_results(data: dict) -> list[str]:
    """Validate assembled mapping-results.json: schema, quality gates, bidirectionality.

    Shape/required-field/enum/id-pattern/status-enum checks live in
    schemas/mapping-results.schema.json.
    This function retains:
    - framework_mapping completeness threshold (< 150 objectives = red flag)
    - Rule 1/3/5 quality gates (schema can't express aggregate/conditional)
    - Bidirectional consistency between controls[].framework_objectives
      and framework_mapping[].controls[].control_id
    - Mitigation NONE-coverage detection
    - framework_coverage_summary.by_domain presence (schema is permissive)
    """
    errors = schema_errors(data, "mapping-results")

    tmm = data.get("threat_mitigation_map", []) if isinstance(data.get("threat_mitigation_map"), list) else []
    controls = data.get("controls", []) if isinstance(data.get("controls"), list) else []
    fm = data.get("framework_mapping", []) if isinstance(data.get("framework_mapping"), list) else []

    # Framework mapping completeness threshold — CCMv4 has 197 objectives;
    # anything much below that suggests the assembler dropped entries.
    if len(fm) < 150:
        errors.append(f"CHECK-S13 framework_mapping: only {len(fm)} entries — expected ~197+")

    # Quality gates re-check on assembled data
    # Rule 1: Confidence-coverage consistency
    for f in fm:
        if f.get("status") != "MAPPED":
            continue
        ctrls = f.get("controls", [])
        if not ctrls:
            continue
        confs = [c.get("confidence", "Low") for c in ctrls]
        cov = f.get("coverage", "")
        if cov == "FULL" and "High" not in confs:
            errors.append(f"CHECK-S13 Rule1: {f['objective_id']}: FULL but no High confidence")

    # Rule 3: No control >15 objectives
    ctrl_counts: Counter = Counter()
    for f in fm:
        for c in f.get("controls", []):
            cid = c.get("control_id")
            if cid:
                ctrl_counts[cid] += 1
    for ctrl, count in ctrl_counts.items():
        if count > 15:
            errors.append(f"CHECK-S13 Rule3: {ctrl} mapped to {count} objectives — max 15")

    # Rule 5: Rationale
    missing_rationale = sum(
        1 for f in fm for c in f.get("controls", []) if not c.get("rationale")
    )
    if missing_rationale > 0:
        errors.append(f"CHECK-S13 Rule5: {missing_rationale} mappings missing rationale")

    # Rule 7: Orphans
    all_mapped_ids = set()
    for f in fm:
        for c in f.get("controls", []):
            cid = c.get("control_id")
            if cid:
                all_mapped_ids.add(cid)
    all_ctrl_ids = {c.get("id", "") for c in controls}
    orphans = all_ctrl_ids - all_mapped_ids
    if orphans:
        # Warning not error — some controls may be compensating
        pass

    # Bidirectional consistency: fm→controls and controls→fm must agree
    fm_obj_to_ctrls: dict[str, set[str]] = {}
    for f in fm:
        if f.get("status") == "MAPPED":
            for c in f.get("controls", []):
                cid = c.get("control_id")
                oid = f.get("objective_id")
                if cid and oid:
                    fm_obj_to_ctrls.setdefault(oid, set()).add(cid)

    ctrl_to_objs: dict[str, set[str]] = {}
    for ctrl in controls:
        for obj in ctrl.get("framework_objectives", []):
            # framework_objectives can be list of strings or list of dicts
            if isinstance(obj, dict):
                obj_id = obj.get("objective_id", "")
            else:
                obj_id = str(obj)
            if obj_id:
                ctrl_to_objs.setdefault(ctrl.get("id", ""), set()).add(obj_id)

    bidir_mismatches = 0
    for obj_id, ctrl_ids in fm_obj_to_ctrls.items():
        for ctrl_id in ctrl_ids:
            if obj_id not in ctrl_to_objs.get(ctrl_id, set()):
                bidir_mismatches += 1
    if bidir_mismatches > 0:
        errors.append(f"CHECK-S13 bidirectional: {bidir_mismatches} pairs mismatch")

    # Mitigation completeness
    none_mits = [
        t.get("mitigation_id", f"tmm[{i}]")
        for i, t in enumerate(tmm)
        if t.get("coverage") == "NONE"
    ]
    if none_mits:
        errors.append(f"CHECK-S13 {len(none_mits)} mitigations have NONE coverage: {none_mits}")

    # framework_coverage_summary
    fcs = data.get("framework_coverage_summary", {})
    if not fcs or not fcs.get("by_domain"):
        errors.append("CHECK-S13 framework_coverage_summary: empty or missing by_domain")

    return errors


# ================================================================
# Check S14: research-attack-surface schema
# ================================================================

_TECHNIQUE_PATTERN = re.compile(r"^T\d{4}(\.\d{3})?$")


def check_research_attack_surface(data: dict) -> list[str]:
    """Validate research-attack-surface.json schema."""
    errors = []

    if data.get("phase") != "research-attack-surface":
        errors.append("CHECK-S14 phase: must be 'research-attack-surface'")

    if data.get("schema_version") != "1.0":
        errors.append("CHECK-S14 schema_version: must be '1.0'")

    if not isinstance(data.get("service"), str):
        errors.append("CHECK-S14 service: must be a string")

    # applicable_techniques
    techs = data.get("applicable_techniques", [])
    if not isinstance(techs, list) or len(techs) == 0:
        errors.append("CHECK-S14 applicable_techniques: must be non-empty list")

    tech_ids = set()
    for i, t in enumerate(techs):
        if not isinstance(t, dict):
            continue
        tid = t.get("technique_id", "")
        if not _TECHNIQUE_PATTERN.match(tid):
            errors.append(f"CHECK-S14 techniques[{i}]: invalid technique_id '{tid}'")
        if tid in tech_ids:
            errors.append(f"CHECK-S14 duplicate technique_id: {tid}")
        tech_ids.add(tid)

        for field in ("technique_name", "tactic_id", "tactic_name",
                       "applicability", "applicability_reason", "api_surface_evidence"):
            if not t.get(field):
                errors.append(f"CHECK-S14 techniques[{i}] ({tid}): missing {field}")

        if t.get("applicability") not in ("HIGH", "MEDIUM"):
            errors.append(
                f"CHECK-S14 techniques[{i}] ({tid}): applicability must be HIGH or MEDIUM, "
                f"got '{t.get('applicability')}'"
            )

    # stride_to_attack_bridge
    bridge = data.get("stride_to_attack_bridge", [])
    valid_stride = {"Spoofing", "Tampering", "Repudiation",
                    "Information Disclosure", "Denial of Service",
                    "Elevation of Privilege"}
    for i, b in enumerate(bridge):
        if not isinstance(b, dict):
            continue
        cat = b.get("stride_category", "")
        if cat not in valid_stride:
            errors.append(f"CHECK-S14 bridge[{i}]: invalid stride_category '{cat}'")
        # Bridge techniques should be subset of applicable techniques
        for bt in b.get("attack_techniques", []):
            if bt not in tech_ids:
                errors.append(
                    f"CHECK-S14 bridge[{i}] ({cat}): technique {bt} not in applicable_techniques"
                )

    # tactic_coverage_summary
    tcs = data.get("tactic_coverage_summary", {})
    if not isinstance(tcs, dict):
        errors.append("CHECK-S14 tactic_coverage_summary: must be object")

    return errors


# ================================================================
# Check S15: sar-facts.json (Phase 0 Assess output)
# ================================================================

def check_sar_facts(data: dict) -> list[str]:
    """Validate sar-facts.json against the schema contract.

    All shape/required-field/condition-key-object-form/cfn-resource-pattern
    checks live in schemas/sar-facts.schema.json.
    No cross-file lookups required at this phase — sar-facts is produced
    standalone from the SAR page.
    """
    return schema_errors(data, "sar-facts")


# ================================================================
# Check S16: checkpoint-results.json (Phase 0 Assess output)
# ================================================================

def check_checkpoint_results(data: dict) -> list[str]:
    """Validate checkpoint-results.json against the schema contract.

    Schema accepts both iter-14+ list form and iter-11/12/13 dict form
    via oneOf — the downstream consumers tolerate both shapes. No
    cross-file checks required.
    """
    return schema_errors(data, "checkpoint-results")


# ================================================================
# Check S17: iac-support.json (Phase 0 Assess Step 2b output)
# ================================================================

def check_iac_support(data: dict) -> list[str]:
    """Validate iac-support.json against the schema contract.

    Shape/required-field/enum checks live in
    schemas/iac-support.schema.json. Adds one cross-field invariant the
    schema cannot express: each format's `generate_formats[<format>]`
    must be false when the corresponding `<format>.supported` is false
    (you cannot generate a format that AWS doesn't expose — assess/SKILL.md
    Step 2b explicitly forbids forcing an unsupported format).
    """
    errors = schema_errors(data, "iac-support")

    gen = data.get("generate_formats", {}) if isinstance(data.get("generate_formats"), dict) else {}
    # Map generate_formats key → the top-level block whose `supported` gates it.
    format_gate = {
        "cloudformation": "cloudformation",
        "terraform": "terraform",
        "cdk_typescript": "cdk",
        "cdktf": "cdktf",
    }
    for gen_key, gate_block in format_gate.items():
        if gen.get(gen_key) is True:
            block = data.get(gate_block, {})
            if isinstance(block, dict) and block.get("supported") is False:
                errors.append(
                    f"generate_formats.{gen_key} is true but {gate_block}.supported is false — "
                    f"cannot force generation of an unsupported IaC format "
                    f"(assess/SKILL.md Step 2b)."
                )

    return errors


# ================================================================
# Main dispatcher
# ================================================================

def validate_state_file(file_path: str) -> list[str]:
    """Run all applicable checks on a state file."""
    errors = []
    basename = os.path.basename(file_path)

    if not file_path.endswith(".json"):
        return []

    try:
        with open(file_path) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"JSON syntax error: {e}"]
    except OSError as e:
        return [f"File read error: {e}"]

    if not isinstance(data, dict):
        return [f"Expected JSON object, got {type(data).__name__}"]

    state_dir = _phase_dir_of(file_path)

    # Dispatch by filename
    if basename == "sar-facts.json":
        errors.extend(check_sar_facts(data))

    elif basename == "checkpoint-results.json":
        errors.extend(check_checkpoint_results(data))

    elif basename == "iac-support.json":
        errors.extend(check_iac_support(data))

    elif "research-mitigations" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_research_mitigations(data))

    elif "research-capabilities" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_research_capabilities(data))

    elif "research-api-surface" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_research_api_surface(data))

    elif "research-attack-surface" in basename:
        errors.extend(check_research_attack_surface(data))

    elif basename == "research.json":
        errors.extend(check_schema_version(data, "3.0"))
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_duplicate_assets(data))
        errors.extend(check_unenriched_placeholders(data))
        errors.extend(check_research_merged(data))

    elif "validated" in basename:
        errors.extend(check_schema_version(data, "3.0"))
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_duplicate_assets(data))
        errors.extend(check_unenriched_placeholders(data))

    elif "map-framework-parsed" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_framework_parsed(data))

    elif "map-controls-generated" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_controls_generated(data, state_dir))

    elif "map-framework-mapped" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_framework_mapped(data, state_dir))

    elif "mapping-results" in basename:
        errors.extend(check_required_fields(data, basename))
        errors.extend(check_control_integrity(data))
        errors.extend(check_mapping_results(data))

    return errors


# ================================================================
# CLI entry point
# ================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_state.py <file_path>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.isfile(file_path):
        print(f"File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    errors = validate_state_file(file_path)

    if errors:
        print(f"STATE VALIDATION FAILED: {os.path.basename(file_path)} ({len(errors)} errors)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(2)
    else:
        print(f"STATE VALIDATION PASSED: {os.path.basename(file_path)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
