#!/usr/bin/env python3
"""
PostToolUse hook: validate artifacts written to .service-approval/.

Reads JSON from stdin (Claude Code hook protocol), dispatches to
validate_controls or validate_state based on file path.

Exit codes:
    0 — pass (or not our concern)
    2 — validation failed (errors on stderr for Claude to auto-fix)
"""

import json
import os
import sys
import time

# Allow sibling imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _hook_log import log_hook_fire  # noqa: E402


# Hard-fail grace window: after the legacy-layout marker has existed for this
# long without the user migrating, the hook starts rejecting writes to the
# legacy layout. 24 hours gives a user enough time to notice the warning,
# plan the migration, and run the tool — without leaving a half-migrated tree
# to fester for weeks.
_LEGACY_GRACE_PERIOD_S = 24 * 3600


def _legacy_marker_for(norm: str) -> str | None:
    """Return the .LEGACY-LAYOUT-DETECTED marker path for the given write target.

    Returns None if the target isn't under a .service-approval/ tree at all.
    """
    parts = norm.replace("/.service-approval/", "/.service-approval|", 1).split("|", 1)
    if len(parts) != 2:
        return None
    sa_dir = parts[0] + "/.service-approval"
    return os.path.join(sa_dir, ".LEGACY-LAYOUT-DETECTED")


def _emit_legacy_migration_warning(norm: str, file_path: str) -> str | None:
    """Emit a one-time warning when a write targets the legacy layout.

    A user mid-upgrade may have a leftover .service-approval/state/ tree
    while the new code reads .service-approval/<slug>/. Without a warning,
    they'd silently double-write and find inconsistent state. We can't auto-
    migrate (the slug is unknown at this layer), but we can surface the
    issue and create a marker file so the migration tool can find it.

    Returns the marker path if one was relevant (created or already present),
    so the caller can check its age for the hard-fail grace window.
    """
    if "/state/" not in norm and "/controls/" not in norm:
        return None

    marker = _legacy_marker_for(norm)
    if marker is None:
        return None

    if os.path.exists(marker):
        return marker  # already warned

    sa_dir = os.path.dirname(marker)
    try:
        os.makedirs(sa_dir, exist_ok=True)
        with open(marker, "w") as f:
            f.write(
                "Legacy .service-approval/state/ or .service-approval/controls/ tree detected.\n"
                f"Triggering write: {file_path}\n"
                "\n"
                "The pipeline migrated to a per-slug layout in MR !14. Old paths\n"
                "are NOT auto-migrated. Run tools/migrate-legacy-state.py (planned)\n"
                "or manually move files to .service-approval/<slug>/<NN>-<phase>/.\n"
                "After 24 hours, this hook will start REJECTING writes to the\n"
                "legacy tree (exit code 2) — fix the layout before then.\n"
                "Delete this marker after migration is complete.\n"
            )
        print(
            f"WARN: Legacy .service-approval/ layout detected (write to {file_path}). "
            f"See {marker} for migration guidance. "
            f"Hook will hard-fail in 24h if not migrated.",
            file=sys.stderr,
        )
        log_hook_fire(
            "legacy-detected",
            "warn",
            f"Legacy layout marker created at {marker}; 24h grace started",
            file_path=file_path,
        )
    except OSError:
        # Marker creation is best-effort; don't fail the hook over it.
        return marker
    return marker


def _legacy_marker_grace_exhausted(marker: str) -> bool:
    """Return True if the marker has existed longer than the grace window."""
    try:
        age_s = time.time() - os.path.getmtime(marker)
    except OSError:
        return False
    return age_s > _LEGACY_GRACE_PERIOD_S


def main():
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        sys.exit(0)

    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    norm = file_path.replace("\\", "/")

    # Dispatch based on path pattern
    # New layout: .service-approval/<slug>/05-generate/ → controls validator
    #             .service-approval/<slug>/0[1-8]-*/ → state validator
    # Legacy (fallback): /controls/ or /state/ for migration only — emit
    # a one-time warning marker so users know to migrate; after a 24h
    # grace period, hard-fail to force the user to migrate.
    if ("/.service-approval/" in norm or "/service-approval/" in norm):
        marker = _emit_legacy_migration_warning(norm, file_path)
        if marker is not None and _legacy_marker_grace_exhausted(marker):
            # Grace exhausted — reject the write.
            print(
                f"HOOK REJECTED: legacy .service-approval/ layout has not been "
                f"migrated for >24h. Marker: {marker}.\n"
                f"  Triggering write: {file_path}\n"
                f"  Action: run tools/migrate-legacy-state.py (or manually move\n"
                f"  files to .service-approval/<slug>/<NN>-<phase>/), then delete\n"
                f"  the marker file.",
                file=sys.stderr,
            )
            log_hook_fire(
                "post-tool-use",
                "reject",
                f"Legacy layout grace expired for {file_path}",
                file_path=file_path,
                extra={"marker": marker},
            )
            sys.exit(2)

        # Check if it's in a 05-generate/ directory (controls)
        if "/05-generate/" in norm or "/controls/" in norm:
            from validate_controls import validate_file
            errors = validate_file(file_path)
        # Check if it's in a numbered phase directory (state) — range(9) covers
        # 00-intake through 08-evidence.
        elif any(f"/{p:02d}-" in norm for p in range(9)) or "/state/" in norm:
            from validate_state import validate_state_file
            errors = validate_state_file(file_path)
        else:
            sys.exit(0)
    else:
        sys.exit(0)

    if errors:
        print(f"HOOK VALIDATION FAILED ({len(errors)} errors):", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        log_hook_fire(
            "post-tool-use",
            "fail",
            f"{len(errors)} schema errors on {file_path}",
            file_path=file_path,
            extra={"first_error": errors[0][:200]},
        )
        sys.exit(2)

    log_hook_fire(
        "post-tool-use",
        "pass",
        f"validated {file_path}",
        file_path=file_path,
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
