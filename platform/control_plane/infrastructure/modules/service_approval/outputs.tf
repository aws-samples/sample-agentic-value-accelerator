output "table_name" {
  description = "DynamoDB table for service-approval runs"
  value       = aws_dynamodb_table.runs.name
}

output "table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.runs.arn
}

output "bucket_name" {
  description = "S3 bucket holding per-phase artifacts"
  value       = aws_s3_bucket.artifacts.bucket
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.artifacts.arn
}
