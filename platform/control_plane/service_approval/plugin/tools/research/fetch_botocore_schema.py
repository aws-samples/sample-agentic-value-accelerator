#!/usr/bin/env python3
"""Extract per-parameter API schema from the boto3 service model.

Emits JSON matching the `api_surface.operations[]` schema expected by the
service-approval pipeline's `validated.json`. Fields produced per parameter:
- path: JSONPath-like (e.g. `$.configuration.executeCommandConfiguration.logging`)
- type: botocore type_name (string | integer | boolean | list | structure | map | ...)
- required: bool (from the shape's required_members)
- enum: list[str] (only when botocore has an explicit enum)
- min / max: numeric bound (on integers) or length bound (on strings/lists)
- pattern: regex (rare — when botocore has one)
- description: first ~200 chars of the boto3 docstring
- security_category: kms | network | iam | tag | log | auth | tls | policy | null
  (from keyword-match on path + name)

Offline: no AWS API calls. Only uses boto3's packaged service models.

Usage:
    python3 fetch_botocore_schema.py <service> [--output=<path>]
    python3 fetch_botocore_schema.py --list   # list all services boto3 knows

Exit codes:
    0 — success, JSON emitted to stdout or file
    2 — service unknown to boto3 (newly-launched AWS service)
    3 — argument error
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

try:
    import boto3
except ImportError:
    print("ERROR: boto3 not installed. Install with: pip install boto3", file=sys.stderr)
    sys.exit(3)

# Keyword families for `security_category` classification. Order matters — first match wins.
_SEC_CATEGORIES: list[tuple[str, re.Pattern]] = [
    ("kms", re.compile(r"\bkms|cmk|encrypt|encryption[_-]?key|encryptionconfiguration", re.I)),
    ("network", re.compile(r"\bvpc|subnet|security[_-]?group|cidr|ingress|egress|assign[_-]?public[_-]?ip|network[_-]?configuration", re.I)),
    ("iam", re.compile(r"\brole[_-]?arn|iam|principal|assume[_-]?role|execution[_-]?role|task[_-]?role", re.I)),
    ("auth", re.compile(r"\bauth|mfa|credential|signer|certificate[_-]?authority", re.I)),
    ("tls", re.compile(r"\btls|ssl|certificate|ca[_-]?arn", re.I)),
    ("policy", re.compile(r"\bpolicy|policies", re.I)),
    ("log", re.compile(r"\blog[_-]?group|log[_-]?configuration|cloudtrail|cloudwatch[_-]?log", re.I)),
    ("tag", re.compile(r"\btag|label\b|propagate[_-]?tags", re.I)),
]


def classify_security_category(path: str, name: str) -> str | None:
    """Return a security_category label for a parameter, or None if not security-relevant."""
    haystack = f"{path} {name}"
    for label, pat in _SEC_CATEGORIES:
        if pat.search(haystack):
            return label
    return None


def _short_doc(raw: str | None) -> str:
    if not raw:
        return ""
    # Strip HTML tags and collapse whitespace
    text = re.sub(r"<[^>]+>", "", raw)
    text = " ".join(text.split())
    return text[:200]


# Hard caps to prevent runaway recursion on services with self-referential shapes
# (e.g. DynamoDB's AttributeValue, which contains AttributeValue as a member).
_MAX_DEPTH = 8          # deepest nested structure we'll emit parameters for
_MAX_PARAMS_PER_OP = 2000  # safety cap per operation


def walk_shape(
    shape: Any,
    path: str,
    required_members: set[str] | None,
    out: list[dict],
    visited: set[str] | None = None,
    depth: int = 0,
) -> None:
    """Recursively flatten a shape into parameter records.

    Only emits leaf scalar parameters (string, integer, boolean, long, float, double, timestamp,
    blob). Intermediate structure and list nodes are traversed but not emitted as records.
    This matches the existing leaf-records contract of `api_surface.operations[].parameters[]`.

    Cycle + depth guard: tracks shape names in `visited` to prevent infinite recursion on
    self-referential shapes (DynamoDB AttributeValue, etc). Caps depth at _MAX_DEPTH.
    """
    if visited is None:
        visited = set()
    if depth > _MAX_DEPTH:
        return
    if len(out) > _MAX_PARAMS_PER_OP:
        return
    type_name = shape.type_name
    shape_name = getattr(shape, "name", None)
    # Only track named shapes (anonymous shapes have no cycle risk)
    if shape_name and shape_name in visited:
        return
    local_visited = visited | ({shape_name} if shape_name else set())
    if type_name == "structure":
        members = shape.members or {}
        nested_required = set(shape.required_members or [])
        for name, member in members.items():
            sub_path = f"{path}.{name}"
            if member.type_name == "structure":
                walk_shape(member, sub_path, nested_required, out, local_visited, depth + 1)
            elif member.type_name == "list":
                walk_shape(member, f"{sub_path}[*]", nested_required, out, local_visited, depth + 1)
            elif member.type_name == "map":
                # map values are accessible via .* path suffix
                walk_shape(member.value, f"{sub_path}.*", nested_required, out, local_visited, depth + 1)
            else:
                # Scalar leaf
                record = {
                    "path": sub_path,
                    "type": member.type_name,
                    "required": name in nested_required,
                }
                enum = getattr(member, "enum", None)
                if enum:
                    record["enum"] = list(enum)
                mn = getattr(member, "min", None)
                if mn is not None:
                    record["min"] = mn
                mx = getattr(member, "max", None)
                if mx is not None:
                    record["max"] = mx
                pat = getattr(member, "pattern", None)
                if pat:
                    record["pattern"] = pat
                doc = _short_doc(getattr(member, "documentation", None))
                if doc:
                    record["description"] = doc
                cat = classify_security_category(sub_path, name)
                if cat:
                    record["security_category"] = cat
                out.append(record)
    elif type_name == "list":
        member = shape.member
        # List of scalars vs list of structures
        if member.type_name == "structure":
            walk_shape(member, path, None, out, local_visited, depth + 1)
        elif member.type_name == "list":
            walk_shape(member, f"{path}[*]", None, out, local_visited, depth + 1)
        else:
            # list of scalars — rare; emit one record describing the element type
            record = {
                "path": path,
                "type": f"list<{member.type_name}>",
                "required": False,
            }
            enum = getattr(member, "enum", None)
            if enum:
                record["enum"] = list(enum)
            out.append(record)


def build_operations(service: str) -> list[dict]:
    """Build the operations list for a given service name."""
    client = boto3.client(service, region_name="us-east-1")
    # Depends on pinned boto3 version — see requirements-research.txt.
    # `_service_model` is a private attribute; re-verify compatibility when
    # bumping the pin. Public alternatives (e.g. botocore.loaders) do not
    # expose the same shape-walking API we rely on.
    model = client._service_model
    operations: list[dict] = []
    for op_name in sorted(model.operation_names):
        op = model.operation_model(op_name)
        params: list[dict] = []
        if op.input_shape:
            walk_shape(op.input_shape, "$", None, params)
        operations.append(
            {
                "operation": op_name,
                "parameters": params,
                "param_count": len(params),
            }
        )
    return operations


def build_service_schema(service: str) -> dict:
    """Build the complete enriched schema for one service."""
    client = boto3.client(service, region_name="us-east-1")
    # Depends on pinned boto3 version — see requirements-research.txt.
    model = client._service_model
    ops = build_operations(service)
    return {
        "_metadata": {
            "service": service,
            "boto3_version": boto3.__version__,
            "api_version": model.api_version,
            "endpoint_prefix": model.endpoint_prefix,
            "total_operations": len(ops),
            "total_parameters": sum(len(o["parameters"]) for o in ops),
            "source": "boto3._service_model (offline, no AWS API calls)",
        },
        "api_surface": {"operations": ops},
    }


def list_known_services() -> list[str]:
    session = boto3.Session(region_name="us-east-1")
    return sorted(session.get_available_services())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("service", nargs="?", help="AWS service id (e.g. ecs, lambda, s3)")
    ap.add_argument("--output", "-o", help="Write JSON to this path instead of stdout")
    ap.add_argument("--list", action="store_true", help="List all services boto3 knows and exit")
    args = ap.parse_args()

    if args.list:
        for s in list_known_services():
            print(s)
        return 0

    if not args.service:
        print("ERROR: service argument required (or use --list)", file=sys.stderr)
        return 3

    try:
        schema = build_service_schema(args.service)
    except Exception as e:
        err_name = type(e).__name__
        if "UnknownService" in err_name or "DataNotFound" in err_name:
            print(
                f"ERROR: service '{args.service}' not known to boto3 {boto3.__version__}. "
                f"Try `--list` to see available services, or update boto3.",
                file=sys.stderr,
            )
            return 2
        raise

    out_json = json.dumps(schema, indent=2, sort_keys=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(out_json + "\n")
        print(
            f"Wrote {args.service}: {schema['_metadata']['total_operations']} ops, "
            f"{schema['_metadata']['total_parameters']} params → {args.output}",
            file=sys.stderr,
        )
    else:
        print(out_json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
