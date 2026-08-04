# AWS Security Agent — CDK Deployment

Deploys an AWS Security Agent Space into your account using AWS CDK (TypeScript). Creates the same resources as the [Terraform module](../terraform/README.md) — an Agent Space and the three IAM roles the service requires (Application, PenTest Service, Actor).

Based on the [AWS Security Agent user guide](https://docs.aws.amazon.com/securityagent/latest/userguide/setup-security-agent.html) and the [IAM role reference](https://docs.aws.amazon.com/securityagent/latest/userguide/create-iam-role.html).

## Resources Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| IAM Role | `SecurityAgentRole-Application-{suffix}` | Assumed by Security Agent to grant WebApp users API access |
| IAM Role | `SecurityAgentRole-PenTestService-{suffix}` | Read-only role for the agent during pentests (`SecurityAudit` + `ViewOnlyAccess`) |
| IAM Role | `SecurityAgentRole-Actor-{suffix}` | Assumed by the agent to authenticate against the target app |
| Agent Space | `{agent_space_name}` | Workspace for security reviews and pentests |

## Parameters

Passed via CDK context (`-c key=value`) or environment variables:

| Context Key | Env Var | Default | Description |
|-------------|---------|---------|-------------|
| `agentSpaceName` | `AGENT_SPACE_NAME` | `FSIAgentKitSecurityAgentSpace-CDK` | Name for the Agent Space |
| `agentSpaceDescription` | `AGENT_SPACE_DESCRIPTION` | `Security Agent Space provisioned by AVA - CDK` | Description |
| `namePostfix` | `NAME_POSTFIX` | *(random 4-byte hex)* | Fixed suffix for IAM role names |
| `externalId` | `EXTERNAL_ID` | *(random UUID)* | External ID required for PenTest / Actor role assumption |
| `awsRegion` | `AWS_TARGET_REGION` | `us-east-1` | Target AWS region |

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
cdk destroy -c agentSpaceName=MyAgentSpace
```

The first deploy in an account/region needs CDK bootstrapping:

```bash
cdk bootstrap aws://<account>/<region>
```

## Important caveats

- **First-run console setup**: choosing IAM Identity Center (SSO) for the WebApp is a one-time console action that is not IaC-able. This stack assumes IAM-only access via the AWS Console admin link, or that SSO is already configured.
- **Pentest scope**: the PenTest Service Role attaches `SecurityAudit` + `ViewOnlyAccess` for breadth. Tighten with custom policies before running real pentests.
- **Actor permissions**: defaults to `execute-api:Invoke` + `lambda:Invoke*` on `*`. Narrow to your specific API Gateway / Lambda before pointing the agent at production.
- **External ID**: a fresh random UUID is generated each `cdk synth` unless `externalId` is pinned. Persist it so existing roles continue to work across re-deploys.
