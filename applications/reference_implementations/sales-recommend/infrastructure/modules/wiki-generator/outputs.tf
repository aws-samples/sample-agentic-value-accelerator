###############################################################################
# Wiki Generator Module — Outputs
###############################################################################

output "codebuild_project_name" {
  description = "Name of the CodeBuild project (use with `aws codebuild start-build`)"
  value       = aws_codebuild_project.this.name
}

output "codebuild_project_arn" {
  description = "ARN of the CodeBuild project"
  value       = aws_codebuild_project.this.arn
}

output "source_bucket" {
  description = "S3 bucket that holds the packaged wiki-agent code"
  value       = aws_s3_bucket.source.bucket
}

output "source_object_key" {
  description = "S3 key where the wiki-agent zip must be uploaded"
  value       = var.source_object_key
}

output "log_group_name" {
  description = "CloudWatch log group for build logs"
  value       = aws_cloudwatch_log_group.this.name
}

output "repos_config_bucket" {
  description = "Bucket where the repo-list file must be uploaded to trigger fan-out"
  value       = aws_s3_bucket.source.bucket
}

output "repos_config_key" {
  description = "S3 key for the repo-list file (upload here to start one build per URL)"
  value       = "${var.config_prefix}/${var.repos_file_name}"
}

output "dispatch_function_name" {
  description = "Name of the fan-out dispatch Lambda"
  value       = aws_lambda_function.dispatch.function_name
}
