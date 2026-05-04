# AWS DevOps Agent — Terraform

Terraform module that provisions an AWS DevOps Agent Space, its operator-app and agent-space IAM roles, and the primary-account association needed for same-account monitoring. Optional Part 2 adds cross-account monitoring by deploying a trusted role (and a sample echo Lambda) into a secondary AWS account.

> Adapted from the official AWS sample at
> [`aws-samples/sample-aws-devops-agent-terraform`](https://github.com/aws-samples/sample-aws-devops-agent-terraform)
> and tailored for use from the AVA control plane. See the
> [AWS DevOps Agent getting-started guide](https://docs.aws.amazon.com/devopsagent/latest/userguide/getting-started-with-aws-devops-agent-getting-started-with-aws-devops-agent-using-terraform.html)
> for service-level background.

## What it creates

### Primary (monitoring) account

| Resource | Purpose |
|---|---|
| `awscc_devopsagent_agent_space.main` | Central Agent Space with operator app. |
| `aws_iam_role.devops_agentspace` | Role the agent assumes to monitor this account. Attaches `AIDevOpsAgentAccessPolicy`. |
| `aws_iam_role.devops_operator` | Role the operator webapp uses. Attaches `AIDevOpsOperatorAppAccessPolicy`. |
| `awscc_devopsagent_association.primary_aws_account` | `account_type = monitor` association. |

### Secondary (service) account — optional Part 2

| Resource | Purpose |
|---|---|
| `aws_iam_role.secondary_account` | Role in the service account trusted by the monitoring Agent Space. Attaches `AIDevOpsAgentAccessPolicy`. |
| `aws_lambda_function.echo_service` | Sample target that echoes its input event; useful for end-to-end verification of the cross-account association. |
| `awscc_devopsagent_association.secondary_aws_account` | `account_type = source` association. |

## Usage

```hcl
module "devops_agent" {
  source = "./modules/frontier_agents/devops/terraform"

  aws_region              = "us-east-1"
  agent_space_name        = "FSIAgentKitAgentSpace"
  agent_space_description = "DevOps Agent Space for production workloads"
  name_postfix            = "dev"

  # Omit for Part 1 only. Fill in after the first apply for Part 2.
  # service_account_id = "123456789012"
  # agent_space_arn    = module.devops_agent.agent_space_arn
}
```

When running standalone, copy `terraform.tfvars.example` → `terraform.tfvars`, edit, then:

```bash
terraform init
terraform plan
terraform apply
```

### Part 2 — cross-account monitoring

1. Apply Part 1 and record `agent_space_arn` from the outputs.
2. Set `service_account_id` and `agent_space_arn` in `terraform.tfvars`.
3. Configure the `aws.service` provider alias in `main.tf` with credentials for the secondary account (profile or `assume_role`).
4. Re-apply:

   ```bash
   terraform apply
   ```

## Inputs

| Name | Description | Default |
|---|---|---|
| `aws_region` | AWS region for the deployment. | `us-east-1` |
| `agent_space_name` | Agent Space name. | `FSIAgentKitAgentSpace` |
| `agent_space_description` | Agent Space description. | See `variables.tf`. |
| `service_account_id` | Secondary-account ID. Empty skips Part 2. | `""` |
| `agent_space_arn` | ARN from Part 1. Required before Part 2 resources deploy. | `""` |
| `name_postfix` | Fixed suffix for IAM role names. Empty uses a random 4-byte hex. | `""` |
| `tags` | Tags applied to every resource this module creates. | `{ Project = "ava", Component = "frontier-agents/devops" }` |

## Outputs

See [`outputs.tf`](./outputs.tf). Highlights: `agent_space_arn`, `agent_space_id`, `devops_agentspace_role_arn`, `devops_operator_role_arn`, `secondary_account_role_arn`.

## IAM propagation note

The module inserts a 30-second `time_sleep` between IAM role creation and Agent Space creation. The DevOps Agent service validates the operator role's trust policy at Agent Space creation time, and that validation can fail if IAM hasn't fully propagated. If you still see trust-policy errors, wait a minute and re-run `terraform apply` — the roles already exist, so it picks up where it left off.

## Cleanup

```bash
terraform destroy
```

Destroy applies resources in reverse: associations first, then the Agent Space, then IAM. If you deployed Part 2, the service-account Lambda + role are torn down in the same apply.
