# Strands Agent Scaffold

Production-ready Strands agent with tools, conversation memory, and Bedrock AgentCore deployment.

## What It Does

A research assistant agent that can:
- Answer questions conversationally (multi-turn with sliding window memory)
- Perform math calculations (safe AST-based evaluator)
- Tell the current date and time

## Tech Stack

- **Strands Agents SDK** (`strands-agents >= 1.38`)
- **Bedrock AgentCore Runtime** (`bedrock-agentcore`)
- **Claude Sonnet 4** on Amazon Bedrock
- Python 3.11+

## Quick Start

```bash
# Install dependencies
pip install -e .

# Set environment variables (or copy .env.example)
export MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0
export AWS_REGION=us-east-1

# Run locally
python -m src.main
```

The agent starts on `http://localhost:8080` (AgentCore default port).

### Test

```bash
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is sqrt(144) + 5?"}'
```

## Docker

```bash
docker build -t my-agent .
docker run -p 8080:8080 my-agent
```

## Deploy to AgentCore

1. Push the Docker image to ECR
2. Use the `agent-runtime-agentcore` infrastructure module to create the runtime
3. Point the runtime at your ECR image URI

## Project Structure

```
src/
├── __init__.py
├── config.py      # Environment variable configuration
└── main.py        # Agent definition, tools, and AgentCore entrypoint
```

## Adding Tools

```python
from strands import tool

@tool
def my_tool(query: str) -> str:
    """Description of what this tool does.

    Args:
        query: The search query
    """
    return f"Result for {query}"

# Add to agent
agent = Agent(tools=[calculator, get_current_datetime, my_tool])
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_ID` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model ID |
| `AWS_REGION` | `us-east-1` | AWS region |
| `LOG_LEVEL` | `INFO` | Log level |
