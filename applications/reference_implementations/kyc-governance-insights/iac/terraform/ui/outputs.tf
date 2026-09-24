output "ui_bucket_name" {
  description = "S3 bucket name for the UI"
  value       = aws_s3_bucket.ui.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.ui.id
}

output "cloudfront_domain" {
  description = "CloudFront domain name for the UI"
  value       = aws_cloudfront_distribution.ui.domain_name
}

output "ui_url" {
  description = "URL to access the UI"
  value       = "https://${aws_cloudfront_distribution.ui.domain_name}"
}

output "api_endpoint" {
  description = "API endpoint (routed through CloudFront)"
  value       = "https://${aws_cloudfront_distribution.ui.domain_name}/api/invoke"
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.proxy.function_name
}
