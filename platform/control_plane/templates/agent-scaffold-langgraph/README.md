# Agent Scaffold — LangGraph

Production-ready LangGraph ReAct agent with tools, conversation memory, and Bedrock AgentCore deployment.

## What It Does

A research assistant agent that can:
- Answer questions conversationally (multi-turn with InMemorySaver checkpointing)
- Perform math calculations (safe AST-based evaluator)
- Tell the current date and time

## Tech Stack

- **LangGraph** (`langgraph >= 1.2.0`) — StateGraph with `create_react_agent`
- **LangChain AWS** (`langchain-aws >= 1.4.0`) — `ChatBedrockConverse`
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
  -d '{"prompt": "What is sqrt(144) + 5?", "session_id": "test-1"}'
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
└── main.py        # LangGraph agent, tools, and AgentCore entrypoint
```

## Architecture

```
START → agent (LLM) → tools_condition → tool_node → agent → ... → END
```

Uses `create_react_agent` which builds a StateGraph that loops between the LLM and tool execution until the model produces a final response.

## Adding Tools

```python
from langchain_core.tools import tool

@tool
def my_tool(query: str) -> str:
    """Description of what this tool does.

    Args:
        query: The search query
    """
    return f"Result for {query}"

# Add to graph
graph = create_react_agent(llm, tools=[calculator, get_current_datetime, my_tool])
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_ID` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model ID |
| `AWS_REGION` | `us-east-1` | AWS region |
| `LOG_LEVEL` | `INFO` | Log level |

## Multi-Turn Memory

Pass `session_id` in the payload to maintain conversation context across invocations:

```json
{"prompt": "What did I ask before?", "session_id": "user-123"}
```

Memory is stored in-memory (InMemorySaver). For production persistence, swap with `PostgresSaver` or `DynamoDBSaver`.
