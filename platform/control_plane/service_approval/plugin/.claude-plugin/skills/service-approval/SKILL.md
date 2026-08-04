---
name: service-approval-v3
description: Orchestrate all 9 service-approval agents (Intake → Assess → Research → Validate → Map → Generate → Test → Summarize → Evidence) to generate AWS security controls and compliant resource templates for any AWS service
disable-model-invocation: false
argument-hint: '[./input-folder] [--service=<name>] [--env=<profile>] [--skip-test] [--questions=<file>] [--dry-run] [--timeout=<minutes>] [--keep] [--include-unverified] [--clean] [--framework=<ccmv4|nist|cis|iso>] [--framework-file=<path>] [--from-intake=<file>] [--interactive]'
---

# Service Approval — Orchestrator v3

Coordinate the service-approval agents to produce a complete set of AWS security controls
and a compliant resource template for any AWS service.

**Pipeline**: Intake → Assess → Research (4 sub-skills) → Validate → Map (4 sub-skills) → Generate (3 sub-skills) → Test → Summarize → Evidence

Deployment intent (full-deploy / dry-run / skip / manual-cli) is captured upfront in
the Intake phase via `testing.mode` in `intake-manifest.json`. There is no separate
human-in-the-loop gate between Generate and Test — whatever Intake recorded is what
Phase 5 does. Phase 7 Evidence runs after Summarize when `testing.mode == full-deploy`
and Phase 5 succeeded.

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `./input-folder` | Path to folder with input files (.md, .json, .xlsx, .pdf, .docx) | None (MCP-only mode) |
| `--service=<name>` | AWS service ID (e.g., `bedrock-agentcore`) | Required if no folder |
| `--env=<profile>` | AWS CLI profile for Tester | None (skips Tester) |
| `--skip-test` | Skip Tester agent | false |
| `--dry-run` | Lint artifacts, do not deploy | false |
| `--timeout=<minutes>` | Config evaluation timeout | 30 |
| `--keep` | Keep deployed resources alive after Phase 7 Evidence completes (default: Phase 7 tears down). Phase 5 always defers teardown to Phase 7 when Phase 7 is in scope. | false |
| `--include-unverified` | Allow unverified items in generation | false |
| `--questions=<file>` | Path to SITCO Bar Questions file (.docx or .txt) — passed to Phase 0 | None |
| `--clean` | Delete existing .service-approval/ state before run | false |
| `--framework=<type>` | Control framework type (ccmv4, nist, cis, iso) — passed to Map phase | auto-detect |
| `--framework-file=<path>` | Explicit path to framework file — passed to Map phase | auto-detect from input folder |
| `--from-intake=<file>` | Path to intake YAML — Intake reads this instead of prompting | None |
| `--interactive` | Force Intake's interactive form even when other flags would satisfy it | false |

## Agnosticism Guardrails (apply to every sub-skill)

This pipeline is explicitly **AWS-service-agnostic** and **control-framework-agnostic**. Every
skill, sub-skill, validator, and generated artifact MUST honor these rules. They are binding
on all agents executing any phase of the pipeline.

### Service agnosticism

1. **No hardcoded service names in generic skills.** The service name (`Amazon ECS`,
   `AWS Lambda`, `Amazon S3`, etc.) is ALWAYS a runtime argument passed via `--service=<name>`.
   It never appears as a literal in skill files, validator code, or rule descriptions — only
   in examples explicitly labeled as illustrative (e.g., "e.g. `ecs:Create*`"). Service
   prefixes in rule bodies must come from `validated.json` / `sar-facts.json`, not assumption.

2. **Service-specific data belongs in data files, not code.** Lookup tables (`sar-slugs.json`,
   consumer specs, CFN prefixes) MUST live as JSON/YAML data files that any service can
   extend. Code that iterates these files must emit a WARNING on an unknown key — never
   silently skip.

3. **Sub-skills must read service identifiers from state.** `validated.json` has `service`
   and `capabilities.iam.service_prefix`. Sub-skills must read both from there, not infer
   them. The SAR page is the ground truth for any service-specific fact.

### Framework agnosticism

1. **No hardcoded framework names or objective IDs in generic skills.** Framework domain
   names (`CEK-03`, `IAM-04`, `AC-2`, `CIS 1.1`) appear ONLY in `map-parse-framework` and
   `map-framework-mapping` skills, which dispatch on the `--framework=<type>` argument. Never
   in `generate-*` skills, never in validators.

2. **Customer framework is supplied at runtime.** Every pipeline run takes
   `--framework-file=<path>` pointing at a customer-provided file (xlsx/json/md). No
   framework ships bundled except as a schema/parser reference.

### No service-specific helper scripts

Agents executing any phase MUST NOT create service-specific helper scripts in `scripts/`,
`.service-approval/<slug>/`, or `service-approval-plugin/`. If a one-off computation is
needed:
- Keep it inline in the agent's task (Python `python3 -c "..."` or Bash)
- Or write it under `/tmp/` for the duration of the run
- Never commit or persist a file named `build-<service>-*.py`, `fix-<service>-*.sh`, or
  similar. Durable tooling belongs in the plugin's own `tools/` tree and must be generic
  across services.

### Enforcement

- Every generic skill in this pipeline MUST state its agnosticism in its own header if it
  adds any consumer/service logic. If it cannot be generic (e.g., `map-parse-framework`
  for CCMv4), it MUST be a dedicated sub-skill that dispatches on argument.
- If an agent notices a rule, table, or validator check that would need rewriting to run
  on a different AWS service or a different framework, flag it as a CONTRADICTS-AGNOSTICISM
  finding and stop until resolved.

---

## Pipeline Audit Log

**Every phase logs to a single consolidated file:**

```
.service-approval/<slug>/pipeline.log
```

This is the primary debugging artifact. Hooks (PostToolUse, Stop,
check_phase_complete), MCP calls, skill lifecycle (start/end/retry/halt),
and subprocess invocations all append to the same file in chronological
order. When something breaks, `tail -50 .service-approval/<slug>/pipeline.log`
shows the failure plus the last few causally-relevant events.

**Line format:**

```
<UTC-iso8601> [<phase>] [<source>:<verdict>]  <message> [k=v ...]
```

**Sources:**
- `hook:post-tool-use` / `hook:stop` / `hook:check-phase-complete` — validation hooks
- `mcp:<server>` — MCP calls (verdict `call` or `response`)
- `skill:<skill-name>` — skill lifecycle (verdict `start` / `end` / `retry` / `halt`)
- `script:<script-name>` — subprocess invocations (smoke-deploy-test.sh, etc.)

**How skills emit events:**

Skills SHOULD log a `start` event at the top and an `end` (or `halt`) event
at the bottom — this is what makes `pipeline.log` useful for debugging
("which phase started, when did it finish, did it halt?"). Coverage is
being added to skills incrementally; today the canonical example is
`skills/map-assemble/SKILL.md`. Until every skill emits these events,
gaps in `pipeline.log` mean "skill ran without lifecycle logging," not
"phase didn't run." Use the bash CLI:

```bash
# At skill start:
python3 -m tools.validate.log --slug <slug> --phase <NN-phase> \
    --source skill:<skill-name> --verdict start \
    --message "<one-line summary of what this run will do>"

# At skill end:
python3 -m tools.validate.log --slug <slug> --phase <NN-phase> \
    --source skill:<skill-name> --verdict end \
    --message "<one-line summary of outcome>"

# When retrying (e.g. after a hook auto-fix):
python3 -m tools.validate.log --slug <slug> --phase <NN-phase> \
    --source skill:<skill-name> --verdict retry \
    --message "<reason>" --extra attempt=2
```

**Backward compatibility:** the old `mcp-calls.log` is still written as
a shadow file (whenever an `mcp:*` event lands in pipeline.log, it's
mirrored to `mcp-calls.log` too). Tools that grep `mcp-calls.log`
continue to work; new tooling should read `pipeline.log`.

---

## Prerequisites

### MCP Pre-flight Check

Before doing anything else, verify all required MCP servers are available. Run this check
automatically — do not ask the user. Install any that are missing.

Required MCPs (all from https://github.com/awslabs/mcp):

| Name | Transport | Endpoint / Command |
|------|-----------|-------------------|
| `awsknowledge` | HTTP | `https://knowledge-mcp.global.api.aws` |
| `aws-documentation` | HTTP | `https://mcp.awsdocs.amazon.com` |
| `awsiac` | HTTP | `https://iac-mcp.global.api.aws` |
| `aws-cdk-mcp-server` | stdio | `npx -y @aws/cdk-mcp-server@latest` |

**Step 1 — Detect environment** (reuse the same logic as Environment Detection below):
- `Agent` tool in tool list → Claude Code
- `KIRO_AGENT` env var set → Kiro
- `GITHUB_COPILOT` env var set → GitHub Copilot (VS Code)
- Otherwise → Generic (Aider, Continue, other)

**Step 2 — Check and install missing MCPs:**

**Claude Code:**
```bash
INSTALLED=$(claude mcp list 2>/dev/null)
for MCP in awsknowledge aws-documentation awsiac aws-cdk-mcp-server; do
  echo "$INSTALLED" | grep -q "$MCP" && echo "OK: $MCP" || echo "MISSING: $MCP"
done
```
For each MISSING entry, run the corresponding add command:
```bash
claude mcp add --transport http awsknowledge https://knowledge-mcp.global.api.aws
claude mcp add --transport http aws-documentation https://mcp.awsdocs.amazon.com
claude mcp add --transport http awsiac https://iac-mcp.global.api.aws
claude mcp add aws-cdk-mcp-server -- npx -y @aws/cdk-mcp-server@latest
```
After adding any MCP, inform the user: "Added missing MCP servers: <list>. They are now active."

**Step 3 — Handle MCPs that are registered but failing to connect:**
If any MCP is listed but shows "Failed to connect" or is unreachable, warn the user:
```
MCP degraded coverage:
  aws-documentation UNREACHABLE — Research and Validate will fall back to web search.
  awsiac UNREACHABLE — Generate will use best-effort generation.
```
Do NOT block execution — continue with degraded coverage and note it in the final report.

**Kiro:**

> **Update (2026-05-18):** the Kiro CLI 2.0 (`kiro-cli`) install path was
> removed from `install.sh`. Path 1 below describes the legacy symlink
> install that is no longer wired automatically; Path 2 (manual IDE install
> via the Powers panel) is the supported flow today. Kiro CLI 2.0 may
> remain as a manually-installed runtime — the runtime decision is being
> re-evaluated.

Kiro has two install paths (see `install.sh`); MCP-config handling differs between them.

**Path 1 — Power install (CLI 2.0, recommended).** If the user installed via
`kiro-cli power install --local powers/service-approval`, the Power bundles its own
MCP config at `powers/service-approval/mcp.json` and registers it with Kiro
automatically. **Do NOT hand-edit `~/.kiro/settings/mcp.json`** — that would shadow or
duplicate the Power-bundled entries. Detect the Power install with:

```bash
kiro-cli power list 2>/dev/null | grep -q "service-approval" && echo "Power installed" || echo "Power NOT installed"
```

If the Power is installed:
- The MCPs are already wired via `powers/service-approval/mcp.json` (generated from
  `manifest.yaml` by `tools/sync-ide-configs.py`). No action needed at runtime.
- If MCPs appear unreachable in Kiro, instruct the user to run
  `kiro-cli power install --local <repo>/powers/service-approval` again to re-register
  the Power, then restart Kiro.

**Path 2 — Manual IDE install.** If the user installed by copying
`powers/service-approval/{steering,ide/*}` → `.kiro/` (the path `install.sh` falls back
to when `kiro-cli` is not available), Kiro reads `~/.kiro/settings/mcp.json` for MCP
config. Detect this path by:

```bash
test -d .kiro && ! kiro-cli power list 2>/dev/null | grep -q "service-approval" && echo "Manual install"
```

For each missing MCP under Path 2, add it to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "awsknowledge":       { "type": "http", "url": "https://knowledge-mcp.global.api.aws" },
    "aws-documentation":  { "type": "http", "url": "https://mcp.awsdocs.amazon.com" },
    "awsiac":             { "type": "http", "url": "https://iac-mcp.global.api.aws" },
    "aws-cdk-mcp-server": { "command": "npx", "args": ["-y", "@aws/cdk-mcp-server@latest"] }
  }
}
```

Merge (do not overwrite existing entries). Write back the updated file.
After writing, inform the user: "Added missing MCP servers to
`~/.kiro/settings/mcp.json`: <list>. Restart Kiro if this is the first time adding them."

**If neither path is detected:** the Power is not installed. Instruct the user to run
`./install.sh` from the repo root, then restart Kiro.

**GitHub Copilot (VS Code):**
Copilot in VS Code reads workspace-scoped `.vscode/mcp.json` automatically.
The repo ships this file generated from `manifest.yaml` via
`tools/sync-ide-configs.py`, so no install action is needed at runtime —
only verification.

```bash
test -f .vscode/mcp.json && echo "OK: .vscode/mcp.json present" || echo "MISSING: .vscode/mcp.json"
```

If present:
- Inform the user: "Copilot will auto-discover MCP servers from
  `.vscode/mcp.json` when this repo is opened in VS Code. If Copilot is
  already running, reload the window (Cmd/Ctrl+Shift+P → 'Developer:
  Reload Window') to pick up changes."
- Note: Copilot's MCP schema uses `{"servers": {...}}` (NOT
  `{"mcpServers": {...}}` like other clients). The sync tool already
  emits the correct schema; do not hand-edit.

If absent:
- Tell the user: "Run `python3 tools/sync-ide-configs.py` to regenerate
  `.vscode/mcp.json` from `manifest.yaml`, then reload the VS Code
  window."

**Generic (Aider, Continue, other):**
Print instructions for each missing MCP and continue — do not block execution:
```
Missing MCP servers detected. Add these to your IDE's MCP configuration:
  awsknowledge:       { "type": "http", "url": "https://knowledge-mcp.global.api.aws" }
  aws-documentation:  { "type": "http", "url": "https://mcp.awsdocs.amazon.com" }
  awsiac:             { "type": "http", "url": "https://iac-mcp.global.api.aws" }
  aws-cdk-mcp-server: { "command": "npx", "args": ["-y", "@aws/cdk-mcp-server@latest"] }
See: https://github.com/awslabs/mcp
Continuing with degraded MCP coverage — some steps may fall back to web search.
```

- [ ] If `--clean` was passed:
  ```bash
  # Clean all service-specific state trees
  rm -rf .service-approval/*/
  # Preserve plans/ directory if it exists
  mkdir -p .service-approval/plans
  ```

- [ ] Check for stale state — if any `.service-approval/<slug>/` directories exist AND `--clean` was NOT passed:
  Tell the user: "Existing service state found. Use --clean to start fresh, or I'll
  run all phases again and overwrite. Proceeding with fresh run."
  Then continue — NEVER silently read or report from old state files.

- [ ] Phase 0 Intake + Assess will create the service-specific directories automatically.
  No pre-creation needed. The canonical slug is derived after SAR facts are loaded.

- [ ] Validate required input:
  If no `./input-folder` AND no `--service` AND no `--from-intake`, the Intake
  phase below will prompt the user interactively. If Intake is running in
  non-interactive mode (e.g., `--from-intake=<file>`) and required fields are
  missing, Intake halts with an error. Do NOT try to resolve the service name
  here — defer to Intake.

## Environment Detection

Detect execution environment to choose parallelism strategy:

```bash
env | grep -E 'KIRO_AGENT|GITHUB_COPILOT' 2>/dev/null
```

Additionally: check whether the `Agent` tool appears in your available tool list.
If it does, treat this as Claude Code regardless of env var results.

Decision logic:
- `Agent` tool available in tool list → **Claude Code — use Parallel Mode** (see below)
- `KIRO_AGENT` env var set → **Kiro — Sequential Mode**
- `GITHUB_COPILOT` env var set → **GitHub Copilot — Sequential Mode**
- No signals detected → **Sequential Mode** (safe default)

---

## Sequential Mode (default for all non-Claude-Code clients)

Run each phase in order. Pass all relevant flags through.

### Intake (Precursor — Mandatory)
Follow ALL instructions in `skills/intake/SKILL.md` exactly.
Pass: `--service`, `--from-intake` if provided, `--interactive` if provided,
and any of `--env`, `--framework`, `--framework-file`, `--skip-test`, `--dry-run`,
`--keep`, `--timeout` the user supplied at the orchestrator level (Intake uses
them to pre-fill its form / intake manifest).

When done: verify `.service-approval/_staging/<ts>/00-intake/intake-manifest.json`
exists before proceeding (it gets promoted to `<slug>/00-intake/` by Phase 0
Step 0b after slug derivation). From that manifest, resolve the effective `--service`, `--framework`,
`--framework-file`, input folder, and Phase 5 intent (CLI flags still override;
see Phase 5 resolution below).

**Intake always runs.** The intake skill itself decides whether to prompt
interactively or short-circuit:

- If `./service-approval-intake.yaml` exists in the user's CWD and
  `--interactive` was not passed, the skill renders a summary and prompts
  `[U]se as-is / [E]dit`. "Use as-is" is the short-circuit path.
- If `--from-intake=<path>` is provided, the skill reads that file (no prompts).
- Otherwise the skill runs the full interactive form and offers to save the
  answers to `./service-approval-intake.yaml`.

**Plugin-repo guard:** Files inside the installed plugin
(`skills/intake/intake-template.yaml`, `skills/intake/defaults.yaml`) are never
auto-loaded as user intake — they are templates/defaults shared across users.

`--clean` deletes the entire `.service-approval/` tree (all per-slug service
dirs and any `_staging/` snapshots) but does **not** delete the user's
`./service-approval-intake.yaml`.

### Phase 0: Assess (Mandatory)
Follow ALL instructions in `skills/assess/SKILL.md` exactly.
Pass: input folder path (from intake), `--service` flag, `--questions` flag if provided.
When done: verify these files exist before proceeding:
- `.service-approval/<slug>/01-assess/sar-facts.json`
- `.service-approval/<slug>/01-assess/checkpoint-results.json`
- `.service-approval/<slug>/01-assess/assessment-summary.md`
- `.service-approval/<slug>/01-assess/iac-support.json`

**Skip condition**: Phase 0 is skipped ONLY if all four assessment artifacts already
exist (from a previous `/assess` run). There is no flag to skip assessment.

### Phase 1: Research (3+1 sub-skills, sequential in this mode)

**Step 1a — Mitigations:**
Follow ALL instructions in `skills/research-mitigations/SKILL.md`.
Pass: `./input-folder`, `--service`.
Wait for `.service-approval/<slug>/02-research/research-mitigations.json`.

**Step 1b — Capabilities:**
Follow ALL instructions in `skills/research-capabilities/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/02-research/research-capabilities.json`.

**Step 1c — API Surface:**
Follow ALL instructions in `skills/research-api-surface/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/02-research/research-api-surface.json`.

**Step 1d — Threat Attack Surface (optional but recommended):**
Follow ALL instructions in `skills/research-attack-surface/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/02-research/research-attack-surface.json`.
**Auto-trigger rule:** Run this step if ANY file in the input folder matches threat model
patterns: `*MITRE*`, `*ATT&CK*`, `*attack*`, `*STRIDE*`, `*threat*model*`, `*threat*catalog*`.
Skip ONLY if no threat model file is present in the input folder AND no customer threat
model input was provided.

**Step 1e — Merge:**
Run the merge step from `skills/research/SKILL.md` → "Merge Step" section.
Verify `.service-approval/<slug>/02-research/research.json` exists and has `schema_version: "3.0"`.

### Phase 2: Validate
Follow ALL instructions in `skills/validate/SKILL.md` exactly.
When done: verify `.service-approval/<slug>/03-validate/validated.json` exists before proceeding.

### Phase 3: Map (4 sub-skills, sequential in this mode)

**Step 3a — Parse Framework:**
Follow ALL instructions in `skills/map-parse-framework/SKILL.md`.
Pass: `--framework` and `--framework-file` flags if provided.
Wait for `.service-approval/<slug>/04-map/map-framework-parsed.json`.

**Step 3b — Generate Controls:**
Follow ALL instructions in `skills/map-generate-controls/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/04-map/map-controls-generated.json`.

**Step 3c — Framework Mapping:**
Follow ALL instructions in `skills/map-framework-mapping/SKILL.md`.
Wait for `.service-approval/<slug>/04-map/map-framework-mapped.json`.

**Step 3d — Assemble:**
Follow ALL instructions in `skills/map-assemble/SKILL.md`.
Verify these files exist before proceeding:
- `.service-approval/<slug>/04-map/mapping-results.json`
- `.service-approval/<slug>/04-map/controls-catalog.md`
- `.service-approval/<slug>/04-map/framework-mapping.md`

### Phase 4: Generate (3 sub-skills, sequential in this mode)

**Step 4a — Preventive/Proactive:**
Follow ALL instructions in `skills/generate-preventive/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `<slug>/05-generate/preventive/` and `<slug>/05-generate/proactive/` to be populated.

**Step 4b — Detective/Responsive:**
Follow ALL instructions in `skills/generate-detective/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `<slug>/05-generate/detective/` and `<slug>/05-generate/responsive/` to be populated.

**Step 4c — IaC Templates:**
Follow ALL instructions in `skills/generate-iac/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `<slug>/05-generate/iac/` to have all 4 formats.

**Step 4d — Final Validation:**
Run the final validation from `skills/generate/SKILL.md` → "Final Validation" section.

### Phase 5: Test

Resolve Phase 5 intent in this order (CLI flags > intake > default):

1. If `--skip-test` was passed on the command line → skip.
2. Else if `--dry-run` was passed → run `skills/test/SKILL.md` with `--dry-run`
   (use `--env` if provided, else Tier 1 only).
3. Else if `--env=<profile>` was passed → run `skills/test/SKILL.md` in full mode
   with that profile.
4. Else read `.service-approval/<slug>/00-intake/intake-manifest.json` → `testing.mode`
   (or the staging path if Phase 0 hasn't yet promoted):
   - `skip` or `manual-cli` → skip Phase 5. (Summarize handles the manual-cli
     cheat-sheet render.)
   - `dry-run` → run `skills/test/SKILL.md` with `--dry-run`; pass `--env` if
     `testing.aws_profile` is set.
   - `full-deploy` → run `skills/test/SKILL.md` in full mode with
     `--env=<testing.aws_profile>` and `--timeout=<testing.timeout_minutes>`.
     **Do NOT pass `--keep` to Phase 5.** Phase 5 always leaves the stack
     alive when Phase 7 will run; the user's `testing.keep` preference is
     consumed by Phase 7 (which tears down at the end of evidence collection
     unless `keep == true`). If Phase 7 is being skipped (e.g. orchestrator
     was invoked with `--no-evidence` or `--env` is missing for Phase 7),
     pass `--no-evidence` to Phase 5 so it reverts to the legacy
     deploy-and-teardown behavior.
5. If `intake-manifest.json` is missing (orchestrator invoked without Intake)
   and no CLI flags were provided → skip Phase 5 with a warning.

### Phase 6: Summarize
Follow ALL instructions in `skills/summarize/SKILL.md` exactly.
Report the final verdict to the user.

### Phase 7: Evidence (Optional — requires AWS credentials)
**NEW:** If `--env` was provided AND Phase 5 Test deployed resources successfully (not --dry-run):
Run the Evidence skill to perform AWS CLI attestation against deployed resources.

Follow ALL instructions in `skills/evidence/SKILL.md` exactly.
Pass: `--env`, `--service=<slug>` flags.

If `--skip-test` or `--dry-run` or Phase 5 was skipped: skip this phase entirely
AND write a skip artifact so the audit trail isn't a hole:

```python
import json
from datetime import datetime, timezone
from tools.paths import phase_dir

evidence_dir = phase_dir(slug, "evidence")
evidence_dir.mkdir(parents=True, exist_ok=True)
skip_reason = (
    "Phase 5 Test was skipped or did not deploy resources. "
    "Phase 7 requires a live deployed stack (06-test/deployed-resources.json) "
    "to probe via AWS CLI. Re-run with --env=<profile> in full-deploy mode "
    "to enable Phase 7."
)
skip_artifact = {
    "schema_version": "1.0",
    "phase": "evidence",
    "skipped": True,
    "skipped_at": datetime.now(timezone.utc).isoformat(),
    "skip_reason": skip_reason,
    "preconditions_failed": [
        "phase_5_test_run",
        "deployed_resources_present",
    ],
}
(evidence_dir / "phase-skipped.json").write_text(json.dumps(skip_artifact, indent=2))
```

**Stack lifecycle:** Phase 5 left the stack alive (`teardown_status:
"deferred_to_phase_7"` in `06-test/test-results.json`). Phase 7 reads
`06-test/deployed-resources.json`, probes the stack via AWS CLI, then tears
it down at the end of Step 11 — UNLESS `intake-manifest.json.testing.keep ==
true`, in which case Phase 7 leaves the stack alive for manual debugging and
records `teardown_status: "skipped_keep_true"`. See skills/evidence/SKILL.md
Step 11 for the exact teardown procedure.

Evidence produces:
- `<slug>/08-evidence/attestation-report.md` — control x CLI x verdict matrix
- `<slug>/08-evidence/attestation-results.json` — machine-readable verdicts (includes `teardown_status`)
- `<slug>/08-evidence/summary.md` — top-level triage digest
- `<slug>/attestation.md` — reviewer's audit guide (service tree manifest)

---

## Parallel Mode (Claude Code only — Agent tool available)

Leverage the Agent tool to parallelize independent sub-skills within each phase.

### Intake (Precursor — Mandatory)
Always dispatch Intake — the intake skill itself decides whether to prompt or
short-circuit (see "Discovery Rules" in `skills/intake/SKILL.md`):

- If `./service-approval-intake.yaml` exists in CWD and `--interactive` was not
  passed, the skill renders a summary and prompts `[U]se as-is / [E]dit`.
- If `--from-intake=<path>` is set, the skill reads that path with no prompts.
- Otherwise the skill runs the full interactive form and offers to save.

Dispatch Intake as a foreground subagent with the full text of
`skills/intake/SKILL.md`, plus `--service`, `--from-intake`, `--interactive`, and
any pre-Intake CLI flags the user passed (`--env`, `--framework`, `--framework-file`,
`--skip-test`, `--dry-run`, `--keep`, `--timeout`).
Wait for `.service-approval/_staging/<ts>/00-intake/intake-manifest.json` (Intake's pre-promotion landing zone).

Plugin-repo files (`skills/intake/intake-template.yaml`,
`skills/intake/defaults.yaml`) are never auto-loaded as user intake. `--clean`
clears the entire `.service-approval/` tree (all per-slug service dirs and
any `_staging/` snapshots) but does not touch the user's
`./service-approval-intake.yaml`.

### Phase 0: Assess (Mandatory)
If all 4 assessment artifacts (`sar-facts.json`, `checkpoint-results.json`,
`assessment-summary.md`, `iac-support.json`) already exist, skip (previous
`/assess` run).
Otherwise: dispatch Assessor as foreground subagent.
Wait for all 4 assessment artifacts.

### Phase 1: Research (3 required sub-skills in parallel, +1 conditional)

Dispatch the 3 required research sub-skills simultaneously as background subagents:

```
Agent 1: research-mitigations (background)
  Prompt: Full text of skills/research-mitigations/SKILL.md + input folder + --service flag
  Output: research-mitigations.json

Agent 2: research-capabilities (background)
  Prompt: Full text of skills/research-capabilities/SKILL.md + --service flag
  Output: research-capabilities.json

Agent 3: research-api-surface (background)
  Prompt: Full text of skills/research-api-surface/SKILL.md + --service flag
  Output: research-api-surface.json
```

**Conditionally dispatch a 4th agent — research-attack-surface — ONLY when a
threat model is present.** Apply the same auto-trigger rule as Sequential Mode
(lines 408-411): scan `./input/` for files matching any of these patterns:
`*MITRE*`, `*ATT&CK*`, `*attack*`, `*STRIDE*`, `*threat*model*`, `*threat*catalog*`.
If at least one file matches OR the user supplied an explicit threat model
input, add this 4th agent to the dispatch:

```
Agent 4 (conditional): research-attack-surface (background)
  Prompt: Full text of skills/research-attack-surface/SKILL.md + --service flag
  Output: research-attack-surface.json
```

**Skip Agent 4 entirely** when no threat model file is present and no customer
threat model input was provided. Skipping it saves one full subagent
cold-start (~30-60s + Bedrock latency) per run, which adds up across the fleet.
The research-merge step already treats `research-attack-surface.json` as
optional and won't fail when it's absent.

**IMPORTANT:** Dispatch all required (and conditional, if triggered) sub-skills
in a single message with parallel Agent tool calls. Do NOT set `model`
parameter — let subagents inherit the caller's model.

When the dispatched agents complete, run the merge step from
`skills/research/SKILL.md`:
- Combine the 3 required partial JSONs into `research.json`
- If `research-attack-surface.json` exists, merge its data into `attack_surface`
  (when Agent 4 was skipped, this is a no-op)
- Run the validation script
- If CRITICAL cross-reference errors exist (actions missing from both operations[] and
  permission_only_actions[]), re-dispatch the api-surface agent with the missing action list

### Phase 2: Validate
Dispatch Validator as foreground subagent.
Provide full text of `skills/validate/SKILL.md`.
Wait for `validated.json`.

### Phase 3: Map (4 sub-skills, 2 parallel + 2 sequential)

**Steps 3a+3b: Parallel dispatch**

Dispatch both independent sub-skills simultaneously as background subagents:

```
Agent 3a: map-parse-framework (background)
  Prompt: Full text of skills/map-parse-framework/SKILL.md + framework flags
  Output: map-framework-parsed.json

Agent 3b: map-generate-controls (background)
  Prompt: Full text of skills/map-generate-controls/SKILL.md + --service flag
  Output: map-controls-generated.json
```

**IMPORTANT:** Dispatch both in a single message with 2 Agent tool calls.

**Step 3c: Framework mapping (foreground, after 3a+3b complete)**

When both complete, dispatch as foreground subagent:

```
Agent 3c: map-framework-mapping (foreground)
  Prompt: Full text of skills/map-framework-mapping/SKILL.md
  Input: map-framework-parsed.json + map-controls-generated.json
  Output: map-framework-mapped.json
```

This is the most reasoning-heavy step — MUST run in foreground to ensure quality gates pass.

**Step 3d: Assembly (foreground, after 3c completes)**

Dispatch as foreground subagent:

```
Agent 3d: map-assemble (foreground)
  Prompt: Full text of skills/map-assemble/SKILL.md
  Input: All 3 intermediate files + validated.json
  Output: mapping-results.json + controls-catalog.md + framework-mapping.md
```

Wait for `mapping-results.json`, `controls-catalog.md`, `framework-mapping.md`.

### Phase 4: Generate (3 sub-skills in parallel)

Dispatch all 3 generate sub-skills simultaneously as background subagents:

```
Agent 4: generate-preventive (background)
  Prompt: Full text of skills/generate-preventive/SKILL.md + --service + --include-unverified
  Output: <slug>/05-generate/preventive/ + <slug>/05-generate/proactive/

Agent 5: generate-detective (background)
  Prompt: Full text of skills/generate-detective/SKILL.md + --service + --include-unverified
  Output: <slug>/05-generate/detective/ + <slug>/05-generate/responsive/

Agent 6: generate-iac (background)
  Prompt: Full text of skills/generate-iac/SKILL.md + --service + --include-unverified
  Output: <slug>/05-generate/iac/
```

**IMPORTANT:** Dispatch all 3 in a single message with 3 Agent tool calls.

When all 3 complete, run the final validation from `skills/generate/SKILL.md`.
If any IaC templates are missing, re-dispatch the generate-iac agent.

### Phase 5: Test

Apply the same resolution as Sequential Mode (CLI flags > intake.testing.mode >
default skip). If the resolution produces a run, dispatch Tester as a foreground
subagent with the resolved `--env` / `--dry-run` / `--keep` / `--timeout` flags.

### Phase 6: Summarize
Dispatch Summarizer as foreground subagent.
Wait for `APPROVAL-REPORT.md`.

### Parallelism Summary

```
Intake                    (1 agent, foreground — precursor)
Phase 0: Assess          (1 agent, foreground)
Phase 1: Research         (3 required agents in parallel, +1 conditional, then merge)
  1a: Mitigations         (background) ─┐
  1b: Capabilities        (background) ─┤
  1c: API Surface         (background) ─┤
  1d: ATT&CK Surface      (conditional) ─┤  ← only when threat-model file in input
                                        └─ 1e: Merge (foreground)
Phase 2: Validate         (1 agent, foreground)
Phase 3: Map              (2 agents in parallel, then 2 sequential)
  3a: Parse Framework     (background) ─┐
  3b: Generate Controls   (background) ─┤
                                        ├─ 3c: Framework Mapping (foreground)
                                        └─ 3d: Assemble          (foreground)
Phase 4: Generate         (3 agents in parallel, then validate)
Phase 5: Test             (1 agent, foreground — gated by intake.testing.mode)
Phase 6: Summarize        (1 agent, foreground)
```

Total agents: up to 14 (vs 8 in monolithic mode), but with 3 parallelization windows
that significantly reduce wall-clock time.

If any agent exceeds `--timeout` minutes, proceed to Summarizer with partial results.
Summarizer marks the timed-out agent as INCOMPLETE in the report.

---

## Final Output

```
Service Approval complete.
Report: .service-approval/APPROVAL-REPORT.md
Controls: .service-approval/<slug>/05-generate/
Verdict: <APPROVED|APPROVED WITH EXCEPTIONS|REQUIRES REMEDIATION>
```
