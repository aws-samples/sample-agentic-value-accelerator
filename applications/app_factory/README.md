# App Factory

App Factory is the mechanism within AVA for turning a business stakeholder's idea into a deployable agentic application. The goal is to remove the translation layer between what a business wants and what engineers build — by capturing requirements in plain language and converting them into structured context that AI coding assistants can act on directly.

---

## Current State

### Questionnaire

The Control Plane UI includes a multi-step questionnaire at `/applications/app-factory`. It is designed for business stakeholders, not engineers — no framework choices, no infrastructure decisions, no technical language. The five steps cover:

- **The Problem** — the use case name, business domain, what's broken today, and how it's currently handled
- **The Users** — who interacts with the application and what a successful outcome looks like
- **The Workflow** — the process end to end, any human-in-the-loop approvals, and how frequently it runs
- **The Data** — what information the application consumes and what it produces
- **Constraints** — regulatory requirements (GDPR, FINRA, ECOA, etc.) and existing systems that need integration

Each submission is validated before the user can advance to the next step. On completion, the full set of answers is stored in DynamoDB and the user receives a submission ID.

### Storage

Submissions are stored in DynamoDB with a `SUBMISSION#{id}` partition key and `META` sort key. Each record contains the raw questionnaire answers and a `created_at` timestamp.

### Blueprint Generation

A local generation script (`generate_blueprint.py`) takes questionnaire answers and calls Bedrock (Claude Sonnet) to produce four markdown files:

- `spec.md` — full application specification: purpose, users, success criteria, edge cases
- `agents.md` — agent definitions, tools, decision logic, and orchestration patterns
- `infra.md` — AWS services, data flow, security model, and deployment topology
- `tests.md` — unit, integration, and end-to-end test scenarios with expected behaviors

These files are written to `blueprints/<use_case_name>/`. They are not meant to be human documentation — they are structured context files intended to be loaded into an AI coding assistant session (Claude Code, Kiro, etc.) to generate a working implementation.

---

## Blueprint Structure

```
app_factory/
├── blueprints/
│   └── <use_case_name>/
│       ├── spec.md       # Application specification
│       ├── agents.md     # Agent definitions and workflows
│       ├── infra.md      # Infrastructure requirements
│       └── tests.md      # Test specifications
├── generate_blueprint.py
└── README.md
```

---

## Future Plans

### Phase 3 — Automated Generation from Submissions

The next step is connecting the questionnaire directly to the blueprint generation pipeline. When a stakeholder submits a use case through the UI, the backend will invoke Bedrock to generate the four blueprint files and store them alongside the submission record in DynamoDB (or S3). The Control Plane UI will show the generated files and allow the team to review them before moving forward.

### Phase 4 — End-to-End Deployment


The blueprint format is designed with this in mind. The files are explicit and unambiguous so that an AI coding assistant can generate production-quality code from them on the first pass, with minimal back-and-forth.

---

## Related

- [FSI Foundry](../fsi_foundry/) — Multi-agent POC implementations on shared foundations
- [AVA Overview](../../README.md) — Full project overview
