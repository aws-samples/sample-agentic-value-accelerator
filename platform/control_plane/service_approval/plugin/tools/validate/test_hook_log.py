"""Tests for the consolidated pipeline logger (_hook_log.py).

Verifies the single-pipeline.log-per-service design: every event lands
in one file at .service-approval/<slug>/pipeline.log, MCP events shadow
to mcp-calls.log for backward compatibility, and the older API surfaces
(log_hook_fire, log_phase_event) remain callable.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _hook_log import (  # type: ignore
    log_event,
    log_hook_fire,
    log_mcp,
    log_phase_event,
    log_script,
    log_skill,
)


@pytest.fixture
def tmp_sa(tmp_path, monkeypatch):
    """Create a tmp .service-approval/<slug>/<phase>/ tree and cwd into tmp_path."""
    monkeypatch.chdir(tmp_path)
    sa = tmp_path / ".service-approval"
    sa.mkdir()
    slug_dir = sa / "awslambda"
    slug_dir.mkdir()
    phase_dir = slug_dir / "04-map"
    phase_dir.mkdir()
    return tmp_path, sa, slug_dir, phase_dir


# ---------------------------------------------------------------------------
# Single pipeline.log per service
# ---------------------------------------------------------------------------

def test_event_writes_to_single_pipeline_log(tmp_sa):
    """A phase-scoped event lands ONLY in <slug>/pipeline.log."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    fp = str(phase_dir / "mapping-results.json")

    log_event(
        phase="04-map",
        source="hook:post-tool-use",
        verdict="pass",
        message="validated mapping-results.json",
        file_path=fp,
    )

    pipeline_log = slug_dir / "pipeline.log"
    assert pipeline_log.exists()
    content = pipeline_log.read_text()
    assert "[04-map]" in content
    assert "[hook:post-tool-use:pass]" in content
    assert "validated mapping-results.json" in content

    # Per-phase + tree logs no longer created
    assert not (phase_dir / ".hooks.log").exists()
    assert not (sa / ".hooks.log").exists()


def test_event_resolves_slug_and_phase_from_file_path(tmp_sa):
    """When phase/slug are not given, derive them from file_path."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    fp = str(phase_dir / "controls-catalog.md")

    # Note: phase=None, slug=None — must be inferred
    log_event(
        phase=None,
        source="hook:post-tool-use",
        verdict="pass",
        message="x",
        file_path=fp,
    )

    content = (slug_dir / "pipeline.log").read_text()
    assert "[04-map]" in content


def test_event_marks_phase_as_question_mark_when_unknown(tmp_path, monkeypatch):
    """Without a slug+phase, log to the tree-scoped fallback."""
    monkeypatch.chdir(tmp_path)
    sa = tmp_path / ".service-approval"
    sa.mkdir()
    # No slug subdir — write to .service-approval/_staging or similar
    staging = sa / "_staging" / "2026-05-13T11-30-00Z"
    staging.mkdir(parents=True)
    fp = str(staging / "intake-manifest.json")

    log_event(
        phase=None,
        source="hook:post-tool-use",
        verdict="pass",
        message="staging intake",
        file_path=fp,
    )

    # Tree-scoped pipeline.log fallback
    tree_log = sa / "pipeline.log"
    assert tree_log.exists()
    content = tree_log.read_text()
    assert "[?]" in content  # phase tag
    assert "staging intake" in content


def test_appends_not_overwrites(tmp_sa):
    """Multiple log fires append rather than overwrite."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    log_event("04-map", "hook:post-tool-use", "pass", "first", slug="awslambda",
              file_path=str(phase_dir / "x.json"))
    log_event("04-map", "hook:post-tool-use", "fail", "second", slug="awslambda",
              file_path=str(phase_dir / "x.json"))

    content = (slug_dir / "pipeline.log").read_text()
    assert content.count("\n") == 2
    assert "first" in content
    assert "second" in content


def test_multiline_message_escaped(tmp_sa):
    """Multi-line messages get \\n-escaped to keep one event per line."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    log_event("04-map", "hook:stop", "fail", "line1\nline2\nline3",
              slug="awslambda", file_path=str(phase_dir / "x.json"))

    content = (slug_dir / "pipeline.log").read_text()
    assert content.count("\n") == 1
    assert "line1\\nline2\\nline3" in content


def test_extra_kvs_appended(tmp_sa):
    """Optional extra dict serialized as key=value tokens.

    Strings are json.dumps'd (quoted + escaped) so embedded newlines /
    spaces / quotes don't break the line-per-event contract. Numbers
    fall through to str() unquoted.
    """
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    log_event(
        "04-map", "hook:stop", "fail", "summary",
        slug="awslambda",
        file_path=str(phase_dir / "x.json"),
        extra={"integrity_count": 3, "first_error": "P7 missing X"},
    )
    content = (slug_dir / "pipeline.log").read_text()
    assert "integrity_count=3" in content
    # String value is now quoted (per the High-finding fix).
    assert 'first_error="P7 missing X"' in content


def test_extra_string_value_with_newline_escaped(tmp_sa):
    """A string extra value containing a newline must NOT break the line
    contract. json.dumps escapes embedded newlines as \\n."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    log_event(
        "04-map", "hook:stop", "fail", "with newline",
        slug="awslambda",
        file_path=str(phase_dir / "x.json"),
        extra={"context": "line1\nline2"},
    )
    content = (slug_dir / "pipeline.log").read_text()
    # Exactly one trailing newline — embedded \n is escaped to literal "\n".
    assert content.count("\n") == 1
    assert 'context="line1\\nline2"' in content


# ---------------------------------------------------------------------------
# MCP shadow file for backward compat
# ---------------------------------------------------------------------------

def test_mcp_event_mirrors_to_mcp_calls_log(tmp_sa):
    """An MCP source event writes to BOTH pipeline.log and mcp-calls.log."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    log_mcp("awslambda", "01-assess", "awsknowledge", "call",
            "search_documentation: lambda condition keys")

    pipeline_log = slug_dir / "pipeline.log"
    mcp_shadow = slug_dir / "mcp-calls.log"

    assert pipeline_log.exists()
    assert mcp_shadow.exists()

    p_content = pipeline_log.read_text()
    m_content = mcp_shadow.read_text()

    assert "[mcp:awsknowledge:call]" in p_content
    assert "[mcp:awsknowledge:call]" in m_content
    assert "lambda condition keys" in p_content
    assert "lambda condition keys" in m_content


def test_non_mcp_event_does_not_write_to_mcp_shadow(tmp_sa):
    """Hook events do NOT shadow into mcp-calls.log."""
    tmp_path, sa, slug_dir, phase_dir = tmp_sa
    log_event("04-map", "hook:post-tool-use", "pass", "x",
              slug="awslambda", file_path=str(phase_dir / "x.json"))

    assert (slug_dir / "pipeline.log").exists()
    assert not (slug_dir / "mcp-calls.log").exists()


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

def test_log_skill_uses_skill_source(tmp_sa, monkeypatch):
    monkeypatch.chdir(tmp_sa[0])
    log_skill("awslambda", "01-assess", "assess", "start", "service=lambda")
    content = (tmp_sa[2] / "pipeline.log").read_text()
    assert "[01-assess]" in content
    assert "[skill:assess:start]" in content


def test_log_script_uses_script_source(tmp_sa, monkeypatch):
    monkeypatch.chdir(tmp_sa[0])
    log_script("awslambda", "06-test", "smoke-deploy-test", "start", "stack=test")
    content = (tmp_sa[2] / "pipeline.log").read_text()
    assert "[script:smoke-deploy-test:start]" in content


# ---------------------------------------------------------------------------
# OS-error tolerance — log failure must never cascade
# ---------------------------------------------------------------------------

def test_silent_on_oserror(tmp_sa, monkeypatch):
    """If the log file can't be opened (disk full, EACCES, EROFS), the call
    is a no-op, not an exception.

    The earlier version of this test used `chmod 0o400` to revoke write
    permission, but that's not a fault under root (CI's `python:3.12-slim`
    image runs as uid=0 by default and bypasses DAC, so `open(path, 'a')`
    succeeded and the `except OSError` branch was never exercised). This
    version injects the fault deterministically by patching `builtins.open`
    so the test asserts the OSError-tolerance contract regardless of uid.
    """
    tmp_path, sa, slug_dir, phase_dir = tmp_sa

    import builtins
    real_open = builtins.open

    def fake_open(path, *args, **kwargs):
        # Only raise for log writes; let the test infrastructure read normally.
        if isinstance(path, (str, Path)) and str(path).endswith(".log"):
            raise OSError(13, "EACCES (injected)")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fake_open)

    # Must not raise even when every log open fails.
    log_event("04-map", "hook:post-tool-use", "pass", "msg",
              slug="awslambda", file_path=str(phase_dir / "x.json"))


# ---------------------------------------------------------------------------
# Backward-compat aliases
# ---------------------------------------------------------------------------

def test_log_hook_fire_backward_compat(tmp_sa, monkeypatch):
    """The older log_hook_fire API still routes to pipeline.log."""
    monkeypatch.chdir(tmp_sa[0])
    fp = str(tmp_sa[3] / "x.json")
    log_hook_fire("post-tool-use", "pass", "via legacy API", file_path=fp)

    content = (tmp_sa[2] / "pipeline.log").read_text()
    assert "[hook:post-tool-use:pass]" in content
    assert "via legacy API" in content


def test_log_phase_event_backward_compat(tmp_sa, monkeypatch):
    """The older log_phase_event API still routes to pipeline.log."""
    monkeypatch.chdir(tmp_sa[0])
    log_phase_event("awslambda", "04-map", "check-phase-complete", "pass", "ok")
    content = (tmp_sa[2] / "pipeline.log").read_text()
    assert "[04-map]" in content
    assert "[hook:check-phase-complete:pass]" in content
