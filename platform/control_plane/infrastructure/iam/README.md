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

# Recommended: scope evaluation-output S3 reads to specific buckets.
# Left unset, that statement falls back to every bucket in THIS account
# (it is always bounded by aws:ResourceAccount, never cross-account).
# Pass BOTH ARNs per bucket so ListBucket and GetObject each resolve.
aws cloudformation deploy \
  --template-file ava-govern-role.yaml \
  --stack-name ava-govern-iam \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    'EvaluationOutputBucketArns=arn:aws:s3:::my-eval-output,arn:aws:s3:::my-eval-output/*'

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

2. Create a service account bound to the role the stack already created:

```bash
eksctl create iamserviceaccount \
  --cluster <cluster-name> \
  --namespace ava-govern \
  --name ava-govern-sa \
  --attach-role-arn arn:aws:iam::123456789012:role/AVAGovernRole \
  --approve
```

Use `--attach-role-arn`, not `--attach-policy-arn`. Every policy in
`ava-govern-role.yaml` is an `AWS::IAM::Policy`, which is an **inline** policy on
`AVAGovernRole` — inline policies have no ARN, so
`--attach-policy-arn arn:aws:iam::<acct>:policy/AVAGovernCostExplorer` refers to a managed
policy that does not exist and fails with `NoSuchEntity`. The permissions are already on the
role; the service account only needs to be pointed at it.

They are inline deliberately: the template defines 12 policies and the default quota is
**10 managed policies per role**, so a managed-policy version would not attach.

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

**With default parameters, no write permissions are granted** and AVA Govern
cannot create, modify, or delete any resources.

### Write actions are opt-in (`EnableWriteActions`, default `false`)

Setting `EnableWriteActions=true` creates one additional policy,
`AVAGovernWriteActions`. It is the only policy on the role that can write, so
`aws iam list-role-policies --role-name <role>` tells you at a glance whether
this role can write anything:

| Action | Bound to |
|---|---|
| `bedrock:ApplyGuardrail` | Guardrails in this account. Billable, but mutates nothing. |
| `cloudwatch:PutMetricData` | The `AVA/LLMQuality` namespace only, enforced by a `Condition`. |
| `cloudwatch:PutDashboard`, `cloudwatch:PutMetricAlarm` | Unbounded. Both overwrite by name, so this can replace an existing dashboard or alarm. |
| `cloudwatch:DeleteAlarms` | Alarms named `AVA-*` only, so it can delete only what it created. |
| `servicequotas:RequestServiceQuotaIncrease` | Reviewed by AWS Support; modifies no resource. |

`s3:PutObject` is **not** granted even with the flag on. Leave the flag `false`
unless you need guardrail testing, alarm provisioning, or quota requests. Full
detail: `platform/control_plane/docs/ava-govern-iam-permissions.md`.

## Relationship to `environments/dev` (read this before deploying either)

This template and the Terraform dev root each create a role, the two permission sets are
**disjoint**, and no Terraform in this repo references this file. Applying only one of them
produces a control plane that half works, in a way that is easy to miss.

| | `iam/ava-govern-role.yaml` (this stack) | `environments/dev` (`aws_iam_role.backend_task`) |
|---|---|---|
| Bedrock | 33 read actions (`ListAgents`, `ListGuardrails`, inventory) | 4 actions, **inference only** (`InvokeModel`, `ListFoundationModels`) |
| Cost Explorer / Budgets | `ce` (13), `budgets`, `compute-optimizer` | none |
| CloudWatch / Logs / X-Ray | 20 actions | none |
| CloudTrail | 6 actions | none |
| Security Hub, GuardDuty, Macie, Inspector, Access Analyzer, Detective, Security Lake | 18 actions | none |
| Config, Audit Manager, Organizations, Verified Permissions | 14 actions | none |
| AgentCore | 7 actions | none |
| Glue, KMS, SageMaker, Tagging | 23 actions | none |
| Service Quotas, Health, Support, SSM, EC2, API Gateway | 18 actions | none |
| **DynamoDB** | **none** | the control-plane tables, by enumerated ARN |
| **S3 / ECS / Secrets Manager** | limited | the control plane's own buckets, services and secrets |

So: this stack can read a customer's AI estate but cannot touch AVA's own tables; the dev
task role can run AVA but reads almost nothing Govern needs. A `terraform apply` alone yields
a control plane where every Govern panel degrades to `live=false`. That degradation is now
honest — it says which call was denied instead of rendering a fabricated zero — but it is
still a broken deployment, and "Security Hub unavailable" reads like a customer
misconfiguration rather than a missing grant.

**These two roles cannot simply be merged, and the numbers are why.** Measured against the
template: 172 action entries, ~4,795 characters of action strings alone, which with
`Effect` / `Resource` / `Condition` overhead lands near 8-9 KB of the **10,240-character
aggregate inline-policy limit per role**. The dev root's DynamoDB policy enumerates every
table ARN plus `/index/*`, which would push the total past that ceiling and fail at apply.
Converting to managed policies instead hits the other wall: 12 policies against a default
quota of 10 attachments per role. Combining them therefore needs a Service Quotas increase
first, which is why it is not wired up rather than an oversight.

### What to actually do

- **Deploying AVA into your own account** — deploy this stack with `ComputeType=ecs`, then
  add its inline policy set to the role Terraform creates, or run the Govern services under
  this role and the control plane under Terraform's. Either way, request the quota increase
  before trying to put both on one role.
- **Just running the demo locally** — nothing here applies. `docker compose` uses your AWS
  CLI credentials directly, which is why the demo account has never had an `AVAGovernRole`
  (verified: `iam get-role AVAGovernRole` returns `NoSuchEntity`) and Govern still reads
  live data.
- **Auditing what a deployment can see** — this table is a summary; `ava-govern-role.yaml`
  is authoritative for the read surface, and `environments/dev/main.tf`'s
  `aws_iam_role_policy.backend_task_*` resources for the write surface.

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
