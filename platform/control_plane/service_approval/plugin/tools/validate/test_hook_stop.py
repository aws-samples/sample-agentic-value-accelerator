"""Unit tests for hook_stop._should_snooze.

The snooze backstop suppresses identical hook:stop:fail loops. Tests cover:
- happy path: 3 identical fail entries with matching first_integrity → snooze
- mismatch: identical entries but a different first_integrity → no snooze
- progress: a non-fail event between the failures → no snooze
- json-encoding: pipeline.log values are json.dumps'd, so the regex captures
  the JSON-encoded form and decode is required before equality compare
"""
from __future__ import annotations

import json
from pathlib import Path

from hook_stop import _should_snooze


def _write_log(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n")


def test_snooze_triggers_on_three_identical_fails(tmp_path: Path) -> None:
    """Three consecutive hook:stop:fail entries with byte-identical
    first_integrity strings AND no other events between them must snooze."""
    log = tmp_path / "pipeline.log"
    integrity = "P1 too few MCP calls"
    encoded = json.dumps(integrity)
    lines = [
        f"2026-05-14T18:32:0{i}Z [07-summarize] [hook:stop:fail]  "
        f"integrity=1 cross=0 deploy=0 first_integrity={encoded} first_cross=null first_deploy=null"
        for i in range(3)
    ]
    _write_log(log, lines)
    controls_dir = str(tmp_path / "05-generate")
    assert _should_snooze(controls_dir, integrity)


def test_no_snooze_below_threshold(tmp_path: Path) -> None:
    """Two identical fail entries (below the 3-fail threshold) must NOT snooze.

    Pins the _SNOOZE_THRESHOLD value: a regression that lowered it to 1 or 2
    would silently quiet the hook on the very first failure.
    """
    log = tmp_path / "pipeline.log"
    integrity = "P1 too few MCP calls"
    encoded = json.dumps(integrity)
    lines = [
        f"2026-05-14T18:32:0{i}Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}"
        for i in range(2)  # only 2 fails — below threshold of 3
    ]
    _write_log(log, lines)
    assert not _should_snooze(str(tmp_path / "05-generate"), integrity)


def test_no_snooze_when_first_integrity_differs(tmp_path: Path) -> None:
    """Entries with a different first_integrity value than the current run
    must NOT snooze — those represent a different failure mode."""
    log = tmp_path / "pipeline.log"
    encoded = json.dumps("OLD failure")
    lines = [
        f"2026-05-14T18:32:0{i}Z [07-summarize] [hook:stop:fail]  "
        f"first_integrity={encoded}"
        for i in range(3)
    ]
    _write_log(log, lines)
    assert not _should_snooze(str(tmp_path / "05-generate"), "NEW failure")


def test_no_snooze_when_progress_event_follows_all_fails(tmp_path: Path) -> None:
    """A non-hook:stop:fail event landing AFTER all fails (most-recent log
    line is a skill:start) must reset the snooze. Pre-fix this case fell
    into the `# else: keep going` branch and snoozed silently — contradicting
    the docstring's "any non-fail event resets" contract."""
    log = tmp_path / "pipeline.log"
    integrity = "P1 too few MCP calls"
    encoded = json.dumps(integrity)
    lines = [
        f"2026-05-14T18:32:00Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        f"2026-05-14T18:32:01Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        f"2026-05-14T18:32:02Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        # Progress event AFTER all 3 fails — agent moved on:
        "2026-05-14T18:32:03Z [04-map] [skill:map-assemble:start]  beginning",
    ]
    _write_log(log, lines)
    assert not _should_snooze(str(tmp_path / "05-generate"), integrity)


def test_no_snooze_when_progress_event_intervenes(tmp_path: Path) -> None:
    """A non-hook:stop:fail event between failures = real progress; reset."""
    log = tmp_path / "pipeline.log"
    integrity = "P1 too few MCP calls"
    encoded = json.dumps(integrity)
    lines = [
        f"2026-05-14T18:32:00Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        f"2026-05-14T18:32:01Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        # Progress event — a real fix-and-retry cycle:
        "2026-05-14T18:32:02Z [04-map] [skill:map-assemble:end]  outputs=4",
        f"2026-05-14T18:32:03Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
    ]
    _write_log(log, lines)
    assert not _should_snooze(str(tmp_path / "05-generate"), integrity)


def test_no_snooze_when_pass_in_tail(tmp_path: Path) -> None:
    """A pass entry in the recent tail blocks snooze — the loop already broke."""
    log = tmp_path / "pipeline.log"
    integrity = "P1"
    encoded = json.dumps(integrity)
    lines = [
        f"2026-05-14T18:32:00Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        f"2026-05-14T18:32:01Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
        "2026-05-14T18:32:02Z [07-summarize] [hook:stop:pass]  ok",
        f"2026-05-14T18:32:03Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}",
    ]
    _write_log(log, lines)
    assert not _should_snooze(str(tmp_path / "05-generate"), integrity)


def test_no_snooze_when_log_missing(tmp_path: Path) -> None:
    """No pipeline.log → can't snooze (no history to suppress against)."""
    assert not _should_snooze(str(tmp_path / "05-generate"), "any")


def test_no_snooze_when_current_first_integrity_is_none(tmp_path: Path) -> None:
    """Current run has no integrity error → nothing to suppress."""
    log = tmp_path / "pipeline.log"
    log.write_text("2026-05-14T18:32:00Z [07-summarize] [hook:stop:fail]  first_integrity=\"x\"\n")
    assert not _should_snooze(str(tmp_path / "05-generate"), None)


def test_snooze_handles_json_escaped_values(tmp_path: Path) -> None:
    """first_integrity values containing quotes/newlines arrive JSON-encoded
    in the log. The decoder in _should_snooze must round-trip them."""
    log = tmp_path / "pipeline.log"
    raw = 'P1 "templated" verification\nnote'
    encoded = json.dumps(raw)
    lines = [
        f"2026-05-14T18:32:0{i}Z [07-summarize] [hook:stop:fail]  first_integrity={encoded}"
        for i in range(3)
    ]
    _write_log(log, lines)
    assert _should_snooze(str(tmp_path / "05-generate"), raw)
