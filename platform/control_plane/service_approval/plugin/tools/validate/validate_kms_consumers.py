#!/usr/bin/env python3
"""
Deterministic pre-deploy check: every service that consumes a KMS CMK defined in
this IaC template MUST have a matching Statement[] grant in that key's policy.

Implements the enforcement half of `generate-iac/SKILL.md` Rule 4.

Supports:
  - CloudFormation YAML (parses via PyYAML when available; else regex fallback)
  - Terraform HCL (regex — good enough for detection, not a full parser)
  - CDK TypeScript / CDKTF are out of scope here (harder to parse reliably;
    escape hatch: handled by the generate-iac skill Rule 4 itself).

Called from hook_post_tool_use.py via validate_controls.validate_file when the
written file is under .service-approval/<slug>/05-generate/iac/ (or legacy /controls/iac/).

Exit codes (CLI):
    0 — pass (or file not applicable)
    2 — validation errors

Returns a list of error strings when imported.
"""

from __future__ import annotations

import json
import os
import re
import sys

# KMS consumer specifications are stored in a data file (not code) so new AWS services
# can be added without code changes. See `data/kms-consumer-specs.json`.
# Regenerator: `python3 scripts/regenerate-kms-consumer-specs.py`.
_DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "kms-consumer-specs.json",
)


def _load_specs() -> tuple[dict, dict, tuple, tuple]:
    """Load consumer specs from data file. Returns (cfn_spec, tf_spec, cfn_props, tf_args)."""
    try:
        with open(_DATA_FILE) as f:
            data = json.load(f)
    except OSError as exc:
        # Fail-safe: empty specs rather than crash the hook, but surface the
        # problem to the operator via stderr so "silent pass" cannot hide a
        # missing data file. The file is expected to exist in a well-formed
        # plugin install; if it doesn't, every KMS check silently returns
        # clean and the safety property is lost.
        print(
            f"[validate_kms_consumers] WARNING: consumer specs file missing at "
            f"{_DATA_FILE} ({exc}). KMS consumer validation will be a no-op. "
            f"Restore the file or regenerate via "
            f"`python3 scripts/regenerate-kms-consumer-specs.py`.",
            file=sys.stderr,
        )
        return {}, {}, (), ()
    except json.JSONDecodeError as exc:
        print(
            f"[validate_kms_consumers] WARNING: consumer specs file at "
            f"{_DATA_FILE} is corrupt ({exc}). KMS consumer validation will "
            f"be a no-op until the file is fixed.",
            file=sys.stderr,
        )
        return {}, {}, (), ()

    consumers = data.get("consumers", {}) or {}
    cfn_spec: dict[str, dict] = {
        cfn_type: {
            "principal": v["principal"],
            "required_actions": v["required_actions"],
        }
        for cfn_type, v in consumers.items()
    }
    tf_spec: dict[str, dict] = {
        v["terraform"]: {
            "principal": v["principal"],
            "required_actions": v["required_actions"],
        }
        for v in consumers.values()
        if v.get("terraform")
    }
    cfn_props = tuple(data.get("cfn_key_pointing_properties", []))
    tf_args = tuple(data.get("tf_key_pointing_args", []))
    return cfn_spec, tf_spec, cfn_props, tf_args


_CFN_CONSUMER_SPEC, _TF_CONSUMER_SPEC, _CFN_KEY_PROPERTIES, _TF_KEY_ARGS = _load_specs()

# Back-compat: expose principal-only views for any callers that still use them.
_CFN_CONSUMER_PRINCIPALS: dict[str, str] = {k: v["principal"] for k, v in _CFN_CONSUMER_SPEC.items()}
_TF_CONSUMER_PRINCIPALS: dict[str, str] = {k: v["principal"] for k, v in _TF_CONSUMER_SPEC.items()}


# -------- CloudFormation --------

def _load_cfn(path: str) -> dict | None:
    try:
        import yaml
    except ImportError:
        return None
    # CFN uses !Ref etc — use a loader that tolerates unknown tags by preserving them as str.
    class _Tolerant(yaml.SafeLoader):
        pass
    def _tag_passthrough(loader, tag_suffix, node):
        if isinstance(node, yaml.ScalarNode):
            return f"!{tag_suffix} {loader.construct_scalar(node)}"
        if isinstance(node, yaml.SequenceNode):
            return [loader.construct_object(c) for c in node.value]
        return loader.construct_mapping(node)
    _Tolerant.add_multi_constructor("!", _tag_passthrough)
    try:
        with open(path) as f:
            loader = _Tolerant(f)
            try:
                return loader.get_single_data()
            finally:
                loader.dispose()
    except (yaml.YAMLError, OSError):
        return None


def _cfn_collect_key_policies(resources: dict) -> dict[str, list[dict]]:
    """Return {logical_id: [{principal, actions}, ...]} for every AWS::KMS::Key.

    Each inner dict is one Allow statement: {"principal": str, "actions": list[str]}.
    """
    keys: dict[str, list[dict]] = {}
    for lid, res in resources.items():
        if not isinstance(res, dict) or res.get("Type") != "AWS::KMS::Key":
            continue
        props = res.get("Properties", {}) or {}
        key_policy = props.get("KeyPolicy", {}) or {}
        stmts = key_policy.get("Statement", []) or []
        if isinstance(stmts, dict):
            stmts = [stmts]
        flat: list[dict] = []
        for s in stmts:
            if not isinstance(s, dict) or s.get("Effect") != "Allow":
                continue
            p = s.get("Principal", {}) or {}
            svc = p.get("Service") if isinstance(p, dict) else None
            principals: list[str] = []
            if isinstance(svc, str):
                principals = [svc]
            elif isinstance(svc, list):
                principals = [x for x in svc if isinstance(x, str)]
            actions = s.get("Action", []) or []
            if isinstance(actions, str):
                actions = [actions]
            actions = [a for a in actions if isinstance(a, str)]
            for pr in principals:
                flat.append({"principal": pr, "actions": actions})
        keys[lid] = flat
    return keys


def _cfn_collect_consumers(resources: dict) -> tuple[list[tuple[str, str, str]], list[tuple[str, str]]]:
    """Return (known_consumers, unknown_consumers).

    known_consumers: [(consumer_logical_id, resource_type, referenced_key_text)] where
      the resource_type is in our spec file and can be fully validated.
    unknown_consumers: [(consumer_logical_id, resource_type)] where the resource references
      a KMS key but the resource_type isn't in our spec — operator should add it.
    """
    known: list[tuple[str, str, str]] = []
    unknown: list[tuple[str, str]] = []
    for lid, res in resources.items():
        if not isinstance(res, dict):
            continue
        rtype = res.get("Type")
        if not rtype:
            continue
        props = res.get("Properties", {}) or {}
        # Is this resource referencing a KMS key via any known property?
        references_cmk = any(props.get(p) for p in _CFN_KEY_PROPERTIES)
        if not references_cmk:
            continue
        if rtype in _CFN_CONSUMER_PRINCIPALS:
            for prop in _CFN_KEY_PROPERTIES:
                val = props.get(prop)
                if val:
                    known.append((lid, rtype, str(val)))
                    break
        else:
            unknown.append((lid, rtype))
    return known, unknown


def _cfn_key_logical_id_from_ref(ref_text: str) -> str | None:
    """Extract the KMS key logical id from intrinsic strings like '!GetAtt EcsCmk.Arn'."""
    m = re.search(r"!GetAtt\s+(\w+)\.\w+", ref_text) or re.search(r"!Ref\s+(\w+)", ref_text)
    return m.group(1) if m else None


def _principal_matches(required: str, granted_principals: list[str]) -> bool:
    """Match a required service principal against a list of granted principals.

    Normalizes CFN intrinsics (!Sub logs.${AWS::Region}.amazonaws.com) and TF
    interpolations (logs.${data.aws_region.current.id}.amazonaws.com).
    """
    req_base = required.replace("{region}.", "")
    req_prefix = required.split(".", 1)[0] + "."
    for g in granted_principals:
        gn = re.sub(r"^!\w+\s+", "", g).strip('"').strip("'")
        gn = re.sub(r"\$\{[^}]+\}\.", "", gn)
        if gn == required or gn == req_base:
            return True
        if gn.startswith(req_prefix) and gn.endswith(".amazonaws.com"):
            return True
    return False


def _action_covered(required_any_of: list[str], granted_actions: list[str]) -> bool:
    """Return True if at least one required action is in granted_actions.

    `required_any_of` is a list of equivalent actions (e.g., ['kms:Encrypt',
    'kms:GenerateDataKey*']) — any one of them covers the requirement. Treats
    wildcard actions in granted_actions (e.g., 'kms:*', 'kms:Generate*') as matching.
    """
    granted_set = set(granted_actions or [])
    for req in required_any_of:
        if req in granted_set:
            return True
        # wildcard in granted
        for g in granted_actions:
            if g == "kms:*" or g == "*":
                return True
            if g.endswith("*"):
                prefix = g[:-1]
                if req.startswith(prefix):
                    return True
    return False


def check_cloudformation(path: str) -> list[str]:
    tpl = _load_cfn(path)
    if not isinstance(tpl, dict):
        return []
    resources = tpl.get("Resources") or {}
    if not isinstance(resources, dict):
        return []
    keys = _cfn_collect_key_policies(resources)
    if not keys:
        return []
    consumers, unknown_consumers = _cfn_collect_consumers(resources)
    errors: list[str] = []
    # Warn — but don't fail — when a template references a CMK from a consumer
    # type not yet in our spec file. Operator remediation: verify the required
    # principal + actions in the service's "Encrypting data with KMS for <service>"
    # page (search AWS docs for that phrase), deploy-test the policy, then add to
    # data/kms-consumer-specs.json.
    for unk_lid, unk_rtype in unknown_consumers:
        errors.append(
            f"KMS-CONSUMER-UNKNOWN {os.path.basename(path)}: resource type {unk_rtype!r} "
            f"({unk_lid}) references a KMS key but is not in "
            f"data/kms-consumer-specs.json. To enable the check: "
            f"(1) find the service's 'Encrypting data with KMS for <service>' dev guide "
            f"page, (2) verify the required principal/actions via deploy+teardown, "
            f"(3) add the entry. WARNING, not a deploy blocker."
        )
    for consumer_lid, rtype, ref_text in consumers:
        spec = _CFN_CONSUMER_SPEC[rtype]
        required_principal = spec["principal"]
        required_actions = spec["required_actions"]
        key_lid = _cfn_key_logical_id_from_ref(ref_text)
        if key_lid is None or key_lid not in keys:
            # Consumer references something we can't map to a key in this template — skip.
            continue
        stmts = keys[key_lid]
        # Find at least one statement that grants the required principal AND a required action.
        matching_stmt = None
        for st in stmts:
            if _principal_matches(required_principal, [st["principal"]]) and \
               _action_covered(required_actions, st["actions"]):
                matching_stmt = st
                break
        if matching_stmt is None:
            all_principals = [s["principal"] for s in stmts]
            if not _principal_matches(required_principal, all_principals):
                errors.append(
                    f"KMS-CONSUMER {os.path.basename(path)}: {rtype} {consumer_lid!r} "
                    f"uses key {key_lid!r} but policy does not grant {required_principal!r} "
                    f"(granted principals: {all_principals or 'none'})"
                )
            else:
                errors.append(
                    f"KMS-CONSUMER {os.path.basename(path)}: {rtype} {consumer_lid!r} "
                    f"uses key {key_lid!r}; principal {required_principal!r} is granted "
                    f"but missing required action (need any of {required_actions})"
                )
    return errors


# -------- Terraform --------

_TF_RESOURCE_RE = re.compile(r'resource\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)
_TF_KMS_POLICY_SERVICE_RE = re.compile(
    r'"?Service"?\s*[:=]\s*(?:"([^"]+)"|\[([^\]]+)\])'
)


def _tf_extract_blocks(text: str) -> list[tuple[str, str, str]]:
    """Return [(resource_type, name, body)] — simple brace-balanced extraction."""
    out = []
    for m in _TF_RESOURCE_RE.finditer(text):
        rtype, rname = m.group(1), m.group(2)
        start = m.end()
        depth = 1
        i = start
        while i < len(text) and depth > 0:
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            i += 1
        body = text[start : i - 1]
        out.append((rtype, rname, body))
    return out


_TF_STATEMENT_RE = re.compile(
    r"\{[^{}]*?(?:\{[^{}]*\}[^{}]*?)*\}",  # balanced-ish statement block
    re.DOTALL,
)
_TF_STMT_ACTION_RE = re.compile(
    r'"?Action"?\s*[:=]\s*(?:"([^"]+)"|\[([^\]]+)\])',
    re.DOTALL,
)


def _tf_collect_kms_statements(body: str) -> list[dict]:
    """From an aws_kms_key body, return [{principal, actions}, ...] for each Allow statement."""
    stmts: list[dict] = []
    # Find each statement block — look for Effect == "Allow" sections
    for m in re.finditer(r'Effect\s*=\s*"Allow"', body):
        # Scan backward to find this statement's enclosing { and forward to find matching }
        start = body.rfind("{", 0, m.start())
        if start < 0:
            continue
        depth = 1
        i = start + 1
        while i < len(body) and depth > 0:
            if body[i] == "{":
                depth += 1
            elif body[i] == "}":
                depth -= 1
            i += 1
        stmt_text = body[start + 1 : i - 1]
        # Extract principal
        principal = None
        pm = _TF_KMS_POLICY_SERVICE_RE.search(stmt_text)
        if pm:
            principal = pm.group(1) or (pm.group(2) or "").strip().strip('"').strip("'")
        if not principal:
            continue
        # Extract actions
        actions: list[str] = []
        am = _TF_STMT_ACTION_RE.search(stmt_text)
        if am:
            if am.group(1):
                actions = [am.group(1)]
            elif am.group(2):
                actions = [
                    a.strip().strip('"').strip("'")
                    for a in am.group(2).split(",")
                    if a.strip().strip('"').strip("'")
                ]
        stmts.append({"principal": principal, "actions": actions})
    return stmts


def check_terraform(path: str) -> list[str]:
    try:
        with open(path) as f:
            text = f.read()
    except OSError:
        return []
    blocks = _tf_extract_blocks(text)
    if not blocks:
        return []
    # Collect every KMS key in this file with its Allow statements (principal + actions)
    keys: dict[str, list[dict]] = {}
    consumers: list[tuple[str, str, str]] = []  # (rtype, rname, key_ref_text)
    unknown_consumers: list[tuple[str, str]] = []  # (rtype, rname) references KMS but not in spec
    for rtype, rname, body in blocks:
        if rtype == "aws_kms_key":
            keys[rname] = _tf_collect_kms_statements(body)
            continue
        # Does this resource reference a KMS key via any known arg?
        has_kms_ref = False
        key_ref_text: str | None = None
        for arg in _TF_KEY_ARGS:
            m = re.search(rf'{arg}\s*=\s*([^\n]+)', body)
            if m:
                has_kms_ref = True
                key_ref_text = m.group(1).strip()
                break
        if not has_kms_ref:
            continue
        if rtype in _TF_CONSUMER_SPEC:
            consumers.append((rtype, rname, key_ref_text or ""))
        else:
            unknown_consumers.append((rtype, rname))
    if not keys:
        return []
    errors: list[str] = []
    for unk_rtype, unk_rname in unknown_consumers:
        errors.append(
            f"KMS-CONSUMER-UNKNOWN {os.path.basename(path)}: resource type {unk_rtype!r} "
            f"({unk_rname}) references a KMS key but is not in "
            f"data/kms-consumer-specs.json. To enable the check: "
            f"(1) find the service's 'Encrypting data with KMS for <service>' dev guide "
            f"page, (2) verify the required principal/actions via deploy+teardown, "
            f"(3) add the entry. WARNING, not a deploy blocker."
        )
    for rtype, rname, ref in consumers:
        spec = _TF_CONSUMER_SPEC[rtype]
        required_principal = spec["principal"]
        required_actions = spec["required_actions"]
        km = re.search(r'aws_kms_key\.(\w+)', ref)
        if not km or km.group(1) not in keys:
            continue
        stmts = keys[km.group(1)]
        matched = False
        for st in stmts:
            if _principal_matches(required_principal, [st["principal"]]) and \
               _action_covered(required_actions, st["actions"]):
                matched = True
                break
        if matched:
            continue
        all_principals = [s["principal"] for s in stmts]
        if not _principal_matches(required_principal, all_principals):
            errors.append(
                f"KMS-CONSUMER {os.path.basename(path)}: {rtype}.{rname} uses "
                f"aws_kms_key.{km.group(1)} but policy does not grant "
                f"{required_principal!r} (granted principals: {all_principals or 'none'})"
            )
        else:
            errors.append(
                f"KMS-CONSUMER {os.path.basename(path)}: {rtype}.{rname} uses "
                f"aws_kms_key.{km.group(1)}; principal {required_principal!r} is "
                f"granted but missing required action (need any of {required_actions})"
            )
    return errors


# -------- Dispatcher --------

def validate_kms_consumers(file_path: str) -> list[str]:
    """Public entry — called from validate_controls.validate_file."""
    norm = file_path.replace("\\", "/")
    # Check for IaC directory in both old and new layouts
    # New: .service-approval/<slug>/05-generate/iac/
    # Old (legacy): .service-approval/controls/iac/
    if "/controls/iac/" not in norm and "/05-generate/iac/" not in norm and "/iac/" not in norm:
        return []
    lower = file_path.lower()
    if lower.endswith((".cfn.yaml", ".cfn.yml")) or (
        "/cloudformation/" in norm and lower.endswith((".yaml", ".yml"))
    ):
        return check_cloudformation(file_path)
    if lower.endswith(".tf"):
        return check_terraform(file_path)
    return []


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_kms_consumers.py <file>", file=sys.stderr)
        return 2
    errs = validate_kms_consumers(sys.argv[1])
    for e in errs:
        print(e, file=sys.stderr)
    return 2 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
