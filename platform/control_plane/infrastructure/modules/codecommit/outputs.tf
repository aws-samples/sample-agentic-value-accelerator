output "repository_id" {
  description = "CodeCommit repository ID"
  value       = aws_codecommit_repository.main.repository_id
}

output "repository_name" {
  description = "CodeCommit repository name"
  value       = aws_codecommit_repository.main.repository_name
}

output "repository_arn" {
  description = "CodeCommit repository ARN"
  value       = aws_codecommit_repository.main.arn
}

output "clone_url_http" {
  description = "CodeCommit repository clone URL (HTTPS)"
  value       = aws_codecommit_repository.main.clone_url_http
}

output "clone_url_ssh" {
  description = "CodeCommit repository clone URL (SSH)"
  value       = aws_codecommit_repository.main.clone_url_ssh
}

output "read_policy_arn" {
  description = "IAM policy ARN for read-only CodeCommit access"
  value       = aws_iam_policy.codecommit_read.arn
}

output "write_policy_arn" {
  description = "IAM policy ARN for read-write CodeCommit access"
  value       = aws_iam_policy.codecommit_write.arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for CodeCommit notifications"
  value       = var.enable_notifications ? aws_sns_topic.codecommit_notifications[0].arn : ""
}
