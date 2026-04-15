# AgentCore Gateway
# Provides API endpoint for RAG application

resource "aws_agentcore_gateway" "main" {
  name        = "${var.project_name}-gateway"
  description = "${var.project_name} RAG Application API Gateway"

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-gateway"
      Pattern     = "rag-application"
      Environment = var.environment
    }
  )
}

output "gateway_endpoint" {
  description = "AgentCore Gateway API endpoint"
  value       = aws_agentcore_gateway.main.endpoint
}

output "gateway_id" {
  description = "AgentCore Gateway ID"
  value       = aws_agentcore_gateway.main.id
}
