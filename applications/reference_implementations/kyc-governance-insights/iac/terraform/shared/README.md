# Shared Module

## Purpose

This module provides **shared resources for individual use case deployments**, such as S3 buckets and random IDs for resource naming uniqueness.

Each use case deployment (EC2, Step Functions, AgentCore) calls this module to create its own set of shared resources.

## What This Module Creates

- **S3 Data Bucket**: Use case-specific bucket for application data
- **S3 Logs Bucket**: Use case-specific bucket for logs (for Step Functions)
- **Random ID**: Unique suffix for bucket names to avoid naming conflicts

## When to Use

This module is **automatically called** by deployment patterns (EC2, Step Functions, AgentCore). You don't need to deploy it directly.

```hcl
# Example: Called from ec2/main.tf
module "shared" {
  source            = "../shared"
  project_name      = var.project_name
  aws_region        = var.aws_region
  deployment_suffix = "ec2"
  use_case_id       = var.use_case_id
  framework         = var.framework
}
```

---

## Difference: `shared` vs `shared_networking`

| Aspect | `shared` (this module) | `shared_networking` |
|--------|------------------------|---------------------|
| **Purpose** | Per-use-case resources | Cross-use-case networking |
| **Scope** | One instance per use case × framework | One instance per region |
| **Creates** | S3 buckets, random IDs | VPC, subnets, route tables |
| **Deployment** | Called automatically by patterns | Deploy manually once |
| **Cost** | ~$1-2/month per use case | ~$0-200/month per region |

### `shared` (this module)

**Purpose**: Provides common resources for **each individual use case deployment**

**Pattern**:
```
Use Case 1 + LangGraph → calls shared → creates S3 buckets for use case 1
Use Case 1 + Strands   → calls shared → creates S3 buckets for use case 1 (different buckets)
Use Case 2 + LangGraph → calls shared → creates S3 buckets for use case 2
```

**Resources Created** (per use case):
- `fsi-{use_case_id}-{framework}-data-{pattern}-{random}` (S3 bucket)
- `fsi-{use_case_id}-{framework}-logs-{pattern}-{random}` (S3 bucket, if needed)

### `shared_networking` (separate module)

**Purpose**: Provides **one shared VPC** for **all use cases** in a region

**Pattern**:
```
Deploy shared_networking once → creates 1 VPC
All use cases reference this VPC → no new VPCs created
```

**Resources Created** (once per region):
- 1 VPC (fsi-foundry-dev-vpc)
- 9 Subnets (public/app/data × 3 AZs)
- 1 Internet Gateway
- 3 Route Tables

---

## Summary

- **`shared` module**: Per-use-case resources (S3 buckets) - used automatically by deployment patterns
- **`shared_networking` module**: Shared VPC for all use cases - deploy once per region manually

For VPC architecture details, see: `applications/fsi_foundry/foundations/iac/shared_networking/README.md`
