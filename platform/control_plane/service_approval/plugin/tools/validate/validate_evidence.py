"""Schema validators for Phase 7 Evidence artifacts.

Validates:
- cli-commands.json (synthesized CLI probes)
- attestation-results.json (post-execution verdicts)
- deployed-resources.json (Phase 5 deploy output)

Beyond JSON Schema, `check_attestation_results` also verifies that
supplemental_evidence files referenced by NOT_CLI_VALIDATABLE entries with
`reason_code in {iac-time-only, policy-only-no-describe-api}` actually exist
on disk under <slug>/08-evidence/. The schema enforces the *contract* (the
field is required + non-empty); this validator enforces the *artifact*
(the file is reachable and non-empty) so Phase 7 can't claim IaC-time
evidence that nobody wrote.

All schema-shape validations use JSON Schema Draft 2020-12 via _schemas.py.
"""
from __future__ import annotations

from pathlib import Path

from tools.validate._schemas import schema_errors


# Reason codes that contract supplemental_evidence to point at a real file.
# Mirrors the schema's allOf in attestation-results.schema.json.
_SUPPLEMENTAL_REQUIRED_REASONS = {
    "iac-time-only",
    "policy-only-no-describe-api",
}


def check_cli_commands(data: dict) -> list[str]:
    """Validate cli-commands.json against its schema."""
    return schema_errors(data, "cli-commands")


def check_attestation_results(
    data: dict,
    evidence_dir: Path | None = None,
) -> list[str]:
    """Validate attestation-results.json against its schema and (optionally)
    verify referenced supplemental_evidence files exist.

    Args:
        data: Parsed JSON from <slug>/08-evidence/attestation-results.json
        evidence_dir: Path to <slug>/08-evidence/ — when provided, every
            NOT_CLI_VALIDATABLE entry whose reason_code requires evidence
            must point at a file that exists under this directory. Pass None
            to skip the disk check (e.g., when validating in CI before any
            artifacts are produced).

    Returns:
        List of validation error strings (empty if valid).
    """
    errors = list(schema_errors(data, "attestation-results"))
    if evidence_dir is None:
        return errors

    for idx, result in enumerate(data.get("results", [])):
        if result.get("verdict") != "NOT_CLI_VALIDATABLE":
            continue
        reason_code = result.get("reason_code")
        if reason_code not in _SUPPLEMENTAL_REQUIRED_REASONS:
            continue
        rel = result.get("supplemental_evidence", "")
        if not rel:
            errors.append(
                f"SCHEMA attestation-results: results.{idx}: "
                f"reason_code={reason_code!r} requires non-empty "
                f"supplemental_evidence (control_id={result.get('control_id', '?')})"
            )
            continue
        full = (evidence_dir / rel).resolve()
        # Defense in depth: ensure the resolved path stays inside evidence_dir
        # — a malicious '../../etc/passwd' should never validate.
        try:
            full.relative_to(evidence_dir.resolve())
        except ValueError:
            errors.append(
                f"FILE attestation-results: results.{idx}: "
                f"supplemental_evidence path escapes 08-evidence/: {rel!r} "
                f"(control_id={result.get('control_id', '?')})"
            )
            continue
        if not full.is_file():
            errors.append(
                f"FILE attestation-results: results.{idx}: "
                f"supplemental_evidence file not found on disk: {rel!r} "
                f"(resolved: {full}, control_id={result.get('control_id', '?')})"
            )
            continue
        if full.stat().st_size == 0:
            errors.append(
                f"FILE attestation-results: results.{idx}: "
                f"supplemental_evidence file is empty: {rel!r} "
                f"(control_id={result.get('control_id', '?')})"
            )
    return errors


def check_deployed_resources(data: dict) -> list[str]:
    """Validate deployed-resources.json against its schema."""
    return schema_errors(data, "deployed-resources")
