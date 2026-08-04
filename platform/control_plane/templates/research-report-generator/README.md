# Research Report Generator

A RAG-powered agent that retrieves documents from a Bedrock Knowledge Base, synthesizes findings with citations, and generates structured research reports.

## Pattern

Retrieval-Augmented Generation (RAG) with knowledge base integration. The agent queries a Bedrock Knowledge Base for relevant documents, extracts key information with source citations, and produces a coherent research report. Supports both quick answers and full report format.

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
  -d '{"prompt": "What are the key risks in cloud migration?", "report_format": true}'
```

### Deploy to AgentCore

```bash
# Build container
docker build --build-arg FRAMEWORK=strands -t research-report-generator .

# Push to ECR, then deploy
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit: project_name, aws_region, container_image_uri, knowledge_base_id
terraform init && terraform apply
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_ID` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model |
| `AWS_REGION` | `us-east-1` | AWS region |
| `KNOWLEDGE_BASE_ID` | *(required)* | Bedrock Knowledge Base ID |

## API

### POST /invocations

Request:
```json
{"prompt": "Summarize best practices for API security", "report_format": false}
```

Response:
```json
{"response": "Based on the knowledge base..."}
```

### GET /ping

Health check. Returns 200.
