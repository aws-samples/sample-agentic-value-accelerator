#!/usr/bin/env python3
"""Pre-phase precondition gate.

Every phase in the service-approval pipeline declares the artifacts it
must produce. Downstream phases call this CLI as a precondition: if the
upstream phase didn't produce what it promised, halt BEFORE wasting time
on a doomed downstream phase.

This is the load-bearing gate. The Stop-hook P7 (validate_pipeline_integrity:
check_phase_outputs) is the safety net — it catches the same failures
post-hoc but only at the end of the run.

Usage:
    python3 -m tools.validate.check_phase_complete --slug <slug> --phase <NN-name>

Exit codes:
    0 — all required outputs present and meet size thresholds
    2 — at least one required output missing or under-sized

Examples:
    # At the start of /generate, verify Map produced everything:
    python3 -m tools.validate.check_phase_complete --slug awslambda --phase 04-map

    # Before /summarize, verify Generate, Test (if ran), Map all complete:
    python3 -m tools.validate.check_phase_complete --slug awslambda --phase 05-generate
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Allow imports from sibling modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from validate_pipeline_integrity import PHASE_REQUIRED_OUTPUTS  # noqa: E402
from _hook_log import log_phase_event  # noqa: E402

# Reuse paths.py for service_root resolution + slug validation
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from paths import service_root  # type: ignore  # noqa: E402


def check_phase(slug: str, phase: str) -> list[str]:
    """Return list of error messages for missing/undersized outputs.

    Args:
        slug: Canonical service slug (e.g., 'awslambda').
        phase: Phase directory name (e.g., '04-map'). Must be a key in
               PHASE_REQUIRED_OUTPUTS.

    Returns:
        List of human-readable error strings. Empty list = phase complete.
    """
    errors: list[str] = []

    if phase not in PHASE_REQUIRED_OUTPUTS:
        valid = ", ".join(sorted(PHASE_REQUIRED_OUTPUTS.keys()))
        errors.append(
            f"Unknown phase: {phase!r}. Valid phases: {valid}"
        )
        return errors

    required = PHASE_REQUIRED_OUTPUTS[phase]
    if not required:
        # Phase has no JSON/MD outputs to check (e.g., 05-generate uses
        # subdirs; that gate lives in validate_pipeline_integrity directly).
        return errors

    try:
        sroot = service_root(slug)
    except Exception as e:
        errors.append(f"Service slug invalid: {e}")
        return errors

    phase_dir = sroot / phase
    if not phase_dir.exists():
        errors.append(
            f"Phase directory missing: {phase_dir}. "
            f"Did the {phase} skill run? Re-run the pipeline."
        )
        return errors

    for filename, min_size in required:
        artifact = phase_dir / filename
        if not artifact.exists():
            errors.append(
                f"MISSING: {phase_dir / filename}. "
                f"Phase {phase} must produce this artifact for downstream "
                f"consumers; re-run the {phase.split('-', 1)[1]} skill."
            )
            continue
        actual_size = artifact.stat().st_size
        if actual_size < min_size:
            errors.append(
                f"UNDERSIZED: {phase_dir / filename} is {actual_size} bytes "
                f"(< {min_size} min). File exists but appears truncated/stub. "
                f"Re-run the {phase.split('-', 1)[1]} skill."
            )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pre-phase precondition gate — halts the pipeline if "
                    "an upstream phase didn't produce its declared outputs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--slug",
        required=True,
        help="Canonical service slug (e.g., 'awslambda', 'awss3').",
    )
    parser.add_argument(
        "--phase",
        required=True,
        help=f"Phase directory name. One of: {', '.join(sorted(PHASE_REQUIRED_OUTPUTS.keys()))}",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress 'OK' message on success; only print on failure.",
    )

    args = parser.parse_args()

    errors = check_phase(args.slug, args.phase)
    if errors:
        print(
            f"PHASE COMPLETION CHECK FAILED ({args.slug}/{args.phase}):",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  {err}", file=sys.stderr)
        print(
            "",
            file=sys.stderr,
        )
        print(
            f"  Cannot proceed downstream — {args.phase} must complete first.",
            file=sys.stderr,
        )
        log_phase_event(
            args.slug,
            args.phase,
            "check-phase-complete",
            "fail",
            f"{len(errors)} missing/undersized outputs",
            extra={"first_error": errors[0][:200]},
        )
        return 2

    if not args.quiet:
        print(f"OK: {args.slug}/{args.phase} — all required outputs present.")
    log_phase_event(
        args.slug,
        args.phase,
        "check-phase-complete",
        "pass",
        "all required outputs present",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
