"""Unit tests for Phase B botocore-enrichment schema validator.

Covers the `check_botocore_enrichment_schema` function added to validate_state.py.

Contract recap:
- All enrichment fields on api_surface.operations[].parameters[] are OPTIONAL.
- When present, they must have valid shape/value.
- `enum` must be a non-empty list of strings.
- `gateable_by` must be a subset of {"sar", "api"}.
- If `gateable_by` contains "sar", `sar_condition_key` must be non-null.
"""
from __future__ import annotations

from validate_state import check_botocore_enrichment_schema


# ---------- positive cases ----------


def test_empty_ops_list_returns_no_errors() -> None:
    assert check_botocore_enrichment_schema([]) == []


def test_ops_with_no_enrichment_fields_is_valid() -> None:
    """Forward-compat: artifacts pre-dating Phase B (no enrichment fields) pass."""
    ops = [
        {
            "operation": "CreateService",
            "parameters": [
                {"path": "$.serviceName", "type": "string", "required": True},
                {"path": "$.desiredCount", "type": "integer", "required": False},
            ],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


def test_fully_enriched_param_is_valid() -> None:
    ops = [
        {
            "operation": "CreateService",
            "botocore_coverage": True,
            "parameters": [
                {
                    "path": "$.networkConfiguration.awsvpcConfiguration.assignPublicIp",
                    "type": "string",
                    "required": False,
                    "enum": ["ENABLED", "DISABLED"],
                    "mutability": "mutable",
                    "security_category": "network",
                    "gateable_by": ["api", "sar"],
                    "sar_condition_key": "ecs:auto-assign-public-ip",
                }
            ],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


def test_gateable_by_api_only_no_sar_key_is_valid() -> None:
    """gateable_by=['api'] alone does not require sar_condition_key."""
    ops = [
        {
            "operation": "CreateCluster",
            "parameters": [
                {
                    "path": "$.configuration.executeCommandConfiguration.logging",
                    "enum": ["NONE", "DEFAULT", "OVERRIDE"],
                    "gateable_by": ["api"],
                    "sar_condition_key": None,
                }
            ],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


def test_security_category_null_is_valid() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [{"path": "$.name", "security_category": None}],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


def test_botocore_coverage_false_is_valid() -> None:
    """Operations without botocore coverage are fine — they just retain MCP data."""
    ops = [
        {
            "operation": "PollTask",
            "botocore_coverage": False,
            "parameters": [{"path": "$.taskId"}],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


def test_min_max_pattern_valid_shapes() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [
                {"path": "$.count", "min": 0, "max": 100},
                {"path": "$.arn", "pattern": "^arn:aws:.*"},
                {"path": "$.rate", "min": 0.1, "max": 1.0},
            ],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


# ---------- negative cases ----------


def test_empty_enum_fails() -> None:
    ops = [{"operation": "Foo", "parameters": [{"path": "$.x", "enum": []}]}]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "enum must be a non-empty list" in errors[0]


def test_non_list_enum_fails() -> None:
    ops = [{"operation": "Foo", "parameters": [{"path": "$.x", "enum": "NONE"}]}]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "enum must be a non-empty list" in errors[0]


def test_non_string_enum_entries_fails() -> None:
    ops = [{"operation": "Foo", "parameters": [{"path": "$.x", "enum": ["A", 1, "B"]}]}]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "enum entries must all be strings" in errors[0]


def test_gateable_by_with_invalid_entry_fails() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [
                {"path": "$.x", "gateable_by": ["api", "cloudformation"]}
            ],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "gateable_by entries must be subset" in errors[0]
    assert "cloudformation" in errors[0]


def test_gateable_by_non_list_fails() -> None:
    ops = [{"operation": "Foo", "parameters": [{"path": "$.x", "gateable_by": "api"}]}]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "gateable_by must be a list" in errors[0]


def test_sar_in_gateable_by_without_sar_condition_key_fails() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [
                {
                    "path": "$.x",
                    "gateable_by": ["api", "sar"],
                    "sar_condition_key": None,
                }
            ],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "gateable_by includes 'sar' but sar_condition_key" in errors[0]


def test_sar_in_gateable_by_missing_sar_condition_key_key_fails() -> None:
    """Missing key entirely (not just null) also fails."""
    ops = [
        {
            "operation": "Foo",
            "parameters": [{"path": "$.x", "gateable_by": ["sar", "api"]}],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "gateable_by includes 'sar' but sar_condition_key" in errors[0]


def test_sar_condition_key_non_string_fails() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [{"path": "$.x", "sar_condition_key": 123}],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "sar_condition_key must be string or null" in errors[0]


def test_mutability_invalid_label_fails() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [{"path": "$.x", "mutability": "sometimes"}],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "mutability must be one of" in errors[0]


def test_security_category_invalid_label_fails() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [{"path": "$.x", "security_category": "tagging"}],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "security_category must be one of" in errors[0]


def test_botocore_coverage_non_bool_fails() -> None:
    ops = [{"operation": "Foo", "botocore_coverage": "yes", "parameters": []}]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 1
    assert "botocore_coverage must be bool" in errors[0]


def test_min_max_non_numeric_fails() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [{"path": "$.x", "min": "0", "max": "100"}],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 2
    assert any("min must be numeric" in e for e in errors)
    assert any("max must be numeric" in e for e in errors)


def test_unknown_extra_fields_are_ignored() -> None:
    """Forward-compat: extra unknown fields should not trip the validator."""
    ops = [
        {
            "operation": "Foo",
            "parameters": [
                {
                    "path": "$.x",
                    "enum": ["A"],
                    "future_field_from_phase_c": {"anything": 1},
                    "gateable_by": ["api"],
                }
            ],
        }
    ]
    assert check_botocore_enrichment_schema(ops) == []


def test_multiple_errors_are_all_reported() -> None:
    ops = [
        {
            "operation": "Foo",
            "parameters": [
                {"path": "$.a", "enum": []},
                {"path": "$.b", "gateable_by": ["sar"], "sar_condition_key": None},
                {"path": "$.c", "mutability": "frozen"},
            ],
        }
    ]
    errors = check_botocore_enrichment_schema(ops)
    assert len(errors) == 3


def test_check_id_prefix_is_honored() -> None:
    ops = [{"operation": "Foo", "parameters": [{"path": "$.x", "enum": []}]}]
    errors = check_botocore_enrichment_schema(ops, check_id="CHECK-CUSTOM")
    assert errors[0].startswith("CHECK-CUSTOM")


def test_non_list_ops_handled_gracefully() -> None:
    """Bad input shouldn't crash the validator."""
    assert check_botocore_enrichment_schema("not a list") == []
    assert check_botocore_enrichment_schema(None) == []


# ================================================================
# CHECK-17 — counter/population consistency (F8)
# ================================================================


from validate_state import check_botocore_enrichment_counter_17  # noqa: E402


def _make_data(enriched_ops: int | None, enriched_params: int | None, ops: list) -> dict:
    data: dict = {"api_surface": {"operations": ops}}
    be: dict = {}
    if enriched_ops is not None:
        be["enriched_operations"] = enriched_ops
    if enriched_params is not None:
        be["enriched_params"] = enriched_params
    if be:
        data["botocore_enrichment"] = be
    return data


def test_check_17_no_botocore_enrichment_block_skips() -> None:
    """If the counter block is absent, CHECK-17 silently passes."""
    data = {"api_surface": {"operations": [{"operation": "X", "parameters": []}]}}
    assert check_botocore_enrichment_counter_17(data) == []


def test_check_17_enriched_operations_matches_coverage() -> None:
    ops = [
        {"operation": "A", "botocore_coverage": True, "parameters": []},
        {"operation": "B", "botocore_coverage": True, "parameters": []},
        {"operation": "C", "botocore_coverage": False, "parameters": []},
    ]
    data = _make_data(enriched_ops=2, enriched_params=None, ops=ops)
    assert check_botocore_enrichment_counter_17(data) == []


def test_check_17_enriched_operations_mismatch_fires() -> None:
    ops = [
        {"operation": "A", "botocore_coverage": True, "parameters": []},
        {"operation": "B", "botocore_coverage": False, "parameters": []},
    ]
    data = _make_data(enriched_ops=5, enriched_params=None, ops=ops)
    errors = check_botocore_enrichment_counter_17(data)
    assert len(errors) == 1
    assert "CHECK-17 enriched_operations mismatch" in errors[0]
    assert "claims 5" in errors[0] and "only 1" in errors[0]


def test_check_17_enriched_params_within_range_passes() -> None:
    """Counter within [with_security_category, with_any_enrichment] passes."""
    ops = [
        {
            "operation": "X",
            "botocore_coverage": True,
            "parameters": [
                {"path": "$.a", "security_category": "kms", "mutability": "mutable"},
                {"path": "$.b", "security_category": None, "mutability": "mutable"},
                {"path": "$.c", "security_category": None, "gateable_by": ["api"]},
                {"path": "$.d"},  # no enrichment at all
            ],
        }
    ]
    # with_security_category = 1; with_any_enrichment = 3
    # counter anywhere in [1, 3] must pass.
    for counter in (1, 2, 3):
        data = _make_data(enriched_ops=None, enriched_params=counter, ops=ops)
        assert check_botocore_enrichment_counter_17(data) == [], f"counter={counter} should pass"


def test_check_17_enriched_params_below_range_fires() -> None:
    """Counter smaller than with_security_category indicates dropped data."""
    ops = [
        {
            "operation": "X",
            "botocore_coverage": True,
            "parameters": [
                {"path": "$.a", "security_category": "kms"},
                {"path": "$.b", "security_category": "iam"},
                {"path": "$.c", "security_category": "network"},
            ],
        }
    ]
    # with_security_category=3, with_any=3. Counter=1 is below the floor.
    data = _make_data(enriched_ops=None, enriched_params=1, ops=ops)
    errors = check_botocore_enrichment_counter_17(data)
    assert len(errors) == 1
    assert "CHECK-17 enriched_params out of range" in errors[0]
    assert "claims 1" in errors[0] and "[3, 3]" in errors[0]


def test_check_17_enriched_params_above_range_fires() -> None:
    """Counter larger than with_any indicates an inflated / invented total."""
    ops = [
        {
            "operation": "X",
            "botocore_coverage": True,
            "parameters": [
                {"path": "$.a", "mutability": "mutable"},
            ],
        }
    ]
    data = _make_data(enriched_ops=None, enriched_params=100, ops=ops)
    errors = check_botocore_enrichment_counter_17(data)
    assert len(errors) == 1
    assert "CHECK-17 enriched_params out of range" in errors[0]
    assert "claims 100" in errors[0] and "[0, 1]" in errors[0]


def test_check_17_datasync_iter12_counter_388_accepted() -> None:
    """Regression: iter-12 DataSync has counter=388 with 72 security_category
    and 439 any-enrichment. The range [72, 439] must include 388."""
    ops = []
    # Simulate 53 ops with ~8 params each; 72 of 439 params get security_category.
    security_budget = 72
    for i in range(53):
        params = []
        for j in range(8):
            p = {"path": f"$.p{j}", "mutability": "mutable", "gateable_by": ["api"]}
            if security_budget > 0:
                p["security_category"] = "kms"
                security_budget -= 1
            params.append(p)
        ops.append({"operation": f"Op{i}", "botocore_coverage": True, "parameters": params})
    # Plus 15 ops with ~1.67 params each to match the 439 total (53*8 + 15*(?) = 439)
    remaining = 439 - 53 * 8
    for i in range(15):
        params = [
            {"path": f"$.q{j}", "mutability": "mutable", "gateable_by": ["api"]}
            for j in range(remaining // 15 + (1 if i < remaining % 15 else 0))
        ]
        ops.append({"operation": f"Cov{i}", "botocore_coverage": False, "parameters": params})
    data = _make_data(enriched_ops=53, enriched_params=388, ops=ops)
    assert check_botocore_enrichment_counter_17(data) == []


def test_check_17_non_integer_counter_skipped() -> None:
    """A missing or malformed counter does not fire CHECK-17 (forward-compat)."""
    ops = [{"operation": "X", "botocore_coverage": True, "parameters": [{"path": "$.a"}]}]
    data = {"api_surface": {"operations": ops}, "botocore_enrichment": {}}
    assert check_botocore_enrichment_counter_17(data) == []
    data["botocore_enrichment"] = {"enriched_operations": "53"}  # string, not int
    assert check_botocore_enrichment_counter_17(data) == []
