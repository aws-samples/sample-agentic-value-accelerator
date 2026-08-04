# Agent Runtime — AgentCore

Deploys a Bedrock AgentCore runtime with an invocable endpoint, ECR repository, IAM roles, and CloudWatch observability.

## What It Creates

| Resource | Purpose |
|----------|---------|
| AgentCore Runtime | Managed container runtime for your agent |
| AgentCore Endpoint | URL to invoke the agent (pinned to runtime version) |
| ECR Repository | Container registry with lifecycle policy and scan-on-push |
| IAM Role + 5 Policies | Least-privilege access to Bedrock, ECR, CloudWatch, and X-Ray |
| CloudWatch Log Group | Vended log delivery for application logs |
| X-Ray Trace Delivery | Distributed tracing pipeline |

## Prerequisites

- AWS CLI configured with credentials
- Terraform >= 1.5
- AWS provider >= 6.17.0 (AgentCore resource support)
- Docker (to build and push agent container images)

## Quick Start

```bash
cd iac/terraform

# Copy and edit the variables file
cp terraform.tfvars.example terraform.tfvars
# Edit: project_name, aws_region, container_image_uri

# Deploy
terraform init
terraform plan
terraform apply
```

### Push a Container Image

```bash
# Get the ECR repository URL from Terraform output
ECR_URL=$(terraform output -raw ecr_repository_url)

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_URL

# Build and push
docker build -t $ECR_URL:v1.0.0 .
docker push $ECR_URL:v1.0.0
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `project_name` | Yes | — | Project name (lowercase, hyphens) |
| `aws_region` | Yes | — | AWS region |
| `container_image_uri` | Yes | — | ECR image URI |
| `environment` | No | `dev` | Environment (dev/staging/prod) |
| `server_protocol` | No | `HTTP` | Protocol: `HTTP`, `MCP`, or `A2A` |
| `idle_session_timeout` | No | `300` | Idle session timeout (seconds) |
| `max_session_lifetime` | No | `3600` | Max session lifetime (seconds) |
| `network_mode` | No | `PUBLIC` | `PUBLIC` or `VPC` |
| `model_id` | No | `anthropic.claude-sonnet-4-5-20250929` | Bedrock model for IAM scoping |
| `log_retention_days` | No | `30` | CloudWatch log retention |

## Outputs

| Output | Description |
|--------|-------------|
| `runtime_id` | AgentCore runtime ID |
| `runtime_arn` | AgentCore runtime ARN |
| `endpoint_arn` | Endpoint ARN for invoking the agent |
| `ecr_repository_url` | ECR URL for pushing images |
| `ecr_repository_arn` | ECR repository ARN |
| `iam_role_arn` | IAM role ARN |
| `iam_role_name` | IAM role name |
| `log_group_name` | CloudWatch log group name |
| `log_group_arn` | CloudWatch log group ARN |

## Protocol Options

| Protocol | Use Case |
|----------|----------|
| `HTTP` | Standard REST API agents (default) |
| `MCP` | Model Context Protocol — tool servers |
| `A2A` | Agent-to-Agent communication |

## Examples

- [minimal.tfvars](iac/terraform/examples/minimal.tfvars) — Required variables only
- [production.tfvars](iac/terraform/examples/production.tfvars) — VPC mode with compliance tags

## Cleanup

```bash
terraform destroy
```

Note: In non-production environments, ECR is set to `force_delete = true`. In production, delete images first.
