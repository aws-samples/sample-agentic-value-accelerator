# ============================================================================
# CloudFront Origin Access Control
# ============================================================================

resource "aws_cloudfront_origin_access_control" "main" {
  name                              = "${var.name_prefix}-oac"
  description                       = "OAC for Control Plane frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ============================================================================
# CloudFront Distribution
# ============================================================================

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = var.domain_name != "" && var.hosted_zone_id != "" ? [var.domain_name] : []

  origin {
    domain_name              = data.aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${var.frontend_bucket_id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.main.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.frontend_bucket_id}"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # SPA routing - return index.html for 404s
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == ""
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-distribution"
  })
}

# ============================================================================
# S3 Bucket Policy for CloudFront OAC
# ============================================================================

resource "aws_s3_bucket_policy" "frontend_cloudfront" {
  bucket = var.frontend_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${var.frontend_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = concat([aws_cloudfront_distribution.main.arn], var.extra_distribution_arns)
          }
        }
      }
    ]
  })
}

# ============================================================================
# ACM Certificate for CloudFront
# ============================================================================
# Cert is provisioned by scripts/acm.sh (Option A ownership split) and passed
# in as var.acm_certificate_arn. Terraform does not own the cert lifecycle.
# The DNS-01 validation CNAME is also created by acm.sh directly in Route 53
# via the AWS CLI, so no aws_route53_record.cloudfront_cert_validation
# resource is needed here.

# ============================================================================
# Route53 Record for CloudFront (Optional)
# ============================================================================

resource "aws_route53_record" "cloudfront" {
  count   = var.domain_name != "" && var.hosted_zone_id != "" && var.acm_certificate_arn != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "cloudfront_aaaa" {
  count   = var.domain_name != "" && var.hosted_zone_id != "" && var.acm_certificate_arn != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket_id
}
