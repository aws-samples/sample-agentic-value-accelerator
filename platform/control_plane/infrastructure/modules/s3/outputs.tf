output "project_archives_bucket_name" {
  description = "Name of project archives S3 bucket"
  value       = aws_s3_bucket.project_archives.id
}

output "project_archives_bucket_arn" {
  description = "ARN of project archives S3 bucket"
  value       = aws_s3_bucket.project_archives.arn
}

output "frontend_bucket_name" {
  description = "Name of frontend S3 bucket"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_id" {
  description = "ID of frontend S3 bucket"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "ARN of frontend S3 bucket"
  value       = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_regional_domain_name" {
  description = "Regional domain name of frontend S3 bucket"
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "deployments_bucket_name" {
  description = "Name of the deployments S3 bucket"
  value       = aws_s3_bucket.deployments.id
}

output "deployments_bucket_arn" {
  description = "ARN of the deployments S3 bucket"
  value       = aws_s3_bucket.deployments.arn
}
