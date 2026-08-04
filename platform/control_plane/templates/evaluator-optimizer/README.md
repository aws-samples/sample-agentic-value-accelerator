# Evaluator-Optimizer

A self-improving content generation loop where a generator agent produces content and an evaluator agent scores it against criteria. If the score is below the threshold, feedback is incorporated and the generator tries again, up to a configurable max iterations.

## Pattern

Critique loop (generator/evaluator). Two agents collaborate: one generates content, the other evaluates quality on a numeric scale. The loop continues until the score meets the threshold or max iterations are reached. Each iteration incorporates the evaluator's feedback to improve output quality.

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
  -d '{"goal": "Write a concise executive summary of cloud cost optimization", "threshold": 4, "max_iterations": 3}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t evaluator-optimizer .

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
| `TEMPERATURE` | `0.7` | Model temperature (higher for creative generation) |
| `MAX_TOKENS` | `4096` | Max response tokens |
| `MAX_ITERATIONS` | `3` | Maximum critique loop iterations |
| `QUALITY_THRESHOLD` | `4` | Score (1-5) required to stop iterating |

## API

### POST /invocations

Request:
```json
{"goal": "Write a technical blog post about event sourcing", "criteria": "clarity, depth, examples", "max_iterations": 3, "threshold": 4}
```

Response:
```json
{"content": "Final optimized content...", "score": 4, "iterations": 2}
```

### GET /ping

Health check. Returns 200.
