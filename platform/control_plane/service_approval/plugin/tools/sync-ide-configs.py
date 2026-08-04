#!/usr/bin/env python3
"""
Sync per-client IDE configs from the canonical manifest.yaml.

Regenerates plugin metadata AND MCP server lists in every client's config,
so adding a server to manifest.yaml propagates to all five MCP files at
once. Does NOT touch skill bodies, agent prompts, or hook scripts.

Usage:
    python3 tools/sync-ide-configs.py           # regenerate and write
    python3 tools/sync-ide-configs.py --check   # dry-run; exit 2 if drift
    python3 tools/sync-ide-configs.py --client=kiro  # regenerate one client
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


# Reuse the canonical repo-root resolver from tools.paths instead of
# reimplementing the manifest.yaml walk. Both code paths must stay in sync
# anyway; calling the canonical version eliminates the drift hazard.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import repo_root  # type: ignore  # noqa: E402

REPO = repo_root()
MANIFEST_PATH = REPO / "manifest.yaml"


# --------------------------------------------------------------------------
# MCP server rendering — each client uses a slightly different JSON shape.
# --------------------------------------------------------------------------

def render_mcp_claude(mcp: dict) -> dict:
    """Claude Code .mcp.json format. Script paths are repo-root-relative."""
    out = {}
    for name, cfg in mcp.items():
        if cfg["type"] == "http":
            out[name] = {"type": "http", "url": cfg["url"]}
        elif cfg["type"] == "stdio":
            entry = {"command": cfg["command"]}
            if "args" in cfg:
                entry["args"] = list(cfg["args"])
            if "script" in cfg:
                entry["args"] = [cfg["script"]]
            if "env" in cfg:
                entry["env"] = dict(cfg["env"])
            out[name] = entry
    return {"mcpServers": out}


def render_mcp_kiro(mcp: dict) -> dict:
    """Kiro mcp.json. stdio scripts prefixed ${workspaceRoot}/.
    Respects skip_clients: ['kiro'] to exclude servers Kiro can't reliably
    spawn.

    Kiro IDE subprocesses inherit PATH /usr/bin:/bin:/usr/sbin:/sbin which
    excludes /usr/local/bin where users install uv/uvx/docker. We inject an
    explicit PATH env var so MCP servers can find their commands even when
    Kiro's own PATH is minimal."""
    KIRO_PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    out = {}
    for name, cfg in mcp.items():
        if "kiro" in cfg.get("skip_clients", []):
            continue
        if cfg["type"] == "http":
            out[name] = {"type": "http", "url": cfg["url"]}
        elif cfg["type"] == "stdio":
            entry = {"command": cfg["command"]}
            if "args" in cfg:
                entry["args"] = list(cfg["args"])
            if "script" in cfg:
                entry["args"] = [f"${{workspaceRoot}}/{cfg['script']}"]
            env = dict(cfg.get("env", {}))
            env["PATH"] = KIRO_PATH
            entry["env"] = env
            out[name] = entry
    return {"mcpServers": out}

def render_mcp_vscode(mcp: dict) -> dict:
    """VS Code .vscode/mcp.json uses `servers` (not mcpServers)."""
    out = {}
    for name, cfg in mcp.items():
        if cfg["type"] == "http":
            out[name] = {"type": "http", "url": cfg["url"]}
        elif cfg["type"] == "stdio":
            entry = {"type": "stdio", "command": cfg["command"]}
            if "args" in cfg:
                entry["args"] = list(cfg["args"])
            if "script" in cfg:
                entry["args"] = [cfg["script"]]
            if "env" in cfg:
                entry["env"] = dict(cfg["env"])
            out[name] = entry
    return {"servers": out}


# --------------------------------------------------------------------------
# File I/O helpers
# --------------------------------------------------------------------------

def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _write_json(path: Path, data: dict, check: bool) -> bool:
    new = json.dumps(data, indent=2) + "\n"
    existing = path.read_text() if path.exists() else ""
    if existing == new:
        return False
    if check:
        print(f"DRIFT  {path.relative_to(REPO)}", file=sys.stderr)
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new)
    print(f"wrote  {path.relative_to(REPO)}")
    return True


def _update_md_frontmatter(path: Path, updates: dict, check: bool) -> bool:
    if not path.exists():
        print(f"MISS   {path.relative_to(REPO)} (file missing, skipping)", file=sys.stderr)
        return False
    content = path.read_text()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", content, re.DOTALL)
    if not m:
        print(f"WARN   {path.relative_to(REPO)} (no frontmatter)", file=sys.stderr)
        return False
    fm = yaml.safe_load(m.group(1)) or {}
    body = m.group(2)
    changed = False
    for k, v in updates.items():
        if fm.get(k) != v:
            fm[k] = v
            changed = True
    if not changed:
        return False
    new_fm = yaml.dump(fm, default_flow_style=False, sort_keys=False, width=10000).rstrip()
    new_content = f"---\n{new_fm}\n---\n{body}"
    if check:
        print(f"DRIFT  {path.relative_to(REPO)}", file=sys.stderr)
        return True
    path.write_text(new_content)
    print(f"wrote  {path.relative_to(REPO)}")
    return True


# --------------------------------------------------------------------------
# Per-client syncers — each returns True if drift/writes happened.
# --------------------------------------------------------------------------

def sync_claude_code(m: dict, check: bool) -> bool:
    """Plugin metadata at .claude-plugin/plugin.json + MCP at .mcp.json."""
    drift = False

    plugin_json = REPO / ".claude-plugin" / "plugin.json"
    existing = _read_json(plugin_json)
    new_plugin = {
        **existing,
        "name": m["name"],
        "version": m["version"],
        "description": m["description"].strip().replace("\n  ", " "),
        "author": m["author"],
        "repository": m["repository"],
        "keywords": m["keywords"],
        "license": m["license"],
    }
    drift |= _write_json(plugin_json, new_plugin, check)

    mcp_json = REPO / ".mcp.json"
    drift |= _write_json(mcp_json, render_mcp_claude(m["mcp_servers"]), check)

    return drift


def sync_kiro(m: dict, check: bool) -> bool:
    """Kiro POWER.md frontmatter + mcp.json."""
    drift = False

    power_md = REPO / "powers" / "service-approval" / "POWER.md"
    drift |= _update_md_frontmatter(power_md, {
        "name": m["name"],
        "displayName": "AWS Service Security Controls Generator",
        "description": m["description"].strip().replace("\n  ", " "),
        "keywords": m["keywords"],
        "author": m["author"]["name"],
    }, check)

    mcp_json = REPO / "powers" / "service-approval" / "mcp.json"
    drift |= _write_json(mcp_json, render_mcp_kiro(m["mcp_servers"]), check)

    return drift


def sync_copilot(m: dict, check: bool) -> bool:
    """Copilot plugin.json (awesome-copilot schema) + .vscode/mcp.json."""
    drift = False

    plugin_json = REPO / ".github" / "plugins" / "service-approval" / ".github" / "plugin" / "plugin.json"
    existing = _read_json(plugin_json)
    new_plugin = {
        **existing,
        "name": m["name"],
        "description": m["description"].strip().replace("\n  ", " "),
        "version": m["version"],
        "author": m["author"],
        "repository": m["repository"],
        "license": m["license"],
        "keywords": m["keywords"][:10],  # awesome-copilot schema caps at 10
    }
    drift |= _write_json(plugin_json, new_plugin, check)

    vscode_mcp = REPO / ".vscode" / "mcp.json"
    drift |= _write_json(vscode_mcp, render_mcp_vscode(m["mcp_servers"]), check)

    return drift


SYNCERS = {
    "claude-code": sync_claude_code,
    "kiro": sync_kiro,
    "copilot": sync_copilot,
}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true", help="Dry-run; exit 2 on drift")
    p.add_argument("--client", choices=list(SYNCERS.keys()), help="Sync one client only")
    args = p.parse_args()

    with MANIFEST_PATH.open() as f:
        manifest = yaml.safe_load(f)

    clients = [args.client] if args.client else list(SYNCERS.keys())
    any_drift = False
    for client in clients:
        any_drift |= SYNCERS[client](manifest, args.check)

    if args.check and any_drift:
        print("\nDrift detected. Run `python3 tools/sync-ide-configs.py` to fix.",
              file=sys.stderr)
        return 2
    if not any_drift:
        print("All in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
