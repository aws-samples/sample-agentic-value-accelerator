"""Single-source path resolver for evidence-attestation system.

Provides canonical path resolution for the .service-approval/ hierarchy:

- `.service-approval/<slug>/` — per-service root
- `.service-approval/<slug>/<NN>-<phase>/` — per-phase directories
- `.service-approval/<slug>/mcp-calls.log` — service-scoped MCP audit log
- `.service-approval/_staging/<timestamp>/` — intake staging before slug known

Phase names map to numbers:
  intake → 00, assess → 01, research → 02, validate → 03,
  map → 04, generate → 05, test → 06, summarize → 07, evidence → 08

All paths are relative to repo_root(). Skills, validators, and scripts
MUST use these helpers instead of hardcoding paths.

Security: service_root() and phase_dir() re-validate the slug against the
canonical regex (defense in depth — Phase 0's slug.derive_canonical_slug
already validates, but a downstream caller could pass an attacker-controlled
slug from intake-manifest.json or a stale env var) and assert the resolved
path stays under repo_root() / .service-approval / .
"""
from __future__ import annotations

import os
import re
from pathlib import Path


# Phase name → number mapping (authoritative).
_PHASE_MAP = {
    "intake": "00",
    "assess": "01",
    "research": "02",
    "validate": "03",
    "map": "04",
    "generate": "05",
    "test": "06",
    "summarize": "07",
    "evidence": "08",
}

# Canonical slug pattern (mirrors slug.derive_canonical_slug).
# Must start with [a-z0-9], up to 63 chars total, only [a-z0-9-].
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


class PathResolutionError(ValueError):
    """Raised when path resolution fails (e.g., invalid phase name, slug, traversal)."""


def repo_root() -> Path:
    """Return the repository root directory.

    Walks up from this file's location until it finds a directory containing
    `manifest.yaml` (the project-specific marker that uniquely identifies a
    service-onboarding clone — anchoring on `.git` or `.service-approval/`
    risked landing on a developer's home directory if either existed there).

    Returns:
        Path to repository root.

    Raises:
        PathResolutionError: If root cannot be found.
    """
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / "manifest.yaml").exists():
            return current
        current = current.parent
    raise PathResolutionError(
        f"Could not find repository root from {__file__}. "
        f"Expected a parent directory containing manifest.yaml"
    )


def _validate_slug(slug: str) -> None:
    """Validate slug against canonical pattern.

    Raises:
        PathResolutionError: If slug is not a string, empty, contains traversal
            sequences, or fails the canonical pattern.
    """
    if not slug or not isinstance(slug, str):
        raise PathResolutionError(f"Invalid slug (empty or non-string): {slug!r}")
    if not _SLUG_RE.match(slug):
        raise PathResolutionError(
            f"Invalid slug: {slug!r}. Must match {_SLUG_RE.pattern} "
            "(lowercase alphanumeric + hyphens, 1-63 chars, must start with [a-z0-9])."
        )


def _assert_under_service_approval(resolved: Path) -> None:
    """Assert that the resolved path stays under repo_root() / .service-approval / .

    Defense in depth — even if slug validation regressed, this catches any
    path that escapes the .service-approval/ jail.
    """
    sa_root = (repo_root() / ".service-approval").resolve()
    try:
        resolved.relative_to(sa_root)
    except ValueError as e:
        raise PathResolutionError(
            f"Path traversal detected: {resolved} is not under {sa_root}"
        ) from e


def service_root(slug: str) -> Path:
    """Return the service root directory for the given slug.

    Args:
        slug: Service slug (e.g., "awslambda", "bedrock-agentcore").
            Must match ^[a-z0-9][a-z0-9-]{0,62}$.

    Returns:
        Path to .service-approval/<slug>/

    Raises:
        PathResolutionError: If slug is invalid or resolves outside .service-approval/.
    """
    _validate_slug(slug)
    candidate = (repo_root() / ".service-approval" / slug).resolve()
    _assert_under_service_approval(candidate)
    return candidate


def phase_dir(slug: str, phase: str) -> Path:
    """Return the phase directory for the given slug and phase name.

    Args:
        slug: Service slug (e.g., "awslambda"). Validated.
        phase: Phase name (e.g., "assess", "research", "map", "generate").
               Must be one of the recognized phase names in _PHASE_MAP.

    Returns:
        Path to .service-approval/<slug>/<NN>-<phase>/ where NN is the
        two-digit phase number.

    Raises:
        PathResolutionError: If slug or phase name is invalid.

    Examples:
        >>> phase_dir("awslambda", "assess")  # doctest: +SKIP
        PosixPath('/repo/.service-approval/awslambda/01-assess')
    """
    if phase not in _PHASE_MAP:
        valid = ", ".join(sorted(_PHASE_MAP.keys()))
        raise PathResolutionError(
            f"Invalid phase name: {phase!r}. Valid phases: {valid}"
        )
    phase_num = _PHASE_MAP[phase]
    candidate = (service_root(slug) / f"{phase_num}-{phase}").resolve()
    _assert_under_service_approval(candidate)
    return candidate


def mcp_log(slug: str) -> Path:
    """Return the MCP calls log path for the given slug.

    Args:
        slug: Service slug.

    Returns:
        Path to .service-approval/<slug>/mcp-calls.log
    """
    return service_root(slug) / "mcp-calls.log"


# Allowed staging timestamp pattern: YYYY-MM-DDTHH-MM-SSZ (ISO 8601 with
# colons substituted by hyphens for filesystem safety).
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$")

# A canonical phase directory name is exactly NN-name where NN is one of
# the two-digit numbers in _PHASE_MAP and name is the matching phase name.
# Anchoring with this prevents `01-something-else` or `09-extra-phase`
# from being mistaken for a phase dir.
_PHASE_DIR_RE = re.compile(
    r"^(0[0-8])-(intake|assess|research|validate|map|generate|test|summarize|evidence)$"
)


def is_phase_dir_name(name: str) -> bool:
    """Return True if `name` is a canonical phase directory name.

    Use this instead of ad-hoc heuristics like `name.startswith("0") and "-" in name`,
    which mis-match unrelated dirs (e.g., `0-day-old-cache`, `00-private`).
    """
    return bool(_PHASE_DIR_RE.match(name))


def find_service_root_for_file(file_path: str | Path) -> Path | None:
    """Walk up from a file path to find its service root.

    Returns the absolute path to the service root (e.g.,
    `.service-approval/awslambda/`) by walking up from `file_path` until it
    finds a directory whose parent contains at least one canonical phase
    directory (matching is_phase_dir_name).

    Returns None if no service root can be located within 10 levels of
    walking up — this is the safety bound so a stray path can't wander up
    to /.

    Use this instead of inline `c.startswith("0") and "-" in c` heuristics.
    """
    p = Path(file_path).resolve()
    if p.is_file():
        p = p.parent
    for _ in range(10):
        parent = p.parent
        if parent == p:
            return None
        if parent.is_dir():
            try:
                children = [c.name for c in parent.iterdir()]
            except OSError:
                return None
            if any(is_phase_dir_name(c) for c in children):
                # `parent` is a service root; `p` is one of its children
                # (could be a phase dir, or a deeper file inside one).
                # Walk back down to find which phase contains file_path.
                return parent
        p = parent
    return None


def staging_dir(ts: str) -> Path:
    """Return the staging directory for a given timestamp.

    Used by intake skill before the service slug is known. After assess
    canonicalizes the slug, the staging dir is promoted to the service root.

    Args:
        ts: ISO 8601 timestamp string with hyphens for time separators
            (e.g., "2026-05-13T11-30-00Z").

    Returns:
        Path to .service-approval/_staging/<ts>/

    Raises:
        PathResolutionError: If ts is empty, non-string, or doesn't match the
            timestamp pattern (defense against path injection via ts).
    """
    if not ts or not isinstance(ts, str):
        raise PathResolutionError(f"Invalid timestamp: {ts!r}")
    if not _TIMESTAMP_RE.match(ts):
        raise PathResolutionError(
            f"Invalid timestamp format: {ts!r}. "
            "Expected YYYY-MM-DDTHH-MM-SSZ (e.g., '2026-05-13T11-30-00Z')."
        )
    candidate = (repo_root() / ".service-approval" / "_staging" / ts).resolve()
    _assert_under_service_approval(candidate)
    return candidate


def legacy_state_dir() -> Path:
    """Return the legacy .service-approval/state/ directory.

    **DEPRECATED.** This path is only for migration utilities and
    should NOT be used by skills or validators in the new layout.

    Callers MUST warn users that this is legacy and point them to
    the per-service layout.

    Returns:
        Path to .service-approval/state/
    """
    return repo_root() / ".service-approval" / "state"
