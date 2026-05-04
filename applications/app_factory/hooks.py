"""SDK-level hooks that enforce the builder's hard rules.

Two event types:
  * PreToolUse — matcher="Write|Edit", intercepts every file-creating tool
    call and can deny it with a reason. Rules A–G.
  * SubagentStop — matcher="data-builder", runs cross-file consistency
    checks when the data-builder declares itself done. Gates 1 / 1.5 / 2.

The subagents are prompted with these rules, but prompts are probabilistic.
These hooks enforce the SAME constraints at the SDK level — a subagent that
tries to violate them gets a deny decision back instead of silently
cheating.
"""
import json
import re
from pathlib import Path

from .paths import FSI_FOUNDRY
from .console import GREEN, YELLOW, DIM, RESET, log


_S3_TOOL_IN_AGENT_RE = re.compile(
    r"tools\s*=\s*\[[^\]]*\bs3_retriever_tool\b[^\]]*\]"
)

# File extensions that a "document" (thing a real person uploads) would have.
# If a path under /documents/, /uploads/, or /attachments/ ends in .json we
# treat that as the data-builder cheating — a tax return isn't JSON, a photo
# isn't JSON. Legitimate JSON writes (profile.json, offerings.json, etc.)
# sit OUTSIDE these document-upload subdirectories and are not affected.
_DOCUMENT_PATH_MARKERS = ("/documents/", "/uploads/", "/attachments/")

# Matches the broken absolute-import pattern the agent-builder keeps inventing:
#   from use_cases.<name>.src.strands.tools import ...
# At runtime the Dockerfile copies `use_cases/<id>/src/<framework>/` to
# `/app/use_cases/<id>/`, stripping the `src/<framework>/` segment. Imports
# that reference `.src.` fail silently and crash the runtime container on
# boot (no log line ever reaches CloudWatch). Verified zero false positives
# against the entire existing use_cases/ and foundations/ trees — no
# legitimate code uses `from use_cases.<id>.src.` pattern.
_BAD_USECASE_SRC_IMPORT_RE = re.compile(r"from\s+use_cases\.[\w_]+\.src\.")

# Narrow UI schema-mismatch guards. These target the exact field-access bugs
# we've seen the ui-builder emit when it guesses output shapes instead of
# reading models.py. False-positive-resistant: each rule only fires when
# the component accesses a KNOWN-wrong field name AND does NOT also access
# the corresponding right-name field.
_UI_SEVERITY_ANTIPATTERN_RE = re.compile(r"\bitem\.severity\b")
_UI_MISMATCH_SEV_RE = re.compile(r"\bitem\.mismatch_severity\b")
_UI_MESSAGE_ANTIPATTERN_RE = re.compile(r"\bitem\.message\b")
_UI_NOTES_RE = re.compile(r"\bitem\.notes\b")
_UI_JSON_STRINGIFY_FALLBACK_RE = re.compile(
    r"\bJSON\.stringify\s*\(\s*item\s*\)"
)

# Orchestrator anti-pattern: prefetching and stuffing content_base64 into
# the downstream agent's input prompt. LLMs can't parse base64 PDF bytes
# reliably and silently return null extractions. The right pattern is to
# pass document_keys only and let the extractor agent call the
# extract_pdf_text tool. We match a broad pattern and exclude benign
# references (docstrings, tool definitions in tools.py).
_ORCH_BASE64_PREFETCH_RE = re.compile(
    r"['\"]content_base64['\"]\s*:\s*doc"    # dict field assignment
    r"|content_base64\s*=\s*doc"             # attr assignment
    r"|\.get\(\s*['\"]content_base64['\"]"   # .get() read from prefetch result
)

# UI package.json minimum versions. The scaffolded ui-template ships with
# Vite 8 + plugin-react 6 + Tailwind v4 pinned together because earlier
# versions of Vite (5.x) are incompatible with @tailwindcss/postcss v4 —
# you get `Missing field negated on ScannerOptions.sources` from
# lightningcss at `npm run build` time, which kills Phase 2d of deploy.sh
# AFTER CloudFront has already been created (~10 min of wasted deploy).
#
# The ui-builder has been observed downgrading these pins to Vite 5.4 /
# plugin-react 4.3 — probably copying from older React-19 reference code.
# This rule enforces the minimums by parsing the generated package.json.
_UI_PKGJSON_MIN_VERSIONS = {
    "vite": 8,
    "@vitejs/plugin-react": 6,
    "@tailwindcss/postcss": 4,
    "tailwindcss": 4,
}
_UI_PKGJSON_VERSION_RE = re.compile(r'"([^"]+)"\s*:\s*"[~^]?(\d+)')

# Rule I uses ast.parse to extract the request model's field names from
# the sibling models.py, then compares against the field names the UI
# declares in runtime-config.json. Silent 422s on every form submit
# when these drift — we have no runtime error surfaced back to the user,
# just a stuck page.
_RUNTIME_CONFIG_PATH_MARKER = "/runtime-config.json"


def _extract_request_model_fields(models_py_path) -> set[str] | None:
    """Return the set of attribute names declared on the request-model
    class in `models.py` (the one whose name ends with `Request`).

    Returns None if the file doesn't parse or no request model is found,
    so the hook can fail open rather than blocking on a parse error.
    Does not import the module — uses ast so it's safe to run on
    untrusted generated code."""
    try:
        import ast
        src = models_py_path.read_text()
        tree = ast.parse(src)
    except Exception:
        return None

    request_cls = None
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name.endswith("Request"):
            request_cls = node
            break
    if request_cls is None:
        return None

    fields: set[str] = set()
    for stmt in request_cls.body:
        # Pydantic v2 pattern: `name: type = Field(...)` — we want the name.
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            fields.add(stmt.target.id)
    return fields


def _deny(input_data: dict, message: str) -> dict:
    """Shape a PreToolUse hook output that blocks the tool call.

    Per the docs, `hookEventName` inside `hookSpecificOutput` is required
    and should echo the incoming event name.
    """
    return {
        "hookSpecificOutput": {
            "hookEventName": input_data.get("hook_event_name", "PreToolUse"),
            "permissionDecision": "deny",
            "permissionDecisionReason": message,
        }
    }


async def enforce_builder_rules(input_data, tool_use_id, context):
    """PreToolUse hook enforcing deterministic build-time rules.

    Rules
    -----
    A) Writes to a document-upload path may not claim a .json extension —
       forces data-builder to generate real binary content.
    B) Writes to a .pdf file must start with %PDF- magic bytes — rejects
       text masquerading as PDF.
    C) Writes to an analyzer agent file may not include `s3_retriever_tool`
       in the `tools = [...]` list — enforces the orchestrator-prefetch
       architecture. Custom domain tools are allowed.
    D) Writes to orchestrator.py must contain `_prefetch_data` — enforces
       the shared-fetch-once pattern.
    """
    try:
        tool_name = input_data.get("tool_name")
        tool_input = input_data.get("tool_input") or {}

        # Only inspect file-writing tools. Bash can also create files via
        # redirection / reportlab, but the content there is bytes on disk and
        # gets caught by the validator's later filesystem check.
        if tool_name not in ("Write", "Edit"):
            return {}

        path = tool_input.get("file_path", "") or ""
        # For Write the body is `content`; for Edit it's `new_string`.
        body = tool_input.get("content") or tool_input.get("new_string") or ""

        # Trace every PreToolUse fire so reviewers can confirm the hook ran on
        # a specific write (not just "no deny line = hook fired and allowed").
        # Grep `HOOK PreToolUse` in CodeBuild logs to see every invocation.
        # Uses a trailing path tail only — full paths are long and add noise.
        log(f"{DIM}HOOK{RESET}", f"PreToolUse: {tool_name} /{'/'.join(path.rsplit('/', 3)[-3:])}")

        # --- Rule A: no .json masquerading as a document ---
        if any(marker in path for marker in _DOCUMENT_PATH_MARKERS) and path.endswith(".json"):
            return _deny(input_data,
                "Blocked: path is under a document-upload directory "
                f"({path}) but has a .json extension. Real documents need "
                "real extensions — .pdf for reports/statements/contracts, "
                ".jpg or .png for photos. Rewrite the profile's s3_key with "
                "the correct extension, then use Bash + reportlab (for PDFs) "
                "or Bash + Pillow (for images) to generate the actual binary "
                "file at that path. setPageCompression(0) for PDFs."
            )

        # --- Rule B: .pdf writes must have PDF magic bytes ---
        if path.endswith(".pdf") and tool_name == "Write":
            head = body[:5] if isinstance(body, str) else body[:5].decode("latin-1", errors="replace")
            if not head.startswith("%PDF-"):
                return _deny(input_data,
                    f"Blocked: attempted to write text to {path} (expected a "
                    "real PDF). Generate PDFs via Bash using reportlab, not "
                    "by writing text through the Write tool. Example:\n"
                    "  python3 - <<'PY'\n"
                    "  from reportlab.pdfgen import canvas\n"
                    "  c = canvas.Canvas('<path>')\n"
                    "  c.setPageCompression(0)\n"
                    "  c.setFont('Helvetica', 10); c.drawString(50, 750, '...')\n"
                    "  c.save()\n"
                    "  PY"
                )

        # --- Rule C: agent files may not import s3_retriever_tool into tools= ---
        if (
            "/use_cases/" in path
            and "/agents/" in path
            and path.endswith(".py")
            and _S3_TOOL_IN_AGENT_RE.search(body or "")
        ):
            return _deny(input_data,
                "Blocked: agent file attempted `tools = [..., "
                "s3_retriever_tool, ...]`. The shared s3 retriever is a "
                "data-fetch tool — it belongs in the orchestrator's "
                "_prefetch_data, not in any agent. Set this agent's "
                "tools = [] and ensure the orchestrator injects pre-fetched "
                "JSON into the agent's input_text. Custom domain tools "
                "defined in use_cases/<name>/src/strands/tools.py ARE "
                "allowed — only s3_retriever_tool is forbidden here."
            )

        # --- Rule E: no `from use_cases.<id>.src.` absolute imports ---
        # At runtime the Dockerfile flattens the tree; this import fails
        # silently and crashes the container on boot (seen as
        # RuntimeClientError from the UI with NO CloudWatch log group).
        if (
            "/use_cases/" in path
            and path.endswith(".py")
            and _BAD_USECASE_SRC_IMPORT_RE.search(body or "")
        ):
            return _deny(input_data,
                "Blocked: file used `from use_cases.<name>.src.<framework>."
                "<mod> import ...`. This path is ONLY valid in the source "
                "tree. At runtime the Dockerfile copies "
                "`use_cases/<id>/src/<framework>/*` to "
                "`/app/use_cases/<id>/*`, stripping the `src/<framework>/` "
                "segment, so this import fails silently and crashes the "
                "AgentCore runtime on boot with no log output.\n\n"
                "Fix: use a RELATIVE import instead. From an agent file in "
                "agents/, import sibling tools with two dots (parent "
                "package): `from ..tools import calculate_my_tool`. From "
                "the orchestrator, use `from .tools import ...`. These "
                "relative imports resolve correctly whether the code is "
                "read from the source tree or the flattened container."
            )

        # --- Rule F: UI components must not use known-wrong field names ---
        # Targets the specific ui-builder failure where the generated
        # Console references field names that don't exist in the agent's
        # response model (e.g. `item.severity` when the model actually
        # emits `item.mismatch_severity`). Deny only when the wrong name
        # is used in ISOLATION — if the component also accesses the right
        # name (defensive-coding pattern), the rule passes.
        if (
            tool_name == "Write"
            and "/ui/" in path
            and path.endswith((".tsx", ".ts"))
            and body
        ):
            failures: list[str] = []
            if _UI_SEVERITY_ANTIPATTERN_RE.search(body) and not _UI_MISMATCH_SEV_RE.search(body):
                failures.append(
                    "references `item.severity` but the generated Pydantic "
                    "consistency-report items use `mismatch_severity`. Read "
                    "use_cases/<id>/src/strands/models.py and use the real "
                    "field name. If you want defensive fallback, write "
                    "`item.mismatch_severity ?? item.severity`."
                )
            if _UI_MESSAGE_ANTIPATTERN_RE.search(body) and not _UI_NOTES_RE.search(body):
                failures.append(
                    "references `item.message` but consistency items have "
                    "no `message` field — they have `notes` (plus "
                    "`declared_value`/`extracted_value`/`source_document` "
                    "which you should surface side-by-side). Read models.py "
                    "and render the real fields."
                )
            if _UI_JSON_STRINGIFY_FALLBACK_RE.search(body):
                failures.append(
                    "uses `JSON.stringify(item)` as a render fallback. This "
                    "dumps raw JSON to the user when your field-name guesses "
                    "are wrong — which is the symptom, not the fix. Read "
                    "models.py to see the actual item shape and render real "
                    "fields. If you genuinely need a generic renderer, iterate "
                    "`Object.entries(item)` and format key: value pairs."
                )
            if failures:
                return _deny(input_data,
                    "Blocked: UI schema-mismatch anti-pattern in "
                    f"{path}:\n  - " + "\n  - ".join(failures) +
                    "\n\nRead the response model in "
                    "use_cases/<id>/src/strands/models.py BEFORE writing "
                    "renderer components, then use the exact field names "
                    "the agent emits."
                )

        # --- Rule G: orchestrator.py must not prefetch base64 PDF content ---
        # Stuffing content_base64 into the agent's input_text doesn't work —
        # the LLM can't decode base64 + parse PDF bytes reliably. Use the
        # `extract_pdf_text` tool on the extractor agent instead, and have
        # the orchestrator pass only document_keys (strings) to that agent.
        if (
            tool_name == "Write"
            and path.endswith("/orchestrator.py")
            and _ORCH_BASE64_PREFETCH_RE.search(body or "")
        ):
            return _deny(input_data,
                "Blocked: orchestrator tried to prefetch `content_base64` "
                "from document keys. LLMs cannot reliably decode base64 "
                "PDF bytes — the downstream extractor will return null "
                "fields.\n\n"
                "Fix: in _prefetch_data, DO NOT fetch document bytes. "
                "Only fetch the profile JSON and pass the plain list of "
                "document_keys (strings) to the extractor agent in its "
                "input_text.\n\n"
                "Then give the extractor agent `tools = [extract_pdf_text]` "
                "(imported from `tools.s3_retriever_strands`). The "
                "extractor loops over each key and calls "
                "`extract_pdf_text(s3_key=...)` which returns real "
                "extracted text the agent can actually read."
            )

        # --- Rule D: orchestrator.py must contain _prefetch_data ---
        if tool_name == "Write" and path.endswith("/orchestrator.py") and "_prefetch_data" not in (body or ""):
            return _deny(input_data,
                "Blocked: orchestrator.py must define a `_prefetch_data` "
                "method that calls s3_retriever_tool (or boto3) to fetch all "
                "shared entity data ONCE per request, then the per-agent "
                "input_text injects that data inline. Without "
                "_prefetch_data, each analyzer agent will redundantly fetch "
                "the same JSON at runtime and hit max_tokens. Add the method "
                "and try again."
            )

        # --- Rule H: UI package.json must keep template's pinned versions ---
        if (
            tool_name in ("Write", "Edit")
            and "/ui/" in path
            and path.endswith("/package.json")
        ):
            # Scan the written body for each critical package's major version.
            # We accept >= the minimum; downgrades below it are blocked because
            # they produce a known-broken Vite+Tailwind build combination.
            too_old = []
            for pkg, min_major in _UI_PKGJSON_MIN_VERSIONS.items():
                # Find this package's version line and extract the first digit
                # group of its major number. Accepts ^ / ~ / plain prefixes.
                for match_pkg, match_major in _UI_PKGJSON_VERSION_RE.findall(body or ""):
                    if match_pkg == pkg:
                        try:
                            if int(match_major) < min_major:
                                too_old.append(f"{pkg}: found ^{match_major}, need >= {min_major}")
                        except ValueError:
                            pass
                        break
            if too_old:
                return _deny(input_data,
                    "Blocked: UI package.json downgrades critical packages "
                    "below the ui-template's pinned minimums. The template "
                    "ships Vite 8 + plugin-react 6 + Tailwind v4 together "
                    "because earlier Vite versions are incompatible with "
                    "@tailwindcss/postcss v4 and fail `npm run build` at "
                    "Phase 2d with `Missing field negated on "
                    "ScannerOptions.sources` (lightningcss crash).\n\n"
                    "Do NOT change these versions. Copy the template's "
                    "package.json as-is, then add your use-case-specific "
                    "runtime dependencies only. Violations:\n  - "
                    + "\n  - ".join(too_old)
                )

        # --- Rule I: runtime-config.json id_field/type_field must exist in models.py ---
        if (
            tool_name in ("Write", "Edit")
            and _RUNTIME_CONFIG_PATH_MARKER in path
        ):
            # Locate the sibling use_case's models.py. Path convention:
            #   .../ui/<use_case>/public/runtime-config.json
            #   .../use_cases/<use_case>/src/strands/models.py
            # Extract use_case_name from the UI path, then resolve models.py.
            try:
                import json as _json
                config = _json.loads(body or "{}")
            except Exception:
                # Malformed JSON is out of scope for this rule — let the
                # write proceed so the validator surfaces the JSON error.
                config = None
            if config and "/ui/" in path:
                ui_part = path.split("/ui/", 1)[1]
                uc_name = ui_part.split("/", 1)[0]
                models_py = FSI_FOUNDRY / "use_cases" / uc_name / "src" / "strands" / "models.py"
                if models_py.is_file():
                    model_fields = _extract_request_model_fields(models_py)
                    if model_fields is not None:
                        # The two field names the form posts at submit time.
                        declared = []
                        input_schema = (config.get("input_schema") or {})
                        for cfg_key in ("id_field", "type_field"):
                            v = input_schema.get(cfg_key)
                            if v:
                                declared.append((cfg_key, v))
                        missing = [
                            (cfg_key, field) for (cfg_key, field) in declared
                            if field not in model_fields
                        ]
                        if missing:
                            return _deny(input_data,
                                "Blocked: runtime-config.json declares form "
                                "field names that don't exist on the request "
                                "model in models.py. Every submission will "
                                "422 silently because Pydantic rejects the "
                                "unknown keys.\n\n"
                                f"Request model declares: {sorted(model_fields)}\n"
                                "runtime-config mismatches:\n  - "
                                + "\n  - ".join(f"{k} = '{v}' (not in model)"
                                                 for k, v in missing)
                                + "\n\nEither rename the form field to match "
                                "the Pydantic field, or add the field to "
                                "models.py's request model."
                            )

        return {}
    except Exception as e:
        log(
            f"{YELLOW}WARN{RESET}",
            f"enforce_builder_rules crashed ({e}); allowing",
        )
        return {}


def _make_data_builder_stop_validator(use_case_name: str):
    """Build a PostToolUse hook on the `Agent`/`Task` tool that runs
    cross-file consistency gates after the data-builder subagent returns.

    Why PostToolUse on Agent, not SubagentStop: SubagentStop fires *after*
    the subagent has already completed — the SDK ignores any block
    decision because there's nothing to un-complete. PostToolUse on the
    parent's Agent-tool call, however, fires on the parent's view of the
    subagent-invocation result, and the parent honors `permissionDecision
    = "deny"` by re-invoking with the reason as context.

    Gates:
      1   profile.json must live at <entity_id>/profile.json (2 path parts)
      1.5 every s3_key must start with an existing entity_id prefix
      2   every document_key must resolve to a real file on disk

    The hook fires on every Agent/Task call the parent makes; the filter
    `tool_input.subagent_type == "data-builder"` narrows it to just the
    data-builder invocations.
    """
    samples_dir = FSI_FOUNDRY / "data" / "samples" / use_case_name

    async def _validate(input_data, tool_use_id, context):
        """PostToolUse handler — runs Gates 1 / 1.5 / 2 when a parent
        Agent/Task tool call has just returned from the data-builder
        subagent. Returns a `hookSpecificOutput.permissionDecision="deny"`
        payload to force the parent to re-invoke, or `{}` to allow.
        No-op for any other subagent invocation."""
        try:
            # PostToolUse fires for every tool. Only run on Agent|Task.
            if input_data.get("tool_name") not in ("Agent", "Task"):
                return {}

            # Only run on data-builder invocations. Trace the dispatch so
            # reviewers can confirm gates ran (or deliberately skipped) for
            # every subagent invocation, not just the data-builder ones.
            tool_input = input_data.get("tool_input") or {}
            subagent = tool_input.get("subagent_type", "?")
            log(f"{DIM}HOOK{RESET}", f"PostToolUse Agent: subagent={subagent}")
            if subagent != "data-builder":
                return {}

            if not samples_dir.is_dir():
                # Nothing to validate — data-builder wrote nothing. Let the
                # validator subagent's later filesystem check surface this.
                return {}

            # --- Gate 1: profile.json MUST live at the runtime-expected path ---
            # The runtime's s3_retriever.get_customer_profile() reads at:
            #     samples/<use_case_name>/<customer_id>/profile.json
            # (HARDCODED, no configurable subpath). If the data-builder wrote
            # profiles under an extra subdir like `clients/`, `customers/`, or
            # `applications/`, the runtime returns "Data not found" and EVERY
            # downstream field shows null extracted values.
            misplaced: list[str] = []
            all_profiles = list(samples_dir.rglob("profile.json"))
            for p in all_profiles:
                rel = p.relative_to(samples_dir)
                # Expected depth: <entity_id>/profile.json == 2 parts.
                # Anything deeper means an extra wrapper directory.
                if len(rel.parts) != 2:
                    misplaced.append(str(rel))
            if misplaced:
                reason = (
                    "data-builder cannot finish: one or more profile.json "
                    "files are at the WRONG filesystem location. The runtime "
                    "s3_retriever reads profiles at "
                    "`samples/<use_case_name>/<entity_id>/profile.json` "
                    "(fixed path — NO extra `clients/`, `customers/`, "
                    "`applications/`, or any other wrapper directory).\n\n"
                    "Move these files up one level (or remove the wrapper "
                    "directory entirely), then update any document_keys "
                    "inside the profile.json to drop the same wrapper prefix "
                    "from their s3_key values:\n  - "
                    + "\n  - ".join(misplaced[:10])
                    + (f"\n  - ...and {len(misplaced) - 10} more"
                       if len(misplaced) > 10 else "")
                )
                log(f"{YELLOW}WARN{RESET}", f"data-builder post-invoke blocked: profile location mismatch ({len(misplaced)})")
                return _deny(input_data, reason)

            # --- Gate 1.5: every s3_key MUST start with an existing entity_id ---
            # Separate semantic rule from Gate 2's file-existence check. Catches
            # the "invented wrapper directory" bug (e.g. s3_key="claims/CLM001/..."
            # or "applications/APP001/...") even if the data-builder accidentally
            # wrote files under the wrapper too. The runtime's get_object_by_key
            # prepends `samples/<uc>/` to the s3_key — so the key's first path
            # segment MUST be an entity_id that has a real entity directory on
            # disk. Any other prefix == guaranteed NoSuchKey at runtime.
            entity_ids = {
                p.name for p in samples_dir.iterdir()
                if p.is_dir() and (p / "profile.json").is_file()
            }
            bad_prefix: list[tuple[str, str, str]] = []  # (profile_name, key, first_segment)
            for profile_path in sorted(samples_dir.glob("*/profile.json")):
                try:
                    profile = json.loads(profile_path.read_text())
                except Exception:
                    continue
                doc_keys = profile.get("document_keys") or profile.get("documents") or profile.get("uploaded_files") or []
                for entry in doc_keys:
                    if isinstance(entry, dict):
                        key = entry.get("s3_key") or entry.get("key") or ""
                    else:
                        key = str(entry)
                    if not key:
                        continue
                    first = key.split("/", 1)[0]
                    if first not in entity_ids:
                        bad_prefix.append((profile_path.name, key, first))
            if bad_prefix:
                wrapper_segments = sorted({b[2] for b in bad_prefix})
                report_lines = [
                    f"- profile {name}: s3_key '{key}' starts with '{first}/' (not an entity_id)"
                    for name, key, first in bad_prefix[:10]
                ]
                more = f"\n- ...and {len(bad_prefix) - 10} more" if len(bad_prefix) > 10 else ""
                reason = (
                    "data-builder cannot finish: one or more document_keys have "
                    "an s3_key that starts with a wrapper directory instead of "
                    "an entity_id.\n\n"
                    "The runtime's s3_retriever resolves keys by prepending "
                    "`samples/<use_case_name>/`, so every s3_key MUST start "
                    "with an existing entity directory name (the same name "
                    "used for that entity's profile.json directory).\n\n"
                    f"Valid entity_ids in this use case: {sorted(entity_ids)}\n"
                    f"Invented wrapper prefix(es) found: {wrapper_segments}\n\n"
                    "Fix: rewrite each bad s3_key to drop the wrapper segment. "
                    "If you also wrote real binary files under the wrapper "
                    "directory, move them up one level so they live at "
                    "`samples/<uc>/<entity_id>/documents/...`. Then re-verify.\n\n"
                    "Offending keys:\n" + "\n".join(report_lines) + more
                )
                log(f"{YELLOW}WARN{RESET}", f"data-builder post-invoke blocked: {len(bad_prefix)} s3_keys have wrapper prefix")
                return _deny(input_data, reason)

            # --- Gate 2: every document_key in every profile MUST resolve ---
            missing = []
            checked = 0
            for profile_path in sorted(samples_dir.glob("*/profile.json")):
                try:
                    profile = json.loads(profile_path.read_text())
                except Exception:
                    continue
                entity_dir = profile_path.parent  # e.g. .../samples/<uc>/APP001
                doc_keys = profile.get("document_keys") or profile.get("documents") or profile.get("uploaded_files") or []
                for entry in doc_keys:
                    # Accept either bare-string keys or {s3_key: ...} dicts.
                    if isinstance(entry, dict):
                        key = entry.get("s3_key") or entry.get("key") or ""
                    else:
                        key = str(entry)
                    if not key:
                        continue
                    checked += 1

                    # The runtime's s3_retriever resolves a bare key by
                    # prepending `samples/<use_case_name>/`. The data-builder
                    # writes files under either `samples/<use_case_name>/<key>`
                    # OR — per prompt guidance — under
                    # `samples/<use_case_name>/<entity_dir>/<tail>`.
                    #
                    # Whichever convention the builder picked, the ground
                    # truth is: we must find this exact `key` (relative to
                    # samples_dir) as a real file.
                    expected_abs = samples_dir / key
                    # Also try the entity-nested form in case the profile
                    # dropped the entity prefix.
                    alt_abs = entity_dir / key

                    if not (expected_abs.is_file() or alt_abs.is_file()):
                        missing.append((profile_path.name, key, str(expected_abs)))

            if missing:
                report_lines = [
                    f"- profile {name}: key '{key}' not found on disk (expected at {expected})"
                    for name, key, expected in missing[:10]
                ]
                more = f"\n- ...and {len(missing) - 10} more" if len(missing) > 10 else ""
                reason = (
                    "data-builder cannot finish: checked "
                    f"{checked} document_keys across the profile.json files, "
                    f"{len(missing)} resolve to NO file on disk. At runtime the "
                    "agent will get 'Document not found' on every one and "
                    "produce null extractions.\n\n"
                    "Fix ONE of these two ways for each mismatch:\n"
                    "  (a) Generate the missing file at the path the profile "
                    "promises.\n"
                    "  (b) Edit the profile's document_keys to reference the "
                    "path where the file actually lives.\n\n"
                    "Mismatches:\n" + "\n".join(report_lines) + more
                )
                log(f"{YELLOW}WARN{RESET}", f"data-builder post-invoke blocked: {len(missing)} key/file mismatches")
                return _deny(input_data, reason)

            log(f"{GREEN}OK{RESET}", f"data-builder post-invoke validated: {checked} document_keys all resolve")
            return {}
        except Exception as e:
            log(f"{YELLOW}WARN{RESET}", f"data-builder post-invoke validator crashed ({e}); allowing")
            return {}

    return _validate


