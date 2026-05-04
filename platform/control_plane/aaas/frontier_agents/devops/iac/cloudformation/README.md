# AWS DevOps Agent — CloudFormation Deployment

Deploys an AWS DevOps Agent Space into your account using a standalone CloudFormation template. This creates the same resources as the [Terraform module](../terraform/README.md) and [CDK stack](../cdk/README.md).

Based on the [AWS documentation](https://docs.aws.amazon.com/devopsagent/latest/userguide/getting-started-with-aws-devops-agent-getting-started-with-aws-devops-agent-using-aws-cloudformation.html).

## Resources Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| IAM Role | `DevOpsAgentRole-AgentSpace-{suffix}` | Assumed by the DevOps Agent service to monitor the account |
| IAM Role | `DevOpsAgentRole-WebappAdmin-{suffix}` | Operator app role for the DevOps Agent webapp |
| Agent Space | `{AgentSpaceName}` | Central agent space with operator app |
| Association | AWS (monitor) | Links the primary account to the agent space |

## Parameters

| Parameter | Default                                 | Description |
|-----------|-----------------------------------------|-------------|
| `AgentSpaceName` | `FSIAgentKitAgentSpace`                 | Name for the Agent Space |
| `AgentSpaceDescription` | `DevOps Agent Space provisioned by AVA` | Description |
| `NamePostfix` | *(stack unique suffix)*                 | Fixed suffix for IAM role names |

## Local Deployment

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name DevOpsAgentStack \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    AgentSpaceName=MyAgentSpace \
    AgentSpaceDescription="My DevOps Agent Space"
```

## Pipeline Deployment

This template is deployed automatically by the Frontier Agents CI/CD pipeline when a user selects **CloudFormation** as the IaC type in the Control Plane UI. The pipeline:

1. Downloads and unzips this directory
2. Runs `aws cloudformation deploy` with parameter overrides derived from the UI parameters
3. Captures stack outputs to DynamoDB

## Cleanup

```bash
aws cloudformation delete-stack \
  --stack-name DevOpsAgentStack \
  --region us-east-1
```

## Supported Regions

AWS DevOps Agent is available in: `us-east-1`, `us-west-2`, `ap-southeast-2`, `ap-northeast-1`, `eu-central-1`, `eu-west-1`.
