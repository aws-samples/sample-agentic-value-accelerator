output "certificate_arn" {
  description = "ARN of the ACM certificate"
  value = var.existing_certificate_arn != "" ? var.existing_certificate_arn : (
    var.create_certificate && length(aws_acm_certificate.this) > 0 ? aws_acm_certificate.this[0].arn : (
      length(aws_acm_certificate.imported) > 0 ? aws_acm_certificate.imported[0].arn : null
    )
  )
}

output "certificate_id" {
  description = "ID of the ACM certificate"
  value = var.create_certificate && length(aws_acm_certificate.this) > 0 ? aws_acm_certificate.this[0].id : (
    length(aws_acm_certificate.imported) > 0 ? aws_acm_certificate.imported[0].id : null
  )
}

output "certificate_status" {
  description = "Status of the ACM certificate (PENDING_VALIDATION, ISSUED, INACTIVE, EXPIRED, VALIDATION_TIMED_OUT, REVOKED, FAILED)"
  value = var.create_certificate && length(aws_acm_certificate.this) > 0 ? aws_acm_certificate.this[0].status : (
    length(aws_acm_certificate.imported) > 0 ? aws_acm_certificate.imported[0].status : "UNKNOWN"
  )
}

output "domain_name" {
  description = "Domain name of the certificate"
  value       = var.domain_name
}

output "validation_method" {
  description = "Validation method used"
  value       = var.validation_method
}

output "domain_validation_options" {
  description = "Domain validation options (DNS records to add for validation)"
  value = var.create_certificate && var.validation_method == "DNS" && length(aws_acm_certificate.this) > 0 ? [
    for dvo in aws_acm_certificate.this[0].domain_validation_options : {
      domain_name           = dvo.domain_name
      resource_record_name  = dvo.resource_record_name
      resource_record_type  = dvo.resource_record_type
      resource_record_value = dvo.resource_record_value
    }
  ] : []
  sensitive = true
}
