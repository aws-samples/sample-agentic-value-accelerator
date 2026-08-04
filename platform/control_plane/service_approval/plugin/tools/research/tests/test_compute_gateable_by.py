"""Unit tests for compute_gateable_by.py.

Covers the four cases called out in the MR7 review:

    1. Single candidate SAR key with semantic evidence → matched.
    2. Ambiguous candidates resolved by largest action overlap.
    3. Virtual-key allow-list correctly excluded (ecs:CreateAction,
       operation — never mapped to a parameter path).
    4. No semantic evidence (SAR applies_to_actions don't overlap ops
       accepting the path) → rejected.

Plus helper checks: _normalize / _sar_key_suffix / _param_leaf_name
produce matching tokens.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Put the research tool dir on sys.path so we can import the module directly.
sys.path.insert(
    0, str(Path(__file__).resolve().parent.parent)
)

from compute_gateable_by import (  # noqa: E402
    _normalize,
    _param_leaf_name,
    _sar_key_suffix,
    compute_gateable_by,
)


# ------------------------------------------------------------------
# Normaliser / leaf helpers
# ------------------------------------------------------------------


def test_normalize_strips_non_alnum_and_lowercases() -> None:
    assert _normalize("Auto-Assign-Public-IP") == "autoassignpublicip"
    assert _normalize("Task-Definition") == "taskdefinition"
    assert _normalize("UPPER_CASE") == "uppercase"


def test_sar_key_suffix_strips_prefix() -> None:
    assert _sar_key_suffix("ecs:auto-assign-public-ip") == "autoassignpublicip"
    assert _sar_key_suffix("aws:RequestTag/${TagKey}") == "requesttagtagkey"
    # No prefix — normalize the whole thing
    assert _sar_key_suffix("bareKey") == "barekey"


def test_param_leaf_name_handles_list_and_map_suffixes() -> None:
    assert _param_leaf_name("$.networkConfiguration.awsvpcConfiguration.assignPublicIp") == "assignpublicip"
    assert _param_leaf_name("$.Tags[*]") == "tags"
    # Sorted: .rstrip("[*]").rstrip(".*") is additive, not ordered-sensitive.
    assert _param_leaf_name("$.foo") == "foo"


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


def _schema(operations: list[dict]) -> dict:
    return {
        "_metadata": {"service": "svc"},
        "api_surface": {"operations": operations},
    }


def _sar_facts(condition_keys: list[dict]) -> dict:
    return {"service": "svc", "condition_keys": condition_keys}


# ------------------------------------------------------------------
# 1. Single candidate with semantic evidence → matched
# ------------------------------------------------------------------


def test_single_candidate_with_semantic_evidence_matches() -> None:
    schema = _schema(
        [
            {
                "operation": "CreateService",
                "parameters": [
                    {"path": "$.cluster", "type": "string"},
                ],
            }
        ]
    )
    sar = _sar_facts(
        [{"key": "ecs:cluster", "applies_to_actions": ["CreateService"]}]
    )
    out = compute_gateable_by(schema, sar)
    params = out["api_surface"]["operations"][0]["parameters"]
    assert params[0]["gateable_by"] == ["api", "sar"]
    assert params[0]["sar_condition_key"] == "ecs:cluster"
    assert out["_metadata"]["gateable_by_stats"]["sar_matched"] == 1


def test_single_candidate_without_applies_to_actions_is_accepted_flagged() -> None:
    """When sar-facts has no applies_to_actions data, the match is accepted
    but should be considered unvalidated. (Current behaviour: match wins.)"""
    schema = _schema(
        [{"operation": "CreateX", "parameters": [{"path": "$.foo"}]}]
    )
    sar = _sar_facts([{"key": "svc:foo"}])  # no applies_to_actions
    out = compute_gateable_by(schema, sar)
    params = out["api_surface"]["operations"][0]["parameters"]
    assert params[0]["gateable_by"] == ["api", "sar"]
    assert params[0]["sar_condition_key"] == "svc:foo"


# ------------------------------------------------------------------
# 2. Ambiguous candidates resolved by largest action overlap
# ------------------------------------------------------------------


def test_ambiguous_candidates_resolved_by_largest_action_overlap() -> None:
    """Two SAR keys normalize to the same suffix. The one whose
    applies_to_actions overlaps more with operations that accept the
    parameter path wins."""
    schema = _schema(
        [
            {
                "operation": "CreateService",
                "parameters": [{"path": "$.cluster"}],
            },
            {
                "operation": "UpdateService",
                "parameters": [{"path": "$.cluster"}],
            },
        ]
    )
    sar = _sar_facts(
        [
            # Winner — overlap 2 (both ops)
            {
                "key": "ecs:cluster",
                "applies_to_actions": ["CreateService", "UpdateService", "FooBar"],
            },
            # Loser — overlap 0 (BarBaz is in its applies list but not in
            # our schema's operations)
            {"key": "other:Cluster", "applies_to_actions": ["BarBaz"]},
        ]
    )
    out = compute_gateable_by(schema, sar)
    for op in out["api_surface"]["operations"]:
        p = op["parameters"][0]
        assert p["sar_condition_key"] == "ecs:cluster"
        assert "sar" in p["gateable_by"]


def test_ambiguous_candidates_with_zero_overlap_rejected() -> None:
    """If every candidate has zero overlap, the match is ambiguous-rejected."""
    schema = _schema(
        [{"operation": "CreateX", "parameters": [{"path": "$.thing"}]}]
    )
    sar = _sar_facts(
        [
            {"key": "a:thing", "applies_to_actions": ["SomethingElse"]},
            {"key": "b:thing", "applies_to_actions": ["AnotherOp"]},
        ]
    )
    out = compute_gateable_by(schema, sar)
    p = out["api_surface"]["operations"][0]["parameters"][0]
    assert p["gateable_by"] == ["api"]
    assert p["sar_condition_key"] is None
    stats = out["_metadata"]["gateable_by_stats"]
    assert stats["sar_ambiguous_rejected"] == 1


# ------------------------------------------------------------------
# 3. Virtual-key allow-list (CreateAction, operation) excluded from matching
# ------------------------------------------------------------------


def test_virtual_keys_are_excluded_from_parameter_matching() -> None:
    """A parameter leaf that happens to equal a virtual SAR key suffix
    (e.g. a param named `operation` matching the virtual key `operation`)
    MUST NOT be SAR-matched — virtual keys don't map to API inputs."""
    schema = _schema(
        [
            {
                "operation": "DoThing",
                "parameters": [{"path": "$.operation"}, {"path": "$.createAction"}],
            }
        ]
    )
    sar = _sar_facts(
        [
            {"key": "ecs:CreateAction", "applies_to_actions": ["DoThing"]},
            {"key": "svc:operation", "applies_to_actions": ["DoThing"]},
        ]
    )
    out = compute_gateable_by(schema, sar)
    for p in out["api_surface"]["operations"][0]["parameters"]:
        # Neither should SAR-match despite leaf names matching virtual keys.
        assert p["gateable_by"] == ["api"]
        assert p["sar_condition_key"] is None


# ------------------------------------------------------------------
# 4. No semantic evidence → rejected
# ------------------------------------------------------------------


def test_single_candidate_without_semantic_evidence_is_rejected() -> None:
    """SAR key has applies_to_actions listed, but none of those actions
    accept this parameter path — so the match is semantically invalid and
    the parameter stays api-only."""
    schema = _schema(
        [{"operation": "CreateService", "parameters": [{"path": "$.cluster"}]}]
    )
    sar = _sar_facts(
        [
            {
                "key": "ecs:cluster",
                # ecs:cluster claims to apply to SomeOtherOp, but our
                # schema says CreateService is what actually takes $.cluster.
                "applies_to_actions": ["SomeOtherOp"],
            }
        ]
    )
    out = compute_gateable_by(schema, sar)
    p = out["api_surface"]["operations"][0]["parameters"][0]
    assert p["gateable_by"] == ["api"]
    assert p["sar_condition_key"] is None
    stats = out["_metadata"]["gateable_by_stats"]
    assert stats["sar_no_semantic_evidence_rejected"] == 1


# ------------------------------------------------------------------
# General-shape assertions
# ------------------------------------------------------------------


def test_empty_schema_returns_clean_result() -> None:
    out = compute_gateable_by(_schema([]), _sar_facts([]))
    assert out["api_surface"]["operations"] == []
    stats = out["_metadata"]["gateable_by_stats"]
    assert stats["total_parameters"] == 0
    assert stats["sar_matched"] == 0


def test_every_parameter_always_includes_api_in_gateable_by() -> None:
    """`api` is always present; every parameter came from the API surface."""
    schema = _schema(
        [{"operation": "DoThing", "parameters": [{"path": "$.x"}, {"path": "$.y"}]}]
    )
    sar = _sar_facts([])  # no SAR keys at all
    out = compute_gateable_by(schema, sar)
    for p in out["api_surface"]["operations"][0]["parameters"]:
        assert "api" in p["gateable_by"]
