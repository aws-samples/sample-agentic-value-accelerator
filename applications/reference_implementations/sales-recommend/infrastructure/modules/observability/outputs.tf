output "agent_log_group_name" {
  description = "CloudWatch log group name for the agent"
  value       = aws_cloudwatch_log_group.agent.name
}
