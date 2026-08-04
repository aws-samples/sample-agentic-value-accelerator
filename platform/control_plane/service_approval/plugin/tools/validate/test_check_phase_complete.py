"""Tests for the pre-phase precondition gate (check_phase_complete.py).

Verifies that:
- Each phase's required outputs are correctly listed in PHASE_REQUIRED_OUTPUTS
- Missing outputs trigger errors
- Undersized outputs trigger errors
- Complete phase outputs return no errors
- Invalid phase names error out cleanly
- Invalid slugs error out cleanly
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

# Allow importing the module under test
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from check_phase_complete import check_phase  # type: ignore
from validate_pipeline_integrity import PHASE_REQUIRED_OUTPUTS  # type: ignore


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    """Create a tmp repo with manifest.yaml + .service-approval/<slug>/ tree.

    monkeypatches paths.repo_root() to return this tmp path so service_root()
    resolves correctly.
    """
    (tmp_path / "manifest.yaml").write_text("name: test\n")
    sa_dir = tmp_path / ".service-approval" / "awslambda"
    sa_dir.mkdir(parents=True)

    # Re-anchor repo_root to tmp_path
    import paths  # type: ignore
    monkeypatch.setattr(paths, "repo_root", lambda: tmp_path)
    return tmp_path


def _populate_phase(repo: Path, slug: str, phase: str) -> Path:
    """Create the phase dir and write all required artifacts at exact min-size."""
    phase_dir = repo / ".service-approval" / slug / phase
    phase_dir.mkdir(parents=True, exist_ok=True)
    for filename, min_size in PHASE_REQUIRED_OUTPUTS.get(phase, []):
        (phase_dir / filename).write_text("x" * min_size)
    return phase_dir


# ---------------------------------------------------------------------------
# Happy path — complete phase returns no errors
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("phase", [
    "00-intake", "01-assess", "02-research", "03-validate",
    "04-map", "06-test", "07-summarize", "08-evidence",
])
def test_complete_phase_returns_no_errors(fake_repo, phase):
    """Each phase, when fully populated, returns an empty error list."""
    _populate_phase(fake_repo, "awslambda", phase)
    errors = check_phase("awslambda", phase)
    assert errors == [], f"Expected no errors for complete {phase}, got: {errors}"


def test_05_generate_has_no_file_outputs():
    """05-generate uses subdirs, not files; PHASE_REQUIRED_OUTPUTS empty entry."""
    assert PHASE_REQUIRED_OUTPUTS["05-generate"] == []


# ---------------------------------------------------------------------------
# Phase dir missing
# ---------------------------------------------------------------------------

def test_phase_dir_missing_errors(fake_repo):
    """If the phase dir doesn't exist, error out — phase didn't run."""
    errors = check_phase("awslambda", "04-map")
    assert len(errors) == 1
    assert "Phase directory missing" in errors[0]


# ---------------------------------------------------------------------------
# Required output missing
# ---------------------------------------------------------------------------

def test_missing_output_errors(fake_repo):
    """If a required output is absent, the phase fails."""
    phase_dir = fake_repo / ".service-approval" / "awslambda" / "04-map"
    phase_dir.mkdir(parents=True)
    # Write only mapping-results.json, not the others
    (phase_dir / "mapping-results.json").write_text("x" * 2000)
    errors = check_phase("awslambda", "04-map")
    # Should report missing controls-catalog.md, framework-mapping.md, plus the 3 map-* JSONs
    assert len(errors) >= 3
    assert any("MISSING" in e and "controls-catalog.md" in e for e in errors)
    assert any("MISSING" in e and "framework-mapping.md" in e for e in errors)


# ---------------------------------------------------------------------------
# Undersized output
# ---------------------------------------------------------------------------

def test_undersized_output_errors(fake_repo):
    """If a required output is below the size threshold, the phase fails."""
    phase_dir = fake_repo / ".service-approval" / "awslambda" / "04-map"
    phase_dir.mkdir(parents=True)
    # Write all required files, but framework-mapping.md is too small (stub)
    for filename, min_size in PHASE_REQUIRED_OUTPUTS["04-map"]:
        size = 100 if filename == "framework-mapping.md" else min_size
        (phase_dir / filename).write_text("x" * size)
    errors = check_phase("awslambda", "04-map")
    assert len(errors) == 1
    assert "UNDERSIZED" in errors[0]
    assert "framework-mapping.md" in errors[0]
    assert "100 bytes" in errors[0]


# ---------------------------------------------------------------------------
# Invalid input
# ---------------------------------------------------------------------------

def test_invalid_phase_errors(fake_repo):
    """Unknown phase name is reported clearly."""
    errors = check_phase("awslambda", "99-bogus")
    assert len(errors) == 1
    assert "Unknown phase" in errors[0]


def test_invalid_slug_errors(fake_repo):
    """Invalid slugs (regex-violating) are caught."""
    errors = check_phase("../etc", "04-map")
    assert len(errors) == 1
    assert "Service slug invalid" in errors[0] or "Invalid slug" in errors[0]


# ---------------------------------------------------------------------------
# Specific contracts the rest of the pipeline depends on
# ---------------------------------------------------------------------------

def test_map_phase_demands_both_md_files():
    """The user's specific concern: framework-mapping.md and controls-catalog.md
    must both be enumerated as required outputs of 04-map."""
    map_outputs = {f for f, _ in PHASE_REQUIRED_OUTPUTS["04-map"]}
    assert "controls-catalog.md" in map_outputs
    assert "framework-mapping.md" in map_outputs
    assert "mapping-results.json" in map_outputs


def test_evidence_demands_attestation_artifacts():
    """Phase 7 must produce attestation outputs the audit guide references."""
    ev_outputs = {f for f, _ in PHASE_REQUIRED_OUTPUTS["08-evidence"]}
    assert "cli-commands.json" in ev_outputs
    assert "attestation-results.json" in ev_outputs
    assert "attestation-report.md" in ev_outputs
