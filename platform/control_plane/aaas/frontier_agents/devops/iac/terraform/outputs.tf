output "agent_space_id" {
  description = "ID of the created Agent Space."
  value       = awscc_devopsagent_agent_space.main.id
}

output "agent_space_arn" {
  description = "ARN of the created Agent Space. Feed this into `agent_space_arn` to enable Part 2."
  value       = awscc_devopsagent_agent_space.main.arn
}

output "agent_space_name" {
  description = "Name of the created Agent Space."
  value       = awscc_devopsagent_agent_space.main.name
}

output "operator_app_url" {
  description = "URL of the DevOps Agent operator webapp for this Agent Space. Keeping the URL shape here (rather than composing it in the UI) makes it easy to change if AWS ever revises the domain template."
  value       = "https://${awscc_devopsagent_agent_space.main.id}.aidevops.global.app.aws/home"
}

output "devops_agentspace_role_arn" {
  description = "ARN of the IAM role assumed by the Agent Space to monitor the primary account."
  value       = aws_iam_role.devops_agentspace.arn
}

output "devops_operator_role_arn" {
  description = "ARN of the operator-app IAM role used by the DevOps Agent webapp."
  value       = aws_iam_role.devops_operator.arn
}

output "primary_account_id" {
  description = "Account ID of the primary (monitoring) account."
  value       = data.aws_caller_identity.current.account_id
}

output "primary_account_association_id" {
  description = "ID of the primary AWS account association on the Agent Space."
  value       = awscc_devopsagent_association.primary_aws_account.id
}

output "secondary_account_role_arn" {
  description = "ARN of the secondary-account role in the service account. Null when Part 2 is not deployed."
  value       = var.agent_space_arn != "" ? aws_iam_role.secondary_account[0].arn : null
}

output "secondary_account_association_id" {
  description = "ID of the secondary AWS account association on the Agent Space. Null when Part 2 is not deployed."
  value       = var.service_account_id != "" && var.agent_space_arn != "" ? awscc_devopsagent_association.secondary_aws_account[0].id : null
}

output "aws_region" {
  description = "AWS region the module deployed into."
  value       = data.aws_region.current.name
}
