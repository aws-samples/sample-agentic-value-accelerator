output "agent_runtime_id" {
  description = "The ID of the AgentCore Runtime"
  value       = aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_id
}

output "agent_runtime_arn" {
  description = "The ARN of the AgentCore Runtime"
  value       = aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_arn
}

output "agent_runtime_name" {
  description = "The name of the AgentCore Runtime"
  value       = aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_name
}

output "agent_runtime_endpoint" {
  description = "The AgentCore Runtime invocation endpoint URL"
  value       = "https://bedrock-agentcore.${data.aws_region.current.id}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.agent_runtime.agent_runtime_arn)}/invocations"
}

output "execution_role_arn" {
  description = "The ARN of the AgentCore execution IAM role"
  value       = aws_iam_role.agentcore_execution.arn
}

output "execution_role_name" {
  description = "The name of the AgentCore execution IAM role"
  value       = aws_iam_role.agentcore_execution.name
}

output "code_interpreter_id" {
  description = "The ID of the Code Interpreter"
  value       = aws_bedrockagentcore_code_interpreter.code_interpreter.code_interpreter_id
}

output "code_interpreter_arn" {
  description = "The ARN of the Code Interpreter"
  value       = aws_bedrockagentcore_code_interpreter.code_interpreter.code_interpreter_arn
}

# Observability Outputs
output "log_group_name" {
  description = "CloudWatch Log Group name for agent runtime vended logs"
  value       = aws_cloudwatch_log_group.agent_runtime_logs.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch Log Group"
  value       = aws_cloudwatch_log_group.agent_runtime_logs.arn
}

output "logs_delivery_id" {
  description = "ID of the logs delivery connection"
  value       = aws_cloudwatch_log_delivery.logs.id
}

output "traces_delivery_id" {
  description = "ID of the traces delivery connection"
  value       = aws_cloudwatch_log_delivery.traces.id
}
