---
name: intake
description: >
  Precursor intake phase for the Service Approval pipeline. Collects service name, input type,
  and testing preferences. Produces intake-manifest.json consumed by all downstream phases.
  Supports file-based input (intake YAML) for repeatable, batch-friendly execution.
disable-model-invocation: false
argument-hint: "[--service=<name>] [--from-intake=<file>] [--interactive]"
---

# Service Approval — Intake

Collect and validate inputs before the pipeline begins. This phase runs before Phase 0
(Assess) and produces a manifest that configures the downstream pipeline.

**IaC format selection is NOT part of intake.** The Assess phase (Phase 0) discovers which
IaC providers support the target service and presents the available options to the user.
This ensures format decisions are based on facts, not guesses.

---

## Background — What This Tool Does

The **Service Approval Pipeline** generates a complete set of AWS security controls for any
AWS service. It produces:

| Category | What you get |
|----------|--------------|
| **Proactive controls** | CFN Guard rules, CloudFormation hooks, Checkov policies, OPA policies |
| **Preventive controls** | SCPs, RCPs, declarative policies, permission boundaries, tag policies, resource policies, KMS key policies |
| **Detective controls** | AWS Config rules (with Lambda handlers), EventBridge rules, CloudWatch alarms, Access Analyzer configurations |
| **Responsive controls** | Lambda auto-remediators, SSM runbooks, Step Functions remediation workflows |
| **Compliant IaC templates** | Automatically determined based on provider support (CloudFormation, Terraform, CDK, CDKTF) |
| **Framework mapping** | Controls mapped to CCMv4 objectives (other frameworks are out of scope for now) |
| **Threat model** | MITRE ATT&CK technique mapping with tactic coverage analysis (optional) |

The pipeline verifies every claim via MCP servers (no hardcoded training data), maps controls
to your chosen compliance framework, and produces deployable artifacts — not just documentation.

**Typical output:** per-service files across 5 control categories (preventive,
proactive, detective, responsive, IaC), a framework coverage matrix, and a
final approval report with verdict.

---

## Input Modes

### Mode 1: Explicit intake file

```bash
service-approval --from-intake=path/to/my-service.yaml
```

Reads the YAML at the given path. No interactive prompts unless required fields
are missing. CLI flag wins over auto-discovery.

### Mode 2: Auto-discovered project intake (recommended for repeated runs)

If `./service-approval-intake.yaml` exists in the user's current working
directory, it is loaded automatically. The user is shown a summary and given
two choices: **[U]se as-is** or **[E]dit a field** (see "Existing Intake Flow"
below). This is the path most users hit on their second and subsequent runs.

### Mode 3: Interactive (first-time path)

When no intake YAML is found and no flags are provided, present the full intake
form. After the user confirms, **offer to save** the answers to
`./service-approval-intake.yaml` so the next run can auto-discover them.

### Mode 4: CLI flags

```bash
service-approval --service=s3 ./input --env=my-profile --framework=ccmv4
```

All required fields provided via flags — no prompts needed. `--interactive`
forces the full prompt flow even when a YAML or manifest exists (escape hatch).

---

## Discovery Rules

Resolution order, highest priority first:

1. **`--from-intake=<path>` flag** — explicit, always honored.
2. **`./service-approval-intake.yaml` in CWD** — auto-discovered. Show summary,
   prompt `[U]se as-is / [E]dit`.
3. **None found** — fall through to the interactive form (first-time path).

**Plugin-repo guard:** Files inside the installed plugin directory
(`skills/intake/intake-template.yaml`, `skills/intake/defaults.yaml`, anything
under the plugin root) are **never** auto-loaded as user intake. They are
templates and org defaults, not user data. Reject any auto-discovery path that
resolves inside the plugin install dir; if `--from-intake` explicitly points
there, warn and refuse.

`--interactive` short-circuits steps 1 and 2 — always run the full prompt flow.

---

## Existing Intake Flow

When `./service-approval-intake.yaml` is found (and `--interactive` was not
passed), render a digestible summary and prompt:

```
┌─ Existing intake found: ./service-approval-intake.yaml ─┐
│  Service:        {friendly_name} ({service-id})         │
│  Framework:      {framework_type}                       │
│  Testing mode:   {full-deploy | dry-run | skip | manual-cli} │
│  AWS profile:    {profile or n/a}                       │
│  Region:         {region}                               │
│  ATT&CK Mapping: {Yes | No}                             │
└─────────────────────────────────────────────────────────┘

[U]se as-is   [E]dit a field   (default: U)
```

- **Use as-is** (default): proceed with the loaded values, write the manifest,
  continue to Phase 0.
- **Edit a field**: walk the user through the intake fields one at a time with
  current values pre-filled. The user accepts each (Enter) or overrides. After
  edits, write the updated YAML back to `./service-approval-intake.yaml` and
  continue.

There is no "fresh start" option in this prompt. To start over, the user
deletes `./service-approval-intake.yaml` or passes `--interactive`.

---

## First-Time Save Prompt

After the interactive form completes (Mode 3), before writing the runtime
manifest, ask:

```
Save these answers to ./service-approval-intake.yaml so future runs skip
the prompts? (Y/n)
```

If yes, serialize the collected fields into the YAML schema from
`intake-template.yaml` and write to the user's CWD. Do **not** write into the
plugin repo.

---

## Environment-Adaptive Input Protocol

The form below is rendered **interactively** — one question at a time, waiting
for the user's answer before continuing. How you do that depends on what your
runtime offers. Pick the right branch on first use and stick with it for the
whole intake.

### Branch detection

| Signal | Branch |
|--------|--------|
| Your tool list includes `AskUserQuestion` (Claude Code) | Use **Branch A** |
| Your tool list includes any sanctioned blocking ask-user primitive (a future Kiro elicitation tool, an MCP elicitation tool, etc.) | Use **Branch A** with that tool's name in place of `AskUserQuestion` |
| Neither — you're in a chat pane (Kiro IDE, generic CLI, GitHub Copilot chat) | Use **Branch B** |

Do not invent a tool that isn't present. If unsure, fall through to Branch B.

### Branch A — Sanctioned ask-user tool available

For each question in "Intake Form Fields" below:

1. Call `AskUserQuestion` (or the equivalent primitive) **once** with that
   single question.
2. Use the question wording from this file verbatim as the `question` field.
3. Convert the question's enumerated choices into the tool's option list
   when the tool supports structured options; otherwise put the choices in
   the question text.
4. Do not bundle multiple questions into one call. One field per call.
5. Do not infer answers from earlier conversation context. If the user
   mentioned a value in passing, still ask — pre-fill it as the default
   option, but require an explicit selection.
6. Skip a question only when its value was supplied by a CLI flag or
   `--from-intake=<file>`. Announce the skip once
   ("Using `--service=s3` from CLI, skipping service prompt") then move on.

After all questions are answered, render the **User Confirmation** summary
(see that section below) and ask one final `AskUserQuestion` — "Proceed?
[Y/n]" — before any write to `intake-manifest.json`.

### Branch B — Chat-pane fallback (no blocking primitive)

Your runtime cannot pause the agent loop to wait for a typed reply. You must
enforce turn-taking yourself or you will silently commit the user to defaults
they never saw.

**Rules:**

1. **Ask one question per turn.** Never bundle questions.
2. **After asking, STOP.** End your turn with the literal marker:

   ```
   >>> WAITING FOR YOUR REPLY — I will not proceed until you answer.
   ```

   Do not call any further tool (`fs_read`, `fs_write`, `execute_bash`, MCP)
   in the same turn after this marker. The next user message is your only
   trigger to continue.
3. **Do not infer answers from earlier context.** If the user's opening
   prompt mentioned a value, re-ask explicitly with it pre-filled
   (e.g. "I see you mentioned S3 — confirm `s3`? [Y/n]").
4. **Do not skip ahead.** Only act on the question you just asked, even if
   the user volunteers extra info for later questions.
5. **Confirmed answers are locked.** Don't silently overwrite a previously
   acknowledged value during a later turn.
6. **The summary is a hard gate.** Before writing
   `.service-approval/_staging/<timestamp>/00-intake/intake-manifest.json`, render the
   "User Confirmation" summary box and end with:

   ```
   Type Y to write the manifest, N to revise, or "edit <field>" to change
   one field.

   >>> WAITING FOR YOUR REPLY — I will not write the manifest until you answer.
   ```

   A literal "Y" (case-insensitive) is the only trigger to write the file.
7. **Skip a question only on CLI-flag / `--from-intake` evidence.** Same
   rule as Branch A — announce the skip once, then move on.

### Question order (both branches)

1. Step 0 — Input folder bootstrap (only if `./input/` missing)
2. Step 1 — Service name
3. Step 2 — Input type
4. Step 3 — Testing requirements
5. Step 4 — Additional options
6. Final summary (always — never skipped)

---

## Intake Form Fields

Present this form when running interactively. Fields marked **(required)** must be answered.

### 0. Input Folder Bootstrap (when `./input/` is missing)

Before asking the service question, check whether `./input/` exists in the user's
current working directory:

```bash
test -d ./input && echo "PRESENT" || echo "MISSING"
```

**If PRESENT:** skip this step entirely and go to Step 1.

**If MISSING:** create the folder and present the seed menu below. Do NOT silently
fall back to MCP-only mode — let the user decide.

```bash
mkdir -p ./input
```

```
No ./input/ folder was found in this directory. I just created an empty one.
You can populate it with customer documents (.md, .json, .xlsx, .pdf, .docx) for
mitigation reports, threat models, and control frameworks — or run without inputs.

How would you like to seed it?
  [1] Skip — run in MCP-only mode (research everything from scratch)
  [2] Leave empty — I'll add files myself before continuing
  [3] Seed bundled CCMv4 framework (recommended)
  [4] Auto-download latest CCMv4 from CSA
  [5] Both — copy bundled CCMv4 AND try CSA download

Choice [1-5]:
```

If the run is non-interactive (CLI flags or `--from-intake=<file>`), read the answer
from `input.bootstrap.{seed_from_plugin, auto_download_ccmv4}` in the intake YAML.
Defaults: both `false` → equivalent to choice [1] (skip).

#### Locate the plugin's bundled input/

The plugin is symlinked or copied into client-specific paths. Walk up from a known
anchor to find the plugin root (the directory containing `manifest.yaml`):

```bash
# Try environment variables first (Claude Code sets CLAUDE_PLUGIN_ROOT)
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"

# Fall back: walk up from the skill file's known location
if [ -z "$PLUGIN_ROOT" ]; then
  for dir in \
    "$(pwd)" \
    "$HOME/.claude/plugins/service-approval" \
    "$HOME/.gemini/extensions/service-approval" \
    "$HOME/.kiro/powers/service-approval"; do
    if [ -f "$dir/manifest.yaml" ] && [ -d "$dir/input" ]; then
      PLUGIN_ROOT="$dir"
      break
    fi
  done
fi

# Last resort: search common parent paths for manifest.yaml + input/
if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(find "$HOME" -maxdepth 6 -name manifest.yaml -path '*service-onboarding*' -print -quit 2>/dev/null | xargs -I{} dirname {})"
fi

echo "$PLUGIN_ROOT"
```

If `PLUGIN_ROOT` cannot be located, warn the user, disable choices [3] and [5],
and offer [1], [2], or [4] only.

#### Choice [3] — Seed bundled CCMv4

```bash
cp "$PLUGIN_ROOT/input/CCMv4_LightningLane.xlsx" ./input/
```

Print: `Copied CCMv4_LightningLane.xlsx → ./input/`. Set `inputs.input_folder = "./input"`
and `inputs.framework_type = "ccmv4"` in the manifest.

We deliberately do NOT copy the bundled mitigation report — that's customer-specific
and would mislead downstream skills. The user supplies their own mitigation report
(if any) by dropping it into `./input/` themselves.

#### Choice [4] — Auto-download CCMv4 from CSA

Try a direct download first. The CSA download URL may serve HTML (login wall) instead
of an xlsx, so verify the response shape before trusting it.

```bash
CSA_URL="https://cloudsecurityalliance.org/download/artifacts/cloud-controls-matrix-v4-1"
TMP=$(mktemp -t ccmv4.XXXXXX)

# Follow redirects, fail on HTTP error, time out at 30s
if curl -sSfL --max-time 30 -A "service-approval/1.0" -o "$TMP" "$CSA_URL"; then
  CT=$(file -b --mime-type "$TMP")
  case "$CT" in
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet|\
    application/zip|\
    application/octet-stream)
      mv "$TMP" ./input/CCMv4-CSA-latest.xlsx
      echo "Downloaded CCMv4 from CSA → ./input/CCMv4-CSA-latest.xlsx"
      ;;
    *)
      rm -f "$TMP"
      echo "CSA returned $CT (likely a login/marketing page). Falling back to manual download."
      OPEN_BROWSER=1
      ;;
  esac
else
  rm -f "$TMP"
  echo "CSA download failed. Falling back to manual download."
  OPEN_BROWSER=1
fi

if [ "${OPEN_BROWSER:-0}" = "1" ]; then
  echo ""
  echo "Manual CCMv4 download:"
  echo "  1. Visit: $CSA_URL"
  echo "  2. Sign in to your CSA account (free)"
  echo "  3. Save the .xlsx file into ./input/"
  echo ""

  # Best-effort browser launch
  if command -v open >/dev/null 2>&1; then
    open "$CSA_URL" 2>/dev/null || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$CSA_URL" 2>/dev/null || true
  elif command -v start >/dev/null 2>&1; then
    start "$CSA_URL" 2>/dev/null || true
  fi

  read -r -p "Press Enter once the file is in ./input/ (or Ctrl-C to abort): " _
fi
```

#### Choice [5] — Both

Run choice [3] first, then choice [4]. If both succeed, the user has two CCMv4 files
in `./input/`. The Map phase auto-detects framework files by filename pattern (any
xlsx with `CCMv4`/`ccm`/`CSA` in the name) — having both is harmless, but if both
files are present, prefer the CSA download (it's likely newer). Tell the user:

```
You have two CCMv4 files in ./input/:
  - CCMv4_LightningLane.xlsx (bundled snapshot)
  - CCMv4-CSA-latest.xlsx (just downloaded)

The Map phase will use CCMv4-CSA-latest.xlsx (newer). Delete the other file if
you want to silence this notice.
```

#### After bootstrap

Continue to Step 1 with `inputs.input_folder = "./input"`. The rest of the intake
form runs normally; `framework_type` defaults to `ccmv4` if a CCMv4 file is present.

---

### 1. Service Name (required)

```
What AWS service should we generate security controls for?
Examples: s3, lambda, bedrock-agentcore-control, kms, ecs, dynamodb
```

- Accept any valid AWS service identifier (lowercase, hyphenated)
- If the user provides a friendly name (e.g., "Amazon S3"), normalize to the service ID (`s3`)
- Validate the service exists by checking `data/sar-slugs.json` for a matching entry

### 2. Input Type (optional)

```
Are you providing any of the following? (select all that apply)
  [ ] Custom threat model (.md, .json, .pdf, .docx)
  [ ] Custom control framework (.xlsx, .json — CCMv4 only)
  [ ] Existing mitigation report (.md, .json)
  [ ] None — use MCP-only mode (research everything from scratch)
```

- If custom inputs are provided, record the input folder path
- If a custom control framework is provided, detect the framework type:
  - Filename contains "CCMv4" or "ccm" → `ccmv4`
  - Any other framework filename (NIST, CIS, ISO) → warn and ignore;
    those frameworks are out of scope for the current pipeline.
- If no framework file is provided, leave `framework_type` unset
  (the user's intake reply determines whether CCMv4 is included).

### 3. Testing Requirements (required — default: `skip`)

This is the single point where the user declares how Phase 5 (Test) should run.
There is no later human-in-the-loop gate — whatever is chosen here is what the
pipeline does.

```
How do you want to validate the generated controls?

  A. Full deploy + validate  (mode: full-deploy)
     Deploys the compliant resource template into an AWS account, waits for
     Config rule evaluations, checks CloudWatch alarms, then tears down.
     Requires an AWS CLI profile.

  B. Dry-run validation only  (mode: dry-run)
     Runs static checks (terraform validate, cfn-lint, CDK tsc, CFN Guard
     syntax, py_compile). Optionally CloudFormation validate-template + IAM
     Access Analyzer if a profile is provided. No deployment.

  C. Skip testing  (mode: skip)
     Stop after generation. Artifacts remain on disk for manual review.

  D. Manual CLI — show commands  (mode: manual-cli)
     Skip Phase 5. The Summarize phase appends per-format deploy commands
     (terraform apply, cdk deploy, aws cloudformation deploy) to the final
     approval report so you can run them yourself later.
```

Validation rules:
- `full-deploy` requires `aws_profile`; if missing, re-prompt. If the profile
  is not configured in `~/.aws/credentials` or `~/.aws/config`, warn and
  downgrade to `mode: skip`.
- `dry-run` accepts a profile (enables Tier 2 static checks) but does not
  require one.
- `manual-cli` does not require a profile — the cheat-sheet uses
  `<AWS_PROFILE>` placeholders.
- Default when the user declines to choose: `skip`.

### 4. Additional Options (optional)

```
Additional options:
  [ ] Include MITRE ATT&CK threat mapping (adds ~15 min to pipeline)
  [ ] Generate artifact dependency matrix (ARTIFACT-FLOW-MATRIX.md)
```

---

## Output

**CRITICAL:** Intake runs BEFORE the canonical service slug is known (slug is derived by Phase 0 Assess from the SAR `service_prefix`). Therefore, intake writes to a staging directory indexed by timestamp.

Compute the staging timestamp:

```bash
STAGING_TS=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
STAGING_DIR=".service-approval/_staging/${STAGING_TS}"
mkdir -p "${STAGING_DIR}/00-intake"
```

Or using Python:

```python
from datetime import datetime, timezone
from pathlib import Path
staging_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
staging_dir = Path(f".service-approval/_staging/{staging_ts}/00-intake")
staging_dir.mkdir(parents=True, exist_ok=True)
manifest_path = staging_dir / "intake-manifest.json"
```

Write to `.service-approval/_staging/<timestamp>/00-intake/intake-manifest.json`:

```json
{
  "schema_version": "2.1.0",
  "generated_at": "{ISO-8601 timestamp}",
  "staging_timestamp": "{STAGING_TS}",
  "service": {
    "name": "{service-name}",
    "friendly_name": "{AWS Service Friendly Name}",
    "sar_slug": "{slug from sar-slugs.json}",
    "service_prefix": "{IAM prefix}",
    "candidate_slug": "{lowercase, hyphenated service name from user input}"
  },
  "inputs": {
    "input_folder": "{path or null}",
    "has_custom_threat_model": true|false,
    "has_custom_framework": true|false,
    "framework_type": "ccmv4 | null",
    "framework_file": "{path or null}",
    "has_mitigation_report": true|false,
    "input_files": [
      {"path": "...", "type": "threat_model|framework|mitigation_report|context"}
    ]
  },
  "testing": {
    "mode": "full-deploy|dry-run|skip|manual-cli",
    "aws_profile": "{profile-name or null}",
    "region": "{region or us-east-1}",
    "keep": false,
    "timeout_minutes": 30
  },
  "output": {
    "include_attack_surface": true|false,
    "include_artifact_matrix": true|false
  },
  "pipeline_flags": {
    "service": "{service-name}",
    "input_folder": "{path or null}",
    "env": "{profile or null}",
    "region": "{region}",
    "framework": "{type}",
    "framework_file": "{path or null}",
    "skip_test": true|false,
    "dry_run": true|false,
    "keep": true|false,
    "timeout": 30,
    "skip_attack_surface": true|false,
    "include_unverified": false,
    "clean": false
  }
}
```

**Derivation from `testing.mode` to `pipeline_flags`:**

| `testing.mode` | `skip_test` | `dry_run` | `env`               | Phase 5 effect                         |
|----------------|-------------|-----------|---------------------|----------------------------------------|
| `full-deploy`  | false       | false     | `testing.aws_profile` | `test` full mode                     |
| `dry-run`      | false       | true      | `testing.aws_profile` or null | `test` `--dry-run` (Tier 1/2)  |
| `skip`         | true        | false     | null                | Phase 5 skipped                        |
| `manual-cli`   | true        | false     | null                | Phase 5 skipped; Summarize prints CLI cheat-sheet |

CLI flag overrides: if the user passes `--env`, `--skip-test`, or `--dry-run`
to the orchestrator, those override the intake-derived flags (CLI > intake >
defaults).

**Note:** `iac_formats` and `iac_support` are NOT in the intake manifest. They are
determined by Phase 0 (Assess) and written to `<slug>/01-assess/iac-support.json`.

**Staging → Canonical Promotion:** Phase 0 (Assess) will atomically promote this staging directory to `.service-approval/<slug>/` after deriving the canonical slug from the SAR `service_prefix`. The promotion is described in Phase 0's Step 0b.

---

## User Confirmation

After collecting inputs, present a summary:

```
┌─────────────────────────────────────────────────────────────┐
│  SERVICE APPROVAL — Intake Summary                          │
├─────────────────────────────────────────────────────────────┤
│  Service:        {friendly_name} ({service-id})             │
│  Input:          {description of inputs}                    │
│  Framework:      {framework_type}                           │
│  Testing mode:   {full-deploy | dry-run | skip | manual-cli}│
│  AWS profile:    {profile or n/a}                           │
│  Region:         {region}                                   │
│  ATT&CK Mapping: {Yes | No}                                 │
├─────────────────────────────────────────────────────────────┤
│  Note: IaC output formats will be determined in Phase 0     │
│  (Assess) based on actual provider support for this service.│
└─────────────────────────────────────────────────────────────┘

Proceed? (Y/n)
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Service not found in `sar-slugs.json` | Warn user, attempt SAR page lookup via MCP. If found, continue. If not, halt. |
| `./input/` folder missing | Run Step 0 bootstrap (create empty + offer seed menu). Never silently skip. |
| Plugin root cannot be located for seeding | Warn, disable choices [3] and [5], keep [1]/[2]/[4] available |
| CSA auto-download returns HTML / non-xlsx | Delete partial file, fall back to opening browser + printing URL, wait for user to drop file |
| Input folder path invalid | Ask user to correct the path |
| `testing.mode == full-deploy` but `aws_profile` missing | Re-prompt for profile; if still missing, downgrade to `mode: skip` |
| AWS profile not configured in `~/.aws/` | Warn and downgrade `testing.mode` to `skip` |
| Intake YAML file not found | Fall back to interactive mode |
| Intake YAML missing required fields | Report which fields are missing, halt |
| Intake YAML has invalid `testing.mode` | List valid modes (full-deploy, dry-run, skip, manual-cli), halt |

---

## Downstream Consumption

| Phase | What it reads from intake-manifest.json |
|-------|----------------------------------------|
| Phase 0 (Assess) | `service`, `inputs.input_folder`, `service.sar_slug`, `staging_timestamp` (to locate staging dir for promotion) |
| Phase 1 (Research) | `service`, `inputs.*`, `output.include_attack_surface` |
| Phase 2 (Validate) | `service` |
| Phase 3 (Map) | `inputs.framework_type`, `inputs.framework_file` |
| Phase 4 (Generate) | Reads `<slug>/01-assess/iac-support.json` (from Phase 0), NOT intake |
| Phase 5 (Test) | `testing.mode`, `testing.aws_profile`, `testing.region`, `testing.timeout_minutes` (orchestrator translates to `--env` / `--skip-test` / `--dry-run`). Note: Phase 5 always passes `--keep` to smoke-deploy-test.sh when Phase 7 is in scope; `testing.keep` itself is consumed by Phase 7, not Phase 5. |
| Phase 6 (Summarize) | Full manifest for report metadata; `testing.mode` drives the manual-cli cheat-sheet render when mode == `manual-cli` |
| Phase 7 (Evidence) | `testing.keep` — when `true`, Phase 7 skips its end-of-run teardown (stack stays alive for manual debugging); when `false` (default), Phase 7 tears down the stack from `06-test/deployed-resources.json` after evidence collection completes. |

---

## Print Summary

```
Intake complete:
  Service: {friendly_name} ({service-id})
  SAR slug: {slug}
  Inputs: {N} files ({types})
  Framework: {framework_type}
  Testing mode: {full-deploy|dry-run|skip|manual-cli} (profile: {name or n/a}, region: {region})
  Staging: .service-approval/_staging/{STAGING_TS}/00-intake/intake-manifest.json

Canonical service slug will be derived in Phase 0 (Assess).
IaC formats will be determined in Phase 0 (Assess).
Ready for Phase 0.
```
