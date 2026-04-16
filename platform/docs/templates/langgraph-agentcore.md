# LangGraph AgentCore

**State-based agent on AWS Bedrock AgentCore with Langfuse observability**

![Agent Pattern](https://img.shields.io/badge/Category-Agent_Pattern-green)

## Overview

The LangGraph AgentCore template deploys state-based agents using LangGraph. LangGraph provides a graph-based framework for building agents with complex state management and conditional flows. This template demonstrates deploying a LangGraph agent on AWS Bedrock AgentCore runtime with built-in Langfuse tracing.

**Ideal for**: Complex workflows, stateful conversations, conditional branching, multi-step reasoning

## Architecture

```mermaid
graph LR
    A[API Request] --> B[AgentCore Gateway]
    B --> C[AgentCore Runtime]
    C --> D[LangGraph Agent<br/>State Graph]
    D --> E[Amazon Bedrock<br/>Claude 3.5 Sonnet]
    D --> F[Langfuse<br/>Traces]
```

**AgentCore Components:**
- **Gateway**: API Gateway for agent invocations
- **Runtime**: Managed container runtime for agent code
- **LangGraph Agent**: State-based graph workflow
- **Bedrock**: LLM inference (Claude 3.5 Sonnet)
- **Langfuse**: OpenTelemetry-based observability

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `project_name` | Yes | - | Project name for resource naming |
| `aws_region` | No | `us-east-1` | AWS region for deployment |
| `langfuse_host` | Yes | - | Langfuse server URL (from observability-stack) |
| `langfuse_secret_name` | Yes | - | Secrets Manager secret with Langfuse API keys |
| `llm_model` | No | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Bedrock model ID |

## Deployment

Deploy this template from the Control Plane UI:

1. Navigate to **Templates** → **Agent Patterns**
2. Select **LangGraph AgentCore**
3. Choose framework: **LangGraph**
4. Set required parameters: `project_name`, `langfuse_host`, `langfuse_secret_name`
5. Click **Deploy**

The deployment creates:
- AgentCore Gateway with HTTPS endpoint
- AgentCore Runtime with IAM role for Bedrock access
- ECR repository and container image
- Langfuse OpenTelemetry integration

## Testing

Invoke the agent via the AgentCore Gateway:

```bash
curl -X POST https://<gateway-endpoint>/invoke \
  -H "Content-Type: application/json" \
  -d '{"user_input": "Hello, how are you?"}'
```

View traces in the Langfuse dashboard at your `langfuse_host` URL.

## Customization

Modify the agent workflow in `src/hello_agent.py`:

```python
def process_input(state: AgentState) -> AgentState:
    # Your custom graph node logic here
    return state
```

Add tools for function calling:

```python
@tool
def my_custom_tool(input: str) -> str:
    """Tool description for LLM"""
    # Tool implementation
    pass
```

## Links

- [View template source](../../../platform/control_plane/templates/langraph-agentcore/README.md)
- [Back to Templates Overview](README.md)
