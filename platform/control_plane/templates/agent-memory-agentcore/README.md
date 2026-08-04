# Agent Memory — AgentCore

Deploys a Bedrock AgentCore memory store with a configurable extraction strategy and IAM execution role.

## What It Creates

| Resource | Purpose |
|----------|---------|
| AgentCore Memory | Persistent memory store for agent sessions and knowledge |
| Memory Strategy | Extraction strategy (semantic, summarization, user preference, or episodic) |
| IAM Role | Execution role for memory operations with managed policy |

## Prerequisites

- AWS CLI configured with credentials
- Terraform >= 1.5
- AWS provider >= 6.18.0 (AgentCore memory resource support)

## Quick Start

```bash
cd iac/terraform

# Copy and edit the variables file
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project_name and aws_region

# Deploy
terraform init
terraform plan
terraform apply
```

## Configuration

See [terraform.tfvars.example](iac/terraform/terraform.tfvars.example) for all available variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `project_name` | Yes | — | Project name (lowercase, hyphens allowed) |
| `aws_region` | Yes | — | AWS region |
| `environment` | No | `dev` | Environment (dev/staging/prod) |
| `event_expiry_duration` | No | `30` | Memory event expiry in days (7–365) |
| `memory_strategy_type` | No | `SEMANTIC` | Strategy type |
| `namespaces` | No | `["default"]` | Namespaces for the strategy |

## Outputs

| Output | Description |
|--------|-------------|
| `memory_id` | AgentCore memory ID |
| `memory_arn` | AgentCore memory ARN |
| `strategy_id` | Memory strategy ID |
| `role_arn` | IAM execution role ARN |

## Cleanup

```bash
terraform destroy
```
