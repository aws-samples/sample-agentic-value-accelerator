output "gateway_id" {
  description = "The ID of the AgentCore Gateway"
  value       = aws_bedrockagentcore_gateway.agent_gateway.gateway_id
}

output "gateway_arn" {
  description = "The ARN of the AgentCore Gateway"
  value       = aws_bedrockagentcore_gateway.agent_gateway.gateway_arn
}

output "gateway_name" {
  description = "The name of the AgentCore Gateway"
  value       = aws_bedrockagentcore_gateway.agent_gateway.name
}

output "gateway_target_ids" {
  description = "The IDs of the alert API gateway targets"
  value = {
    get_latest_summary = aws_bedrockagentcore_gateway_target.get_latest_summary.target_id
    save_summary       = aws_bedrockagentcore_gateway_target.save_summary.target_id
  }
}

output "gateway_role_arn" {
  description = "The ARN of the Gateway IAM role"
  value       = aws_iam_role.gateway_role.arn
}

output "gateway_url" {
  description = "The URL of the AgentCore Gateway MCP endpoint"
  value       = "https://${aws_bedrockagentcore_gateway.agent_gateway.gateway_id}.gateway.bedrock-agentcore.${data.aws_region.current.region}.amazonaws.com/mcp"
}
