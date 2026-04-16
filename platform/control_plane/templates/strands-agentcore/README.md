# ${PROJECT_NAME}

Strands agent deployed on AWS AgentCore with Langfuse observability.

## Overview

This project contains a simple greeting agent built with Strands SDK and deployed on AWS AgentCore. It demonstrates:

- **Strands SDK**: Action-based agent framework
- **AWS Bedrock**: Claude 3.5 Sonnet for LLM inference
- **AgentCore**: Managed runtime and API gateway
- **Langfuse**: OpenTelemetry-based tracing and observability

## Architecture

```
User Request → AgentCore Gateway → AgentCore Runtime → Strands Agent → Bedrock
                                                              ↓
                                                         Langfuse Traces
```

## Project Structure

```
.
├── iac/
│   └── agentcore/          # Terraform infrastructure
│       ├── main.tf
│       ├── variables.tf
│       ├── gateway.tf      # AgentCore Gateway
│       ├── runtime.tf      # AgentCore Runtime
│       ├── iam.tf          # IAM roles and policies
│       └── outputs.tf
├── src/
│   ├── hello_agent.py      # Strands agent logic
│   ├── observability.py    # Langfuse integration
│   └── config.py           # Configuration
├── requirements.txt
├── Dockerfile
└── README.md               # This file
```

## Configuration

The following variables are pre-configured by Control Plane:

- `PROJECT_NAME`: ${PROJECT_NAME}
- `AWS_REGION`: ${AWS_REGION}
- `LANGFUSE_HOST`: ${LANGFUSE_HOST}
- `LANGFUSE_PUBLIC_KEY`: ${LANGFUSE_PUBLIC_KEY}

## Deployment

Follow the same deployment process as the LangGraph template. See the LangGraph template README for detailed instructions.

## Customization

### Add Actions

Extend the agent with custom actions:

```python
class MyCustomAction(Action):
    def __init__(self):
        super().__init__(
            name="my_action",
            description="My custom action"
        )

    def execute(self, context: Context, **kwargs) -> str:
        # Your logic here
        return "result"

agent.add_action(MyCustomAction())
```

### Chain Actions

Create multi-step workflows:

```python
result1 = agent.execute("action1", context, input=data)
result2 = agent.execute("action2", context, input=result1)
```

## Support

For issues and questions:
- Review AVA documentation
- Check Control Plane logs
- Open GitHub issue

## License

Apache 2.0 - See LICENSE file
