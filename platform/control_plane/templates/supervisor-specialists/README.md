# Supervisor-Specialists

A supervisor agent that routes requests to three specialist agents (researcher, writer, analyst) based on the task type. The supervisor analyzes the prompt and delegates to the most appropriate specialist.

## Pattern

Multi-agent supervisor pattern. A central supervisor agent classifies incoming requests and routes them to specialized sub-agents, each with distinct system prompts and capabilities. Results are aggregated and returned by the supervisor.

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
  -d '{"prompt": "Research the latest trends in quantum computing"}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t supervisor-specialists .

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
| `MEMORY_WINDOW_SIZE` | `20` | Messages retained per session |

## API

### POST /invocations

Request:
```json
{"prompt": "Write a blog post about serverless architecture"}
```

Response:
```json
{"response": "..."}
```

### GET /ping

Health check. Returns 200.
