# FSI Foundry Platform

The platform layer provides the foundational infrastructure for building, deploying, and operating multi-agent AI systems on AWS.

---

## Overview

The platform is designed to be:

- Framework-agnostic — supports LangGraph, LangChain, Strands, and custom frameworks
- Deployment-ready — deploy to Amazon Bedrock AgentCore with built-in auto-scaling and observability
- Scalable — shared infrastructure with per-use-case isolation via Terraform workspaces

---

## Key Components

### Deployment Adapters

The AgentCore adapter translates between Bedrock AgentCore Runtime and the agent registry:

| Adapter | File | Purpose |
|---------|------|---------|
| AgentCore | `foundations/src/adapters/agentcore_adapter.py` | Bedrock AgentCore Runtime deployment |

### Agent Registry

Central registration point for all use cases. The registry (`foundations/src/base/registry.py`) allows any adapter to invoke any registered agent:

```python
from base.registry import register_agent, RegisteredAgent

register_agent("kyc_banking", RegisteredAgent(
    entry_point=run_kyc_assessment,
    request_model=KYCRequest,
    response_model=KYCResponse,
))
```

### Base Classes

Framework-specific base classes for building agents and orchestrators:

- `foundations/src/base/langgraph/` — State-based workflow orchestration
- `foundations/src/base/langchain/` — Chain-based agent composition
- `foundations/src/base/strands/` — AWS Strands SDK integration

---

## Deployment Pattern

| Pattern | Infrastructure | Best For |
|---------|---------------|----------|
| AgentCore | AWS-native serverless | Scalable, production-ready deployments |

See [Architecture Patterns](architecture/architecture_patterns.md) for detailed information.

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region | `us-east-1` |
| `S3_BUCKET_NAME` | Data bucket | Required |
| `BEDROCK_MODEL_ID` | Bedrock model | Claude Sonnet |
| `AGENT_NAME` | Agent to run | `kyc_banking` |
| `DEPLOYMENT_PATTERN` | Deployment pattern | `agentcore` |

---

## Quick Start

### Local Development

```bash
pip install -r foundations/src/requirements/requirements.txt

export AWS_REGION=us-east-1
export S3_BUCKET_NAME=your-bucket
export AGENT_NAME=kyc_banking
export DEPLOYMENT_MODE=local

cd foundations/src
python main.py
```

### Deploy to AWS

```bash
# Interactive deployment
./scripts/main/deploy.sh

# Or deploy a specific pattern
./scripts/deploy/full/deploy_agentcore.sh
```

---

## Documentation

### Architecture
- [AgentCore Architecture](architecture/architecture_agentcore.md) — Bedrock AgentCore details
- [Architecture Patterns](architecture/architecture_patterns.md) — Deployment architecture

### Deployment
- [AgentCore Deployment](deployment/deployment_agentcore.md) — AgentCore deployment guide
- [Deployment Patterns](deployment/deployment_patterns.md) — Step-by-step deployment

### Security
- [Security Architecture](security/architecture_security.md) — Security architecture and data flows
- [Threat Model](security/threat-model.md) — Security threat analysis and mitigations
- [AWS Service Security](security/aws-service-security.md) — Service-specific security guidelines
- [AI Security](security/ai-security.md) — GenAI-specific security considerations

### Development
- [Adding Applications](development/adding_applications.md) — Create new use cases
- [Local Development](development/local_development.md) — Development setup
- [Global Variables](development/global_variables.md) — Environment variable reference

### Operations
- [Testing](testing/testing.md) — Testing strategies
- [Cleanup](cleanup/cleanup.md) — Resource teardown
