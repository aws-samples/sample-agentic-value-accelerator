# Connecting Agents to Langfuse

This guide covers how to send traces from your agents to a self-hosted Langfuse instance deployed via the observability stack.

## Prerequisites

- A running Langfuse deployment (see [README.md](README.md) for deployment instructions)
- The `langfuse_host` output URL from your Terraform deployment
- API keys (from Secrets Manager, the Langfuse UI, or the EKS test script)

## AgentCore Runtime Agents

The `langraph-agentcore` and `strands-agentcore` templates have Langfuse tracing built in. Each template includes an `observability.py` module that sets up OpenTelemetry with a `LangfuseSpanProcessor`. All LLM calls via ChatBedrock are traced automatically with no additional instrumentation required.

### How It Works

```
Agent Handler
    │
    ▼
setup_tracing()              ◄── called once at startup
    │
    ├── Sets LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
    ├── Creates TracerProvider
    └── Adds LangfuseSpanProcessor
         │
         ▼
    OpenTelemetry traces ──► Langfuse OTEL endpoint ──► Langfuse UI
```

### Option 1: Via the Control Plane API (recommended)

Register your Langfuse instance with the control plane, then link it when generating a project. The template variables (`${LANGFUSE_HOST}`, `${LANGFUSE_PUBLIC_KEY}`, `${LANGFUSE_SECRET_KEY}`) are substituted automatically during project generation.

```bash
# Register the Langfuse server
curl -X POST http://<CONTROL_PLANE>/langfuse-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "self-hosted",
    "endpoint": "http://<ALB_DNS>",
    "public_key": "pk-lf-...",
    "secret_key": "sk-lf-..."
  }'

# Generate a project linked to the server
curl -X POST http://<CONTROL_PLANE>/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "template_id": "langraph-agentcore",
    "langfuse_server_id": "<server-id-from-above>"
  }'
```

The generated project's `config.py` will have the Langfuse variables pre-filled.

### Option 2: Environment Variables

Set these three variables in your agent's `.env` file, `config.py`, or AgentCore runtime YAML (`agentcore_runtime.yaml`):

```bash
LANGFUSE_HOST=http://<ALB_DNS>        # From langfuse_host terraform output
LANGFUSE_PUBLIC_KEY=pk-lf-...         # From Secrets Manager or Langfuse UI
LANGFUSE_SECRET_KEY=sk-lf-...         # From Secrets Manager or Langfuse UI
```

**In `config.py`:**

```python
class Settings(BaseSettings):
    LANGFUSE_ENABLED: bool = True
    LANGFUSE_HOST: str = "http://<ALB_DNS>"
    LANGFUSE_PUBLIC_KEY: str = "pk-lf-..."
    LANGFUSE_SECRET_KEY: str = "sk-lf-..."
```

**In `agentcore_runtime.yaml`:**

```yaml
Properties:
  RuntimeConfig:
    EnvironmentVariables:
      LANGFUSE_HOST: "http://<ALB_DNS>"
      LANGFUSE_PUBLIC_KEY: "pk-lf-..."
      LANGFUSE_SECRET_KEY: "sk-lf-..."
```

The agent's `observability.py` reads these at startup:

```python
from observability import setup_tracing

setup_tracing()  # Configures OpenTelemetry + LangfuseSpanProcessor
```

To disable tracing, set `LANGFUSE_ENABLED=false`.

### Retrieving API Keys

**ECS deployments** auto-seed API keys into Secrets Manager:

```bash
aws secretsmanager get-secret-value --secret-id langfuse-secrets \
  --query SecretString --output text | python3 -m json.tool
```

Look for `langfuse_public_key` and `langfuse_secret_key` in the output.

**EKS deployments** require creating keys via the Langfuse UI or the test script (`test-langfuse-eks.sh`), which seeds keys and prints them to stdout.

## Direct SDK Integration

For agents not using the AgentCore templates, use the Langfuse Python SDK directly:

```python
from langfuse import Langfuse, observe

langfuse = Langfuse(
    public_key="pk-lf-...",
    secret_key="sk-lf-...",
    host="http://<ALB_DNS>"
)

@observe()
def my_agent(query: str) -> str:
    # Your agent logic here — LLM calls are traced automatically
    return result

# Ensure traces are flushed before the process exits
langfuse.flush()
```

Install the SDK: `pip install langfuse`

### Tracing LangGraph Agents

```python
from langfuse import Langfuse
from langfuse.callback import CallbackHandler

langfuse = Langfuse(
    public_key="pk-lf-...",
    secret_key="sk-lf-...",
    host="http://<ALB_DNS>"
)

handler = CallbackHandler(langfuse)

# Pass to LangGraph invoke
result = graph.invoke(input_data, config={"callbacks": [handler]})
```

### Tracing Strands Agents

```python
from strands import Agent
from strands.telemetry.tracer import get_tracer

# Set env vars before creating the agent
import os
os.environ["LANGFUSE_HOST"] = "http://<ALB_DNS>"
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-..."
os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-..."

agent = Agent(model=model, tools=tools)
result = agent("your prompt")
```

## OpenTelemetry (OTEL) Integration

Langfuse v3 exposes a native OTEL endpoint for any OpenTelemetry-compatible framework:

```
POST http://<ALB_DNS>/api/public/otel/v1/traces
```

Configure your OTEL exporter:

```python
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(
    endpoint="http://<ALB_DNS>/api/public/otel/v1/traces",
    headers={
        "Authorization": "Basic <base64(public_key:secret_key)>"
    }
)
```

This works with any language or framework that supports OpenTelemetry.

## Verifying the Connection

After configuring your agent, verify traces are flowing:

1. Run your agent with a test query
2. Open the Langfuse UI at `http://<ALB_DNS>`
3. Navigate to **Tracing** to see the trace
4. Each trace should show the full call chain: agent invocation, LLM calls, tool usage

You can also verify programmatically:

```bash
curl -u "pk-lf-...:sk-lf-..." "http://<ALB_DNS>/api/public/traces?limit=5"
```

## Troubleshooting

### Traces not appearing

- Verify `LANGFUSE_ENABLED=true` (default)
- Check that `LANGFUSE_HOST` is reachable from your agent's network
- Call `langfuse.flush()` before the process exits
- For AgentCore, verify the runtime has network access to the Langfuse ALB

### 401 Unauthorized

- Verify the public key and secret key match a valid API key in the Langfuse project
- ECS keys are in Secrets Manager (`langfuse-secrets`)
- EKS keys must be created via the UI or test script

### Connection refused / timeout

- For Isengard accounts, VPN is typically required to reach the ALB
- Verify the ALB security group allows inbound traffic from your agent's network
- Check that the ALB scheme matches your network topology (`internet-facing` vs `internal`)
