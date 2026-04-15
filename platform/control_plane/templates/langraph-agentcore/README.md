# ${PROJECT_NAME}

LangGraph agent deployed on AWS AgentCore with Langfuse observability.

## Overview

This project contains a simple greeting agent built with LangGraph and deployed on AWS AgentCore. It demonstrates:

- **LangGraph**: State-based agent workflow
- **AWS Bedrock**: Claude 3.5 Sonnet for LLM inference
- **AgentCore**: Managed runtime and API gateway
- **Langfuse**: OpenTelemetry-based tracing and observability

## Architecture

```
User Request → AgentCore Gateway → AgentCore Runtime → LangGraph Agent → Bedrock
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
│   ├── hello_agent.py      # LangGraph agent logic
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

### Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform 1.6+
- Docker (for local testing)

### Infrastructure Deployment

1. Navigate to infrastructure directory:
   ```bash
   cd iac/agentcore
   ```

2. Initialize Terraform:
   ```bash
   terraform init
   ```

3. Review the plan:
   ```bash
   terraform plan
   ```

4. Apply the infrastructure:
   ```bash
   terraform apply
   ```

5. Note the outputs:
   ```bash
   terraform output
   ```

### Build and Deploy Container

1. Build the Docker image:
   ```bash
   docker build -t ${PROJECT_NAME} .
   ```

2. Push to ECR (replace with your ECR repository):
   ```bash
   aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin <account>.dkr.ecr.${AWS_REGION}.amazonaws.com
   docker tag ${PROJECT_NAME}:latest <account>.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest
   docker push <account>.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest
   ```

3. Update AgentCore Runtime to use the new image

## Testing

### Local Testing

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set environment variables:
   ```bash
   export AWS_REGION=${AWS_REGION}
   export LANGFUSE_HOST=${LANGFUSE_HOST}
   export LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
   export LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY}
   ```

3. Run the agent:
   ```bash
   python src/hello_agent.py
   ```

### Invoke via AgentCore

After deployment, invoke the agent via the AgentCore Gateway endpoint:

```bash
curl -X POST https://<gateway-endpoint>/invoke \
  -H "Content-Type: application/json" \
  -d '{"user_input": "Hello, how are you?"}'
```

## Monitoring

### Langfuse Dashboard

View traces and metrics at: ${LANGFUSE_HOST}

### CloudWatch Logs

Agent logs are available in CloudWatch Logs:
- Log Group: `/aws/agentcore/${PROJECT_NAME}`

### CloudWatch Metrics

Monitor agent performance:
- Invocations
- Errors
- Latency

## Customization

### Modify Agent Logic

Edit `src/hello_agent.py` to customize the agent workflow:

```python
def process_input(state: AgentState) -> AgentState:
    # Your custom logic here
    pass
```

### Add Tools

Extend the agent with tools (function calling):

```python
from langchain.tools import tool

@tool
def my_custom_tool(input: str) -> str:
    """Tool description"""
    # Tool implementation
    pass
```

### Change LLM Model

Update the Bedrock model in `src/config.py`:

```python
BEDROCK_MODEL_ID: str = "anthropic.claude-3-opus-20240229-v1:0"
```

## Troubleshooting

### Agent returns errors

- Check CloudWatch Logs for detailed error messages
- Verify IAM role has Bedrock permissions
- Ensure container image is correctly pushed to ECR

### Traces not appearing in Langfuse

- Verify Langfuse credentials are correct
- Check network connectivity to Langfuse server
- Review CloudWatch Logs for OpenTelemetry errors

### High latency

- Check Bedrock throttling limits
- Review agent workflow complexity
- Consider caching responses

## Clean Up

To destroy all resources:

```bash
cd iac/agentcore
terraform destroy
```

## Support

For issues and questions:
- Review AVA documentation
- Check Control Plane logs
- Open GitHub issue

## License

Apache 2.0 - See LICENSE file
