# LiteLLM Gateway — Dev Environment

Self-contained Terraform deployment that creates a VPC, ECS cluster, and the full LiteLLM gateway stack from scratch.

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured with profile `<your-profile>` (us-east-2)
- Valid AWS credentials: `aws sts get-caller-identity --profile <your-profile>`

## Deploy

```bash
cd platform/control_plane/infrastructure/environments/dev

terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Expected duration: ~10-15 minutes (RDS and ElastiCache take the longest).

## What gets created

| Resource | Details |
|----------|---------|
| VPC | 10.0.0.0/16 with DNS hostnames enabled |
| Public subnets | 10.0.1.0/24 (az-a), 10.0.2.0/24 (az-b) |
| Private subnets | 10.0.10.0/24 (az-a), 10.0.11.0/24 (az-b) |
| Internet Gateway | Routes public subnet traffic to the internet |
| NAT Gateway | Single NAT in public-a for private subnet egress |
| ECS Cluster | `ava-litellm-test` with Container Insights |
| LiteLLM Module | ALB, ECS service, RDS, Redis, S3, Secrets Manager, CloudWatch |

## Outputs

After apply, retrieve key values:

```bash
terraform output gateway_endpoint
terraform output config_s3_bucket
terraform output master_key_secret_arn
terraform output -json backend_environment_variables
```

## Verify Health

The gateway endpoint is an internal ALB — run health checks from inside the VPC:

```bash
# Via SSM session or ECS Exec
curl -s http://<gateway_endpoint>/health | python3 -m json.tool
```

## Tear Down

```bash
terraform destroy
```

All resources use `deletion_protection = false` in dev for easy cleanup.

## Notes

- Uses local backend (no remote state) for simplicity
- Single NAT gateway to save cost — not HA, acceptable for dev
- CloudFront/WAF disabled by default (enable_cloudfront = false)
- Spend Aggregator Lambda layers left empty (schedule disabled in dev)
