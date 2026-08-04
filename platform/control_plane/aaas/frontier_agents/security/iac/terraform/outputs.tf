output "application_id" {
  description = "ID of the Security Agent Application (the top-level app shell that surfaces in the console). Empty when reusing an existing Application."
  value       = var.create_application ? awscc_securityagent_application.main[0].application_id : ""
}

output "application_domain" {
  description = "Domain assigned to the Security Agent Application by AWS. Echoes existing_application_domain when reusing an existing Application."
  value       = local.application_domain
}

output "agent_space_id" {
  description = "ID of the created Security Agent Space."
  value       = awscc_securityagent_agent_space.main.agent_space_id
}

output "operator_app_url" {
  description = "URL of the Security Agent operator webapp for this Agent Space. Mirrors the DevOps Agent pattern (direct app domain). Requires an authenticated AWS console session in the browser; first visit redirects through console SSO."
  value       = "https://${local.application_domain}/${awscc_securityagent_agent_space.main.agent_space_id}"
}

output "agent_space_arn" {
  description = "ARN of the created Security Agent Space."
  value       = awscc_securityagent_agent_space.main.id
}

output "agent_space_name" {
  description = "Name of the created Security Agent Space."
  value       = awscc_securityagent_agent_space.main.name
}

output "application_role_arn" {
  description = "ARN of the Application Role (Security Agent assumes this to grant WebApp API access)."
  value       = aws_iam_role.application.arn
}

output "pentest_service_role_arn" {
  description = "ARN of the Penetration Test Service Role. Selected by WebApp users when creating a pentest."
  value       = aws_iam_role.pentest_service.arn
}

output "actor_role_arn" {
  description = "ARN of the Actor Role used by Security Agent to call the target web application during pentests."
  value       = aws_iam_role.actor.arn
}

output "external_id" {
  description = "External ID required when assuming the PenTest Service Role and Actor Role."
  value       = local.external_id
  sensitive   = true
}

output "primary_account_id" {
  description = "Account ID where the Security Agent Space was created."
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS region the module deployed into."
  value       = data.aws_region.current.name
}
