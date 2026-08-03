output "repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.backend.repository_url
}

output "repository_arn" {
  description = "ECR repository ARN"
  value       = aws_ecr_repository.backend.arn
}

output "repository_name" {
  description = "ECR repository name"
  value       = aws_ecr_repository.backend.name
}

output "datalake_mcp_repository_url" {
  description = "ECR repository URL for data lake MCP server"
  value       = aws_ecr_repository.datalake_mcp.repository_url
}

output "kb_mcp_repository_url" {
  description = "ECR repository URL for knowledge base MCP server"
  value       = aws_ecr_repository.kb_mcp.repository_url
}
