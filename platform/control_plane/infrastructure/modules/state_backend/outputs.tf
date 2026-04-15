output "bucket_name" {
  description = "Terraform state S3 bucket name"
  value       = aws_s3_bucket.state.id
}

output "bucket_arn" {
  description = "Terraform state S3 bucket ARN"
  value       = aws_s3_bucket.state.arn
}

output "lock_table_name" {
  description = "DynamoDB lock table name"
  value       = aws_dynamodb_table.lock.name
}

output "lock_table_arn" {
  description = "DynamoDB lock table ARN"
  value       = aws_dynamodb_table.lock.arn
}
