#!/usr/bin/env python3
"""Cross-reference API parameter paths against SAR condition keys.

For each parameter in the enriched api_surface output, determines:
- `gateable_by`: list containing "sar" if a SAR condition key matches this parameter,
  and "api" if the parameter exists in botocore (always true for inputs of this tool)
- `sar_condition_key`: string (the matched SAR key) or null

Two-step matching per smoke-test finding (2026-04-26):
1. Strict — normalized-token exact match (last segment of path vs SAR key suffix)
2. Semantic confirmation — the matched SAR key's applies_to_actions[] must overlap
   with ops that accept this parameter; otherwise the match is discarded as a false positive.

Hand-curated allow-list for virtual keys (e.g., `ecs:CreateAction`) that don't map
to a parameter path.

Usage:
    python3 compute_gateable_by.py --schema <path> --sar-facts <path> [--output=<path>]

Reads the output of fetch_botocore_schema.py + sar-facts.json; emits an enriched
schema with gateable_by + sar_condition_key populated per parameter.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

# Virtual keys that don't map to a parameter path; still valid for SCP use but
# don't correspond to an API input value. Entries are stored in the SAME
# normalized form (lowercased, alphanumerics only) produced by _sar_key_suffix
# so the membership check `suffix.lower() in _VIRTUAL_KEYS_ALLOW_LIST` works.
_VIRTUAL_KEYS_ALLOW_LIST = {
    "createaction",     # e.g. ecs:CreateAction — matches any Create* op
    "operation",        # matches action name
}


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _sar_key_suffix(sar_key: str) -> str:
    """ecs:auto-assign-public-ip → 'autoassignpublicip'."""
    if ":" in sar_key:
        return _normalize(sar_key.split(":", 1)[1])
    return _normalize(sar_key)


def _param_leaf_name(path: str) -> str:
    """$.networkConfiguration.awsvpcConfiguration.assignPublicIp → 'assignpublicip'."""
    last = path.rsplit(".", 1)[-1].rstrip("[*]").rstrip(".*")
    return _normalize(last)


def _build_sar_to_actions(sar_facts: dict) -> dict[str, set[str]]:
    """Map every SAR condition key to the set of IAM actions that support it."""
    result: dict[str, set[str]] = {}
    # sar-facts.json carries condition_keys with applies_to_actions, if the research phase populated it
    for ck in sar_facts.get("condition_keys", []):
        if isinstance(ck, dict):
            key = ck.get("key")
            if not key:
                continue
            actions = set(ck.get("applies_to_actions", []) or [])
            result[key] = actions
    return result


def _build_op_to_paths(schema: dict) -> dict[str, set[str]]:
    """Map every operation to the set of parameter paths it accepts."""
    result: dict[str, set[str]] = {}
    for op in schema.get("api_surface", {}).get("operations", []):
        op_name = op.get("operation")
        paths = {p.get("path") for p in op.get("parameters", [])}
        if op_name:
            result[op_name] = paths
    return result


def compute_gateable_by(schema: dict, sar_facts: dict) -> dict:
    """Enrich the schema's parameters[] with gateable_by and sar_condition_key."""
    sar_keys = [
        (ck.get("key") if isinstance(ck, dict) else ck)
        for ck in sar_facts.get("condition_keys", [])
    ]
    sar_keys = [k for k in sar_keys if k]

    sar_to_actions = _build_sar_to_actions(sar_facts)
    op_to_paths = _build_op_to_paths(schema)

    # Build quick index: normalized suffix → full SAR key
    sar_suffix_index: dict[str, list[str]] = {}
    for k in sar_keys:
        suffix = _sar_key_suffix(k)
        if not suffix:
            continue
        if suffix.lower() in _VIRTUAL_KEYS_ALLOW_LIST:
            continue  # skip virtual keys for parameter-matching
        sar_suffix_index.setdefault(suffix, []).append(k)

    match_stats = {
        "total_parameters": 0,
        "sar_matched": 0,
        "sar_ambiguous_rejected": 0,
        "sar_no_semantic_evidence_rejected": 0,
    }

    enriched_ops = []
    for op in schema.get("api_surface", {}).get("operations", []):
        op_name = op.get("operation")
        new_params = []
        for p in op.get("parameters", []):
            match_stats["total_parameters"] += 1
            path = p.get("path", "")
            leaf = _param_leaf_name(path)
            gateable_by = ["api"]  # always, since we got here from the schema
            sar_key: str | None = None

            # Strict match: normalized leaf name equals SAR key suffix
            candidates = sar_suffix_index.get(leaf, [])
            if candidates:
                if len(candidates) == 1:
                    candidate_key = candidates[0]
                    # Semantic confirmation: the SAR key's applies_to_actions must include
                    # an op that accepts this parameter path
                    ops_accepting_path = {
                        o for o, paths in op_to_paths.items() if path in paths
                    }
                    allowed_actions = sar_to_actions.get(candidate_key, set())
                    # Compare case-insensitively, since SAR actions are CreateCluster etc
                    if not allowed_actions:
                        # SAR facts have no applies_to_actions data — accept the match but flag it
                        sar_key = candidate_key
                        gateable_by.append("sar")
                        match_stats["sar_matched"] += 1
                    elif ops_accepting_path & allowed_actions:
                        sar_key = candidate_key
                        gateable_by.append("sar")
                        match_stats["sar_matched"] += 1
                    else:
                        match_stats["sar_no_semantic_evidence_rejected"] += 1
                else:
                    # Ambiguous: multiple SAR keys match. Pick the one with largest
                    # intersection of applies_to_actions + ops_accepting_path
                    ops_accepting_path = {
                        o for o, paths in op_to_paths.items() if path in paths
                    }
                    best = None
                    best_overlap = 0
                    for k in candidates:
                        allowed = sar_to_actions.get(k, set())
                        overlap = len(ops_accepting_path & allowed)
                        if overlap > best_overlap:
                            best_overlap = overlap
                            best = k
                    if best and best_overlap > 0:
                        sar_key = best
                        gateable_by.append("sar")
                        match_stats["sar_matched"] += 1
                    else:
                        match_stats["sar_ambiguous_rejected"] += 1

            new_p = dict(p)
            new_p["gateable_by"] = gateable_by
            new_p["sar_condition_key"] = sar_key
            new_params.append(new_p)

        enriched_ops.append({**op, "parameters": new_params})

    return {
        "_metadata": {
            **schema.get("_metadata", {}),
            "gateable_by_stats": match_stats,
            "sar_facts_source": sar_facts.get("service", "unknown"),
        },
        "api_surface": {"operations": enriched_ops},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, help="Path to fetch_botocore_schema.py output")
    ap.add_argument("--sar-facts", required=True, help="Path to sar-facts.json")
    ap.add_argument("--output", "-o")
    args = ap.parse_args()

    try:
        with open(args.schema) as f:
            schema = json.load(f)
        with open(args.sar_facts) as f:
            sar_facts = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR: failed to load inputs — {e}", file=sys.stderr)
        return 3

    enriched = compute_gateable_by(schema, sar_facts)
    out = json.dumps(enriched, indent=2, sort_keys=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(out + "\n")
        s = enriched["_metadata"]["gateable_by_stats"]
        matched_pct = 100 * s["sar_matched"] // max(s["total_parameters"], 1)
        print(
            f"Enriched: {s['total_parameters']} params, "
            f"{s['sar_matched']} sar-matched ({matched_pct}%), "
            f"{s['sar_ambiguous_rejected']} ambiguous rejected, "
            f"{s['sar_no_semantic_evidence_rejected']} no-evidence rejected → {args.output}",
            file=sys.stderr,
        )
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
