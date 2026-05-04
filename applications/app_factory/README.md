# App Factory

App Factory is the mechanism within AVA for turning a business stakeholder's idea into a deployable agentic application. A business user fills out a plain-language questionnaire in the Control Plane UI; the factory generates all the Python, React, Terraform, and sample data for the use case and deploys it to AWS AgentCore Runtime end-to-end.

---

## How it works

```
Business user
    │  (fills questionnaire on /applications/app-factory)
    ▼
Control Plane backend  ─▶  DynamoDB (SUBMISSION#<uuid>)
    │  (on Deploy)
    ▼
Step Functions (ava-cp-dev-982569-deployment)
    │  orchestrates validate → package → build → monitor → capture
    ▼
CodeBuild (runs applications/app_factory/deploy.sh)
    │
    ├─ Phase 1   python3 -m app_factory.builder          (code generation)
    ├─ Phase 1.5 scoped source-zip to S3
    ├─ Phase 1.6 docs capture to /tmp/docs_outputs.json
    ├─ Phase 2a  terraform apply  (infra: ECR, data S3, IAM)
    ├─ Phase 2b  docker build + push to ECR
    ├─ Phase 2c  terraform apply  (runtime: AgentCore CFN stack)
    ├─ Phase 2c.5 publish_to_registry.py                 (Agent Registry, non-fatal)
    └─ Phase 2d  terraform apply  (UI: CloudFront + API GW + Lambdas)
```

Total runtime 15–25 min. Every phase state transition lands in DynamoDB so the UI can show live progress.

---

## Builder architecture — `builder.py`

`builder.py` is the Claude Agent SDK orchestrator that drives code generation. It defines a parent orchestrator (Opus, 80 turns) and six specialized subagents, each with its own prompt, tool allowlist, model, turn budget, and effort level:

| Subagent         | Role                                                        | Model   | Turns |
|------------------|-------------------------------------------------------------|---------|-------|
| `agent-builder`  | Generates all Python: orchestrator, agents/, models, tools.py | opus    | 40    |
| `ui-builder`     | Customizes the React console, wires runtime-config.json     | opus    | 30    |
| `infra-builder`  | Extra Terraform when the use case needs more than defaults  | opus    | 20    |
| `data-builder`   | Sample profile JSON + real PDF / image documents            | haiku   | 15    |
| `docs-builder`   | "About this deployment" markdown for the UI                 | haiku   | 10    |
| `validator`      | 7-check read-only QA pass before pipeline sign-off          | sonnet  | 20    |

Prompts live in `prompts/*.py`, one module per subagent. Shared path constants are in `paths.py`; ANSI console helpers and `log()` are in `console.py`.

---

## Hook-based enforcement — `hooks.py`

Prompts are probabilistic. Hooks are deterministic. Every file write and every data-builder completion is checked at the SDK level by `hooks.py`:

**PreToolUse** — fires on every `Write|Edit`, denies with a reason if matched:
- **A** `.json` file inside `/documents/`, `/uploads/`, `/attachments/`
- **B** `.pdf` write whose body doesn't start with `%PDF-`
- **C** agent file with `s3_retriever_tool` in its `tools=[]` list
- **D** `orchestrator.py` missing a `_prefetch_data` method
- **E** absolute `from use_cases.<id>.src.<framework>.` import
- **F** UI `.tsx` using `item.severity`, `item.message`, or `JSON.stringify(item)` fallbacks
- **G** orchestrator prefetching `content_base64` into agent input_text

**SubagentStop** (matcher: `data-builder`) — cross-file consistency when the data-builder declares itself done:
- **Gate 1**   every `profile.json` must live at `<entity_id>/profile.json`
- **Gate 1.5** every `s3_key` must start with an existing entity_id
- **Gate 2**   every `document_key` must resolve to a real file on disk

Any gate failure returns `{decision: "block", reason: ...}` and forces the subagent to retry.

---

## Directory layout

```
app_factory/
├── __init__.py            # package marker — run as `python3 -m app_factory.builder`
├── builder.py             # runner, CLI, DynamoDB I/O, post-gen patch passes
├── paths.py               # REPO_ROOT, FSI_FOUNDRY, REFERENCE_USE_CASE, UI_TEMPLATE
├── console.py             # ANSI color helpers + log() / log_tool_use()
├── hooks.py               # PreToolUse rules A–G + SubagentStop gates 1 / 1.5 / 2
├── prompts/
│   ├── orchestrator.py    # parent system prompt
│   ├── agent_builder.py
│   ├── ui_builder.py
│   ├── infra_builder.py
│   ├── data_builder.py
│   ├── docs_builder.py
│   └── validator.py
├── deploy.sh              # CodeBuild buildspec — all phases listed above
├── scripts/
│   └── publish_to_registry.py   # A2A agent card publish (non-fatal)
├── ui-template/           # React scaffolding the ui-builder customizes per use case
└── README.md              # this file
```

---

## Running locally

```bash
# From applications/ (so Python finds the package on sys.path)
cd applications/
python3 -m app_factory.builder --dry-run                      # prints orchestrator prompt only
python3 -m app_factory.builder --answers-file answers.json    # runs full generation
python3 -m app_factory.builder --submission-id <uuid>         # fetches answers from DynamoDB
```

Requires:
- `claude-agent-sdk >= 0.1.63` (pip)
- `@anthropic-ai/claude-code` CLI (npm)
- `CLAUDE_CODE_USE_BEDROCK=1` + `ANTHROPIC_MODEL` env vars
- AWS credentials with Bedrock access

CodeBuild stages everything automatically; see `deploy.sh` for the phase-by-phase flow.

---

## Related

- [FSI Foundry](../fsi_foundry/) — shared foundations every generated use case sits on top of
- [Control Plane backend](../../platform/control_plane/backend/) — the FastAPI service that accepts submissions and triggers deploys
- [Reference Implementations](../reference_implementations/) — hand-written end-to-end solutions (pre-App-Factory)
- [AVA Overview](../../README.md) — full project overview
