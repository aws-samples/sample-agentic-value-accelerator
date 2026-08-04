"""Centralized pipeline logger — one file per service.

Writes to:

    .service-approval/<slug>/pipeline.log

Single timestamp-ordered append-only log. Hooks, MCP calls, skill
lifecycle events, and validation outcomes all land here so a debugging
session can read one file and see causality.

Line format (single-line, multi-line input \\n-escaped):

    <UTC-iso8601> [<phase>] [<source>:<verdict>]  <message> [k=v ...]

Where:
    phase    — 00-intake, 01-assess, ..., 08-evidence, or "tree" / "?"
    source   — hook (post-tool-use, stop, check-phase-complete, legacy-detected),
               mcp:<server>, skill:<skill-name>, script:<script-name>, etc.
    verdict  — pass | fail | warn | snoozed | reject | error | halt | start | end | retry | call | response
    message  — single-line summary
    k=v      — optional structured tokens

Examples:

    2026-05-14T18:32:01Z [00-intake] [skill:intake:start]  service=lambda mode=full-deploy
    2026-05-14T18:32:09Z [01-assess] [mcp:awsknowledge:call]  search_documentation: "lambda condition keys"
    2026-05-14T18:32:11Z [01-assess] [mcp:awsknowledge:response]  bytes=12450 cached=false
    2026-05-14T18:32:15Z [01-assess] [hook:post-tool-use:fail]  sar-facts.json: SCHEMA-S2 condition_keys missing
    2026-05-14T18:34:02Z [04-map] [hook:check-phase-complete:fail]  03-validate phase missing validated.json
    2026-05-14T18:34:02Z [04-map] [skill:map:halt]  cannot proceed; see message above

Backward-compat: a parallel append to .service-approval/<slug>/mcp-calls.log
is preserved when source=mcp:* — older skills/tools that grep mcp-calls.log
continue to work, but new code should read pipeline.log.

Logging is best-effort: a permission/disk error never cascades into hook
failure (silent on OSError).
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

# Phase-dir regex (mirrors tools.paths._PHASE_DIR_RE; we don't import to
# avoid circular dependencies during hook execution).
_PHASE_DIR_RE = re.compile(
    r"^(0[0-8])-(intake|assess|research|validate|map|generate|test|summarize|evidence)$"
)

PIPELINE_LOG_NAME = "pipeline.log"
MCP_SHADOW_LOG_NAME = "mcp-calls.log"


def _now() -> str:
    """ISO 8601 timestamp in UTC."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _service_approval_root_for(file_path: str | None) -> Path | None:
    """Walk up from `file_path` to find a `.service-approval/` ancestor.

    Anchors on the canonical project marker (`manifest.yaml`) — only accepts
    a `.service-approval/` ancestor whose enclosing directory contains
    `manifest.yaml`. This prevents writes to a sibling/parent project's
    `.service-approval/` tree if the developer happens to have one (workspace
    scratch dir, unrelated project clone, etc.). Mirrors the rationale in
    `tools/paths.py:repo_root`.
    """
    if not file_path:
        return None
    p = Path(file_path).resolve()
    if p.is_file():
        p = p.parent
    for _ in range(15):
        sa = p / ".service-approval"
        if sa.is_dir() and (p / "manifest.yaml").exists():
            return sa
        if p.parent == p:
            return None
        p = p.parent
    return None


def _slug_and_phase_from_path(file_path: str) -> tuple[str | None, str | None]:
    """Extract (slug, phase) from a path under .service-approval/<slug>/<phase>/."""
    norm = file_path.replace("\\", "/")
    parts = norm.split("/.service-approval/", 1)
    if len(parts) != 2:
        return None, None
    rest = parts[1].split("/")
    if not rest or rest[0] in ("_staging", "plans") or rest[0].startswith("."):
        return None, None
    slug = rest[0]
    phase = rest[1] if len(rest) >= 2 and _PHASE_DIR_RE.match(rest[1]) else None
    return slug, phase


def _format_line(phase: str, source: str, verdict: str, message: str, extra: dict | None) -> str:
    """Format one consolidated log line.

    Every value (including string `extra` values) is normalized so the line
    contract — exactly one event per `\\n` — holds. `json.dumps` quotes
    strings AND escapes embedded newlines/quotes, which fixes both the
    multi-line and the embedded-space ambiguity. Numbers and other primitives
    fall through to `str()`.
    """
    line_msg = message.replace("\n", "\\n").replace("\r", "\\r")
    if extra:
        line_msg += " " + " ".join(
            f"{k}={json.dumps(v) if isinstance(v, (dict, list, bool, str)) or v is None else v}"
            for k, v in extra.items()
        )
    return f"{_now()} [{phase}] [{source}:{verdict}]  {line_msg}\n"


def _append(log_path: Path, line: str) -> None:
    """Append to a log file, swallowing OSError (best-effort logging)."""
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "a") as f:
            f.write(line)
    except OSError:
        pass


def log_event(
    phase: str | None,
    source: str,
    verdict: str,
    message: str,
    *,
    slug: str | None = None,
    file_path: str | None = None,
    extra: dict | None = None,
) -> None:
    """Append one event to the per-service pipeline.log.

    Args:
        phase: Phase tag (e.g. "04-map"). If None and file_path is given,
               try to resolve from the path; otherwise tag as "?".
        source: Source identifier (e.g. "hook:post-tool-use", "mcp:awsknowledge",
                "skill:map-assemble", "script:smoke-deploy-test").
        verdict: Status keyword (pass/fail/warn/reject/error/start/end/retry/
                 call/response).
        message: Single-line message.
        slug: Service slug. If None, resolved from file_path.
        file_path: Path to the artifact being acted on; used to resolve
                   slug/phase if those args are not given.
        extra: Optional structured key/value pairs.
    """
    # Resolve slug
    if slug is None and file_path:
        slug, resolved_phase = _slug_and_phase_from_path(file_path)
        if phase is None:
            phase = resolved_phase

    if phase is None:
        phase = "?"

    # Resolve sa_root regardless of whether we have a slug — the tree-scoped
    # fallback also needs it.
    sa_root: Path | None = None
    if file_path:
        sa_root = _service_approval_root_for(file_path)
    if sa_root is None:
        cwd_sa = Path.cwd() / ".service-approval"
        if cwd_sa.is_dir():
            sa_root = cwd_sa

    line = _format_line(phase, source, verdict, message, extra)

    if slug and sa_root:
        # Per-service log
        _append(sa_root / slug / PIPELINE_LOG_NAME, line)

        # Backward-compat: mirror MCP events to mcp-calls.log so existing
        # readers (Stop-hook P1 used to count this file; older skills) keep
        # working. We mirror the raw line so it's still grep-friendly.
        if source.startswith("mcp:"):
            _append(sa_root / slug / MCP_SHADOW_LOG_NAME, line)
    elif sa_root:
        # Fallback: log to tree root (no slug yet — e.g. Intake before
        # Phase 0 promotion).
        _append(sa_root / PIPELINE_LOG_NAME, line)
    # If we can't find .service-approval/, we silently drop the event.


# ----------------------------------------------------------------------
# Backward-compat aliases (the prior API surface)
# ----------------------------------------------------------------------

def log_hook_fire(
    hook: str,
    verdict: str,
    message: str,
    file_path: str | None = None,
    *,
    extra: dict | None = None,
) -> None:
    """Backward-compat for callers that used the prior hook-only API.

    Forwards to log_event() with source=`hook:<hook>` and slug/phase
    resolved from file_path.
    """
    log_event(
        phase=None,
        source=f"hook:{hook}",
        verdict=verdict,
        message=message,
        file_path=file_path,
        extra=extra,
    )


def log_phase_event(
    slug: str,
    phase: str,
    hook: str,
    verdict: str,
    message: str,
    *,
    extra: dict | None = None,
) -> None:
    """Backward-compat: log to a specific (slug, phase) tuple."""
    log_event(
        phase=phase,
        source=f"hook:{hook}",
        verdict=verdict,
        message=message,
        slug=slug,
        extra=extra,
    )


# ----------------------------------------------------------------------
# Helpers for callers that want concise APIs
# ----------------------------------------------------------------------

def log_skill(slug: str | None, phase: str | None, skill_name: str, verdict: str,
              message: str = "", *, extra: dict | None = None) -> None:
    """Log a skill lifecycle event (start/end/retry/halt)."""
    log_event(
        phase=phase,
        source=f"skill:{skill_name}",
        verdict=verdict,
        message=message,
        slug=slug,
        extra=extra,
    )


def log_mcp(slug: str | None, phase: str | None, server: str, verdict: str,
            message: str, *, extra: dict | None = None) -> None:
    """Log an MCP call/response. verdict is typically 'call' or 'response'."""
    log_event(
        phase=phase,
        source=f"mcp:{server}",
        verdict=verdict,
        message=message,
        slug=slug,
        extra=extra,
    )


def log_script(slug: str | None, phase: str | None, script: str, verdict: str,
               message: str, *, extra: dict | None = None) -> None:
    """Log a subprocess invocation (smoke-deploy-test.sh, etc.)."""
    log_event(
        phase=phase,
        source=f"script:{script}",
        verdict=verdict,
        message=message,
        slug=slug,
        extra=extra,
    )
