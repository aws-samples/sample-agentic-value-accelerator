output "cloudfront_acm_certificate_arn" {
  description = "ARN of the apex cert (us-east-1). Feed into the CP terraform as var.cloudfront_acm_certificate_arn."
  value       = aws_acm_certificate_validation.apex.certificate_arn
}

output "api_acm_certificate_arn" {
  description = "ARN of the api.<domain> cert (same region as the API Gateway). Feed into the CP terraform as var.api_acm_certificate_arn."
  value       = aws_acm_certificate_validation.api.certificate_arn
}

output "apex_domain" {
  description = "Apex domain the CloudFront cert covers."
  value       = var.domain_name
}

output "api_domain" {
  description = "API domain the API Gateway cert covers."
  value       = "${var.api_prefix}.${var.domain_name}"
}
