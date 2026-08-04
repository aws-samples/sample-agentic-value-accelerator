# Agent Observability — Langfuse v2 on ECS Fargate

Deploys [Langfuse v2](https://langfuse.com) on AWS ECS Fargate with Aurora PostgreSQL Serverless v2 and ElastiCache Redis. Provides agent tracing, metrics, prompt management, and evaluation for all AVA use cases.

## Architecture

```
Internet → ALB (port 80) → ECS Fargate (Langfuse v2, port 3000)
                                ├── Aurora PostgreSQL Serverless v2
                                └── ElastiCache Redis
```

## Prerequisites

- AWS account with VPC, public subnets (for ALB), and private subnets (for ECS/RDS/Redis)
- Terraform >= 1.0
- AWS CLI configured

## Deploy

```bash
cd iac/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

terraform init
terraform plan
terraform apply
```

## Connect Agents

After deployment, use the Langfuse URL output to create a project and obtain API keys. Configure agents with:

```python
# Python SDK
from langfuse import Langfuse

langfuse = Langfuse(
    public_key="pk-...",
    secret_key="sk-...",
    host="http://<alb-dns-name>"
)
```

```bash
# Environment variables
export LANGFUSE_PUBLIC_KEY="pk-..."
export LANGFUSE_SECRET_KEY="sk-..."
export LANGFUSE_HOST="http://<alb-dns-name>"
```

## Outputs

| Output | Description |
|--------|-------------|
| `langfuse_url` | Langfuse UI URL |
| `langfuse_alb_dns` | ALB DNS name |
| `database_endpoint` | Aurora PostgreSQL endpoint |
| `redis_endpoint` | Redis endpoint |
| `ecs_cluster_name` | ECS cluster name |
| `ecs_service_name` | ECS service name |
| `security_group_ids` | Map of security group IDs |

## Teardown

```bash
terraform destroy
```

> **Note:** Secrets Manager secrets have a 7-day recovery window. To immediately delete, use `aws secretsmanager delete-secret --force-delete-without-recovery`.
