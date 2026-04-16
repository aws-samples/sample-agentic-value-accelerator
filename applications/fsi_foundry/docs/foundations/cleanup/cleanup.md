# Cleanup Guide

This guide covers removing all deployed resources for AgentCore deployments to avoid ongoing AWS charges.

## Overview

Cleanup involves:
- Removing AgentCore runtime and associated infrastructure
- Deleting container images (ECR repositories)
- Removing IAM roles and policies
- Deleting per-use-case UI resources (S3, CloudFront, Lambda)
- Optionally removing S3 data buckets

**Important:** Always review the Terraform destroy plan before confirming to ensure you're not accidentally deleting resources you want to keep.

---

## Using Cleanup Script (Recommended)

```bash
./applications/fsi_foundry/scripts/main/cleanup.sh
```

Or for a specific use case:

```bash
./applications/fsi_foundry/scripts/use_cases/{USE_CASE_ID}/cleanup/cleanup_agentcore.sh
```

The script will:
1. Delete the AgentCore runtime via Terraform
2. Delete ECR repository and images
3. Remove per-use-case UI infrastructure (CloudFront, S3, Lambda proxy)
4. Optionally clean up S3 data buckets

## Manual Cleanup

```bash
# Destroy runtime
cd applications/fsi_foundry/foundations/iac/agentcore/runtime
terraform destroy

# Destroy infrastructure
cd ../infra
terraform destroy -var="account_id=$(aws sts get-caller-identity --query Account --output text)"
```

Review the plan and type `yes` to confirm.

## What Gets Deleted

- AgentCore runtime
- ECR repository and container images
- IAM roles and policies
- CloudWatch Log Groups
- Per-use-case UI (S3 bucket, CloudFront distribution, Lambda proxy, API Gateway)
- DynamoDB session table
- S3 code bucket (only if empty)

---

## Troubleshooting

### CloudFormation Stack Deletion Fails

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name ava-agentcore_runtime \
  --region us-east-1

# View stack events for errors
aws cloudformation describe-stack-events \
  --stack-name ava-agentcore_runtime \
  --region us-east-1 \
  --max-items 20

# Force delete if stuck
aws cloudformation delete-stack \
  --stack-name ava-agentcore_runtime \
  --region us-east-1
```

### ECR Repository Not Empty

```bash
# Delete all images first
aws ecr batch-delete-image \
  --repository-name ava-agentcore \
  --region us-east-1 \
  --image-ids "$(aws ecr list-images --repository-name ava-agentcore --region us-east-1 --query 'imageIds[*]' --output json)"

# Then delete repository
aws ecr delete-repository \
  --repository-name ava-agentcore \
  --region us-east-1 \
  --force
```

### S3 Bucket Not Empty

```bash
# Force delete bucket with contents
aws s3 rb s3://YOUR-BUCKET-NAME --force
```

---

## Cost Verification

After cleanup, verify no resources are still incurring charges:

### Check CloudFormation Stacks

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `ava`)].StackName' \
  --output table
```

### Check S3 Buckets

```bash
aws s3 ls | grep ava
```

### Check ECR Repositories

```bash
aws ecr describe-repositories \
  --query 'repositories[?contains(repositoryName, `ava`)].repositoryName' \
  --output table
```

### Check Lambda Functions

```bash
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `ava`)].FunctionName' \
  --output table
```

### Check CloudFront Distributions

```bash
aws cloudfront list-distributions \
  --query 'DistributionList.Items[?contains(Comment, `ava`)].{Id:Id,Domain:DomainName}' \
  --output table
```

---

## Important Notes

### S3 Bucket Deletion

- **Terraform requires empty buckets** — delete contents first
- **Versioned buckets** — delete all versions and delete markers
- **Force delete:** `aws s3 rb s3://YOUR-BUCKET-NAME --force`

### IAM Role Deletion

Roles with attached policies may fail to delete. Terraform usually handles this automatically. If manual deletion is needed:

```bash
# List and detach policies
aws iam list-attached-role-policies --role-name ROLE-NAME
aws iam detach-role-policy --role-name ROLE-NAME --policy-arn POLICY-ARN
aws iam delete-role --role-name ROLE-NAME
```

### Deletion Protection

Some resources may have deletion protection enabled. Disable before deletion:

```bash
aws cloudformation update-termination-protection \
  --stack-name STACK-NAME \
  --no-enable-termination-protection
```

---

## Next Steps

After cleanup:

- **[Deployment Guide](../deployment/deployment_patterns.md)** — Redeploy with different configuration
- **[Testing Guide](../testing/testing.md)** — Test a deployment
- **[Architecture](../architecture/architecture_patterns.md)** — Review architecture design
