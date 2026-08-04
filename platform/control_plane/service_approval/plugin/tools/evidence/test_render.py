"""Tests for attestation rendering (tools/evidence/render_*.py).

Tests R17: golden-file test for attestation.md rendering.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.evidence.render_report import (
    markdown_safe,
    render_attestation_report,
    render_summary,
)
from tools.evidence.render_attestation import render_attestation_guide


@pytest.fixture
def fixture_dir() -> Path:
    """Return path to fixtures directory."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def attestation_results() -> dict:
    """Sample attestation-results.json (post-argv-migration shape)."""
    return {
        "schema_version": "1.0",
        "service": "AWS Lambda",
        "service_slug": "awslambda",
        "evidence_run_id": "2026-05-13T10:30:00Z",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/test/12345678",
        "overall_verdict": "PASS",
        "counts": {
            "total_controls": 5,
            "pass": 3,
            "fail": 0,
            "not_cli_validatable": 2,
            "error": 0,
        },
        "results": [
            {
                "control_id": "CTRL-ACC-PRO-001",
                "verdict": "PASS",
                "family": "F1-resource-get",
                "command_argv": [
                    "aws", "lambda", "get-function-configuration",
                    "--function-name", "test",
                ],
                "command_str": "aws lambda get-function-configuration --function-name test",
                "exit_code": 0,
                "stdout_size_bytes": 100,
                "stderr_size_bytes": 0,
                "output_log": "cli-outputs/CTRL-ACC-PRO-001.log",
                "predicate_result": True,
                "predicate_evaluation": "KMSKeyArn = 'arn:aws:kms:...'",
                "elapsed_ms": 200,
                "timestamp": "2026-05-13T10:30:01Z",
            },
            {
                "control_id": "CTRL-ACC-PRO-002",
                "verdict": "NOT_CLI_VALIDATABLE",
                "reason_code": "iac-time-only",
                "reason": "CloudFormation Guard rule operates at template-parse time",
                "supplemental_evidence": "iac-time-evidence/cfn-guard.log",
            }
        ]
    }


@pytest.fixture
def sar_facts() -> dict:
    """Sample sar-facts.json."""
    return {
        "service": "AWS Lambda",
        "service_prefix": "lambda",
        "documentation": {
            "service_authorization_reference": "https://docs.aws.amazon.com/service-authorization/latest/reference/list_awslambda.html"
        }
    }


@pytest.fixture
def mapping_results() -> dict:
    """Sample mapping-results.json."""
    return {
        "framework": {
            "name": "Test Framework",
            "version": "1.0",
            "source_file": "test.xlsx",
            "total_objectives": 10
        }
    }


def test_render_summary(attestation_results: dict, tmp_path: Path):
    """Test summary.md rendering."""
    output_path = tmp_path / "summary.md"
    render_summary(attestation_results, output_path)

    assert output_path.exists()
    content = output_path.read_text()

    # Verify key sections
    assert "Evidence Summary — AWS Lambda" in content
    assert "**Verdict:** PASS" in content
    assert "3/5 controls passed" in content
    assert "**Not CLI-validatable:** 2" in content


def test_render_attestation_report(attestation_results: dict, tmp_path: Path):
    """Test attestation-report.md rendering."""
    output_path = tmp_path / "attestation-report.md"
    render_attestation_report(attestation_results, output_path)

    assert output_path.exists()
    content = output_path.read_text()

    # Verify key sections
    assert "Attestation Report — AWS Lambda" in content
    assert "**Overall Verdict:** PASS" in content
    assert "Control Matrix" in content
    assert "CTRL-ACC-PRO-001" in content
    assert "Summary Counts" in content


def test_render_attestation_guide(
    attestation_results: dict,
    sar_facts: dict,
    mapping_results: dict,
    tmp_path: Path,
    monkeypatch,
):
    """R17: Test attestation.md rendering (golden-file test).

    This is the reviewer's top-level audit guide.
    """
    # Mock service_root to use tmp_path
    def mock_service_root(slug: str) -> Path:
        return tmp_path / slug
    monkeypatch.setattr("tools.evidence.render_attestation.service_root", mock_service_root)

    try:
        render_attestation_guide(
            "awslambda",
            attestation_results,
            sar_facts,
            mapping_results,
        )
    except Exception as e:
        pytest.fail(f"render_attestation_guide raised {e}")

    output_path = tmp_path / "awslambda" / "attestation.md"
    if not output_path.exists():
        # Debug: list what was created
        created = list(tmp_path.rglob("*"))
        pytest.fail(f"attestation.md not found. Created files: {created}")
    assert output_path.exists()
    content = output_path.read_text()

    # Verify key sections (golden-file assertions)
    assert "Attestation Guide — AWS Lambda Service Approval" in content
    assert "How to review this directory" in content
    assert "00-intake/intake-manifest.json" in content
    assert "01-assess/sar-facts.json" in content
    assert "02-research/research.json" in content
    assert "03-validate/validated.json" in content
    assert "04-map/mapping-results.json" in content
    assert "05-generate/" in content
    assert "06-test/test-results.json" in content
    assert "07-summarize/APPROVAL-REPORT.md" in content
    assert "08-evidence/" in content
    assert "Verification commands for an independent reviewer" in content
    assert "python3 tools/evidence/replay.py --service=awslambda" in content
    assert "Source citations" in content


def test_render_attestation_guide_structure(
    attestation_results: dict,
    sar_facts: dict,
    mapping_results: dict,
    tmp_path: Path,
    monkeypatch,
):
    """Verify attestation.md structure matches the plan's template."""
    def mock_service_root(slug: str) -> Path:
        return tmp_path / slug
    monkeypatch.setattr("tools.evidence.render_attestation.service_root", mock_service_root)

    render_attestation_guide(
        "awslambda",
        attestation_results,
        sar_facts,
        mapping_results,
    )

    output_path = tmp_path / "awslambda" / "attestation.md"
    content = output_path.read_text()

    # Verify phase descriptions are present (from template)
    phase_markers = [
        "### 00-intake/intake-manifest.json",
        "### 01-assess/sar-facts.json",
        "### 01-assess/checkpoint-results.json",
        "### 01-assess/assessment-summary.md",
        "### 02-research/research.json",
        "### 03-validate/validated.json",
        "### 04-map/mapping-results.json",
        "### 05-generate/",
        "### 06-test/test-results.json",
        "### 07-summarize/APPROVAL-REPORT.md",
        "### 08-evidence/",
    ]
    for marker in phase_markers:
        assert marker in content, f"Missing phase description: {marker}"

    # Verify each phase has "What:", "Upstream:", "Downstream:", "Claim it substantiates:"
    phase_structure_keywords = [
        "What:",
        "Upstream:",
        "Downstream:",
        "Claim it substantiates:",
    ]
    for keyword in phase_structure_keywords:
        assert content.count(keyword) >= 5, f"Insufficient instances of {keyword!r} in attestation.md"


# ===== Medium 17: markdown_safe filter =====
def test_markdown_safe_neutralizes_table_breakers():
    """The filter must escape pipes, backticks, and angle brackets so they
    don't terminate markdown-table cells / open code spans / pass through as
    HTML."""
    s = "An error: `quoted | with pipes <html>` and ``triple backticks``"
    out = markdown_safe(s)
    # Every backtick is preceded by a backslash (escape).
    import re as _re
    assert not _re.search(r"(?<!\\)`", out), f"unescaped backtick in: {out!r}"
    # Every pipe is preceded by a backslash.
    assert not _re.search(r"(?<!\\)\|", out), f"unescaped pipe in: {out!r}"
    # Angle brackets converted to entities (no raw < or > remain).
    assert "<" not in out and ">" not in out
    assert "&lt;" in out and "&gt;" in out
    # Newlines collapsed to spaces so a multi-line stderr doesn't smash the table.
    assert markdown_safe("line1\nline2") == "line1 line2"
    # None -> empty.
    assert markdown_safe(None) == ""


def test_render_report_with_malicious_predicate(tmp_path: Path):
    """Render a report with a malicious AWS error message. The rendered table
    must remain parseable: same number of rows, same number of pipe columns
    per row in the relevant table."""
    attestation_results = {
        "schema_version": "1.0",
        "service": "AWS Lambda",
        "service_slug": "awslambda",
        "evidence_run_id": "2026-05-13T10:30:00Z",
        "stack_id": "arn:aws:cloudformation:us-east-1:123456789012:stack/t/abc",
        "overall_verdict": "FAIL",
        "counts": {
            "total_controls": 1,
            "pass": 0,
            "fail": 1,
            "not_cli_validatable": 0,
            "error": 0,
        },
        "results": [
            {
                "control_id": "CTRL-ACC-PRO-001",
                "verdict": "FAIL",
                "family": "F1-resource-get",
                "command_argv": ["aws", "lambda", "get-function-configuration"],
                "command_str": "aws lambda get-function-configuration",
                "exit_code": 254,
                "stdout_size_bytes": 0,
                "stderr_size_bytes": 100,
                "output_log": "cli-outputs/CTRL-ACC-PRO-001.log",
                "predicate_result": False,
                # The kind of string a real AWS error produces — backticks,
                # pipes, angle brackets, newlines.
                "predicate_evaluation": "Error: `bad|input` <ResourceNotFoundException>\nfunction not found",
                "timestamp": "2026-05-13T10:30:01Z",
            }
        ],
    }

    output_path = tmp_path / "attestation-report.md"
    render_attestation_report(attestation_results, output_path)
    content = output_path.read_text()

    # The control row in the matrix must still have exactly 5 column separators
    # ("| ... | ... | ... | ... | ... |" = 6 pipes per row).
    matrix_rows = [
        line for line in content.splitlines()
        if line.strip().startswith("|") and "CTRL-ACC-PRO-001" in line
    ]
    assert matrix_rows, "Expected at least one matrix row containing the control id"
    for row in matrix_rows:
        assert row.count("|") == 6, (
            f"Row got mangled by unescaped pipe; expected 6 pipes, got {row.count('|')}: {row!r}"
        )

    # The Failures section row must also have a recognizable command bullet
    # and predicate bullet — neither should bleed across lines.
    assert "**Command:**" in content
    assert "**Predicate:**" in content
    # Sanity: the table header is intact.
    assert "| Control ID | Scope | Mechanism | Verdict | Evidence |" in content
