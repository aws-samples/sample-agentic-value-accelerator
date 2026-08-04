output "agentcore_runtime_arn" {
  description = "ARN to pass to bedrock-agentcore:InvokeAgentRuntime from the backend"
  value       = aws_cloudformation_stack.runtime.outputs["AgentRuntimeArn"]
}

output "agentcore_runtime_id" {
  value = aws_cloudformation_stack.runtime.outputs["AgentRuntimeId"]
}

output "ecr_repository_url" {
  description = "Push v2 agent images here"
  value       = aws_ecr_repository.agent.repository_url
}

output "iam_role_arn" {
  value = aws_iam_role.agentcore.arn
}
