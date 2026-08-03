# Event-Driven Agent

A reactive agent that processes events from multiple sources — S3 object uploads, scheduled (cron) triggers, and webhook payloads. The agent classifies the event type and dispatches to the appropriate handler.

## Pattern

Event-driven dispatch. The agent receives EventBridge-formatted events and routes them based on `detail-type` and `source` fields. Supported event types include S3 object creation, scheduled invocations, and custom webhook events. Each handler processes the event payload and returns structured results.

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
  -d '{
    "source": "aws.s3",
    "detail-type": "Object Created",
    "time": "2024-01-15T10:30:00Z",
    "detail": {
      "bucket": {"name": "my-bucket"},
      "object": {"key": "documents/report.pdf", "size": 1024}
    }
  }'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t event-driven-agent .

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
| `RESULT_BUCKET` | *(required)* | S3 bucket for storing processing results |

## API

### POST /invocations

Request (EventBridge event format):
```json
{"source": "aws.s3", "detail-type": "Object Created", "detail": {...}}
```

Response:
```json
{"event_type": "Object Created", "result": "Processed document..."}
```

### GET /ping

Health check. Returns 200.
