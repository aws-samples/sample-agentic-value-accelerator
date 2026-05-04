# ACM Certificate Module
# Purpose: Manage SSL/TLS certificates for ALB HTTPS

# Request a new ACM certificate (if domain_name is provided)
resource "aws_acm_certificate" "this" {
  count = var.create_certificate && var.domain_name != "" ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = var.validation_method

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "market-surveillance-alb-cert-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# DNS Validation Records (if using Route 53)
resource "aws_route53_record" "cert_validation" {
  for_each = var.create_certificate && var.validation_method == "DNS" && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.this[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

# Wait for certificate validation (only if Route 53 zone ID is provided)
resource "aws_acm_certificate_validation" "this" {
  count = var.create_certificate && var.validation_method == "DNS" && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]

  timeouts {
    create = "45m" # Increased timeout for DNS propagation
  }
}

# Import existing certificate (if certificate_body is provided)
resource "aws_acm_certificate" "imported" {
  count = !var.create_certificate && var.certificate_body != "" ? 1 : 0

  certificate_body  = var.certificate_body
  private_key       = var.private_key
  certificate_chain = var.certificate_chain

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "market-surveillance-alb-cert-imported-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}
