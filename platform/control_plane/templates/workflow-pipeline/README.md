# Workflow Pipeline

A deterministic sequential pipeline that processes documents through fixed stages: classify, extract, validate, and summarize. Each step runs in order with the output of one feeding into the next.

## Pattern

Sequential workflow pipeline. Unlike autonomous agents that decide their own path, this pattern enforces a fixed sequence of processing steps. Each step is an LLM call with a specific prompt template. The pipeline tracks which steps completed and their individual results.

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
  -d '{"document": "Dear Sir, I am writing to request a refund for order #12345..."}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t workflow-pipeline .

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

## API

### POST /invocations

Request:
```json
{"document": "Text content to process through the pipeline..."}
```

Response:
```json
{"success": true, "results": {"document_type": "...", "extracted_fields": "...", "validation_result": "...", "summary": "..."}, "steps_completed": ["classify", "extract", "validate", "summarize"]}
```

### GET /ping

Health check. Returns 200.
