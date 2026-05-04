output "bucket_id" {
  description = "The ID of the chat charts S3 bucket"
  value       = aws_s3_bucket.chat_charts.id
}

output "bucket_arn" {
  description = "The ARN of the chat charts S3 bucket"
  value       = aws_s3_bucket.chat_charts.arn
}

output "bucket_name" {
  description = "The name of the chat charts S3 bucket"
  value       = aws_s3_bucket.chat_charts.bucket
}
