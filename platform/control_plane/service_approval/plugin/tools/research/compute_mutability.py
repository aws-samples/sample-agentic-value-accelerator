#!/usr/bin/env python3
"""Compute per-parameter mutability by diffing Create* vs Update* input shapes.

Classifies each parameter as:
- `create_only` — appears in Create/Register/Put input shape, not in any Update/Modify/Patch shape
- `mutable` — appears in both
- `unknown` — no Create-shape found, or no Update-shape found (heuristic can't decide)

Used to route reactive-corrective mechanism selection. A parameter that's `create_only`
cannot be remediated in-place; Config detection flags but SSM automation can't fix it
without resource recreation.

Usage:
    python3 compute_mutability.py <service> [--output=<path>]

Offline: reads boto3 models only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

try:
    import boto3
except ImportError:
    print("ERROR: boto3 not installed", file=sys.stderr)
    sys.exit(3)

# Map Create-family action prefixes to their Update-family counterparts
_CREATE_PREFIXES = ("Create", "Register", "Put")
_UPDATE_PREFIXES = ("Update", "Modify", "Patch")


def _extract_resource_name(op_name: str, prefixes: tuple[str, ...]) -> str | None:
    """RegisterTaskDefinition → TaskDefinition; CreateCluster → Cluster."""
    for p in prefixes:
        if op_name.startswith(p):
            return op_name[len(p):]
    return None


def _collect_parameter_paths(shape, path="$", visited=None, depth=0):
    """Flatten an input shape to a set of parameter paths (leaves only)."""
    if visited is None:
        visited = set()
    if depth > 6:
        return set()
    paths = set()
    shape_name = getattr(shape, "name", None)
    if shape_name and shape_name in visited:
        return paths
    local_visited = visited | ({shape_name} if shape_name else set())
    if shape.type_name == "structure":
        for name, member in (shape.members or {}).items():
            sub = f"{path}.{name}"
            if member.type_name in ("structure", "list", "map"):
                if member.type_name == "list":
                    paths |= _collect_parameter_paths(member.member, f"{sub}[*]", local_visited, depth + 1)
                elif member.type_name == "map":
                    paths |= _collect_parameter_paths(member.value, f"{sub}.*", local_visited, depth + 1)
                else:
                    paths |= _collect_parameter_paths(member, sub, local_visited, depth + 1)
            else:
                paths.add(sub)
    elif shape.type_name == "list":
        paths |= _collect_parameter_paths(shape.member, path, local_visited, depth + 1)
    return paths


def _classify_paths(
    creates: dict[str, set[str]], updates: dict[str, set[str]]
) -> dict[str, dict[str, str]]:
    """Classify each create path as create_only / mutable / unknown.

    Separated from the boto3-dependent glue so the classification logic is
    unit-testable without hitting the SDK.

    Rules (per resource):
      - No Update-family op found → every create param is `unknown`.
      - Path present in both Create and Update → `mutable`.
      - Path present in Create only (Update exists, but without this path) →
        `create_only`.
    """
    result: dict[str, dict[str, str]] = {}
    for res, create_paths in creates.items():
        update_paths = updates.get(res, set())
        classifications: dict[str, str] = {}
        for p in create_paths:
            if not update_paths:
                classifications[p] = "unknown"
            elif p in update_paths:
                classifications[p] = "mutable"
            else:
                classifications[p] = "create_only"
        result[res] = classifications
    return result


def compute_mutability(service: str) -> dict:
    """Return {parameter_path: mutability_label} across the service."""
    client = boto3.client(service, region_name="us-east-1")
    # Depends on pinned boto3 version — see requirements-research.txt.
    model = client._service_model

    # Group operations by resource name
    creates: dict[str, set[str]] = {}  # resource_name → param paths
    updates: dict[str, set[str]] = {}

    for op_name in model.operation_names:
        res = _extract_resource_name(op_name, _CREATE_PREFIXES)
        if res:
            op = model.operation_model(op_name)
            if op.input_shape:
                creates.setdefault(res, set()).update(
                    _collect_parameter_paths(op.input_shape)
                )
            continue
        res = _extract_resource_name(op_name, _UPDATE_PREFIXES)
        if res:
            op = model.operation_model(op_name)
            if op.input_shape:
                updates.setdefault(res, set()).update(
                    _collect_parameter_paths(op.input_shape)
                )

    result = _classify_paths(creates, updates)

    return {
        "_metadata": {
            "service": service,
            "boto3_version": boto3.__version__,
            "resources_analyzed": len(result),
            "resources_with_update_op": sum(
                1 for r in result if any(v == "mutable" for v in result[r].values())
            ),
        },
        "mutability": result,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("service")
    ap.add_argument("--output", "-o")
    args = ap.parse_args()

    try:
        data = compute_mutability(args.service)
    except Exception as e:
        if "UnknownService" in type(e).__name__ or "DataNotFound" in type(e).__name__:
            print(f"ERROR: service '{args.service}' not known to boto3", file=sys.stderr)
            return 2
        raise

    out = json.dumps(data, indent=2, sort_keys=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(out + "\n")
        m = data["_metadata"]
        print(
            f"{args.service}: {m['resources_analyzed']} resources analyzed "
            f"({m['resources_with_update_op']} have update op) → {args.output}",
            file=sys.stderr,
        )
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
