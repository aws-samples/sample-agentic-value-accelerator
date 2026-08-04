"""Unit tests for compute_mutability.py.

Covers the three cases called out in the MR7 review:

    1. Parameter in Create shape only (Update exists without it) → create_only.
    2. Parameter in BOTH Create and Update → mutable.
    3. No Create-family op found → (resource doesn't appear; `unknown` only
       fires when a Create op exists but NO Update op does).

Plus helper unit tests for _extract_resource_name (prefix stripping) and
an end-to-end call to compute_mutability("ecs") — boto3 model is shipped
with the SDK, so no network IO is performed.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from compute_mutability import (  # noqa: E402
    _classify_paths,
    _extract_resource_name,
    compute_mutability,
)


# ------------------------------------------------------------------
# Helper: _extract_resource_name strips Create/Update/etc. prefixes
# ------------------------------------------------------------------


def test_extract_resource_name_create_prefix() -> None:
    assert _extract_resource_name("CreateCluster", ("Create", "Register", "Put")) == "Cluster"
    assert _extract_resource_name("RegisterTaskDefinition", ("Create", "Register", "Put")) == "TaskDefinition"
    assert _extract_resource_name("PutObject", ("Create", "Register", "Put")) == "Object"


def test_extract_resource_name_update_prefix() -> None:
    assert _extract_resource_name("UpdateService", ("Update", "Modify", "Patch")) == "Service"
    assert _extract_resource_name("ModifyCluster", ("Update", "Modify", "Patch")) == "Cluster"
    assert _extract_resource_name("PatchBaseline", ("Update", "Modify", "Patch")) == "Baseline"


def test_extract_resource_name_non_matching_prefix_returns_none() -> None:
    assert _extract_resource_name("DescribeCluster", ("Create",)) is None
    assert _extract_resource_name("ListThings", ("Update",)) is None
    assert _extract_resource_name("Cluster", ("Create",)) is None  # no prefix at all


# ------------------------------------------------------------------
# _classify_paths — pure classification logic
# ------------------------------------------------------------------


def test_classify_create_only_when_path_absent_from_update() -> None:
    """Parameter in Create but not Update (Update op exists) → create_only."""
    creates = {"Cluster": {"$.clusterName", "$.settings"}}
    updates = {"Cluster": {"$.settings"}}  # clusterName not updatable
    result = _classify_paths(creates, updates)
    assert result == {
        "Cluster": {
            "$.clusterName": "create_only",
            "$.settings": "mutable",
        }
    }


def test_classify_mutable_when_path_present_in_both() -> None:
    """Parameter in both Create and Update → mutable."""
    creates = {"Service": {"$.desiredCount", "$.cluster"}}
    updates = {"Service": {"$.desiredCount", "$.cluster"}}
    result = _classify_paths(creates, updates)
    assert result["Service"]["$.desiredCount"] == "mutable"
    assert result["Service"]["$.cluster"] == "mutable"


def test_classify_unknown_when_no_update_op_exists() -> None:
    """When a resource has a Create op but no Update op at all, every
    create param is classified `unknown` — we cannot prove immutability
    without evidence."""
    creates = {"Task": {"$.taskArn", "$.overrides"}}
    updates = {}  # no Update* / Modify* / Patch* for Task
    result = _classify_paths(creates, updates)
    assert result == {
        "Task": {
            "$.taskArn": "unknown",
            "$.overrides": "unknown",
        }
    }


def test_classify_empty_inputs_returns_empty_result() -> None:
    assert _classify_paths({}, {}) == {}


def test_classify_resource_with_empty_update_set_is_unknown() -> None:
    """An Update op that takes NO parameters (empty set) should be treated
    the same as 'no update op' — `unknown`, because there's no evidence
    either way about a specific param's mutability."""
    creates = {"Thing": {"$.name"}}
    updates = {"Thing": set()}  # degenerate: Update op exists but has no params
    result = _classify_paths(creates, updates)
    # Current behaviour: empty set is falsy → `unknown`. Documented here so
    # any future change to stricter semantics is deliberate.
    assert result["Thing"]["$.name"] == "unknown"


# ------------------------------------------------------------------
# End-to-end — compute_mutability() against a shipped boto3 model
# ------------------------------------------------------------------


def test_compute_mutability_ecs_returns_expected_shape() -> None:
    """Run the full pipeline against ecs (boto3 ships the model; no network).

    This verifies the glue layer wires Create/Update grouping + classifier
    correctly. We don't assert specific parameter classifications — those
    depend on the pinned boto3 version — only the shape and invariants.
    """
    out = compute_mutability("ecs")
    assert "_metadata" in out and "mutability" in out
    meta = out["_metadata"]
    assert meta["service"] == "ecs"
    assert isinstance(meta["boto3_version"], str)
    assert meta["resources_analyzed"] >= 1
    # Every classification value is one of the three labels.
    for resource_name, params in out["mutability"].items():
        assert isinstance(resource_name, str)
        for path, label in params.items():
            assert path.startswith("$.")
            assert label in {"create_only", "mutable", "unknown"}, (
                f"Unexpected label {label!r} for {resource_name}.{path}"
            )


def test_compute_mutability_ecs_has_taskdefinition_and_cluster_resources() -> None:
    """ECS has RegisterTaskDefinition (Create-family) and CreateCluster.
    Both should surface as resource names."""
    out = compute_mutability("ecs")
    resources = set(out["mutability"].keys())
    assert "TaskDefinition" in resources
    assert "Cluster" in resources
