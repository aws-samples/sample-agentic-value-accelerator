# Tool-Calling Agent Template

A template for building agents that can dynamically invoke external tools and APIs to accomplish tasks.

## Pattern Overview

The Tool-Calling Agent pattern enables AI agents to:
- Register and discover available tools
- Decide which tools to use based on user requests
- Invoke tools with appropriate parameters
- Handle tool errors gracefully
- Chain multiple tool calls together
- Return structured results

This pattern is ideal for agents that need to interact with external systems, perform calculations, retrieve data, or execute multi-step workflows.

## Architecture

```
User Request
    ↓
Agent (LLM)
    ↓
Tool Selection & Parameter Extraction
    ↓
Tool Invocation
    ↓
Result Processing
    ↓
Response Generation
```

### Components

1. **Agent Core**: LLM-based decision maker that determines which tools to use
2. **Tool Registry**: Collection of available tools with descriptions and schemas
3. **Tool Executor**: Safely executes tool calls with error handling
4. **Result Processor**: Formats and interprets tool outputs

## Example Tools Included

This template includes mock implementations of common tool types:

- **Calculator**: Perform mathematical calculations
- **Search**: Search the web or knowledge base (mock)
- **Weather**: Get weather information (mock)
- **Timer**: Set timers and reminders (mock)

**TODO**: Replace mock implementations with real tool integrations.

## Quick Start

### Prerequisites

- Python 3.11+
- AWS CLI configured
- Terraform or AWS CDK
- Docker (for containerized deployment)

### Configuration

1. Copy environment template:
```bash
cp .env.example .env
```

2. Set required variables:
```bash
PROJECT_NAME=${PROJECT_NAME}
AWS_REGION=${AWS_REGION}
LLM_MODEL=${LLM_MODEL}
```

3. Add API keys for tools:
```bash
# TODO: Add your API keys
ANTHROPIC_API_KEY=your_key_here
# Add other tool-specific API keys
```

### Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the agent locally:
```bash
python -m uvicorn src.main:app --reload
```

3. Test with curl:
```bash
curl -X POST http://localhost:8000/api/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"query": "What is 15 * 23?", "max_iterations": 5}'
```

### Deployment

Deploy to AWS using Terraform:

```bash
cd iac/terraform
terraform init
terraform plan
terraform apply
```

## Customization Guide

### Adding New Tools

1. **Define the tool** in `src/<framework>/tools.py`:

```python
@tool
def my_custom_tool(param1: str, param2: int) -> str:
    """
    Description of what this tool does.

    Args:
        param1: Description of parameter 1
        param2: Description of parameter 2

    Returns:
        Description of return value
    """
    # TODO: Implement your tool logic
    result = perform_operation(param1, param2)
    return result
```

2. **Register the tool** with the agent:

```python
tools = [calculator, search, weather, my_custom_tool]
agent = create_tool_calling_agent(llm, tools)
```

3. **Add tests** for your tool:

```python
def test_my_custom_tool():
    result = my_custom_tool("test", 42)
    assert result is not None
```

### Tool Best Practices

1. **Clear descriptions**: LLM uses tool descriptions to decide when to use them
2. **Type annotations**: Use proper type hints for parameters and returns
3. **Error handling**: Return error messages instead of raising exceptions
4. **Idempotency**: Tools should be safe to call multiple times
5. **Validation**: Validate inputs before making external calls

### Configuring Tool Behavior

Adjust agent behavior in `src/<framework>/tool_calling_agent.py`:

```python
agent_config = {
    "max_iterations": 10,        # Maximum tool calls per request
    "timeout": 30,                # Timeout per tool call (seconds)
    "retry_on_error": True,       # Retry failed tool calls
    "parallel_execution": False,  # Execute tools in parallel
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECT_NAME` | Project identifier | `${PROJECT_NAME}` |
| `AWS_REGION` | AWS deployment region | `${AWS_REGION}` |
| `LLM_MODEL` | LLM model identifier | `${LLM_MODEL}` |
| `MAX_ITERATIONS` | Max tool invocations | `${MAX_ITERATIONS}` |
| `ANTHROPIC_API_KEY` | Claude API key | (required) |
| `LANGFUSE_PUBLIC_KEY` | Observability key | (optional) |
| `LANGFUSE_SECRET_KEY` | Observability secret | (optional) |

## Testing

Run unit tests:
```bash
pytest tests/
```

Run integration tests:
```bash
pytest tests/integration/
```

Test specific tool:
```bash
pytest tests/test_tools.py::test_calculator
```

## Troubleshooting

### Tool Not Being Called

- Check tool description is clear and relevant
- Verify tool is registered with the agent
- Check LLM has access to tool schemas
- Review agent logs for decision reasoning

### Tool Execution Errors

- Validate tool parameters match schema
- Check external API credentials
- Review timeout settings
- Add error logging in tool implementation

### Performance Issues

- Reduce `max_iterations` if agent loops unnecessarily
- Enable parallel tool execution if independent
- Cache frequently used tool results
- Optimize external API calls

## Architecture Decisions

- **Framework**: LangGraph chosen for flexible tool calling support
- **Deployment**: ECS for persistent connections to external APIs
- **Error Handling**: Graceful degradation with fallback responses
- **Observability**: Langfuse integration for tool call tracing

## Next Steps

1. **TODO**: Replace mock tools with real implementations
2. **TODO**: Add authentication to tool endpoints
3. **TODO**: Implement tool result caching
4. **TODO**: Add rate limiting for external API calls
5. **TODO**: Create custom tools for your use case

## Resources

- [LangChain Tool Calling](https://python.langchain.com/docs/modules/agents/tools/)
- [AWS Strands Framework](https://aws.amazon.com/strands/)
- [Tool Schema Documentation](./docs/tool_schema.md)

## License

See LICENSE file in repository root.
