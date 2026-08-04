# AWS Security Agent — Terraform

Terraform module that provisions an AWS Security Agent Space and the three IAM roles the service requires (Application, Penetration Test Service, and Actor).

> See the [AWS Security Agent user guide](https://docs.aws.amazon.com/securityagent/latest/userguide/setup-security-agent.html)
> and the [IAM role reference](https://docs.aws.amazon.com/securityagent/latest/userguide/create-iam-role.html)
> for service-level background.

## What it creates

| Resource | Purpose |
|---|---|
| `awscc_securityagent_agent_space.main` | Security Agent Space — workspace for security reviews and penetration testing. |
| `aws_iam_role.application` | Trusted by `securityagent.amazonaws.com` to grant WebApp users API access. |
| `aws_iam_role.pentest_service` | Read-only role assumed by Security Agent during pentests. Attaches `SecurityAudit` + `ViewOnlyAccess` AWS-managed policies. Trust requires `sts:ExternalId`. |
| `aws_iam_role.actor` | Assumed by Security Agent to authenticate against the target web app. Trust requires `sts:ExternalId`. |

The Agent Space is created with only `Name`, `Description`, and `Tags` set. `AwsResources` (VPCs, log groups, S3, secrets, Lambdas, IAM roles), `IntegratedResources` (e.g. GitHub), `KmsKeyId`, and `TargetDomainIds` are deferred to user configuration in the WebApp after first apply.

## Usage

```hcl
module "security_agent" {
  source = "./modules/frontier_agents/security/terraform"

  aws_region              = "us-east-1"
  agent_space_name        = "FSIAgentKitSecurityAgentSpace"
  agent_space_description = "Security Agent Space for application X"
  name_postfix            = "dev"
  # Optional: pin a stable external ID instead of the random UUID
  # external_id = "your-external-id"
}
```

When running standalone, copy `terraform.tfvars.example` → `terraform.tfvars`, edit, then:

```bash
terraform init
terraform plan
terraform apply
```

## Outputs

| Output | Notes |
|---|---|
| `agent_space_id` | e.g. `as-0123456789abcdef0` |
| `agent_space_arn` |  |
| `application_role_arn` | Wire this into your WebApp configuration. |
| `pentest_service_role_arn` | Selectable from the WebApp when launching a pentest. |
| `actor_role_arn` | Selectable from the WebApp when configuring target authentication. |
| `external_id` | Sensitive. Required when assuming PenTest Service or Actor roles. |

## Important caveats

- **First-run console setup**: choosing IAM Identity Center (SSO) for the WebApp is a one-time console action that is not IaC-able. This module assumes you will use IAM-only access via the AWS Console admin link, or that SSO is already configured.
- **Pentest scope**: `pentest_service` attaches `SecurityAudit` + `ViewOnlyAccess` for breadth. Tighten with custom policies before letting the agent run against production.
- **Actor permissions**: defaults to `execute-api:Invoke` + `lambda:Invoke*` on `*`. Narrow `Resource` to your specific API Gateway / Lambda before running real pentests.
- **External ID**: auto-generated per `terraform apply` unless `external_id` is pinned. Persist it (or re-use `random_uuid` outputs) so existing roles continue to work.
