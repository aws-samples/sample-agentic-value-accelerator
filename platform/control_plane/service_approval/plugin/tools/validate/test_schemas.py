"""Unit tests for _schemas.py — the JSON-Schema loader behind CHECK-S10..S13.

Covers the loader's contract directly rather than through the state-level
validators. Reviewer on the Class A MR flagged that _schemas.py was 96 lines
of new production code with zero direct coverage. These tests exercise:

- schema_errors returns [] on a valid document
- schema_errors returns one string per violation, sorted by path
- SchemaMissingError is raised when the schema file is absent
- SchemaMissingError is a FileNotFoundError subclass
- SchemaMissingError is raised (with a useful message) when the schema is malformed JSON
- Draft202012Validator.check_schema catches a broken schema at load time
- clear_cache() actually clears the cached validator
"""
from __future__ import annotations

import json

import pytest

import _schemas
from _schemas import SchemaMissingError, clear_cache, schema_errors


# ------------------------------------------------------------------
# Test fixture: tiny self-contained schema in a tmp directory.
# Keeps the tests decoupled from the 11 production schema files.
# ------------------------------------------------------------------


@pytest.fixture
def isolated_schema_dir(tmp_path, monkeypatch):
    """Point _schemas at a temp dir and clear the lru_cache between tests."""
    monkeypatch.setattr(_schemas, "_SCHEMA_DIR", str(tmp_path))
    clear_cache()
    yield tmp_path
    clear_cache()


def _write_schema(dir_path, name: str, schema: dict) -> None:
    (dir_path / f"{name}.schema.json").write_text(json.dumps(schema))


TOY_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "count"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "count": {"type": "integer", "minimum": 0},
        "tags": {
            "type": "array",
            "items": {"type": "string", "pattern": "^[a-z]+$"},
        },
    },
}


# ------------------------------------------------------------------
# schema_errors: happy path
# ------------------------------------------------------------------


def test_schema_errors_empty_for_valid_document(isolated_schema_dir) -> None:
    _write_schema(isolated_schema_dir, "toy", TOY_SCHEMA)
    assert schema_errors({"name": "ok", "count": 1}, "toy") == []


def test_schema_errors_empty_for_valid_document_with_optional_field(
    isolated_schema_dir,
) -> None:
    _write_schema(isolated_schema_dir, "toy", TOY_SCHEMA)
    doc = {"name": "ok", "count": 1, "tags": ["alpha", "beta"]}
    assert schema_errors(doc, "toy") == []


# ------------------------------------------------------------------
# schema_errors: one string per violation, sorted by path
# ------------------------------------------------------------------


def test_schema_errors_one_string_per_violation(isolated_schema_dir) -> None:
    _write_schema(isolated_schema_dir, "toy", TOY_SCHEMA)
    # Two separate violations: count is negative AND tags has a bad item.
    doc = {"name": "ok", "count": -5, "tags": ["GOOD"]}
    errs = schema_errors(doc, "toy")
    assert len(errs) == 2
    # Every error is a string prefixed with "SCHEMA <name>: ".
    assert all(isinstance(e, str) for e in errs)
    assert all(e.startswith("SCHEMA toy: ") for e in errs)


def test_schema_errors_sorted_by_path(isolated_schema_dir) -> None:
    _write_schema(isolated_schema_dir, "toy", TOY_SCHEMA)
    # Violations on two different paths — count and tags.0. Sorted path
    # should put "count" before "tags.0" (lexicographic on path tuples).
    doc = {"name": "ok", "count": -5, "tags": ["BAD"]}
    errs = schema_errors(doc, "toy")
    assert len(errs) == 2
    assert ": count:" in errs[0]
    assert ": tags.0:" in errs[1]


def test_schema_errors_root_path_labelled(isolated_schema_dir) -> None:
    """A violation at the document root (e.g. missing required field) is
    labelled `<root>` rather than an empty path."""
    _write_schema(isolated_schema_dir, "toy", TOY_SCHEMA)
    errs = schema_errors({"name": "ok"}, "toy")  # missing count
    assert len(errs) == 1
    assert "<root>" in errs[0]
    assert "'count' is a required property" in errs[0]


# ------------------------------------------------------------------
# SchemaMissingError — missing file
# ------------------------------------------------------------------


def test_schema_missing_raises_when_file_absent(isolated_schema_dir) -> None:
    with pytest.raises(SchemaMissingError) as excinfo:
        schema_errors({}, "does-not-exist")
    # Message carries the expected path so operators can diagnose a broken install.
    assert "does-not-exist.schema.json" in str(excinfo.value)
    assert "Schema file not found" in str(excinfo.value)


def test_schema_missing_is_filenotfounderror_subclass() -> None:
    """Callers catching FileNotFoundError must also catch SchemaMissingError —
    otherwise the fail-loud contract is lost."""
    assert issubclass(SchemaMissingError, FileNotFoundError)


# ------------------------------------------------------------------
# SchemaMissingError — malformed schema JSON
# ------------------------------------------------------------------


def test_schema_missing_raises_on_malformed_json(isolated_schema_dir) -> None:
    (isolated_schema_dir / "broken.schema.json").write_text("{ not valid json")
    with pytest.raises(SchemaMissingError) as excinfo:
        schema_errors({}, "broken")
    assert "not valid JSON" in str(excinfo.value)


# ------------------------------------------------------------------
# Draft202012Validator.check_schema catches broken schema at load time
# ------------------------------------------------------------------


def test_invalid_schema_is_rejected_at_load_time(isolated_schema_dir) -> None:
    """A syntactically-valid JSON file that is NOT a valid JSON Schema must
    be rejected when the validator is constructed, not when the first
    document happens to exercise the broken section."""
    from jsonschema.exceptions import SchemaError

    bad_schema = {
        "type": "object",
        # 'required' must be a list of strings; passing a string is a schema error.
        "required": "name",
    }
    _write_schema(isolated_schema_dir, "bad", bad_schema)
    with pytest.raises(SchemaError):
        schema_errors({"name": "ok"}, "bad")


# ------------------------------------------------------------------
# clear_cache actually clears
# ------------------------------------------------------------------


def test_clear_cache_actually_clears(isolated_schema_dir) -> None:
    """Swap the schema file on disk; without a cache clear, the old validator
    still fires. After clear_cache(), the new schema is observed."""
    # First load: requires "name" only.
    first = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["name"],
        "properties": {"name": {"type": "string"}},
    }
    _write_schema(isolated_schema_dir, "swap", first)
    assert schema_errors({"name": "x"}, "swap") == []

    # Overwrite with a schema that additionally requires "count".
    second = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["name", "count"],
        "properties": {
            "name": {"type": "string"},
            "count": {"type": "integer"},
        },
    }
    _write_schema(isolated_schema_dir, "swap", second)

    # Without clearing cache, old validator is still in effect.
    assert schema_errors({"name": "x"}, "swap") == []

    # After clear_cache, new validator loads and catches the missing field.
    clear_cache()
    errs = schema_errors({"name": "x"}, "swap")
    assert len(errs) == 1
    assert "'count' is a required property" in errs[0]
