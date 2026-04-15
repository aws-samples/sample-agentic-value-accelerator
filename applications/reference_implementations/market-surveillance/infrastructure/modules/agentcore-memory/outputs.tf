output "memory_id" {
  description = "ID of the AgentCore Memory"
  value       = aws_bedrockagentcore_memory.this.id
}

output "memory_arn" {
  description = "ARN of the AgentCore Memory"
  value       = aws_bedrockagentcore_memory.this.arn
}

output "memory_name" {
  description = "Name of the AgentCore Memory"
  value       = aws_bedrockagentcore_memory.this.name
}

output "semantic_strategy_id" {
  description = "ID of the semantic memory strategy (if enabled)"
  value       = var.enable_semantic_memory ? aws_bedrockagentcore_memory_strategy.semantic[0].memory_strategy_id : null
}

output "user_preferences_strategy_id" {
  description = "ID of the user preferences strategy (if enabled)"
  value       = var.enable_user_preferences ? aws_bedrockagentcore_memory_strategy.user_preferences[0].memory_strategy_id : null
}

output "summarization_strategy_id" {
  description = "ID of the summarization strategy (if enabled)"
  value       = var.enable_summarization ? aws_bedrockagentcore_memory_strategy.summarization[0].memory_strategy_id : null
}
