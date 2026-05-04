"""
App Factory Builder — Multi-Agent Architecture

Uses the Claude Agent SDK with subagents to generate complete Strands-based
use cases from questionnaire answers. A parent orchestrator analyzes requirements
and delegates to specialized subagents:

  - agent-builder:  Generates Strands agent Python code
  - ui-builder:     Customizes React UI (file upload, custom fields, etc.)
  - infra-builder:  Generates additional Terraform when needed
  - data-builder:   Generates realistic sample data
  - validator:      Runs import checks, terraform validate, npm build

Each subagent's prompt lives in `prompts/<name>.py`. Hook-based enforcement
(PreToolUse + SubagentStop) lives in `hooks.py`. ANSI color helpers and
`log()` / `log_tool_use()` live in `console.py`. This file is the thin
runner: ClaudeAgentOptions wiring, CLI, DynamoDB I/O, post-generation
patch passes.

Usage:
    python builder.py                          # Uses sample answers
    python builder.py --answers-file input.json
    python builder.py --dry-run                # Print prompt only
    python builder.py --submission-id SUB123   # Fetch from DynamoDB

Requires:
    - claude-agent-sdk >= 0.1.63 (pip install claude-agent-sdk)
    - Claude Code CLI (npm install -g @anthropic-ai/claude-code)
    - CLAUDE_CODE_USE_BEDROCK=1 (for Bedrock routing)
    - AWS credentials with Bedrock access
"""

import asyncio
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import time
import argparse
from pathlib import Path

import boto3
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition, HookMatcher
from claude_agent_sdk.types import (
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolUseBlock,
)

# Paths + shared constants
from .paths import REPO_ROOT, FSI_FOUNDRY, FOUNDATIONS_SRC, REFERENCE_USE_CASE, UI_TEMPLATE

# ANSI console helpers
from .console import (
    BLUE, GREEN, YELLOW, CYAN, MAGENTA, DIM, BOLD, RESET,
    log, log_tool_use,
)

# Subagent prompts
from .prompts import (
    _agent_builder_prompt,
    _ui_builder_prompt,
    _infra_builder_prompt,
    _data_builder_prompt,
    _docs_builder_prompt,
    _validator_prompt,
    build_orchestrator_prompt,
)

# SDK hooks
from .hooks import enforce_builder_rules, _make_data_builder_stop_validator


def build_agent_options(use_case_name: str) -> ClaudeAgentOptions:
    """Assemble the ClaudeAgentOptions for one builder run.

    Wires the orchestrator system prompt, the six subagent AgentDefinitions
    (agent-builder, ui-builder, infra-builder, data-builder, docs-builder,
    validator), and both hook event registrations (PreToolUse rules +
    SubagentStop data-builder gates) into a single options object the
    Claude Agent SDK's `query()` accepts.
    """
    fsi = str(FSI_FOUNDRY)
    data_builder_stop_validator = _make_data_builder_stop_validator(use_case_name)

    return ClaudeAgentOptions(
        system_prompt=build_orchestrator_prompt(use_case_name, fsi),
        cwd=str(REPO_ROOT),
        permission_mode="acceptEdits",
        max_turns=80,
        model="opus",
        allowed_tools=[
            "Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent",
        ],
        disallowed_tools=["WebFetch", "NotebookEdit"],
        hooks={
            # PreToolUse (Write|Edit): enforces Rules A–I on individual file
            # writes — block a Write before it touches disk. Bash is excluded
            # so reportlab / Pillow binary generation isn't intercepted.
            # PreToolUse (Agent|Task): runs the cross-file consistency gates
            # AFTER a subagent returns. We use PreToolUse-on-the-next-call
            # rather than SubagentStop because the SDK silently ignores block
            # decisions on SubagentStop (the subagent has already finished by
            # then) — on an Agent/Task PostToolUse, the parent honors deny and
            # re-invokes the subagent.
            "PreToolUse": [
                HookMatcher(matcher="Write|Edit", hooks=[enforce_builder_rules]),
            ],
            "PostToolUse": [
                HookMatcher(matcher="Agent|Task", hooks=[data_builder_stop_validator]),
            ],
        },
        agents={
            "agent-builder": AgentDefinition(
                description=(
                    "Strands agent code generator. Use this to generate all Python "
                    "source files: models, config, orchestrator, agents, and __init__. "
                    "Specializes in the Strands SDK patterns used by AVA."
                ),
                prompt=_agent_builder_prompt(use_case_name, fsi),
                tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                model="opus",
                effort="high",
                permissionMode="dontAsk",
                maxTurns=40,
            ),
            "ui-builder": AgentDefinition(
                description=(
                    "React/TypeScript UI customizer. Use this to customize the "
                    "frontend: add file upload components, custom forms, result "
                    "displays, runtime-config.json, and install npm packages."
                ),
                prompt=_ui_builder_prompt(use_case_name, fsi),
                tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                model="opus",
                permissionMode="dontAsk",
                maxTurns=30,
            ),
            "infra-builder": AgentDefinition(
                description=(
                    "Terraform infrastructure generator. Use this ONLY when the "
                    "use case needs additional AWS resources beyond the standard "
                    "AgentCore deployment (e.g., upload buckets, Lambda functions, "
                    "DynamoDB tables, API Gateway endpoints)."
                ),
                prompt=_infra_builder_prompt(use_case_name, fsi),
                tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                model="opus",
                permissionMode="dontAsk",
                maxTurns=20,
            ),
            "data-builder": AgentDefinition(
                description=(
                    "Sample data generator. Use this to create realistic test data "
                    "JSON files and update the offerings registry."
                ),
                prompt=_data_builder_prompt(use_case_name, fsi),
                tools=["Read", "Write", "Edit", "Bash", "Glob"],
                model="haiku",
                permissionMode="dontAsk",
                maxTurns=15,
            ),
            "docs-builder": AgentDefinition(
                description=(
                    "Business-user documentation writer. Invoke AFTER the parallel "
                    "agent/data/ui/infra wave has finished and BEFORE validator. "
                    "Reads the generated models, agents, and runtime-config, then "
                    "writes a 300-500 word 'About this deployment' markdown doc "
                    "at use_cases/<name>/docs/use-case.md for display on the "
                    "control plane deployment detail page."
                ),
                prompt=_docs_builder_prompt(use_case_name, fsi),
                tools=["Read", "Write", "Bash", "Glob"],
                model="haiku",
                effort="low",
                permissionMode="dontAsk",
                maxTurns=10,
            ),
            "validator": AgentDefinition(
                description=(
                    "QA validation agent. Use this LAST (after docs-builder) to "
                    "verify Python imports, file completeness, runtime-config "
                    "schema, and performance patterns. Reports PASS/FAIL for "
                    "each check."
                ),
                prompt=_validator_prompt(use_case_name, fsi),
                tools=["Read", "Bash", "Glob", "Grep"],
                # Upgraded from haiku/low: the validator runs 7 checks (file
                # completeness, runtime-config schema, field consistency,
                # performance patterns, document integrity, custom tools,
                # import paths). haiku + low-effort kept truncating its
                # output, which forced the orchestrator to re-run the same
                # checks itself. sonnet with more turns gets a full report.
                model="sonnet",
                permissionMode="dontAsk",
                maxTurns=20,
            ),
        },
    )


# ---------------------------------------------------------------------------
# Helper: scaffold_ui (copies template before ui-builder runs)
# ---------------------------------------------------------------------------

def scaffold_ui(use_case_name: str) -> list[str]:
    """Copy the UI template to the use case directory. Returns files created."""
    src = UI_TEMPLATE
    dst = FSI_FOUNDRY / "ui" / use_case_name

    # Preserve any runtime-config the agent-builder might have created
    generated_config = dst / "public" / "runtime-config.json"
    config_backup = None
    if generated_config.exists():
        config_backup = generated_config.read_text()

    if dst.exists():
        shutil.rmtree(dst)

    def _ignore(directory, contents):
        """shutil.copytree filter — skip node_modules, lockfiles, TS build info."""
        return [c for c in contents if c in ("node_modules", "package-lock.json")
                or c.endswith(".tsbuildinfo")]

    shutil.copytree(src, dst, ignore=_ignore)

    if config_backup:
        generated_config.parent.mkdir(parents=True, exist_ok=True)
        generated_config.write_text(config_backup)

    display_name = use_case_name.replace("_", "-")
    display_title = use_case_name.replace("_", " ").title()

    pkg = dst / "package.json"
    pkg_text = pkg.read_text()
    pkg_text = pkg_text.replace("ava-use-case-ui", f"ava-{display_name}-ui")
    pkg.write_text(pkg_text)

    index_html = dst / "index.html"
    html_text = index_html.read_text()
    html_text = html_text.replace(
        "<title>AVA Use Case</title>",
        f"<title>{display_title} - AVA</title>",
    )
    index_html.write_text(html_text)

    created = []
    for f in dst.rglob("*"):
        if f.is_file():
            try:
                created.append(str(f.relative_to(REPO_ROOT)))
            except ValueError:
                created.append(str(f))
    return created


# ---------------------------------------------------------------------------
# DynamoDB fetch
# ---------------------------------------------------------------------------

def fetch_submission(submission_id: str, region: str = "us-east-1") -> dict:
    """Fetch questionnaire answers from the App Factory DynamoDB table."""
    table_name = os.environ.get("APP_FACTORY_TABLE_NAME", "")
    if not table_name:
        raise ValueError("APP_FACTORY_TABLE_NAME environment variable is required")

    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    response = table.get_item(
        Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"}
    )
    item = response.get("Item")
    if not item:
        raise ValueError(f"Submission {submission_id} not found in {table_name}")

    required_fields = [
        "use_case_name", "problem", "domain", "current_process", "users",
        "successful_interaction", "workflow", "frequency", "data_inputs",
        "data_outputs",
    ]
    for field in required_fields:
        if not item.get(field):
            raise ValueError(f"Submission {submission_id} missing field: {field}")

    return {
        "use_case_name": item["use_case_name"],
        "problem": item["problem"],
        "domain": item["domain"],
        "current_process": item["current_process"],
        "users": item["users"],
        "successful_interaction": item["successful_interaction"],
        "workflow": item["workflow"],
        "human_in_loop": item.get("human_in_loop", ""),
        "frequency": item["frequency"],
        "data_inputs": item["data_inputs"],
        "data_outputs": item["data_outputs"],
        "compliance": item.get("compliance", ""),
        "existing_systems": item.get("existing_systems", ""),
    }


# ---------------------------------------------------------------------------
# Build the user prompt for the orchestrator
# ---------------------------------------------------------------------------

def build_context_prompt(answers: dict) -> str:
    """Render the user-turn prompt the orchestrator receives.

    Takes the questionnaire answers dict (fields described in
    `AppFactorySubmission` on the backend), sanitizes use_case_name to
    match the backend's normalization, and embeds every answer as a
    named section the orchestrator reads during feature detection.
    """
    # Match backend sanitization (app_factory.py:deploy_submission):
    # strip() first so leading/trailing whitespace doesn't become underscores.
    use_case_name = answers["use_case_name"].strip().replace("-", "_").replace(" ", "_").lower().strip("_")

    return f"""Generate a complete use case for the following business requirements.

## Use Case Name: {use_case_name}

## Business Requirements

**Problem:** {answers['problem']}
**Domain:** {answers['domain']}
**Current Process:** {answers['current_process']}
**Users:** {answers['users']}
**Definition of Success:** {answers['successful_interaction']}
**Workflow:** {answers['workflow']}
**Human Involvement:** {answers['human_in_loop']}
**Volume and Frequency:** {answers['frequency']}
**Data Inputs:** {answers['data_inputs']}
**Data Outputs:** {answers['data_outputs']}
**Compliance Requirements:** {answers['compliance']}
**Existing Systems:** {answers['existing_systems']}

## Instructions

Follow your WORKFLOW steps exactly:
1. FEATURE DETECTION — analyze requirements for file upload, custom display, etc.
2. Read reference files.
3. Scaffold UI template.
4. Invoke agent-builder with requirements + detected features.
5. READ the generated models.py and extract exact field names.
6. Invoke data-builder + ui-builder + infra-builder IN PARALLEL (one turn, multiple
   Agent tool calls). Skip infra-builder if no extra infra is needed. Pass exact
   field names from models.py to ui-builder.
7. Invoke validator with expected field names for cross-checking.
8. Fix any failures and re-validate.

The use case files should be created under: {FSI_FOUNDRY}/
"""


# ---------------------------------------------------------------------------
# Sample answers
# ---------------------------------------------------------------------------

SAMPLE_ANSWERS = {
    "use_case_name": "mortgage_pre_approval",
    "problem": (
        "Our mortgage pre-approval process takes 3-5 business days because loan officers "
        "manually review every application. We lose applicants to competitors."
    ),
    "domain": "Retail Banking / Lending",
    "current_process": (
        "Applicants submit documents. A loan officer manually reviews pay stubs, "
        "tax returns, bank statements, runs credit checks, calculates ratios."
    ),
    "users": "Loan officers (internal) and mortgage applicants (customers)",
    "successful_interaction": (
        "Customer receives a pre-approval decision with reasoning within minutes."
    ),
    "workflow": (
        "1. Customer uploads documents. 2. Extract financial data. "
        "3. Pull credit report. 4. Calculate DTI/LTV ratios. "
        "5. Generate pre-approval decision. 6. Generate letter or denial."
    ),
    "human_in_loop": "Loan officer reviews applications above $750k or DTI 43-50%.",
    "frequency": "200-500 applications per day",
    "data_inputs": "Pay stubs, W-2s, tax returns, bank statements. Credit bureau API.",
    "data_outputs": "Pre-approval letter or denial with reasons. Audit trail.",
    "compliance": "ECOA, Fair Housing Act, state lending regulations, audit trail.",
    "existing_systems": "Core banking (REST API), Experian credit bureau, S3 DMS.",
}


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------


def extract_request_schema(models_py: Path) -> dict | None:
    """AST-parse models.py and extract the request model's schema.

    Returns:
        {
            "model_name": "OnboardingRequest",
            "id_field": "customer_id",
            "type_field": "screening_type",
            "enum_name": "ScreeningType",
            "enum_values": [("STANDARD", "standard"), ...],
            "all_required_fields": [...],
        }
        or None if no request model found.
    """
    try:
        tree = ast.parse(models_py.read_text())
    except Exception as e:
        print(f"  {YELLOW}WARN{RESET} Could not parse {models_py.name}: {e}")
        return None

    # Collect Enum classes: {class_name: [(attr, value), ...]}
    enums: dict[str, list[tuple[str, str]]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            base_names = {
                b.id if isinstance(b, ast.Name) else
                (b.attr if isinstance(b, ast.Attribute) else "")
                for b in node.bases
            }
            if any("Enum" in b for b in base_names):
                values: list[tuple[str, str]] = []
                for item in node.body:
                    if isinstance(item, ast.Assign):
                        for tgt in item.targets:
                            if isinstance(tgt, ast.Name):
                                v = item.value
                                if isinstance(v, ast.Constant) and isinstance(v.value, str):
                                    values.append((tgt.id, v.value))
                if values:
                    enums[node.name] = values

    # Find the request model class (pydantic BaseModel, name ending in Request)
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        base_names = {
            b.id if isinstance(b, ast.Name) else
            (b.attr if isinstance(b, ast.Attribute) else "")
            for b in node.bases
        }
        if "BaseModel" not in base_names:
            continue
        if not node.name.endswith("Request"):
            continue

        id_field = None
        type_field = None
        enum_name = None
        all_required: list[str] = []

        for item in node.body:
            if not isinstance(item, ast.AnnAssign):
                continue
            if not isinstance(item.target, ast.Name):
                continue
            fname = item.target.id
            ann = item.annotation
            type_name = None
            if isinstance(ann, ast.Name):
                type_name = ann.id
            elif isinstance(ann, ast.Subscript) and isinstance(ann.value, ast.Name):
                type_name = ann.value.id
            all_required.append(fname)
            if id_field is None and type_name == "str":
                id_field = fname
            if type_field is None and type_name in enums:
                type_field = fname
                enum_name = type_name

        if id_field:
            return {
                "model_name": node.name,
                "id_field": id_field,
                "type_field": type_field,
                "enum_name": enum_name,
                "enum_values": enums.get(enum_name, []) if enum_name else [],
                "all_required_fields": all_required,
            }
    return None


INPUT_CONSTRAINT_MARKER = "# BEGIN INPUT_CONSTRAINT (deterministic, do not edit by hand)"
INPUT_CONSTRAINT_END = "# END INPUT_CONSTRAINT"


def _build_input_constraint_text(schema: dict) -> str:
    """Produce the canonical constraint block injected into every agent system prompt.

    The block lists EXACTLY which fields the user-facing request contains so the
    agent stops inventing questions for data it will never receive.
    """
    fields = schema.get("all_required_fields", [])
    id_field = schema.get("id_field")
    type_field = schema.get("type_field")
    enum_values = schema.get("enum_values") or []

    lines = [
        "",
        "INPUT CONSTRAINT (authoritative, overrides any earlier instruction):",
        "The user request contains ONLY these fields:",
    ]
    for f in fields:
        if f == type_field and enum_values:
            values = ", ".join(f"'{v}'" for _, v in enum_values)
            lines.append(f"  - {f}: enum of [{values}]")
        elif f == id_field:
            lines.append(f"  - {f}: string (entity identifier)")
        else:
            lines.append(f"  - {f}")
    lines.extend([
        "Never ask for, infer, or fabricate any field outside this list.",
        "If you need related data (e.g., profile, documents, history), fetch it",
        "via the tools provided using the identifier above — do NOT request that",
        "data from the user in your response.",
    ])
    return "\n".join(lines)


def _apply_prompt_constraint_to_file(py_file: Path, constraint_text: str) -> bool:
    """AST-locate each `system_prompt = \"\"\"...\"\"\"` assignment in a class body
    and append the constraint block if not already present. Also patches any
    orchestrator `_build_input_text` method's base f-string similarly.

    Returns True when the file was modified.
    """
    try:
        source = py_file.read_text()
    except Exception:
        return False

    if INPUT_CONSTRAINT_MARKER in source:
        # Strip any previous constraint block before reapplying (idempotent).
        start = source.find(INPUT_CONSTRAINT_MARKER)
        end = source.find(INPUT_CONSTRAINT_END, start)
        if start != -1 and end != -1:
            source = source[:start].rstrip() + "\n" + source[end + len(INPUT_CONSTRAINT_END):].lstrip("\n")

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return False

    modified = False
    new_source_lines = source.splitlines(keepends=True)

    # Find triple-quoted system_prompt assignments inside class bodies.
    # We patch by replacing the literal string content with the original
    # content + the constraint block + marker.
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for stmt in node.body:
            if not isinstance(stmt, ast.Assign):
                continue
            if not stmt.targets or not isinstance(stmt.targets[0], ast.Name):
                continue
            if stmt.targets[0].id != "system_prompt":
                continue
            if not isinstance(stmt.value, ast.Constant) or not isinstance(stmt.value.value, str):
                continue
            original = stmt.value.value
            if INPUT_CONSTRAINT_MARKER in original:
                continue  # Already present
            patched = (
                original.rstrip()
                + "\n\n"
                + INPUT_CONSTRAINT_MARKER
                + "\n"
                + constraint_text.lstrip("\n")
                + "\n"
                + INPUT_CONSTRAINT_END
            )
            # Replace in source. Use literal string search on the unescaped body is
            # fragile — instead, regenerate with ast.unparse so formatting is
            # consistent.
            stmt.value = ast.copy_location(ast.Constant(value=patched), stmt.value)
            modified = True

    if modified:
        try:
            new_source = ast.unparse(tree)
        except Exception:
            return False
        py_file.write_text(new_source + ("\n" if not new_source.endswith("\n") else ""))
    return modified


def enforce_agent_prompt_constraints(use_case_name: str, schema: dict) -> list[str]:
    """Append the INPUT CONSTRAINT block to every generated agent's system_prompt.

    Returns a list of files that were modified.
    """
    constraint_text = _build_input_constraint_text(schema)
    agents_dir = FSI_FOUNDRY / "use_cases" / use_case_name / "src" / "strands" / "agents"
    orchestrator = FSI_FOUNDRY / "use_cases" / use_case_name / "src" / "strands" / "orchestrator.py"

    modified: list[str] = []
    if agents_dir.is_dir():
        for py_file in sorted(agents_dir.glob("*.py")):
            if py_file.name == "__init__.py":
                continue
            if _apply_prompt_constraint_to_file(py_file, constraint_text):
                modified.append(str(py_file.relative_to(FSI_FOUNDRY)))
    if orchestrator.exists():
        if _apply_prompt_constraint_to_file(orchestrator, constraint_text):
            modified.append(str(orchestrator.relative_to(FSI_FOUNDRY)))
    return modified


def enforce_field_consistency(use_case_name: str) -> dict:
    """Deterministically enforce that runtime-config.json matches models.py AND
    that every generated agent's system_prompt is pinned to the actual input fields.

    Returns a dict describing what was fixed.
    """
    report = {"fixed": [], "skipped": [], "error": None, "prompt_patches": []}

    models_py = FSI_FOUNDRY / "use_cases" / use_case_name / "src" / "strands" / "models.py"
    runtime_config = FSI_FOUNDRY / "ui" / use_case_name / "public" / "runtime-config.json"

    if not models_py.exists():
        report["error"] = f"models.py not found at {models_py}"
        return report
    if not runtime_config.exists():
        report["error"] = f"runtime-config.json not found at {runtime_config}"
        return report

    schema = extract_request_schema(models_py)
    if not schema:
        report["error"] = "Could not extract request schema from models.py"
        return report

    try:
        config = json.loads(runtime_config.read_text())
    except Exception as e:
        report["error"] = f"Could not parse runtime-config.json: {e}"
        return report

    input_schema = config.setdefault("input_schema", {})

    if input_schema.get("id_field") != schema["id_field"]:
        report["fixed"].append(
            f"id_field: '{input_schema.get('id_field')}' -> '{schema['id_field']}'"
        )
        input_schema["id_field"] = schema["id_field"]

    if schema["type_field"]:
        if input_schema.get("type_field") != schema["type_field"]:
            report["fixed"].append(
                f"type_field: '{input_schema.get('type_field')}' -> '{schema['type_field']}'"
            )
            input_schema["type_field"] = schema["type_field"]

        expected_values = [v for _, v in schema["enum_values"]]
        current_options = input_schema.get("type_options", [])
        current_values = [opt.get("value") for opt in current_options if isinstance(opt, dict)]
        if set(current_values) != set(expected_values):
            label_map = {
                opt["value"]: opt.get("label", opt["value"].replace("_", " ").title())
                for opt in current_options
                if isinstance(opt, dict) and "value" in opt
            }
            new_options = [
                {"value": v, "label": label_map.get(v, v.replace("_", " ").title())}
                for v in expected_values
            ]
            report["fixed"].append(
                f"type_options: {current_values} -> {expected_values}"
            )
            input_schema["type_options"] = new_options

    if report["fixed"]:
        runtime_config.write_text(json.dumps(config, indent=2) + "\n")

    # Pin every agent system_prompt to the actual schema so the agent stops
    # asking for fields the UI will never supply.
    try:
        patched = enforce_agent_prompt_constraints(use_case_name, schema)
        report["prompt_patches"] = patched
    except Exception as e:
        report["skipped"].append(f"prompt_constraint_patch: {e}")

    return report


async def run_builder(answers: dict, dry_run: bool = False, verbose: bool = False):
    """Run the multi-agent builder to generate a complete use case."""

    # Match backend sanitization: strip() + collapse-to-underscore + strip("_").
    # Without the strip, "  Wire Transfer " → "__wire_transfer_" and paths
    # diverge from the backend's USE_CASE_ID which IS stripped.
    use_case_name = answers["use_case_name"].strip().replace("-", "_").replace(" ", "_").lower().strip("_")
    prompt = build_context_prompt(answers)

    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}App Factory Builder (Multi-Agent){RESET}")
    print(f"{'='*60}")
    print(f"  Use case:   {use_case_name}")
    print(f"  Reference:  {REFERENCE_USE_CASE}")
    print(f"  Output:     applications/fsi_foundry/use_cases/{use_case_name}/")
    print(f"  Agents:     agent-builder, ui-builder, infra-builder, data-builder, validator")
    print(f"{'='*60}\n")

    if dry_run:
        print("[DRY RUN] Orchestrator prompt:\n")
        print(prompt)
        return

    # Pre-scaffold the UI template so ui-builder has something to work with
    print(f"{BOLD}Scaffolding UI template...{RESET}")
    ui_files = scaffold_ui(use_case_name)
    print(f"  {GREEN}DONE{RESET} Copied {len(ui_files)} files to ui/{use_case_name}/\n")

    options = build_agent_options(use_case_name)
    start_time = time.time()
    files_written = []
    turn_count = 0
    subagent_count = 0

    log(f"{BOLD}>>>{RESET}", "Starting orchestrator...\n")

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            turn_count += 1
            parent_id = getattr(message, "parent_tool_use_id", None)

            for block in message.content:
                if isinstance(block, TextBlock):
                    if verbose:
                        prefix = f"  {MAGENTA}|{RESET} " if parent_id else ""
                        print(f"{prefix}{DIM}{block.text}{RESET}", flush=True)
                    else:
                        for line in block.text.split("\n"):
                            stripped = line.strip()
                            if stripped and (
                                stripped.startswith("#")
                                or stripped.startswith("**")
                                or "agent" in stripped.lower()
                                or "generat" in stripped.lower()
                                or "validat" in stripped.lower()
                                or "creat" in stripped.lower()
                                or "design" in stripped.lower()
                                or "delegat" in stripped.lower()
                                or "invok" in stripped.lower()
                                or "pass" in stripped.lower()[:6]
                                or "fail" in stripped.lower()[:6]
                            ):
                                prefix = f"  {MAGENTA}|{RESET} " if parent_id else ""
                                print(f"{prefix}  {DIM}{stripped}{RESET}", flush=True)

                elif isinstance(block, ToolUseBlock):
                    log_tool_use(block.name, block.input, parent_id)

                    if block.name in ("Agent", "Task"):
                        subagent_count += 1

                    if block.name == "Write":
                        path = block.input.get("file_path", "")
                        try:
                            files_written.append(str(Path(path).relative_to(REPO_ROOT)))
                        except ValueError:
                            files_written.append(path)

        elif isinstance(message, ResultMessage):
            elapsed = time.time() - start_time
            print(f"\n{BOLD}{'='*60}{RESET}")
            print(f"{GREEN}{BOLD}Builder finished.{RESET}")
            print(f"  Duration:     {elapsed:.0f}s")
            print(f"  Turns:        {turn_count}")
            print(f"  Subagents:    {subagent_count}")
            if message.total_cost_usd is not None:
                print(f"  Cost:         ${message.total_cost_usd:.4f}")
            if message.is_error:
                print(f"  {YELLOW}Completed with errors{RESET}")
                if message.errors:
                    for err in message.errors:
                        print(f"    - {err}")

            print(f"\n  Files generated ({len(files_written)}):")
            for f in sorted(set(files_written)):
                print(f"    {GREEN}+{RESET} {f}")

            # Deterministic field-consistency enforcement
            print(f"\n{BOLD}Enforcing field consistency (models.py <-> runtime-config.json)...{RESET}")
            fc_report = enforce_field_consistency(use_case_name)
            if fc_report["error"]:
                print(f"  {YELLOW}WARN{RESET} {fc_report['error']}")
            elif fc_report["fixed"]:
                print(f"  {YELLOW}DRIFT DETECTED — corrected runtime-config.json:{RESET}")
                for fix in fc_report["fixed"]:
                    print(f"    * {fix}")
            else:
                print(f"  {GREEN}PASS{RESET} runtime-config.json already consistent with models.py")

            # Final external validation
            print(f"\n{BOLD}Running final validation...{RESET}")
            result = subprocess.run(
                [sys.executable, "-c",
                 f"from use_cases.{use_case_name}.src.strands import *; print('Import OK')"],
                cwd=str(FSI_FOUNDRY),
                env={**os.environ, "PYTHONPATH": str(FOUNDATIONS_SRC)},
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                print(f"  {GREEN}PASS{RESET} {result.stdout.strip()}")
            else:
                print(f"  {YELLOW}FAIL{RESET} {result.stderr.strip()}")

            print(f"{'='*60}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    """CLI entrypoint. Parses --submission-id / --answers-file / --dry-run
    / --verbose / --region, loads the questionnaire answers, and hands off
    to `run_builder()` which drives the Claude Agent SDK session.
    """
    parser = argparse.ArgumentParser(description="App Factory Builder (Multi-Agent)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the prompt without running the agent")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Print all agent reasoning (verbose output)")
    parser.add_argument("--answers-file", type=str,
                        help="Path to JSON file with questionnaire answers")
    parser.add_argument("--submission-id", type=str,
                        help="DynamoDB submission ID to fetch answers from")
    parser.add_argument("--region", type=str,
                        default=os.environ.get("AWS_REGION", "us-east-1"),
                        help="AWS region for DynamoDB (default: us-east-1)")
    args = parser.parse_args()

    if args.answers_file:
        with open(args.answers_file) as f:
            answers = json.load(f)
    elif args.submission_id:
        answers = fetch_submission(args.submission_id, region=args.region)
    else:
        print("Using sample answers (mortgage pre-approval)...")
        answers = SAMPLE_ANSWERS

    asyncio.run(run_builder(answers, dry_run=args.dry_run, verbose=args.verbose))


if __name__ == "__main__":
    main()
