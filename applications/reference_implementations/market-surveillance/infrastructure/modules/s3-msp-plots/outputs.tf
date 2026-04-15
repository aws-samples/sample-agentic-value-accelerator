output "bucket_id" {
  description = "The ID of the Risk Analyst plots S3 bucket"
  value       = aws_s3_bucket.msp_plots.id
}

output "bucket_arn" {
  description = "The ARN of the Risk Analyst plots S3 bucket"
  value       = aws_s3_bucket.msp_plots.arn
}

output "bucket_name" {
  description = "The name of the Risk Analyst plots S3 bucket"
  value       = aws_s3_bucket.msp_plots.bucket
}
