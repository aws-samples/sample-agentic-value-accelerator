# AWS DevOps Agent — CDK Deployment

Deploys an AWS DevOps Agent Space into your account using AWS CDK (TypeScript). This creates the same resources as the [Terraform module](../terraform/README.md) — Agent Space, IAM roles, operator app, and primary-account association.

Based on the [official AWS sample](https://github.com/aws-samples/sample-aws-devops-agent-cdk) and [AWS documentation](https://docs.aws.amazon.com/devopsagent/latest/userguide/getting-started-with-aws-devops-agent-getting-started-with-aws-devops-agent-using-aws-cdk.html).

## Resources Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| IAM Role | `DevOpsAgentRole-AgentSpace-{suffix}` | Assumed by the DevOps Agent service to monitor the account |
| IAM Role | `DevOpsAgentRole-WebappAdmin-{suffix}` | Operator app role for the DevOps Agent webapp |
| Agent Space | `{agent_space_name}` | Central agent space with operator app |
| Association | AWS (monitor) | Links the primary account to the agent space |

## Parameters

Passed via CDK context (`-c key=value`) or environment variables:

| Context Key | Env Var | Default                                 | Description |
|-------------|---------|-----------------------------------------|-------------|
| `agentSpaceName` | `AGENT_SPACE_NAME` | `FSIAgentKitAgentSpace`                 | Name for the Agent Space |
| `agentSpaceDescription` | `AGENT_SPACE_DESCRIPTION` | `DevOps Agent Space provisioned by AVA` | Description |
| `namePostfix` | `NAME_POSTFIX` | *(random 4-byte hex)*                   | Fixed suffix for IAM role names |
| `awsRegion` | `AWS_TARGET_REGION` | `us-east-1`                             | Target AWS region |

## Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Synthesize CloudFormation template (dry run)
cdk synth -c agentSpaceName=MyAgentSpace

# Deploy
cdk deploy -c agentSpaceName=MyAgentSpace

# Destroy
cdk destroy
```

## Pipeline Deployment

This module is deployed automatically by the Frontier Agents CI/CD pipeline when a user selects **CDK** as the IaC type in the Control Plane UI. The pipeline:

1. Downloads and unzips this directory
2. Runs `npm install`
3. Runs `cdk bootstrap` (if needed)
4. Runs `cdk deploy` with context flags derived from the UI parameters
5. Captures stack outputs to DynamoDB

## Supported Regions

AWS DevOps Agent is available in: `us-east-1`, `us-west-2`, `ap-southeast-2`, `ap-northeast-1`, `eu-central-1`, `eu-west-1`.

## Outputs

| Output | Description |
|--------|-------------|
| `AgentSpaceId` | ID of the created Agent Space |
| `AgentSpaceArn` | ARN of the created Agent Space |
| `AgentSpaceName` | Name of the Agent Space |
| `OperatorAppUrl` | URL of the DevOps Agent operator webapp |
| `DevOpsAgentSpaceRoleArn` | ARN of the Agent Space IAM role |
| `DevOpsOperatorRoleArn` | ARN of the operator-app IAM role |
| `PrimaryAccountId` | Account ID of the monitoring account |
| `PrimaryAccountAssociationId` | ID of the primary AWS account association |
| `AwsRegion` | AWS region deployed into |
