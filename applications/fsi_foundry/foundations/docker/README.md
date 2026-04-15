# Docker Images

Pattern-specific Dockerfiles for the FSI Foundry.

## Directory Structure

```
platform/docker/
├── base/
│   └── Dockerfile.base         # Common base (for reference/multi-stage builds)
├── patterns/
│   ├── ec2.Dockerfile          # EC2 pattern (AMD64, FastAPI)
│   └── agentcore.Dockerfile    # AgentCore pattern (ARM64, OpenTelemetry)
└── README.md
```

## Image Naming Convention

Docker images follow a consistent naming convention that ensures isolation between different use cases, frameworks, and deployment patterns:

### Format

```
ava-{USE_CASE_ID}-{FRAMEWORK_SHORT}-{DEPLOYMENT_PATTERN}:{TAG}
```

### Components

| Component | Description | Examples |
|-----------|-------------|----------|
| `USE_CASE_ID` | The use case identifier | `kyc`, `fraud`, `claims` |
| `FRAMEWORK_SHORT` | Short name for the framework | `langgraph`, `strands`, `crewai` |
| `DEPLOYMENT_PATTERN` | The deployment pattern | `ec2`, `agentcore` |
| `TAG` | Version tag | `latest`, `v1.0.0`, `dev` |

### Framework Short Name Mapping

| Framework ID | Short Name |
|--------------|------------|
| `langchain_langgraph` | `langgraph` |
| `strands` | `strands` |
| `crewai` | `crewai` |
| `llamaindex` | `llamaindex` |

### Examples

```
ava-kyc-langgraph-ec2:latest
ava-kyc-strands-agentcore:v1.0.0
ava-fraud-crewai-ec2:latest
ava-claims-langgraph-agentcore:dev
```

### Why This Convention?

This naming convention ensures **complete isolation** between deployments:

1. **Use Case Isolation**: Different use cases (KYC, fraud detection) have separate images
2. **Framework Isolation**: Same use case with different frameworks produces distinct images
3. **Pattern Isolation**: Same use case/framework deployed to different patterns (EC2 vs AgentCore) are separate
4. **Clear Identification**: Image name immediately tells you what's inside

## Build Arguments

All Dockerfiles accept build arguments to inject the correct application code into the image.

### Available Build Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `USE_CASE` | Yes | `kyc` | Use case ID (e.g., `kyc`, `fraud_detection`) |
| `FRAMEWORK` | Yes | `langchain_langgraph` | Framework ID (e.g., `langchain_langgraph`, `strands`) |

### How Build Arguments Work

Build arguments are used to:

1. **Copy Application Code**: The Dockerfile copies code from `applications/{USE_CASE}/src/{FRAMEWORK}/` into the image
2. **Set Environment Variables**: `USE_CASE_ID` and `FRAMEWORK` are set as environment variables in the container
3. **Configure Runtime**: The application uses these variables to load the correct configuration

### Application Code Path

```
applications/{USE_CASE}/src/{FRAMEWORK}/
├── agents/           # Specialist agent implementations
├── orchestrator.py   # Workflow orchestration
├── models.py         # Pydantic request/response models
└── config.py         # Application configuration
```

If the specified application code path does not exist, the build will fail with a descriptive error message.

## Building Images

### EC2 Pattern (AMD64)

The EC2 pattern builds AMD64 images for deployment on EC2 instances with Application Load Balancer.

```bash
# KYC with LangChain/LangGraph (default)
docker build \
  --platform linux/amd64 \
  --build-arg USE_CASE=kyc \
  --build-arg FRAMEWORK=langchain_langgraph \
  -f platform/docker/patterns/ec2.Dockerfile \
  -t ava-kyc-langgraph-ec2:latest .

# Fraud Detection with Strands
docker build \
  --platform linux/amd64 \
  --build-arg USE_CASE=fraud_detection \
  --build-arg FRAMEWORK=strands \
  -f platform/docker/patterns/ec2.Dockerfile \
  -t ava-fraud-strands-ec2:latest .
```

### AgentCore Pattern (ARM64)

The AgentCore pattern builds ARM64 images for deployment on AWS AgentCore Runtime. **ARM64 is required** - AMD64 builds will fail at runtime.

```bash
# KYC with LangChain/LangGraph
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE=kyc \
  --build-arg FRAMEWORK=langchain_langgraph \
  -f platform/docker/patterns/agentcore.Dockerfile \
  -t ava-kyc-langgraph-agentcore:latest .

# KYC with Strands
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE=kyc \
  --build-arg FRAMEWORK=strands \
  -f platform/docker/patterns/agentcore.Dockerfile \
  -t ava-kyc-strands-agentcore:latest .
```

### Building Multiple Use Cases

You can build images for multiple use cases to deploy them independently:

```bash
# Build KYC for EC2
docker build \
  --platform linux/amd64 \
  --build-arg USE_CASE=kyc \
  --build-arg FRAMEWORK=langchain_langgraph \
  -f platform/docker/patterns/ec2.Dockerfile \
  -t ava-kyc-langgraph-ec2:latest .

# Build Fraud Detection for EC2 (same region, different use case)
docker build \
  --platform linux/amd64 \
  --build-arg USE_CASE=fraud_detection \
  --build-arg FRAMEWORK=langchain_langgraph \
  -f platform/docker/patterns/ec2.Dockerfile \
  -t ava-fraud-langgraph-ec2:latest .

# Build KYC for AgentCore (same use case, different pattern)
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE=kyc \
  --build-arg FRAMEWORK=langchain_langgraph \
  -f platform/docker/patterns/agentcore.Dockerfile \
  -t ava-kyc-langgraph-agentcore:latest .
```

## Pattern Comparison

| Feature | EC2 | AgentCore |
|---------|-----|-----------|
| Architecture | AMD64 | ARM64 (required) |
| Port | 8000 | 8080 |
| Server | Uvicorn (FastAPI) | OpenTelemetry instrumented |
| Dependencies | Base only | Base + AgentCore + OTel |
| `DEPLOYMENT_MODE` | `fastapi` | `agentcore` |

## Adding New Use Cases

1. Create application code in `applications/{use_case}/src/{framework}/`
2. Register the use case in `data/registry/offerings.json`
3. Build with the appropriate build args:
   ```bash
   docker build \
     --build-arg USE_CASE=new_use_case \
     --build-arg FRAMEWORK=langchain_langgraph \
     --platform linux/amd64 \
     -f platform/docker/patterns/ec2.Dockerfile \
     -t ava-new_use_case-langgraph-ec2:latest .
   ```

## Adding New Frameworks

1. Register the framework in `data/registry/offerings.json` with a `short_name`
2. Implement the framework in `applications/{use_case}/src/{framework}/`
3. Ensure it follows the same module structure (orchestrator, agents, models)
4. Build with the framework arg:
   ```bash
   docker build \
     --build-arg FRAMEWORK=new_framework \
     --build-arg USE_CASE=kyc \
     --platform linux/amd64 \
     -f platform/docker/patterns/ec2.Dockerfile \
     -t ava-kyc-newframework-ec2:latest .
   ```

## Environment Variables in Container

The built images include these environment variables:

| Variable | Description |
|----------|-------------|
| `USE_CASE_ID` | The use case identifier passed during build |
| `FRAMEWORK` | The framework identifier passed during build |
| `DEPLOYMENT_MODE` | Set by the Dockerfile (`fastapi` or `agentcore`) |

## Notes

- **Step Functions** does not use Docker - it packages Lambda functions as ZIP
- AgentCore **requires** ARM64 - AMD64 builds will fail at runtime
- All images run as non-root user (`appuser`) for security
- The `DEPLOYMENT_MODE` env var tells the application which adapter to use
- Image names should always include the framework short name for clarity
- Use the deployment scripts in `scripts/deploy/` which handle image naming automatically
