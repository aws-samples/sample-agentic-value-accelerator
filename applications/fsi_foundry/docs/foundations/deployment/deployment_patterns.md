# Deployment Guide

FSI Foundry deploys multi-agent AI systems to **Amazon Bedrock AgentCore** — a fully managed runtime with auto-scaling, built-in observability, and native AWS integration.

## Multi-Use-Case and Multi-Framework Support

The platform supports deploying **multiple use cases** and **multiple frameworks** to the same AWS account and region with complete isolation:

- **Workspace-based state isolation**: Each use case/framework combination gets its own Terraform workspace (`{USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}`)
- **Resource naming isolation**: All resources include the use case ID and framework short name in their names
- **Framework isolation**: Deploy the same use case with different frameworks (e.g., LangGraph and Strands) simultaneously
- **Independent lifecycle**: Deploy, update, and destroy use cases independently
- **No state conflicts**: Destroying one use case/framework doesn't affect others

---

## Interactive Deployment (Recommended)

Use the interactive CLI for guided deployment:

```bash
./applications/fsi_foundry/scripts/main/deploy.sh
```

This will guide you through:
1. Selecting a use case from the registry
2. Selecting an AI framework (LangGraph or Strands)
3. Selecting an AWS region
4. Running the deployment

---

## Command-Line Deployment

For scripted or CI/CD deployments, set environment variables and run the deploy script:

```bash
# Set required environment variables
export USE_CASE_ID="kyc_banking"
export FRAMEWORK="langchain_langgraph"
export AWS_REGION="us-east-1"

# Full deployment (infrastructure + application)
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Test
./applications/fsi_foundry/scripts/main/test.sh

# Cleanup
./applications/fsi_foundry/scripts/main/cleanup.sh
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `USE_CASE_ID` | Use case identifier | `kyc_banking` |
| `FRAMEWORK` | AI framework | `langchain_langgraph` or `strands` |
| `AWS_REGION` | Target AWS region | `us-east-1` |
| `AWS_PROFILE` | AWS CLI profile (optional) | `default` |

### Automatic Sample Data Upload

All deployment scripts automatically upload sample data from `applications/fsi_foundry/data/samples/{USE_CASE_ID}/` to the S3 bucket created during deployment. This ensures that test entities are available immediately for functional testing.

---

## Control Plane Deployment (One-Click)

For deployments via the AVA Control Plane UI:

1. Navigate to **FSI Foundry** in the sidebar
2. Select a use case and click **Deploy**
3. Choose the framework and parameters
4. Click **Deploy** — the CI/CD pipeline handles the rest

The pipeline automatically provisions infrastructure, builds the Docker image, deploys the AgentCore runtime, and builds/deploys the per-use-case frontend UI.

**[→ Full AgentCore Deployment Details](deployment_agentcore.md)**

---

## Multi-Use-Case Deployment and State Isolation

### Terraform Workspace-Based State Isolation

Each use case/framework deployment gets its own **Terraform workspace**, which provides:

1. **Isolated State Files**: Each workspace maintains its own `terraform.tfstate` file
2. **Independent Lifecycle**: Deploy, update, and destroy use cases independently
3. **Resource Separation**: All resources are prefixed with use case ID and framework short name
4. **Framework Isolation**: Deploy the same use case with different frameworks simultaneously

#### Workspace Naming Convention

Workspaces follow the pattern: `{USE_CASE_ID}-{FRAMEWORK_SHORT}-{AWS_REGION}`

| Use Case | Framework | Region | Workspace Name |
|----------|-----------|--------|----------------|
| kyc_banking | langchain_langgraph | us-east-1 | `kyc_banking-langgraph-us-east-1` |
| kyc_banking | strands | us-east-1 | `kyc_banking-strands-us-east-1` |
| fraud_detection | langchain_langgraph | us-west-2 | `fraud_detection-langgraph-us-west-2` |

#### Framework Short Names

| Framework ID | Short Name |
|--------------|------------|
| `langchain_langgraph` | `langgraph` |
| `strands` | `strands` |

#### Multi-Framework Deployment Example

```bash
# Deploy KYC with LangGraph
export USE_CASE_ID=kyc_banking FRAMEWORK=langchain_langgraph AWS_REGION=us-east-1
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Deploy KYC with Strands (same region, isolated stack)
export USE_CASE_ID=kyc_banking FRAMEWORK=strands AWS_REGION=us-east-1
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh
```

#### Destroying a Single Deployment

Only the targeted use case/framework combination is affected:

```bash
export USE_CASE_ID=kyc_banking FRAMEWORK=langchain_langgraph AWS_REGION=us-east-1
./scripts/cleanup/cleanup_agentcore.sh
# The strands deployment remains untouched
```

---

## Prerequisites

- **AWS Account** with appropriate permissions
- **AWS CLI** >= 2.28.9
- **Terraform** >= 1.0
- **Python** >= 3.11
- **Docker** with buildx support
- **Node.js** >= 22 (for UI builds)
- **jq** for JSON processing
- **Amazon Bedrock** access with Claude models enabled

### Verify Prerequisites

```bash
aws --version        # >= 2.28.9
terraform --version  # >= 1.0
docker --version
node --version       # >= 22
jq --version
```

---

## Testing Deployments

### Interactive Testing

```bash
./applications/fsi_foundry/scripts/main/test.sh
```

### Command-Line Testing

```bash
FRAMEWORK=langchain_langgraph AWS_REGION=us-east-1 \
  bash ./applications/fsi_foundry/scripts/use_cases/kyc_banking/test/test_agentcore.sh
```

The test scripts automatically:
1. Retrieve deployment outputs (runtime ARN, endpoints)
2. Run functional tests against the deployed agent
3. Report test results with pass/fail status

---

## After Deployment

1. **Test Your Deployment** — Use the test scripts or the Control Plane's Test Deployment drawer
2. **Clean Up Resources** — `./applications/fsi_foundry/scripts/main/cleanup.sh`

---

## Architecture Details

- **[Architecture Overview](../architecture/architecture_patterns.md)** — Platform architecture and per-use-case deployment design
- **[AgentCore Architecture](../architecture/architecture_agentcore.md)** — Detailed AgentCore runtime design
