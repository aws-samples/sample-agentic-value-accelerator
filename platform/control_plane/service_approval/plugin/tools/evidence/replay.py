"""Replay CLI commands from cli-commands.json for independent audit.

Supports re-running a single control's CLI without re-running the whole phase.
Useful for debugging predicate evaluation or verifying evidence after stack updates.

Usage:
    python3 tools/evidence/replay.py --service=awslambda --control=CTRL-ACC-PRO-010
    python3 tools/evidence/replay.py --service=awslambda --all
"""
from __future__ import annotations

import argparse
import json
import shlex
import sys
from pathlib import Path

from tools.evidence.execute import execute_command
from tools.paths import phase_dir


def replay_control(
    service_slug: str,
    control_id: str,
) -> None:
    """Replay a single control's CLI command."""
    evidence_dir = phase_dir(service_slug, "evidence")
    cli_commands_path = evidence_dir / "cli-commands.json"

    if not cli_commands_path.exists():
        print(f"ERROR: {cli_commands_path} does not exist.", file=sys.stderr)
        print("Run /evidence first to generate cli-commands.json", file=sys.stderr)
        sys.exit(1)

    with open(cli_commands_path) as f:
        cli_commands = json.load(f)

    commands = cli_commands.get("commands", [])
    cmd_entry = next((c for c in commands if c["control_id"] == control_id), None)

    if not cmd_entry:
        print(f"ERROR: Control {control_id} not found in cli-commands.json", file=sys.stderr)
        available = [c["control_id"] for c in commands]
        print(f"Available controls: {', '.join(available[:10])}...", file=sys.stderr)
        sys.exit(1)

    print(f"Replaying {control_id}...")
    print(f"Command: {shlex.join(cmd_entry['command_argv'])}")
    print()

    # Execute the command (shell=False inside execute_command)
    result = execute_command(cmd_entry, evidence_dir, timeout=30)

    print(f"Verdict: {result.verdict}")
    print(f"Exit code: {result.exit_code}")
    print(f"Predicate: {result.predicate_evaluation}")
    print(f"Output log: {evidence_dir / result.output_log}")
    print()

    if result.verdict == "ERROR":
        print(f"Error: {result.error_message}", file=sys.stderr)
        sys.exit(1)
    elif result.verdict == "FAIL":
        print("FAIL: Predicate did not match expected", file=sys.stderr)
        sys.exit(1)
    else:
        print("PASS")


def replay_all(service_slug: str) -> None:
    """Replay all CLI commands for a service."""
    evidence_dir = phase_dir(service_slug, "evidence")
    cli_commands_path = evidence_dir / "cli-commands.json"

    if not cli_commands_path.exists():
        print(f"ERROR: {cli_commands_path} does not exist.", file=sys.stderr)
        print("Run /evidence first to generate cli-commands.json", file=sys.stderr)
        sys.exit(1)

    with open(cli_commands_path) as f:
        cli_commands = json.load(f)

    commands = cli_commands.get("commands", [])
    print(f"Replaying {len(commands)} commands for {service_slug}...")
    print()

    results = []
    for cmd_entry in commands:
        control_id = cmd_entry["control_id"]
        print(f"Running {control_id}...", end=" ")
        result = execute_command(cmd_entry, evidence_dir, timeout=30)
        results.append(result)
        print(result.verdict)

    print()
    pass_count = sum(1 for r in results if r.verdict == "PASS")
    fail_count = sum(1 for r in results if r.verdict == "FAIL")
    error_count = sum(1 for r in results if r.verdict == "ERROR")

    print(f"Summary: {pass_count} PASS, {fail_count} FAIL, {error_count} ERROR")

    if fail_count > 0 or error_count > 0:
        sys.exit(1)


def main() -> None:
    """CLI entry point for replay tool."""
    parser = argparse.ArgumentParser(
        description="Replay CLI commands from cli-commands.json for independent audit"
    )
    parser.add_argument(
        "--service",
        required=True,
        help="Service slug (e.g., awslambda)",
    )
    parser.add_argument(
        "--control",
        help="Control ID to replay (e.g., CTRL-ACC-PRO-010). Omit to replay all.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Replay all controls (same as omitting --control)",
    )

    args = parser.parse_args()

    if args.control:
        replay_control(args.service, args.control)
    else:
        replay_all(args.service)


if __name__ == "__main__":
    main()
