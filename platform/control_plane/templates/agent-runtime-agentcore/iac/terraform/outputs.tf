# -----------------------------------------------------------------------------
# Runtime Outputs
# -----------------------------------------------------------------------------

output "runtime_id" {
  description = "AgentCore runtime ID."
  value       = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
}

output "runtime_arn" {
  description = "AgentCore runtime ARN."
  value       = aws_bedrockagentcore_agent_runtime.this.agent_runtime_arn
}

output "endpoint_arn" {
  description = "AgentCore runtime endpoint ARN."
  value       = aws_bedrockagentcore_agent_runtime_endpoint.this.agent_runtime_endpoint_arn
}

# -----------------------------------------------------------------------------
# IAM Outputs
# -----------------------------------------------------------------------------

output "iam_role_arn" {
  description = "IAM role ARN used by the AgentCore runtime."
  value       = aws_iam_role.runtime.arn
}

output "iam_role_name" {
  description = "IAM role name used by the AgentCore runtime."
  value       = aws_iam_role.runtime.name
}

# -----------------------------------------------------------------------------
# ECR Outputs
# -----------------------------------------------------------------------------

output "ecr_repository_url" {
  description = "ECR repository URL for pushing agent container images."
  value       = aws_ecr_repository.agent.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN."
  value       = aws_ecr_repository.agent.arn
}

# -----------------------------------------------------------------------------
# Observability Outputs
# -----------------------------------------------------------------------------

output "log_group_name" {
  description = "CloudWatch log group name for vended log delivery."
  value       = aws_cloudwatch_log_group.runtime.name
}

output "log_group_arn" {
  description = "CloudWatch log group ARN for vended log delivery."
  value       = aws_cloudwatch_log_group.runtime.arn
}
