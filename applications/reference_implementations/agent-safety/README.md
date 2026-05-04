# Agent Safety Controls for Amazon Bedrock AgentCore

A modular toolkit for monitoring and managing AI agents running on Amazon Bedrock AgentCore. Provides human-in-the-loop (HIL) safety controls with a centralized dashboard, automated cost management, evaluation monitoring, observability, and session-level intervention capabilities.

## What This Does

When you deploy this toolkit in your AWS account, you get:

- **Web Dashboard** — ECS Express Mode + CloudFront + Cognito auth. Shows all your AgentCore agents, cost/eval/obs signals, active sessions, and intervention controls
- **Automatic Budget Creation** — every time you deploy a new agent, an AWS Budget is created with SNS email alerts at 80% and 100% thresholds
- **Automatic Evaluation Setup** — every new agent gets an AgentCore Online Evaluation config (7 built-in evaluators) and a CloudWatch alarm that fires on quality issues
- **Automatic Observability Alarms** — anomaly detection alarms for latency, errors, token usage, and invocation count per agent
- **Session Controls** — stop individual sessions or all sessions for an agent from the dashboard
- **Kill Switch** — revoke Bedrock access for a single agent or all agents instantly via IAM deny policy (reversible)
- **Audit Trail** — every intervention is logged with who did it, why, and when
- **DynamoDB as Single Source of Truth** — the dashboard reads only from DynamoDB, making it fast and portable

## Architecture

```
                         ┌──────────────┐
                         │  CloudFront  │
                         └──────┬───────┘
                                │ (origin verify header)
┌───────────────────────────────┴─────────────────────────────────┐
│                   Dashboard (ECS Express Mode)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Cost     │  │  Eval    │  │  Obs     │  │ Kill Switch  │   │
│  │  Signals  │  │  Signals │  │  Signals │  │ (IAM Deny)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       └──────────────┴─────────────┴────────────────┘           │
│                              │                                  │
│                     DynamoDB (6 tables)                         │
└─────────────────────────────────────────────────────────────────┘
                               ▲
                               │ writes
     ┌─────────────────────────┼──────────────────────────┐
     │              │          │           │               │
┌────┴─────┐ ┌─────┴────┐ ┌───┴───┐ ┌────┴─────┐ ┌──────┴──────┐
│Auto      │ │Auto Eval │ │Auto   │ │ Session  │ │Kill Switch  │
│Budget    │ │Lambda    │ │Obs    │ │ Reporter │ │Lambda       │
│Lambda    │ │          │ │Lambda │ │(in agent)│ │(IAM policy) │
└────┬─────┘ └────┬─────┘ └───┬───┘ └────┬────┘ └─────────────┘
     │            │            │          │
  EventBridge  EventBridge  EventBridge  AgentCore Runtime
```

## Prerequisites

- AWS CLI v2 configured with admin-level IAM permissions (assumed role recommended)
- Python 3.11+ with `boto3`
- Docker (for dashboard container)
- Amazon Bedrock model access enabled (Claude Sonnet 4)
- AgentCore access enabled in your AWS account

## Quick Start — Deploy Everything

```bash
./deploy-all.sh \
  --profile <your-aws-profile> \
  --region us-east-1 \
  --admin-email you@company.com \
  --admin-password 'YourPassword123!'
```

This takes ~15-20 minutes and deploys:

| Phase | What Gets Created | Time |
|-------|-------------------|------|
| 1. Dashboard | ECR, Docker image, 6 DynamoDB tables, Cognito, ECS Express Mode, CloudFront, Stop Sessions Lambda | ~10 min |
| 2. Cost Controls | SNS topic + email subscription, EventBridge rule, Auto Budget Lambda | ~3 min |
| 2b. Evaluation Controls | Auto Eval Lambda, CloudWatch eval alarms, EventBridge rule | ~2 min |
| 2c. Kill Switch | Kill Switch Lambda (IAM deny policy management) | ~2 min |
| 2d. Observability Controls | Auto Obs Lambda, CloudWatch anomaly detection alarms | ~2 min |
| 3. Sample Agent | Inference Profile, S3 package, IAM role, AgentCore Runtime | ~5 min |

At the end you'll see the CloudFront dashboard URL and can sign in immediately.

## Key Features

### Dashboard
- 5 tabs: Overview (unified alert feed), Live Sessions, Agent Registry, Audit Log, Settings
- Signal cards for Cost, Evaluation, and Observability with severity indicators
- Configurable thresholds for all alarm types (saved to DynamoDB, applied to AWS on save)
- Auto-refresh every 90 seconds, background sync every 5 minutes

### Cost Controls
- Per-agent AWS Budgets created automatically on agent deployment (EventBridge → Lambda)
- SNS email alerts at 80% and 100% budget thresholds
- Budget amount configurable from Settings tab (applies to all agents)
- Budget deleted automatically when agent is removed

### Evaluation Controls
- AgentCore Online Evaluation config created automatically per agent (7 built-in evaluators, 100% sampling)
- CloudWatch alarm per agent — fires when bad scores exceed configurable thresholds
- Evaluators: Harmfulness, Correctness, Goal Success Rate, Helpfulness, Faithfulness, Tool Selection Accuracy, Tool Parameter Accuracy
- Per-evaluator thresholds configurable from Settings tab

### Observability Controls
- 4 CloudWatch anomaly detection alarms per agent: latency, error rate, token usage, invocation count
- Composite alarm that fires if any child alarm triggers
- Anomaly band width, evaluation periods, and datapoints-to-alarm configurable from Settings tab

### Kill Switch
- **Stop All Agents** — attaches IAM deny policy to every agent execution role, blocking all Bedrock access instantly
- **Per-agent revoke** — revoke/restore a single agent from the intervention panel (Tier 2)
- Reversible — restore access from the dashboard (Resume All Agents button or per-agent Restore in registry)
- All actions logged to audit trail

### Session Management
- **Stateless agents**: `session_reporter.py` writes heartbeats to DynamoDB. Dashboard reads directly.
- **Memory agents**: AgentCore Memory tracks sessions automatically. Dashboard syncs via `ListSessions` API.
- Session states: Active (< 6 min) → Idle (6-30 min) → Inactive (> 30 min)
- Tiered interventions: Tier 1 (stop sessions), Tier 2 (revoke IAM)

### Security
- CloudFront in front of ALB — ALB security group restricted to CloudFront IPs only (managed prefix list)
- Origin verification header — direct ALB access blocked, only CloudFront can reach the backend
- Cognito User Pool with admin-only user creation (no self-signup)
- JWT validation on every API request
- Every intervention requires a reason and admin identity

## Intervention Tiers

| Tier | Action | Scope | Reversible |
|------|--------|-------|------------|
| Tier 1 | Stop Sessions | All active sessions for one agent | No (sessions are terminated) |
| Tier 2 | Revoke/Restore IAM | Single agent's Bedrock access | Yes (restore from registry or audit log) |
| Stop All Agents | Revoke all IAM | All agents in account | Yes (Resume All Agents button) |


## Project Structure

```
├── deploy-all.sh                  # One-command full stack deploy
├── destroy-all.sh                 # One-command full stack teardown
├── SIGNALS_CONTRACT.md            # DynamoDB schema contract for signal producers
│
├── dashboard/                     # Admin dashboard
│   ├── api.py                     # FastAPI backend (DynamoDB reads + AWS sync)
│   ├── index.html                 # Single-file frontend (HTML/CSS/JS)
│   ├── template.yaml              # CF: DynamoDB + Cognito + ECS Express Mode + CloudFront + Lambda
│   ├── deploy.sh                  # Full dashboard deployment (includes ALB hardening)
│   ├── deploy.py                  # Docker build + ECR push
│   └── Dockerfile
│
├── cost-controls/                 # Automated cost management
│   ├── template.yaml              # CF: SNS + EventBridge + Auto Budget Lambda + Stop Sessions Lambda
│   ├── deploy.sh                  # Cost controls deployment
│   └── Auto_budget_creation/
│       └── auto_budget_lambda.py  # EventBridge-triggered budget automation
│
├── evaluation-controls/           # Automated evaluation setup
│   ├── template.yaml              # CF: Auto Eval Lambda + EventBridge
│   ├── deploy.sh
│   └── auto_eval_lambda.py        # Creates eval configs + CloudWatch alarms per agent
│
├── observability-controls/        # Automated anomaly detection
│   ├── template.yaml              # CF: Auto Obs Lambda + EventBridge
│   └── deploy.sh
│
├── kill-switch/                   # Emergency agent shutdown
│   ├── template.yaml              # CF: Kill Switch Lambda
│   ├── deploy.sh
│   └── kill_switch.py             # IAM deny policy management (all or single agent)
│
├── sample-agent/                  # Demo agent with safety controls
│   ├── template.yaml              # CF: IAM role + AgentCore Runtime
│   ├── deploy.py                  # Package + deploy (stateless or memory)
│   ├── invoke_agent.py            # CLI to invoke deployed agent
│   └── agents/
│       ├── stateless_agent.py     # Agent with DynamoDB session reporting
│       ├── memory_agent.py        # Agent with AgentCore Memory sessions
│       ├── session_reporter.py    # DynamoDB heartbeat reporter
│       └── cloudwatch_metrics.py  # Token usage metrics publisher
│
└── hil-interventions/             # Human-in-the-loop CLI tools
    ├── tables.py                  # Create all DynamoDB tables
    ├── registry.py                # Agent registry CRUD CLI
    ├── stop_session.py            # Stop session Lambda handler
    └── intervene.py               # Manual intervention CLI
```

## DynamoDB Tables (6 total)

| Table | Purpose | Key |
|-------|---------|-----|
| `safety-dashboard-registry` | Agent metadata, runtime info, settings | `agent_name` |
| `safety-dashboard-sessions` | Live session tracking with heartbeats | `session_id` |
| `safety-dashboard-interventions` | Audit trail of all interventions | `intervention_id` |
| `safety-dashboard-cost-signals` | Per-agent budget data from AWS Budgets | `agent_name` |
| `safety-dashboard-obs-signals` | Per-agent observability from CloudWatch | `agent_name` + `signal_key` |
| `safety-dashboard-eval-signals` | Per-agent evaluation scores | `agent_name` + `signal_key` |

## Deploy Components Individually

Each component is independent. Deploy in this order:

```bash
# 1. Dashboard
cd dashboard && ./deploy.sh --profile <profile> --region us-east-1 \
  --admin-email you@company.com --admin-password 'YourPassword123!'

# 2. Cost Controls
cd cost-controls && ./deploy.sh --profile <profile> --region us-east-1 \
  --notification-email you@company.com

# 3. Sample Agent (stateless)
cd sample-agent && python deploy.py --name my_agent --region us-east-1 --profile <profile>

# 3b. Sample Agent (with memory)
cd sample-agent && python deploy.py --name my_agent --region us-east-1 --profile <profile> --create-memory

# Invoke the agent
python sample-agent/invoke_agent.py --arn <AGENT_ARN> --prompt "Hello!" --region us-east-1
```

## Tear Down

```bash
./destroy-all.sh --profile <profile> --region us-east-1 --agent-name my_agent
```

## Extending with New Signal Types

See [SIGNALS_CONTRACT.md](SIGNALS_CONTRACT.md) for the DynamoDB schema contract. Write to the appropriate table and the dashboard displays your data automatically.

## Tech Stack

- Python 3.11+, FastAPI, Uvicorn
- Amazon Bedrock AgentCore (agent runtime, evaluations, memory)
- Amazon DynamoDB (data store)
- Amazon CloudFront (CDN + origin protection)
- Amazon Cognito (authentication)
- Amazon ECS Express Mode (dashboard hosting)
- AWS Lambda (automation — budgets, evaluations, observability, kill switch, session stop)
- Amazon EventBridge (agent lifecycle event routing)
- AWS Budgets + SNS (cost management + email alerts)
- Amazon CloudWatch (metrics, alarms, anomaly detection)
- Strands Agents framework
- OpenTelemetry (ADOT) for tracing
