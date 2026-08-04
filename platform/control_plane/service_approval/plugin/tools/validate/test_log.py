"""Tests for the bash-friendly logger CLI (tools/validate/log.py).

Skills invoke this CLI from their Prerequisites blocks via
`python3 -m tools.validate.log --slug ... --phase ... --source ...
--verdict ... --message "..."`. A regression in argparse or the --extra
parser would silently break every skill's lifecycle logging — this test
file pins the contract.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.fixture
def tmp_sa(tmp_path, monkeypatch):
    """Create a tmp .service-approval/<slug>/<phase>/ tree and cwd into it."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "manifest.yaml").write_text("name: test\n")
    sa = tmp_path / ".service-approval"
    sa.mkdir()
    slug_dir = sa / "awslambda"
    slug_dir.mkdir()
    phase_dir = slug_dir / "04-map"
    phase_dir.mkdir()
    return tmp_path, sa, slug_dir, phase_dir


def _run_log(*args, cwd=None) -> subprocess.CompletedProcess:
    """Invoke `python3 -m tools.validate.log <args>`.

    Runs from the test's `cwd` (so the logger's `Path.cwd()` fallback finds
    the test fixture's `.service-approval/` tree) but pins PYTHONPATH to
    the repo root so `tools.validate.log` is importable from the tmp dir.
    """
    repo_root = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo_root) + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run(
        [sys.executable, "-m", "tools.validate.log", *args],
        capture_output=True, text=True,
        cwd=str(cwd or repo_root),
        env=env,
    )


# ---------------------------------------------------------------------------
# Required-arg contract
# ---------------------------------------------------------------------------

def test_missing_source_errors():
    """argparse must reject missing --source."""
    result = _run_log("--verdict", "start", "--message", "x")
    assert result.returncode != 0
    assert "source" in result.stderr.lower()


def test_missing_verdict_errors():
    """argparse must reject missing --verdict."""
    result = _run_log("--source", "skill:test", "--message", "x")
    assert result.returncode != 0
    assert "verdict" in result.stderr.lower()


def test_missing_optional_args_succeeds(tmp_sa):
    """--source + --verdict alone (no slug/phase/message) succeed silently
    when there's no .service-approval/ to log to. Logging is best-effort."""
    tmp_path, _, _, _ = tmp_sa
    result = _run_log("--source", "skill:test", "--verdict", "start", cwd=tmp_path)
    assert result.returncode == 0


# ---------------------------------------------------------------------------
# --extra parsing — single + repeated + bareflag
# ---------------------------------------------------------------------------

def test_extra_kv_round_trips(tmp_sa):
    """A single --extra k=v lands in the log line. String values are
    json.dumps'd (quoted + escaped) so multi-line / spaces don't break
    the line-per-event format. CLI passes raw strings, so the string
    branch fires."""
    tmp_path, _, slug_dir, _ = tmp_sa
    result = _run_log(
        "--slug", "awslambda", "--phase", "04-map",
        "--source", "skill:map-assemble", "--verdict", "start",
        "--message", "go",
        "--extra", "attempt=2",
        cwd=tmp_path,
    )
    assert result.returncode == 0
    content = (slug_dir / "pipeline.log").read_text()
    # CLI passes "2" as a string, so it's quoted.
    assert 'attempt="2"' in content


def test_extra_repeated(tmp_sa):
    """Multiple --extra flags should each add a separate token (quoted)."""
    tmp_path, _, slug_dir, _ = tmp_sa
    result = _run_log(
        "--slug", "awslambda", "--phase", "04-map",
        "--source", "skill:map-assemble", "--verdict", "end",
        "--message", "done",
        "--extra", "duration=5s",
        "--extra", "controls=12",
        cwd=tmp_path,
    )
    assert result.returncode == 0
    content = (slug_dir / "pipeline.log").read_text()
    assert 'duration="5s"' in content
    assert 'controls="12"' in content


def test_extra_bareflag_no_crash(tmp_sa):
    """--extra without an `=` separator should not crash; treat as bare key."""
    tmp_path, _, slug_dir, _ = tmp_sa
    result = _run_log(
        "--slug", "awslambda", "--phase", "04-map",
        "--source", "skill:map-assemble", "--verdict", "start",
        "--message", "x",
        "--extra", "barekey",
        cwd=tmp_path,
    )
    assert result.returncode == 0
    content = (slug_dir / "pipeline.log").read_text()
    # Bare key gets empty-string value, serialized as `barekey=""`
    assert "barekey" in content


# ---------------------------------------------------------------------------
# Skill / source / verdict pass-through to pipeline.log
# ---------------------------------------------------------------------------

def test_pipeline_log_event_format(tmp_sa):
    """The line written should follow the documented format:
    <ts> [<phase>] [<source>:<verdict>]  <message>"""
    tmp_path, _, slug_dir, _ = tmp_sa
    result = _run_log(
        "--slug", "awslambda", "--phase", "04-map",
        "--source", "skill:map-assemble", "--verdict", "start",
        "--message", "starting assembly",
        cwd=tmp_path,
    )
    assert result.returncode == 0
    content = (slug_dir / "pipeline.log").read_text().strip()
    assert "[04-map]" in content
    assert "[skill:map-assemble:start]" in content
    assert "starting assembly" in content


def test_logging_is_best_effort_no_failure_propagates(tmp_path, monkeypatch):
    """Even if .service-approval/ doesn't exist, the CLI returns 0 silently."""
    monkeypatch.chdir(tmp_path)
    result = _run_log(
        "--slug", "awslambda", "--phase", "04-map",
        "--source", "skill:test", "--verdict", "start",
        "--message", "no service-approval dir present",
        cwd=tmp_path,
    )
    assert result.returncode == 0
