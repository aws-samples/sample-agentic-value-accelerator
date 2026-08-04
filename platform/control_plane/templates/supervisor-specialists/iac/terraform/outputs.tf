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

output "iam_role_arn" {
  description = "IAM role ARN used by the AgentCore runtime."
  value       = aws_iam_role.runtime.arn
}
