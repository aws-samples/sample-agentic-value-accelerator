output "prompt_optimization_bucket_name" {
  description = "Name of the prompt optimization S3 bucket"
  value       = aws_s3_bucket.prompt_optimization.id
}

output "prompt_optimization_bucket_arn" {
  description = "ARN of the prompt optimization S3 bucket"
  value       = aws_s3_bucket.prompt_optimization.arn
}

output "prompt_optimization_bucket_regional_domain_name" {
  description = "Regional domain name of the prompt optimization S3 bucket"
  value       = aws_s3_bucket.prompt_optimization.bucket_regional_domain_name
}
