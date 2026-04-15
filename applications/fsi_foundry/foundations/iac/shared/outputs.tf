output "s3_bucket_name" {
  description = "Name of the S3 bucket for customer data"
  value       = aws_s3_bucket.data.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.data.arn
}

output "bedrock_policy_arn" {
  description = "ARN of Bedrock access policy"
  value       = aws_iam_policy.bedrock_access.arn
}

output "s3_policy_arn" {
  description = "ARN of S3 access policy"
  value       = aws_iam_policy.s3_access.arn
}

output "cloudwatch_policy_arn" {
  description = "ARN of CloudWatch Logs policy"
  value       = aws_iam_policy.cloudwatch_logs.arn
}
