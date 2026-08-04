#!/usr/bin/env python3
"""Bash-friendly CLI for appending events to the consolidated pipeline.log.

Skills, scripts, and shell hooks call this from bash to log skill lifecycle
events, MCP calls, and arbitrary status messages without each caller
re-implementing the format.

Usage:
    python3 -m tools.validate.log --slug <slug> --phase <NN-name> \\
        --source <source> --verdict <verdict> --message "<msg>" [--extra k=v ...]

Examples:
    # At the top of map-assemble:
    python3 -m tools.validate.log --slug awslambda --phase 04-map \\
        --source skill:map-assemble --verdict start \\
        --message "assembling map outputs"

    # When an MCP call fires:
    python3 -m tools.validate.log --slug awslambda --phase 02-research \\
        --source mcp:awsknowledge --verdict call \\
        --message "search_documentation: lambda condition keys"

Exit codes:
    0 — always (logging is best-effort and never fails the calling process)
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hook_log import log_event  # type: ignore  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Append an event to .service-approval/<slug>/pipeline.log",
    )
    parser.add_argument("--slug", help="Service slug (e.g. awslambda)")
    parser.add_argument("--phase", help="Phase tag (e.g. 04-map). Optional if file_path is given.")
    parser.add_argument("--source", required=True,
                        help="Source identifier (e.g. 'skill:map-assemble', 'mcp:awsknowledge', "
                             "'script:smoke-deploy-test', 'hook:post-tool-use')")
    parser.add_argument("--verdict", required=True,
                        help="Status keyword (start|end|retry|halt|pass|fail|warn|snoozed|"
                             "reject|error|call|response)")
    parser.add_argument("--message", default="", help="Single-line message")
    parser.add_argument("--file-path", help="Artifact path (used to resolve slug/phase if not given)")
    parser.add_argument("--extra", action="append", default=[],
                        help="Optional key=value pair; repeat for multiple")

    args = parser.parse_args()

    extra_dict: dict | None = None
    if args.extra:
        extra_dict = {}
        for kv in args.extra:
            if "=" in kv:
                k, _, v = kv.partition("=")
                extra_dict[k] = v
            else:
                extra_dict[kv] = ""

    log_event(
        phase=args.phase,
        source=args.source,
        verdict=args.verdict,
        message=args.message,
        slug=args.slug,
        file_path=args.file_path,
        extra=extra_dict,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
