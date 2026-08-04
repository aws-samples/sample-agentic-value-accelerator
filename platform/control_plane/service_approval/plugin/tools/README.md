# `tools/`

Shared scripts for validation, MCP integration, post-processing, and cross-IDE sync. Every agentic client (Claude Code, Kiro) reaches into this directory through its own hook or command system.

| Dir / File | Purpose |
|------------|---------|
| `validate/` | Python validators for state files, controls, deployability, and pipeline integrity. Run at `PostToolUse` and `Stop` hook time. |
| `kb-search-mcp/` | Local MCP server that proxies a Bedrock Knowledge Base (customer-specific mitigations lookup). |
| `post-process/` | Deterministic post-processors that run after the pipeline (e.g., canonicalizing output JSON shapes). |
| `sync-ide-configs.py` | Regenerates per-client manifests from `manifest.yaml`. |

## Sync tool

```bash
python3 tools/sync-ide-configs.py           # write client manifests
python3 tools/sync-ide-configs.py --check   # dry-run; exit 2 if drift
python3 tools/sync-ide-configs.py --client=kiro   # one client only
```

Edit `manifest.yaml` at the repo root. Never edit the per-client manifests directly — they'll be overwritten by the next sync. CI will fail if you do.

### What it syncs

| Client | Manifest generated |
|--------|--------------------|
| Claude Code | `.claude-plugin/plugin.json` |
| Kiro Power | `powers/service-approval/POWER.md` (frontmatter only; body preserved) |
| Copilot plugin | `.github/plugins/service-approval/.github/plugin/plugin.json` |

Body content (Kiro POWER.md body, Copilot plugin README) is NOT touched. Those are human-edited.

## Validators

| Script | Scope | When it runs |
|--------|-------|--------------|
| `validate/validate_state.py` | Schema + cross-file integrity for state files | PostToolUse |
| `validate/validate_controls.py` | Generated artifact checks (SCP format, IaC parameterization) | PostToolUse |
| `validate/validate_deployable.py` | Tier 1 (static) + Tier 2 (AWS API) deployability | Stop, or manual |
| `validate/validate_pipeline_integrity.py` | P1–P7 (see module docstring for the full list) | Stop |
| `validate/validate_kms_consumers.py` | KMS key policy ↔ consumer resource cross-check | PostToolUse |
| `validate/validate_cross.py` | Cross-artifact consistency | Stop |
| `validate/_schemas.py` | Shared JSON Schema helper (wraps the schemas under `/schemas/`) | library |

### Entry points

- `validate/hook_post_tool_use.py` — single entrypoint invoked by every client's PostToolUse hook
- `validate/hook_stop.py` — single entrypoint invoked by every client's Stop/sessionEnd hook

Client-specific hook configs (Claude Code `hooks.json`, Kiro `ide/hooks/stop.kiro.hook`, Copilot `.github/hooks/pipeline-integrity/validate.sh`) all call these same two scripts. One source of truth.

## Running tests

```bash
python3 -m pytest tools/validate/
```

Run `python3 -m pytest tools/validate/ -q` for the current count (the `python3 -m` form is required so `tools/` is on `sys.path` for `test_paths.py` and `test_slug.py`). Covers `_schemas.py`, `validate_state.py`, `validate_deployable.py`, `validate_controls.py`, `validate_botocore_enrichment.py`, `validate_kms_consumers.py`, `validate_pipeline_integrity.py`, `_hook_log.py`, `hook_stop.py`, `log.py`, `slug.py`, `paths.py`, and `check_phase_complete.py`.
