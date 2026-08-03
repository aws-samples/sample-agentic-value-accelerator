# Conversational Assistant

A multi-turn conversational agent with built-in tools (calculator, datetime) and session memory. Maintains context across messages within a session for natural back-and-forth dialogue.

## Pattern

Single agent with tool use and conversation memory. The agent maintains a sliding window of recent messages per session, enabling follow-up questions and contextual responses. Tools extend the agent's capabilities beyond pure text generation.

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
  -d '{"prompt": "What is 42 * 17?", "session_id": "demo"}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t conversational-assistant .

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
{"prompt": "What time is it?", "session_id": "optional-session-id"}
```

Response:
```json
{"response": "The current time is..."}
```

### GET /ping

Health check. Returns 200.
