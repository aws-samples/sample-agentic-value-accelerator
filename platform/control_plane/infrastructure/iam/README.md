# AVA Govern IAM Setup

This directory contains the IAM role configuration for deploying AVA Govern into your AWS account.

## Why This Approach?

This follows AWS Well-Architected Framework security best practices:

| Practice | Benefit |
|----------|---------|
| **IAM roles over access keys** | No long-lived credentials to rotate or risk leaking |
| **Attached to compute** | Credentials never touch disk or environment variables |
| **Least privilege** | Read-only access scoped to specific services |
| **Infrastructure as code** | Auditable, repeatable, version controlled |

## Quick Start

### Option 1: AWS Console (One-Click)

1. Open the [CloudFormation Console](https://console.aws.amazon.com/cloudformation)
2. Click **Create stack** > **With new resources**
3. Select **Upload a template file**
4. Upload `ava-govern-role.yaml`
5. Fill in parameters:
   - **ComputeType**: Where AVA Govern will run (ecs, eks, ec2, lambda, apprunner)
   - **Enable*** options: Toggle which AWS services AVA Govern can read
6. Click **Create stack**
7. Note the **RoleArn** from the Outputs tab

### Option 2: AWS CLI

```bash
# Deploy with defaults (ECS, all capabilities enabled)
aws cloudformation deploy \
  --template-file ava-govern-role.yaml \
  --stack-name ava-govern-iam \
  --capabilities CAPABILITY_NAMED_IAM

# Deploy with specific options
aws cloudformation deploy \
  --template-file ava-govern-role.yaml \
  --stack-name ava-govern-iam \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ComputeType=eks \
    EnableCostExplorer=true \
    EnableBedrock=true \
    EnableCloudWatch=true \
    EnableCloudTrail=false

# Get the role ARN
aws cloudformation describe-stacks \
  --stack-name ava-govern-iam \
  --query 'Stacks[0].Outputs[?OutputKey==`RoleArn`].OutputValue' \
  --output text
```

## Configuring Your Compute Service

### ECS (Fargate or EC2)

In your task definition:

```json
{
  "family": "ava-govern",
  "taskRoleArn": "arn:aws:iam::123456789012:role/AVAGovernRole",
  "containerDefinitions": [...]
}
```

Or with Terraform:

```hcl
resource "aws_ecs_task_definition" "ava_govern" {
  family             = "ava-govern"
  task_role_arn      = "arn:aws:iam::123456789012:role/AVAGovernRole"
  # ...
}
```

### EKS (IAM Roles for Service Accounts)

1. Create an OIDC provider for your cluster (if not already done):

```bash
eksctl utils associate-iam-oidc-provider --cluster <cluster-name> --approve
```

2. Create a service account that can assume the role:

```bash
eksctl create iamserviceaccount \
  --cluster <cluster-name> \
  --namespace ava-govern \
  --name ava-govern-sa \
  --role-name AVAGovernRole \
  --attach-policy-arn arn:aws:iam::123456789012:policy/AVAGovernCostExplorer \
  --attach-policy-arn arn:aws:iam::123456789012:policy/AVAGovernBedrock \
  --attach-policy-arn arn:aws:iam::123456789012:policy/AVAGovernCloudWatch \
  --approve
```

3. Use the service account in your deployment:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ava-govern-sa
  namespace: ava-govern
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/AVAGovernRole
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ava-govern
spec:
  template:
    spec:
      serviceAccountName: ava-govern-sa
      containers:
        - name: ava-govern
          # ...
```

### EC2

1. Launch the instance with the instance profile:

```bash
aws ec2 run-instances \
  --image-id ami-xxxxx \
  --instance-type t3.medium \
  --iam-instance-profile Name=AVAGovernInstanceProfile
```

Or attach to an existing instance:

```bash
aws ec2 associate-iam-instance-profile \
  --instance-id i-xxxxx \
  --iam-instance-profile Name=AVAGovernInstanceProfile
```

### Lambda

Set the execution role in your function configuration:

```bash
aws lambda update-function-configuration \
  --function-name ava-govern \
  --role arn:aws:iam::123456789012:role/AVAGovernRole
```

### App Runner

In your App Runner service configuration:

```json
{
  "InstanceConfiguration": {
    "InstanceRoleArn": "arn:aws:iam::123456789012:role/AVAGovernRole"
  }
}
```

## Permissions Granted

The role grants **read-only** access to:

| Service | Purpose | Actions |
|---------|---------|---------|
| **Cost Explorer** | FinOps dashboards | `ce:Get*`, `ce:List*` |
| **Bedrock** | Agent/model/guardrail inventory | `bedrock:List*`, `bedrock:Get*` |
| **CloudWatch** | Metrics and logs | `cloudwatch:Get*`, `logs:Get*`, `logs:Filter*` |
| **CloudTrail** | Audit trail | `cloudtrail:LookupEvents`, `cloudtrail:Describe*` |
| **IAM** | Policy analysis | `iam:Get*`, `iam:List*` (read-only) |
| **X-Ray** | Distributed tracing | `xray:Get*`, `xray:BatchGetTraces` |

**No write permissions are granted.** AVA Govern cannot create, modify, or delete any resources.

## Local Development

For local development, AVA Govern uses your AWS CLI credentials. Ensure you have:

```bash
# Verify credentials
aws sts get-caller-identity

# Ensure your user/role has similar permissions
# Or use aws-vault / granted for temporary credentials
aws-vault exec my-profile -- npm run dev
```

## Updating the Role

To add new capabilities later:

```bash
aws cloudformation update-stack \
  --stack-name ava-govern-iam \
  --template-body file://ava-govern-role.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides EnableCloudTrail=true
```

## Deleting the Role

```bash
aws cloudformation delete-stack --stack-name ava-govern-iam
```

## Troubleshooting

### "Access Denied" errors

1. Verify the role is attached to your compute:
   ```bash
   # For EC2
   curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
   
   # For ECS
   curl $AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
   ```

2. Check the role has the required policy attached:
   ```bash
   aws iam list-attached-role-policies --role-name AVAGovernRole
   ```

### Cost Explorer shows "not enabled"

Cost Explorer must be enabled in your account (one-time setup):
1. Go to [AWS Cost Management Console](https://console.aws.amazon.com/cost-management)
2. Click **Enable Cost Explorer**
3. Wait 24 hours for data to populate

### Bedrock not available

Bedrock is not available in all regions. Ensure you're deploying to a [supported region](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html).
