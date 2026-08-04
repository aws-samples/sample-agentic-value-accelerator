#!/usr/bin/env python3
"""
Generate Kiro IDE (.md) and Kiro CLI 2.0 (.json) agent files from single-source
YAML manifests at powers/service-approval/agents-src/*.yaml.

Also generates IDE-format .kiro.hook files under powers/service-approval/ide/hooks/
and embeds hooks inside each CLI agent's `hooks` block per Kiro CLI 2.0 conventions.

Usage:
    python3 tools/generate-kiro-agents.py           # regenerate
    python3 tools/generate-kiro-agents.py --check   # dry-run; exit 2 if drift
"""
from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


# Reuse the canonical repo-root resolver from tools.paths.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import repo_root  # type: ignore  # noqa: E402

REPO = repo_root()
SRC_DIR = REPO / "powers" / "service-approval" / "agents-src"
IDE_AGENTS = REPO / "powers" / "service-approval" / "ide" / "agents"
IDE_HOOKS = REPO / "powers" / "service-approval" / "ide" / "hooks"
CLI_AGENTS = REPO / "powers" / "service-approval" / "cli" / "agents"


# --- IDE (.md) emitter ------------------------------------------------------

def render_ide_md(spec: dict) -> str:
    """IDE agent format: YAML frontmatter + body. Tools prefixed `@` for MCP."""
    tools = ["read", "write", "shell"] + [f"@{s}" for s in spec["mcp_servers"]]
    fm = {
        "name": spec["name"],
        "description": spec["description"],
        "tools": tools,
    }
    fm_str = yaml.dump(fm, default_flow_style=False, sort_keys=False, width=10000).rstrip()
    return f"---\n{fm_str}\n---\n\n{spec['body'].rstrip()}\n"


# --- CLI 2.0 (.json) emitter -----------------------------------------------

# Hooks shared across all CLI agents. Embedded into each agent's `hooks` block
# per kiro.dev/docs/cli/hooks — hooks are defined inside agent configs, not as
# standalone files.
CLI_AGENT_HOOKS = {
    "PostToolUse": [
        {
            "matcher": "fs_write",
            "command": "python3 ${workspaceRoot}/tools/validate/hook_post_tool_use.py",
            "timeout_ms": 30000,
        }
    ],
    "Stop": [
        {
            "matcher": "*",
            "command": "python3 ${workspaceRoot}/tools/validate/hook_stop.py",
            "timeout_ms": 60000,
        }
    ],
}


def render_cli_json(spec: dict) -> str:
    """CLI 2.0 agent format: JSON with mcpServers + embedded hooks."""
    doc = {
        "name": spec["name"],
        "description": spec["description"],
        "prompt": spec["body"].rstrip(),
        "mcpServers": list(spec["mcp_servers"]),
        "tools": ["*"],
        "allowedTools": ["fs_read", "fs_write", "execute_bash"],
        "includeMcpJson": True,
        "hooks": CLI_AGENT_HOOKS,
    }
    return json.dumps(doc, indent=2) + "\n"


# --- IDE hook (.kiro.hook) emitter -----------------------------------------

IDE_HOOKS_TEMPLATES = {
    "post-tool-use.kiro.hook": """---
title: Validate state files after write
trigger: File Save
filePattern: ".service-approval/**/*.json|.service-approval/**/05-generate/**/*"
---

# Post-write validation

Run `python3 tools/validate/hook_post_tool_use.py` after any write to
`.service-approval/<slug>/<phase>/` or `.service-approval/<slug>/05-generate/`. The validator
checks schema shape, JSON validity, and cross-file references.

Exit code 2 blocks the write.
""",
    "stop.kiro.hook": """---
title: Pipeline integrity check at end of session
trigger: Agent Stop
---

# Pipeline integrity check

Run `python3 tools/validate/hook_stop.py` when the agent signals completion.
This script wraps `validate_pipeline_integrity.py` and enforces 7 numbered
failure signals (P1-P7):

P1 — pipeline.log / mcp-calls.log missing or too few MCP calls (>=10)
     (exempted by `[pipeline:complete:<VERDICT>]` terminal sentinel)
P2 — validated.json has templated or empty verification notes
     (>=50% uniqueness required)
P3 — IAM policy logic errors (mismatched StringEquals/StringNotEquals
     keys, broad Allow on Resource:* without Condition, SCP without Deny)
P4 — IaC templates contain placeholder account IDs (123456789012,
     000000000000) or placeholder ARNs
P5 — framework coverage below 15% with no per-objective rationale
P6 — verdict mismatch (APPROVED emitted despite integrity failures)
P7 — phase-output completeness: every phase dir on disk must contain
     its declared outputs (mapping-results.json, controls-catalog.md,
     framework-mapping.md, etc.) at min-size thresholds

Cultural rules (no one-shot generator scripts, etc.) live in
`steering/service-approval-enforcement.md`, not in this hook's list.

Exit code 2 forces the verdict to REQUIRES REMEDIATION and blocks the Stop.
""",
    "block-direct-state-writes.kiro.hook": """---
title: Enforce skill-based pipeline execution
trigger: Pre Tool Use
toolTypes: ["write"]
---

# Block direct writes to pipeline state and controls

You are about to write to a file. If this write targets the pipeline state
or controls directories, confirm: are you executing through the power's
defined sub-skills (`sa-intake`, `sa-assess`, `sa-research-*`,
`sa-validate`, `sa-map-*`, `sa-generate-*`, `sa-evidence`) as specified
in `steering/pipeline.md`?

If not, STOP and follow the skill-based execution path. Do not write
state files directly.
""",
}


# --- Drift detection -------------------------------------------------------

def _write_or_check(path: Path, content: str, check: bool) -> bool:
    existing = path.read_text() if path.exists() else ""
    if existing == content:
        return False
    if check:
        # difflib.unified_diff returns a generator — materialize before slicing.
        diff_lines = list(difflib.unified_diff(
            existing.splitlines(), content.splitlines(),
            fromfile=str(path.relative_to(REPO)),
            tofile=f"{path.relative_to(REPO)} (generated)",
            lineterm="",
        ))
        diff = "\n".join(diff_lines[:12])
        print(f"DRIFT  {path.relative_to(REPO)}\n{diff}", file=sys.stderr)
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    print(f"wrote  {path.relative_to(REPO)}")
    return True


# --- Main ------------------------------------------------------------------

def generate(check: bool) -> int:
    if not SRC_DIR.exists():
        print(f"Source dir missing: {SRC_DIR}", file=sys.stderr)
        return 1

    sources = sorted(SRC_DIR.glob("*.yaml"))
    if not sources:
        print(f"No YAML sources in {SRC_DIR}", file=sys.stderr)
        return 1

    any_drift = False

    for src in sources:
        spec = yaml.safe_load(src.read_text())
        if not spec.get("name"):
            print(f"SKIP {src.name}: missing 'name' field", file=sys.stderr)
            continue

        ide_path = IDE_AGENTS / f"{spec['name']}.md"
        cli_path = CLI_AGENTS / f"{spec['name']}.json"

        drift_md = _write_or_check(ide_path, render_ide_md(spec), check)
        drift_json = _write_or_check(cli_path, render_cli_json(spec), check)
        any_drift = any_drift or drift_md or drift_json

    # Emit IDE hook files (static templates, not per-agent)
    for fname, body in IDE_HOOKS_TEMPLATES.items():
        any_drift |= _write_or_check(IDE_HOOKS / fname, body, check)

    if check and any_drift:
        print("\nDrift detected. Run `python3 tools/generate-kiro-agents.py` to fix.",
              file=sys.stderr)
        return 2
    if not any_drift:
        print("All Kiro agent outputs in sync.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true", help="Dry-run; exit 2 on drift")
    args = p.parse_args()
    return generate(args.check)


if __name__ == "__main__":
    sys.exit(main())
