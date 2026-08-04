# Payments Fraud Scoring & Investigation

Agent-native payments fraud platform: real-time transaction scoring, natural-language
case investigation, and FinCEN-structured SAR drafting — built on the full AVA agent
stack (Strands SDK + Bedrock AgentCore, Cognito, Langfuse).

This is the **agent-native counterpart** to the [`case-management`](../case-management/)
reference implementation. Where case-management implements fraud scoring and
investigation as serverless Lambdas with direct Bedrock calls, this app rebuilds the
same capabilities as a true multi-agent system: a supervisor agent delegates to three
specialists, each independently invocable, observable end-to-end in Langfuse, and
bound to typed contracts. Same fraud story, agent-native architecture.

## Key Capabilities

- **Real-time fraud scoring** — score an incoming payment, returning a fraud score
  (0.0–1.0), risk level, a three-tier decision (`approve` / `step_up_review` /
  `hold_and_case`), and machine-readable reason tags.
- **Natural-language investigation** — ask in plain English about an account or case;
  the agent pulls transactions and counterparty links, detects typologies (smurfing,
  velocity, mule networks, round-tripping), and compiles cited evidence.
- **SAR drafting** — generate a FinCEN-structured Suspicious Activity Report from an
  investigation's findings. Drafts for human review only — never auto-filed.
- **Pattern coverage** — smurfing, high velocity, fan-in / mule destinations,
  large-amount and new-beneficiary anomalies, plus investigation-level typologies.
- **Auditable by design** — deterministic models (temperature 0.1), typed output
  contracts, and Langfuse traces over every agent decision.

## Architecture

See the rendered diagrams (Mermaid, inline on GitLab/GitHub):
[**architecture**](docs/diagram/architecture.md) ·
[**data flow**](docs/diagram/data-flow.md)

A **supervisor agent** classifies each request and delegates to one of three
specialists, chaining them when a workflow requires it (investigation → SAR). The
specialists run on **Bedrock AgentCore Runtime** using the **Strands SDK**, following
the official `supervisor-specialists` control-plane template pattern (specialist
`Agent` instances passed directly in the supervisor's `tools=[...]`).

| Agent | Model | Input contract | Output contract |
|-------|-------|----------------|-----------------|
| **Transaction Scorer** | Claude Haiku | `ScoreRequest` | `ScoreResult` |
| **Investigation Agent** | Claude Sonnet | `InvestigationRequest` | `InvestigationResult` |
| **SAR Report Agent** | Claude Sonnet | `SARRequest` | `SARReport` |
| **Supervisor** | Claude Sonnet | NL prompt | routes / chains the above |

Contracts are defined in [`src/strands/contracts.py`](src/strands/contracts.py).
Scores are 0.0–1.0 floats and patterns use a shared `FraudPattern` vocabulary, both
matching `case-management` for direct comparability.

### Tech Stack

- **Frontend**: Next.js + MUI (Material UI), with a server-side BFF proxy to AgentCore
- **Auth**: Amazon Cognito (composes the `auth-cognito` control-plane template)
- **Agents**: Strands Agents SDK on Amazon Bedrock AgentCore Runtime
- **Data**: DynamoDB (transactions, cases, SARs) + S3 (account profiles, sample data)
- **Observability**: Langfuse via OpenTelemetry (composes the `agent-observability`
  template / Foundation Stack)
- **IaC**: Terraform (composes `agent-runtime-agentcore`, `auth-cognito`,
  `agent-observability`)

## Project Structure

```
payments-fraud/
├── README.md
├── template.json                 # catalog metadata
├── pyproject.toml                # Python deps (strands optional-extra)
├── Dockerfile                    # AgentCore container (FRAMEWORK build-arg)
├── .env.example
├── src/strands/                  # agent backend (Strands SDK)
│   ├── contracts.py              # Pydantic input/output contracts for all 3 agents
│   ├── config.py                 # env-var config + Langfuse OTLP helper
│   ├── tools.py                  # data-access tools (DynamoDB/S3, degrade gracefully)
│   ├── agents.py                 # 3 specialists + supervisor
│   └── main.py                   # AgentCore entrypoint (route → invoke → validate)
├── data/                         # bundled synthetic sample data (6 accounts, 24 txns)
│   ├── accounts/<id>/profile.json
│   ├── transactions.json
│   └── README.md
├── iac/terraform/                # infrastructure (composes control-plane templates)
├── frontend/                     # Next.js + MUI UI + BFF proxy (Simulate/Investigate/SAR)
├── scripts/                      # seed_data.py — upload sample data with recent timestamps
├── tests/                        # pytest contract tests (no AWS needed)
└── docs/diagram/                 # architecture + data-flow diagrams (Mermaid)
```

## Deploy your own

This is a **reference implementation**: you deploy it into your **own** AWS account.
Every resource (DynamoDB, S3, Cognito, ECR, AgentCore runtime) is created by your own
`terraform apply` — there is no shared/hosted instance. All values below (region,
account id, table names) come from *your* deploy.

### Prerequisites

- An AWS account with **Amazon Bedrock model access** enabled for Claude Sonnet 4.5
  and Claude Haiku 4.5 (in your target region, e.g. `us-east-1`).
- **Terraform** ≥ 1.5, **Docker**, **Node.js** 18+, **AWS CLI** (authenticated).
- *(Optional)* an AVA **Foundation Stack** for Langfuse observability — without it the
  app still runs and emits CloudWatch/X-Ray traces.
- The AgentCore container image must be built for **`linux/arm64`** (AgentCore runs on
  Graviton).

### 1. Create infra + ECR repo (first apply)

```bash
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars   # set project_name, aws_region; leave container_image_uri=""
terraform init
# First apply creates the ECR repo and data stores (the runtime needs an image, so
# target everything except it for now):
terraform apply \
  -target=module.runtime.aws_ecr_repository.agent \
  -target=aws_dynamodb_table.transactions -target=aws_dynamodb_table.cases \
  -target=aws_dynamodb_table.sars -target=aws_kms_key.data -target=aws_s3_bucket.data \
  -target=module.auth
ECR_URL=$(terraform output -raw ecr_repository_url)
```

### 2. Build & push the agent image (arm64)

```bash
cd ../..                                        # back to the package root
aws ecr get-login-password --region <your-region> \
  | docker login --username AWS --password-stdin "${ECR_URL%/*}"
docker build --platform linux/arm64 --build-arg FRAMEWORK=strands -t "$ECR_URL:v1" .
docker push "$ECR_URL:v1"
```

### 3. Full apply (creates the AgentCore runtime)

```bash
cd iac/terraform
# set container_image_uri = "<ECR_URL>:v1" in terraform.tfvars, then:
terraform apply
```

> If `terraform apply` fails on the X-Ray trace delivery, enable CloudWatch
> Transaction Search once per account:
> `aws xray update-trace-segment-destination --destination CloudWatchLogs`
> (and add a CloudWatch Logs resource policy granting `xray.amazonaws.com`
> `logs:PutLogEvents` on the `aws/spans` log group), then re-apply.

### 4. Seed the sample data

The seed script uploads the bundled account profiles and shifts their timestamps so
the activity always reads as recent (relative spacing — e.g. the 48-hour smurfing
window — is preserved):

```bash
BUCKET=$(cd iac/terraform && terraform output -raw data_bucket)
python scripts/seed_data.py --bucket "$BUCKET" --region <your-region>
# add --dry-run to preview the shifted dates without uploading
```

You only need to run this **once** — the data persists in S3. Re-run it any time you
want to *freshen* the dates before a demo (the seeded timestamps age by one calendar
day per day, so data seeded last week will read as ~a week old). It's idempotent and
overwrites in place.

### 5. Create a login user

Self-registration is disabled, so create the first user as an administrator:

```bash
POOL=$(terraform output -raw cognito_user_pool_id)
aws cognito-idp admin-create-user --user-pool-id "$POOL" \
  --username analyst@example.com \
  --user-attributes Name=email,Value=analyst@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" \
  --username analyst@example.com --password '<a-strong-password>' --permanent
```

### 6. Run the frontend

```bash
cd ../../frontend
cp .env.example .env.local      # set AGENTCORE_RUNTIME_ARN + NEXT_PUBLIC_COGNITO_* from terraform outputs
npm install && npm run dev      # http://localhost:3000
```

The Next.js BFF (`/api/agent`) invokes the AgentCore runtime with your AWS credentials
(SigV4) — the browser never holds AWS credentials. Sign in with the user from step 5.
To run **without** a login gate (local dev), leave the `NEXT_PUBLIC_COGNITO_*` vars
unset in `.env.local`.

### Run just the agent locally (no infra)

```bash
pip install -e ".[strands]"
cp .env.example .env
python -m src.strands.main      # serves on :8080 — GET /ping, POST /invocations
```

## Sample Data

Six synthetic accounts cover the core fraud typologies — see
[`data/README.md`](data/README.md) for the full scenario table and demo prompts.
Account ids, scores, and patterns mirror `case-management` so the two apps are
directly comparable. Highlights:

| Account | Scenario | Decision |
|---------|----------|----------|
| A705 | Smurfing (sub-CTR structuring) | step_up_review |
| A305 | High velocity (8 txns / 32 min) | step_up_review |
| A801 | Mule fan-in (new collection account) | hold_and_case |
| A150 / A160 | Clean controls | approve |

## Testing

Unit tests cover the agent contracts (the typed input/output interface) and confirm
the bundled sample data conforms to them. They are pure and fast - no AWS or Bedrock
needed:

```bash
pip install -e ".[test]"
pytest
```

## Security

- **No real PII** — all data is synthetic and fabricated.
- **Cognito login gate** — the UI requires Cognito sign-in (when configured);
  self-registration is disabled (admin-created users only). The browser never holds
  AWS credentials — the Next.js BFF invokes the AgentCore runtime server-side via SigV4.
- **Human-in-the-loop SAR** — the SAR agent drafts reports for analyst review and
  never files them; `filing_recommendation` defaults to `needs_human_review`.
- **Least privilege** — agent IAM role scoped to Bedrock invoke + its own data stores;
  DynamoDB and S3 encrypted with a customer-managed KMS key.
- **Optional Bedrock Guardrails** — wired via `GUARDRAIL_ID` when configured.

## Documentation

- [Agent contracts](src/strands/contracts.py) — input/output schemas
- [Sample data](data/README.md) — scenarios and demo prompts
- [Architecture diagram](docs/diagram/architecture.md) · [Data-flow diagram](docs/diagram/data-flow.md)
- [AVA control-plane templates](../../../platform/docs/templates/README.md) — the
  building blocks this app composes
- [`case-management`](../case-management/) — the serverless counterpart this rebuilds

---

Part of the [AVA Reference Implementations](../README.md). Built for the FSI TFC
graduation program.
