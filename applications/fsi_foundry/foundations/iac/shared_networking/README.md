# FSI Foundry - Shared VPC Infrastructure

This module creates a shared VPC that can be used by all FSI Foundry use cases.

## Purpose

Instead of creating a separate VPC for each use case × framework combination, deploy this shared VPC **once per region/environment** and have all use cases reference it.

### Benefits

- **VPC Quota Savings**: Single VPC instead of N VPCs (N = use cases × frameworks)
- **Cost Reduction**: ~80% cost savings ($800/month for 5 VPCs → $200/month for 1 VPC)
  - Single NAT Gateway instead of N NAT gateways ($32/month each)
  - Single set of VPC endpoints instead of N sets
- **Security**: Use security groups for use case isolation (industry standard)
- **Management**: Centralized network configuration and monitoring
- **Scalability**: No VPC quota limits (default: 5 VPCs per region)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          FSI Foundry VPC (10.0.0.0/16)                      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐          │
│  │ Public       │  │ Private      │  │ Private  │          │
│  │ Subnets      │  │ App Subnets  │  │ Data     │          │
│  │ (ALB)        │  │ (EC2/ECS)    │  │ Subnets  │          │
│  │ 10.0.0.0/24  │  │ 10.0.10.0/24 │  │ 10.0.20.0/24       │
│  │ 10.0.1.0/24  │  │ 10.0.11.0/24 │  │ 10.0.21.0/24       │
│  │ 10.0.2.0/24  │  │ 10.0.12.0/24 │  │ 10.0.22.0/24       │
│  └──────────────┘  └──────────────┘  └──────────┘          │
│                                                               │
│  Use Cases (isolated via Security Groups):                   │
│  ┌────────────────────────────────────────────────┐         │
│  │ kyc_banking                                    │         │
│  │  - SG: ava-kyc-langgraph-*           │         │
│  │  - SG: ava-kyc-strands-*             │         │
│  └────────────────────────────────────────────────┘         │
│  ┌────────────────────────────────────────────────┐         │
│  │ agentic_payments                               │         │
│  │  - SG: ava-b04-langgraph-*           │         │
│  │  - SG: ava-b04-strands-*             │         │
│  └────────────────────────────────────────────────┘         │
│  ┌────────────────────────────────────────────────┐         │
│  │ customer_service                               │         │
│  │  - SG: ava-custsvc-langgraph-*       │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Deployment

### Prerequisites

- Terraform >= 1.0
- AWS CLI configured with appropriate credentials
- Sufficient AWS permissions to create VPC resources

### Deploy Shared VPC

```bash
# Navigate to shared networking module
cd applications/fsi_foundry/foundations/iac/shared_networking

# Initialize Terraform
terraform init

# Review plan
terraform plan -var="aws_region=us-east-1"

# Deploy (takes ~2-3 minutes)
terraform apply -var="aws_region=us-east-1"
```

### Configuration Options

```hcl
# Minimal deployment (no NAT, no Flow Logs)
terraform apply \
  -var="aws_region=us-east-1" \
  -var="environment=dev"

# With NAT Gateway (for private subnet internet access)
terraform apply \
  -var="aws_region=us-east-1" \
  -var="enable_nat_gateway=true"  # Adds ~$32/month

# With VPC Flow Logs (for monitoring)
terraform apply \
  -var="aws_region=us-east-1" \
  -var="enable_flow_logs=true"

# Custom CIDR block
terraform apply \
  -var="aws_region=us-east-1" \
  -var="vpc_cidr=10.1.0.0/16"
```

## Using Shared VPC in Use Cases

### Option 1: VPC Name Lookup (Recommended)

Let Terraform automatically find the VPC by name:

```bash
cd applications/fsi_foundry/foundations/iac/ec2

terraform apply \
  -var="create_vpc=false" \
  -var="vpc_name_tag=fsi-foundry-dev-vpc" \
  -var="use_case_id=agentic_payments" \
  -var="framework=langchain_langgraph"
```

### Option 2: Explicit VPC ID

Specify the VPC ID and subnet IDs directly:

```bash
# Get VPC ID from shared networking output
cd applications/fsi_foundry/foundations/iac/shared_networking
VPC_ID=$(terraform output -raw vpc_id)
SUBNET_IDS=$(terraform output -json public_subnet_ids | jq -r 'join(",")')

# Use in EC2 deployment
cd ../ec2
terraform apply \
  -var="create_vpc=false" \
  -var="vpc_id=$VPC_ID" \
  -var="subnet_ids=[\"$(echo $SUBNET_IDS | sed 's/,/\",\"/g')\"]" \
  -var="use_case_id=agentic_payments" \
  -var="framework=langchain_langgraph"
```

### Option 3: Update Deployment Scripts

Modify your deployment scripts to use shared VPC by default:

```bash
# In deploy_ec2.sh, add before terraform apply:
export TF_VAR_create_vpc=false
export TF_VAR_vpc_name_tag="fsi-foundry-dev-vpc"
```

## Migration from Per-Use-Case VPCs

### Step 1: Deploy Shared VPC

```bash
cd applications/fsi_foundry/foundations/iac/shared_networking
terraform init
terraform apply -var="aws_region=us-east-1"
```

### Step 2: Update One Use Case (Test)

```bash
# Destroy old VPC deployment
cd applications/fsi_foundry/foundations/iac/ec2
terraform workspace select kyc-langgraph-us-east-1
terraform destroy -auto-approve

# Redeploy with shared VPC
terraform apply \
  -var="create_vpc=false" \
  -var="vpc_name_tag=fsi-foundry-dev-vpc" \
  -var="use_case_id=kyc_banking" \
  -var="framework=langchain_langgraph"
```

### Step 3: Migrate All Use Cases

Repeat Step 2 for each use case × framework combination.

### Step 4: Clean Up Old VPCs

```bash
# List all VPCs
aws ec2 describe-vpcs --region us-east-1 \
  --filters "Name=tag:Project,Values=financial-risk-assessment" \
  --query 'Vpcs[*].[VpcId,Tags[?Key==`Name`].Value|[0]]' \
  --output table

# Delete old per-use-case VPCs (after confirming they're empty)
aws ec2 delete-vpc --vpc-id vpc-xxxxx --region us-east-1
```

## Outputs

After deployment, the module outputs:

- `vpc_id`: VPC ID for reference in use cases
- `vpc_name`: VPC name tag for lookup
- `public_subnet_ids`: Public subnet IDs (for ALBs)
- `private_app_subnet_ids`: Private app subnet IDs (for EC2/ECS)
- `private_data_subnet_ids`: Private data subnet IDs (for databases)
- `usage_instructions`: Detailed instructions with values

View outputs:

```bash
terraform output
terraform output -raw usage_instructions
```

## Cost Comparison

### Before (Per-Use-Case VPCs)

```
5 use cases × 2 frameworks = 10 VPCs
Each VPC: ~$100-200/month (NAT Gateway $32 + VPC endpoints ~$100)
Total: $1,000-2,000/month
```

### After (Shared VPC)

```
1 VPC for all use cases
Shared costs: ~$200/month
Total: $200/month
Savings: $800-1,800/month (80-90% reduction)
```

## Security Isolation

Use cases are isolated via security groups, not separate VPCs:

```hcl
# Each use case gets its own security group
resource "aws_security_group" "app" {
  name        = "ava-${use_case_id}-${framework}-app-sg"
  description = "Security group for ${use_case_id} (${framework})"
  vpc_id      = local.vpc_id

  # Use case-specific rules
}
```

This follows AWS best practices and is the industry-standard approach.

## Troubleshooting

### VPC Not Found

```bash
# Verify VPC exists
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=fsi-foundry-dev-vpc"

# Check VPC name in outputs
cd applications/fsi_foundry/foundations/iac/shared_networking
terraform output vpc_name
```

### No Subnets Available

```bash
# Verify subnets exist
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxxxx"

# Check Terraform outputs
terraform output public_subnet_ids
```

### Deployment Fails with VPC Limit

This is the problem we're solving! The shared VPC approach eliminates VPC quota issues.

## Additional Resources

- [AWS VPC Best Practices](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html)
- [VPC Quota Limits](https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html)
- [Security Group Best Practices](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html)
