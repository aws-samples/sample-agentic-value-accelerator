# AWS Security Agent — CloudFormation Deployment

Deploys an AWS Security Agent Space into your account using a standalone CloudFormation template. Creates the same resources as the [Terraform module](../terraform/README.md) and [CDK stack](../cdk/README.md).

Based on the [AWS Security Agent user guide](https://docs.aws.amazon.com/securityagent/latest/userguide/setup-security-agent.html), the [IAM role reference](https://docs.aws.amazon.com/securityagent/latest/userguide/create-iam-role.html), and the [`AWS::SecurityAgent::AgentSpace` CFN reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-securityagent-agentspace.html).

## Resources Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| IAM Role | `SecurityAgentRole-Application-cfn{suffix}` | Assumed by Security Agent to grant WebApp users API access |
| IAM Role | `SecurityAgentRole-PenTestService-cfn{suffix}` | Read-only role for the agent during pentests (`SecurityAudit` + `ViewOnlyAccess`) |
| IAM Role | `SecurityAgentRole-Actor-cfn{suffix}` | Assumed by the agent to authenticate against the target app |
| Agent Space | `{AgentSpaceName}` | Workspace for security reviews and pentests |

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `AgentSpaceName` | `FSIAgentKitSecurityAgentSpace-CFN` | Name for the Agent Space |
| `AgentSpaceDescription` | `Security Agent Space provisioned by AVA - CloudFormation` | Description |
| `NamePostfix` | *(stack unique suffix)* | Fixed suffix for IAM role names |
| `ExternalId` | *(stack ID slug, NoEcho)* | External ID for PenTest / Actor role trust. Pin a real value for production. |

## Local Deployment

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name SecurityAgentStack \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    AgentSpaceName=MySecurityAgentSpace \
    AgentSpaceDescription="My Security Agent Space" \
    ExternalId="$(uuidgen)"
```

Read the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name SecurityAgentStack \
  --query 'Stacks[0].Outputs'
```

Tear down:

```bash
aws cloudformation delete-stack --stack-name SecurityAgentStack
```

## Pipeline Deployment

This template is deployed automatically by the Frontier Agents CI/CD pipeline when a user selects **CloudFormation** as the IaC type in the Control Plane UI.

## Important caveats

- **First-run console setup**: choosing IAM Identity Center (SSO) for the WebApp is a one-time console action that is not IaC-able. This template assumes IAM-only access via the AWS Console admin link, or that SSO is already configured.
- **Pentest scope**: PenTest Service Role attaches `SecurityAudit` + `ViewOnlyAccess` for breadth. Tighten with custom policies before running real pentests.
- **Actor permissions**: defaults to `execute-api:Invoke` + `lambda:Invoke*` on `*`. Narrow `Resource` to your specific API Gateway / Lambda before running real pentests.
- **External ID**: when `ExternalId` is empty, the stack derives it from the CloudFormation stack ID slug. That works for demos but produces a value visible in CFN events and stack metadata — **always pin a real external ID for production**.
