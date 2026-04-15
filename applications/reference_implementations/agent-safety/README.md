# Agent Safety Controls for Amazon Bedrock AgentCore

A modular toolkit for monitoring and managing AI agents running on Amazon Bedrock AgentCore. Provides human-in-the-loop (HIL) safety controls with a centralized dashboard, automated cost management, and session-level intervention capabilities.

## What This Does

When you deploy this toolkit in your AWS account, you get:

- A **web dashboard** (App Runner + Cognito auth) that shows all your AgentCore agents, their cost signals, and active sessions
- **Automatic budget creation** — every time you deploy a new agent, an AWS Budget is created and tracked on the dashboard
- **Session stop controls** — stop individual sessions or all sessions for an agent directly from the dashboard
- **Audit trail** — every intervention is logged with who did it, why, and when
- **DynamoDB as single source of truth** — the dashboard reads only from DynamoDB, making it fast and portable

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard (App Runner)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Cost     │  │  Agent   │  │ Sessions │  │ Interventions│   │
│  │  Signals  │  │ Registry │  │          │  │   (Audit)    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │             │                │            │
│       └──────────────┴─────────────┴────────────────┘            │
│                              │                                   │
│                     DynamoDB (6 tables)                          │
└─────────────────────────────────────────────────────────────────┘
                               ▲
                               │ writes
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
  ┌─────┴──────┐    ┌─────────┴────────┐    ┌───────┴───────┐
  │ Auto Budget│    │  Agent Session   │    │  Stop Sessions│
  │  Lambda    │    │   Reporter       │    │    Lambda     │
  │            │    │  (in agent code) │    │               │
  └─────┬──────┘    └─────────┬────────┘    └───────────────┘
        │                     │
  EventBridge           AgentCore Runtime
  (CreateAgent)         (per invocation)
```

## Prerequisites

Before deploying, make sure you have:

- AWS CLI v2 configured with appropriate IAM permissions
- Python 3.11+ with `boto3` installed
- Docker (for building the dashboard container)
- `uv` package manager (for cross-platform agent packaging)
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- Amazon Bedrock model access enabled (Claude Sonnet 4 recommended)
- AgentCore access enabled in your AWS account

### Required IAM Permissions

The `--profile` parameter must point to an AWS CLI profile with **AdministratorAccess** or equivalent permissions. The deploy creates IAM roles, DynamoDB tables, Lambda functions, Cognito User Pools, App Runner services, and more.

**Important:** The profile must assume a role with admin permissions — using an IAM user directly may not have sufficient permissions even if the user has admin policies attached. This is because some organizations apply Service Control Policies (SCPs) that restrict IAM users but not assumed roles.

**How to verify your profile has the right permissions:**

```bash
# Check who you are — should show assumed-role/Admin/... (not user/...)
aws sts get-caller-identity --profile <your-profile>

# Expected output (good):
# "Arn": "arn:aws:sts::123456789012:assumed-role/Admin/your-session"

# If you see this instead, your profile is using an IAM user directly (may fail):
# "Arn": "arn:aws:iam::123456789012:user/your-username"
```

**If your profile uses an IAM user**, configure it to assume an admin role in `~/.aws/config`:

```ini
[profile my-admin]
role_arn = arn:aws:iam::123456789012:role/Admin
source_profile = default
region = us-east-2
```

Then use `--profile my-admin` when deploying.

**Minimum IAM permissions required** (if not using AdministratorAccess):
- `cloudformation:*` — Stack management
- `iam:*` — Role creation for Lambda, App Runner, AgentCore
- `dynamodb:*` — Table creation and data access
- `cognito-idp:*` — User Pool, App Client, Domain, User management
- `ecr:*` — Container registry
- `apprunner:*` — Dashboard service
- `lambda:*` — Lambda functions and layers
- `events:*` — EventBridge rules
- `sns:*` — Notification topics
- `budgets:ModifyBudget`, `budgets:ViewBudget` — Budget management
- `s3:*` — Deployment artifacts
- `bedrock:*`, `bedrock-agentcore:*` — Agent runtime and model access
- `cloudwatch:*`, `logs:*`, `xray:*` — Observability
- `sts:GetCallerIdentity` — Account detection

## Quick Start — Deploy Everything

One command deploys the full stack: dashboard, cost controls, and a sample agent.

**Option A: Using an AWS CLI profile (internal/Isengard users):**

```bash
./deploy-all.sh \
  --profile <your-aws-profile> \
  --region us-east-2 \
  --admin-email you@company.com \
  --admin-password 'YourPassword123'
```

**Option B: Using environment credentials (external users):**

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...    # if using temporary credentials

./deploy-all.sh \
  --region us-east-2 \
  --admin-email you@company.com \
  --admin-password 'YourPassword123'
```

When `--profile` is not provided, the scripts use the default AWS credential chain (environment variables, `~/.aws/credentials`, instance role, SSO).

This takes about 15-20 minutes and creates:

| Phase | What Gets Created | Time |
|-------|-------------------|------|
| 1. Dashboard | ECR repo, Docker image, 6 DynamoDB tables, Cognito User Pool, App Runner service, Stop Sessions Lambda | ~10 min |
| 2. Cost Controls | SNS topic, EventBridge rule, Auto Budget Lambda, Stop Sessions Lambda, boto3 Lambda layer | ~3 min |
| 3. Sample Agent | Bedrock Inference Profile, S3 deployment package, IAM role, AgentCore Runtime | ~5 min |

At the end, you'll see the dashboard URL and can sign in immediately.

## Deploy Components Individually

Each component can be deployed independently. Deploy in this order if doing it manually:

### Step 1: Dashboard

```bash
cd dashboard
# With profile:
./deploy.sh --profile <your-aws-profile> --region us-east-2 \
  --admin-email you@company.com --admin-password 'YourPassword123'

# Or with environment credentials (no --profile):
./deploy.sh --region us-east-2 \
  --admin-email you@company.com --admin-password 'YourPassword123'
```

Creates: ECR repo → Docker image → CloudFormation stack (DynamoDB tables, Cognito, App Runner, Lambda)

### Step 2: Cost Controls

```bash
cd cost-controls
./deploy.sh \
  --profile <your-aws-profile> \
  --region us-east-2 \
  --cost-signals-table safety-dashboard-cost-signals \
  --registry-table safety-dashboard-registry \
  --session-table safety-dashboard-sessions \
  --intervention-table safety-dashboard-interventions
```

Creates: SNS topic, EventBridge rule (triggers on agent create/delete), Auto Budget Lambda, Stop Sessions Lambda

### Step 3: Sample Agent (optional)

```bash
cd sample-agent
# Requires Python with boto3 installed
python deploy.py \
  --name my_agent \
  --region us-east-2 \
  --profile <your-aws-profile> \
  --session-table safety-dashboard-sessions
```

Creates: Bedrock Inference Profile (tagged for cost tracking), S3 deployment package, CloudFormation stack (IAM role, AgentCore Runtime)

### Invoke the Agent

```bash
python sample-agent/invoke_agent.py \
  --arn <AGENT_RUNTIME_ARN> \
  --prompt "Hello, what can you help me with?" \
  --region us-east-2 \
  --profile <your-aws-profile>
```

## Tear Down Everything

```bash
./destroy-all.sh \
  --profile <your-aws-profile> \
  --region us-east-2 \
  --agent-name my_agent
```

Deletes all CloudFormation stacks in reverse order, cleans up ECR images and Lambda layers.

## Project Structure

```
agent-safety-kit/
│
├── deploy-all.sh                  # One-command full stack deploy
├── destroy-all.sh                 # One-command full stack teardown
├── SIGNALS_CONTRACT.md            # DynamoDB schema contract for signal producers
├── README.md                      # This file
│
├── dashboard/                     # Admin dashboard (App Runner + Cognito)
│   ├── api.py                     # FastAPI backend — reads from DynamoDB only
│   ├── index.html                 # Single-file frontend (HTML/CSS/JS)
│   ├── Dockerfile                 # Container image for App Runner
│   ├── template.yaml             # CF: DynamoDB tables + Cognito + App Runner + Lambda
│   ├── ecr-stack.yaml            # CF: ECR repository
│   ├── deploy.py                 # Docker build + ECR push script
│   ├── deploy.sh                 # Full dashboard deployment script
│   └── requirements.txt
│
├── cost-controls/                 # Automated cost management
│   ├── template.yaml             # CF: SNS + EventBridge + Lambdas
│   ├── deploy.sh                 # Cost controls deployment script
│   ├── budgets.py                # CLI for manual budget sync
│   ├── stop_sessions_lambda.py   # Bulk session stop (standalone version)
│   └── Auto_budget_creation/
│       └── auto_budget_lambda.py # EventBridge-triggered budget automation
│
├── sample-agent/                  # AgentCore agent with safety controls
│   ├── template.yaml             # CF: IAM role + AgentCore Runtime
│   ├── deploy.py                 # Package + deploy script
│   ├── deploy.sh                 # Interactive deployment wizard
│   ├── invoke_agent.py           # CLI to invoke deployed agent
│   └── agents/
│       ├── stateless_agent.py    # Agent code (DynamoDB sessions)
│       ├── memory_agent.py       # Agent code (AgentCore Memory sessions)
│       ├── session_reporter.py   # DynamoDB heartbeat reporter
│       ├── cloudwatch_metrics.py # Token usage metrics publisher
│       └── requirements.txt
│
└── hil-interventions/             # Human-in-the-loop tools
    ├── tables.py                  # Create all DynamoDB tables
    ├── registry.py                # Agent registry CRUD CLI
    ├── stop_session.py            # Stop session Lambda handler
    └── intervene.py               # Manual intervention CLI
```

## How It Works

### Data Flow

1. **Agent deployed** → EventBridge catches `CreateAgentRuntime` → Auto Budget Lambda creates AWS Budget + writes to `cost-signals` and `agent-registry` DynamoDB tables
2. **Agent invoked** → Agent's `session_reporter.py` writes session heartbeats to `session-token-usage` DynamoDB table
3. **Dashboard loaded** → Frontend calls `POST /api/sync` → backend reads from AWS APIs (Budgets, CloudWatch, AgentCore) → writes to DynamoDB → frontend reads from DynamoDB
4. **Session stopped** → Dashboard calls Lambda → Lambda reads agent ARN from `agent-registry` → stops session via AgentCore → marks terminated in `session-token-usage` → logs to `intervention-log` → cascades to `cost-signals`
5. **Agent deleted** → EventBridge catches `DeleteAgentRuntime` → Auto Budget Lambda deletes budget + removes from `cost-signals` + marks deleted in `agent-registry`

### DynamoDB Tables (6 total)

| Table | Purpose | Key |
|-------|---------|-----|
| `safety-dashboard-registry` | Agent metadata, runtime info, thresholds | `agent_name` |
| `safety-dashboard-sessions` | Live session tracking with heartbeats | `session_id` |
| `safety-dashboard-interventions` | Audit trail of all stop actions | `intervention_id` |
| `safety-dashboard-cost-signals` | Per-agent budget data from AWS Budgets | `agent_name` |
| `safety-dashboard-obs-signals` | Per-agent observability from CloudWatch alarms | `agent_name` + `signal_key` |
| `safety-dashboard-eval-signals` | Per-agent evaluation scores | `agent_name` + `signal_key` |

### Authentication

The dashboard uses Amazon Cognito for authentication:
- User Pool with email-based sign-in
- Admin-only user creation (no self-signup)
- OAuth 2.0 code flow with Cognito Hosted UI
- JWT token validation on every API request
- Auth is disabled when `COGNITO_USER_POOL_ID` is not set (local development)

### Session Management

Two approaches depending on agent type:

| Agent Type | How Sessions Are Tracked | Dashboard Integration |
|------------|--------------------------|----------------------|
| Stateless | `session_reporter.py` writes heartbeats to DynamoDB | Automatic — dashboard reads DynamoDB |
| Memory-enabled | AgentCore Memory tracks sessions via `ListSessions` API | Dashboard syncs memory sessions to DynamoDB |

Session states: **Active** (heartbeat < 6 min ago) → **Idle** (6-30 min) → **Inactive** (> 30 min, auto-terminated)

## Configuration Reference

### Dashboard Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_PROFILE` | (empty) | AWS CLI profile name |
| `COGNITO_USER_POOL_ID` | (empty) | Cognito User Pool ID (empty = auth disabled) |
| `COGNITO_APP_CLIENT_ID` | (empty) | Cognito App Client ID |
| `COGNITO_DOMAIN` | (empty) | Cognito hosted UI domain |
| `COGNITO_REDIRECT_URI` | (empty) | OAuth callback URL |
| `REGISTRY_TABLE` | `agent-registry` | DynamoDB table for agent registry |
| `SESSION_TABLE` | `session-token-usage` | DynamoDB table for sessions |
| `INTERVENTION_TABLE` | `intervention-log` | DynamoDB table for audit log |
| `COST_SIGNALS_TABLE` | `cost-signals` | DynamoDB table for cost signals |
| `OBS_SIGNALS_TABLE` | `observability-signals` | DynamoDB table for obs signals |
| `EVAL_SIGNALS_TABLE` | `evaluation-signals` | DynamoDB table for eval signals |
| `BUDGET_PREFIX` | `agent-` | AWS Budget name prefix |
| `STOP_SESSIONS_LAMBDA` | `AgentSafety-StopSessions` | Lambda function name for bulk stop |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins |

### Dashboard API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | No | Serves the dashboard HTML |
| `GET` | `/api/health` | No | Health check (DynamoDB + AgentCore connectivity) |
| `GET` | `/api/auth/config` | No | Returns Cognito config for frontend |
| `POST` | `/api/auth/token` | No | Exchange Cognito auth code for tokens |
| `GET` | `/api/registry` | Yes | List all agents from registry |
| `GET` | `/api/registry/{name}` | Yes | Get single agent details |
| `GET` | `/api/sessions` | Yes | List all sessions |
| `GET` | `/api/sessions/agent/{name}` | Yes | List sessions for specific agent |
| `GET` | `/api/interventions` | Yes | List intervention audit log |
| `GET` | `/api/cost-signals` | Yes | List cost signals |
| `GET` | `/api/obs-signals` | Yes | List observability signals |
| `GET` | `/api/eval-signals` | Yes | List evaluation signals |
| `POST` | `/api/interventions/stop-session` | Yes | Stop a single session |
| `POST` | `/api/interventions/stop-all-sessions` | Yes | Stop all sessions for an agent |
| `POST` | `/api/registry/set-budget` | Yes | Set monthly budget for an agent |
| `POST` | `/api/sync` | Yes | Sync all DynamoDB tables from AWS |
| `POST` | `/api/sync/registry` | Yes | Sync registry only |
| `POST` | `/api/sync/cost-signals` | Yes | Sync cost signals only |
| `POST` | `/api/sync/obs-signals` | Yes | Sync observability signals only |
| `POST` | `/api/sync/eval-signals` | Yes | Sync evaluation signals only |

## Extending with New Signal Types

See [SIGNALS_CONTRACT.md](SIGNALS_CONTRACT.md) for the DynamoDB schema contract. If you're building a Lambda that produces signals (cost, observability, evaluation), write to the appropriate DynamoDB table following the contract and the dashboard will display your data automatically.

## Local Development

Run the dashboard locally without auth:

```bash
cd dashboard
pip install -r requirements.txt
AWS_PROFILE=<your-profile> uvicorn api:app --reload --port 8000
```

Open `http://localhost:8000` — auth is disabled when Cognito env vars are not set.

## Security

- Cognito User Pool with admin-only user creation (no self-signup)
- All API endpoints require JWT authentication when Cognito is configured
- IAM roles follow least-privilege: each component only has permissions for its specific resources
- DynamoDB tables use server-side encryption (SSE)
- App Runner binds to HTTPS only
- No security groups or IAM roles are opened to the public
- Every session stop action requires a reason and admin identity (audit trail)

## Tech Stack

- Python 3.11+, FastAPI, Uvicorn
- Amazon Bedrock AgentCore (agent runtime)
- Amazon DynamoDB (data store)
- Amazon Cognito (authentication)
- AWS App Runner (dashboard hosting)
- AWS Lambda (automation)
- Amazon EventBridge (event routing)
- AWS Budgets + SNS (cost management)
- Amazon CloudWatch (metrics + logs)
- Strands Agents framework
- OpenTelemetry (ADOT) for observability
