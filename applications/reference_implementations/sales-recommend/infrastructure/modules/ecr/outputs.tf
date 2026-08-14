output "ui_repo_url" {
  description = "ECR repository URL for the UI image"
  value       = aws_ecr_repository.ui.repository_url
}

output "ui_repo_arn" {
  description = "ECR repository ARN for the UI image"
  value       = aws_ecr_repository.ui.arn
}
