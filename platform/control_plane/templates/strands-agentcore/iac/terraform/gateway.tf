# AgentCore Gateway
# Provides API endpoint for agent invocation

resource "aws_agentcore_gateway" "main" {
  name        = "${var.project_name}-gateway"
  description = "${var.project_name} API Gateway"

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-gateway"
      Framework   = "strands"
      Environment = var.environment
    }
  )
}

# Gateway API endpoint
output "gateway_endpoint" {
  description = "AgentCore Gateway API endpoint"
  value       = aws_agentcore_gateway.main.endpoint
}

output "gateway_id" {
  description = "AgentCore Gateway ID"
  value       = aws_agentcore_gateway.main.id
}
