# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "memory_id" {
  description = "AgentCore memory ID."
  value       = aws_bedrockagentcore_memory.this.id
}

output "memory_arn" {
  description = "AgentCore memory ARN."
  value       = aws_bedrockagentcore_memory.this.arn
}

output "strategy_id" {
  description = "Memory strategy ID."
  value       = aws_bedrockagentcore_memory_strategy.this.memory_strategy_id
}

output "role_arn" {
  description = "IAM execution role ARN for memory operations."
  value       = aws_iam_role.memory.arn
}
