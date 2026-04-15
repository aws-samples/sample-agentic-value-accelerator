output "agentcore_role_arn" {
  description = "ARN of the AgentCore Runtime IAM role"
  value       = aws_iam_role.agentcore_runtime.arn
}

output "agentcore_code_bucket" {
  description = "S3 bucket for AgentCore deployment packages"
  value       = aws_s3_bucket.agentcore_code.id
}

output "agentcore_ecr_repository" {
  description = "ECR repository URL for AgentCore container images"
  value       = aws_ecr_repository.agentcore.repository_url
}

output "agentcore_ecr_repository_name" {
  description = "ECR repository name for AgentCore container images"
  value       = aws_ecr_repository.agentcore.name
}

output "s3_data_bucket" {
  description = "S3 bucket for customer data (from shared module)"
  value       = module.shared.s3_bucket_name
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "use_case_id" {
  description = "Use case identifier"
  value       = var.use_case_id
}

output "resource_prefix" {
  description = "Resource naming prefix"
  value       = local.resource_prefix
}
