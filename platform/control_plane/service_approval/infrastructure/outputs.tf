output "agentcore_runtime_arn" {
  description = "ARN of the spike AgentCore Runtime — pass to invoke_agent_runtime"
  value       = aws_cloudformation_stack.runtime.outputs["AgentRuntimeArn"]
}

output "agentcore_runtime_id" {
  description = "ID of the spike AgentCore Runtime"
  value       = aws_cloudformation_stack.runtime.outputs["AgentRuntimeId"]
}

output "ecr_repository_url" {
  description = "ECR URI to push the spike agent image to"
  value       = aws_ecr_repository.spike.repository_url
}

output "ddb_table_name" {
  description = "DDB table the spike writes phase progress into"
  value       = aws_dynamodb_table.spike.name
}

output "iam_role_arn" {
  description = "Runtime IAM role"
  value       = aws_iam_role.agentcore.arn
}
