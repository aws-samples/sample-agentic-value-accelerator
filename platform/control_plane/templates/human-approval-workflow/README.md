# Human Approval Workflow

An agent that drafts proposed actions and pauses for human approval before execution. The response includes the proposed action and approval status, enabling external systems to approve or reject via callback endpoints.

## Pattern

Human-in-the-loop interrupt pattern. The agent analyzes a request, drafts a proposed action, and returns it with a "pending" approval status. External approval systems can then approve or reject the action. The payload includes approval endpoints for integration with notification systems (Slack, email, dashboards).

## What's Included

| Component | Description |
|-----------|-------------|
| `src/strands/` | Strands SDK implementation |
| `src/langgraph/` | LangGraph implementation |
| `iac/terraform/` | AgentCore deployment infrastructure |

## Quick Start

### Run Locally

```bash
# Install dependencies (Strands)
pip install -e ".[strands]"

# Run the agent server
python -m src.strands.main
# Server starts on http://localhost:8080
# Health check: GET /ping
# Invoke: POST /invocations with JSON body
```

### Test the Agent

```bash
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Transfer $50,000 to account ending in 4521"}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t human-approval-workflow .

# Push to ECR, then deploy
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit: project_name, aws_region, container_image_uri
terraform init && terraform apply
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_ID` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model |
| `AWS_REGION` | `us-east-1` | AWS region |

## API

### POST /invocations

Request:
```json
{"prompt": "Delete all records older than 2020", "session_id": "optional"}
```

Response:
```json
{"proposed_action": "Delete records...", "approval_status": "pending", "result": ""}
```

### GET /ping

Health check. Returns 200.
