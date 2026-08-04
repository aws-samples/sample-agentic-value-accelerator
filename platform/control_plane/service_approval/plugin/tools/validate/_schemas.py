"""JSON Schema loader for pipeline state-file contracts.

Loads schema files from `schemas/` and runs them
against JSON data, returning one error string per violation in the same
flat `list[str]` shape as the hand-rolled `check_*` functions in
`validate_state.py`.

## Design policy (iter-14 Class A)

- **additionalProperties: false** at top level and inside known-shape
  objects (controls[], framework_mapping[], threat_mitigation_map[]).
  Permissive inside `_metadata` sidecars so operators can add their own
  documentation fields without schema drift.
- **Hard-fail on missing schema file.** Absence means broken install,
  not optional feature. Unlike `_load_botocore_iam_aliases` (silent
  fallback), schemas are load-bearing contracts — if the file is gone,
  the validator must refuse to run.
- **Error format:** `"SCHEMA <name>: <json-pointer>: <message>"` so every
  schema violation is one line, greppable, with the path into the JSON
  document as a dotted string.

## Registered schemas (evidence-attestation branch, W1):

State files (Phases 0-6):
  - checkpoint-results, sar-facts, research, validated,
    map-controls-generated, map-framework-parsed, map-framework-mapped,
    mapping-results, test-results, iac-support

Evidence files (Phase 7):
  - cli-commands, attestation-results, deployed-resources
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

from jsonschema import Draft202012Validator


_SCHEMA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "schemas",
)


class SchemaMissingError(FileNotFoundError):
    """Raised when a referenced schema file is not on disk.

    Fatal — a missing schema means the plugin install is broken or the
    branch was checked out without the schemas/ directory. Fail loudly
    rather than silently validate-nothing.
    """


@lru_cache(maxsize=None)
def _load_validator(schema_name: str) -> Draft202012Validator:
    """Load the schema file and return a cached Draft202012Validator.

    Cached via lru_cache because each pytest run loads 14 schemas many
    times across tests — disk I/O doesn't need to repeat.
    """
    path = os.path.join(_SCHEMA_DIR, f"{schema_name}.schema.json")
    if not os.path.isfile(path):
        raise SchemaMissingError(
            f"Schema file not found: {path}. "
            f"Expected at schemas/{schema_name}.schema.json. "
            f"If this is a fresh checkout, ensure the schemas/ directory is on disk. "
            f"If the schema name is wrong, correct the caller."
        )
    try:
        with open(path) as f:
            schema = json.load(f)
    except json.JSONDecodeError as exc:
        raise SchemaMissingError(
            f"Schema file {path} is not valid JSON: {exc}"
        ) from exc
    # Validate the schema itself — catches author-side syntax errors early.
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def schema_errors(data: dict, schema_name: str) -> list[str]:
    """Return JSON-Schema-formatted error strings (one per violation).

    Args:
        data: the JSON document to validate (already parsed).
        schema_name: short name without the `.schema.json` extension
            (e.g. `"map-controls-generated"`).

    Returns:
        Empty list if the document validates cleanly. Otherwise, one
        string per violation, sorted by path through the document so
        related errors cluster together.
    """
    validator = _load_validator(schema_name)
    errors = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = ".".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"SCHEMA {schema_name}: {path}: {err.message}")
    return errors


def clear_cache() -> None:
    """Clear the lru_cache — only used by tests that modify schemas on disk."""
    _load_validator.cache_clear()
