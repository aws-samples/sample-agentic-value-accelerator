output "policy_engine_id" {
  description = "AgentCore Policy Engine ID — pass to backend as POLICY_ENGINE_ID"
  value       = trimspace(data.local_file.policy_engine_id.content)
}

output "gateway_arn" {
  description = "AgentCore platform Gateway ARN — pass to backend as GATEWAY_ARN (baked into Cedar statements)"
  value       = trimspace(data.local_file.gateway_arn.content)
}

output "gateway_id" {
  description = "AgentCore platform Gateway ID"
  value       = trimspace(data.local_file.gateway_id.content)
}

output "gateway_role_arn" {
  description = "IAM role ARN assumed by the platform Gateway"
  value       = aws_iam_role.gateway.arn
}
