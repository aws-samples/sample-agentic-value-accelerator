# =============================================================================
# Bootstrap: ACM certificates for the AVA Control Plane custom domain
# =============================================================================
# Owns the 2 ACM certs and their 2 Route 53 DNS-01 validation CNAMEs:
#
#   1. apex cert  -> $var.domain_name, in us-east-1 (CloudFront requirement)
#   2. api  cert  -> api.$var.domain_name, in $var.aws_region (API GW regional)
#
# Runs as a separate `terraform apply` invoked by scripts/acm.sh, AFTER the
# operator has manually delegated the parent zone (example.com owner
# adds an NS record for the subzone pointing at the four name servers this
# bootstrap's sibling module `bootstrap/hosted_zone` printed on first apply).
#
# Ownership boundary:
#   - This module owns the certs full lifecycle. `terraform destroy` here
#     will remove them cleanly.
#   - The main CP terraform CONSUMES the cert ARNs as inputs
#     (cloudfront_acm_certificate_arn, api_acm_certificate_arn) so it can
#     attach them to CloudFront + API Gateway custom domains.
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ava"
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "bootstrap/acm"
    }
  }
}

# The apex cert MUST live in us-east-1 for CloudFront. When aws_region is
# already us-east-1 this second provider block is functionally identical to
# the default, but keeping an explicit alias makes the intent clear and
# guarantees correctness regardless of aws_region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "ava"
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "bootstrap/acm"
    }
  }
}

# -----------------------------------------------------------------------------
# Apex cert (CloudFront) -- must be in us-east-1
# -----------------------------------------------------------------------------
resource "aws_acm_certificate" "apex" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.domain_name}-cloudfront"
  }
}

# DNS-01 validation CNAME for the apex cert. `for_each` handles the (usually
# single-entry) `domain_validation_options` set idiomatically -- avoids the
# `tolist(...)[0]` pattern the old CP module used.
resource "aws_route53_record" "apex_validation" {
  for_each = {
    for dvo in aws_acm_certificate.apex.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "apex" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.apex.arn
  validation_record_fqdns = [for record in aws_route53_record.apex_validation : record.fqdn]
}

# -----------------------------------------------------------------------------
# API cert (API Gateway REGIONAL endpoint) -- in var.aws_region
# -----------------------------------------------------------------------------
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_prefix}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.api_prefix}.${var.domain_name}-apigateway"
  }
}

resource "aws_route53_record" "api_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_validation : record.fqdn]
}
