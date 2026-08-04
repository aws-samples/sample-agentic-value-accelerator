# Plan-Execute Agent

A two-phase agent that first creates a step-by-step plan for a given goal, then executes each step sequentially using tools. Supports configurable max steps and re-planning on failure.

## Pattern

Plan-and-execute loop. A planner agent decomposes a complex goal into discrete steps. An executor agent processes each step with tool access. Results are aggregated and summarized into a final answer. The loop bounds execution with a configurable maximum step count.

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
  -d '{"goal": "Compare the GDP of the top 3 economies and summarize trends"}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t plan-execute-agent .

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
| `TEMPERATURE` | `0.3` | Model temperature |
| `MAX_TOKENS` | `4096` | Max response tokens |
| `MAX_REPLAN_ATTEMPTS` | `2` | Max re-planning attempts on failure |

## API

### POST /invocations

Request:
```json
{"goal": "Analyze the pros and cons of microservices vs monoliths"}
```

Response:
```json
{"result": "Final summary...", "steps": [{"action": "...", "result": "..."}]}
```

### GET /ping

Health check. Returns 200.
