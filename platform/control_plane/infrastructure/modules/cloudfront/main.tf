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
    cloudfront_default_certificate = var.domain_name == "" || var.hosted_zone_id == ""
    acm_certificate_arn            = var.domain_name != "" && var.hosted_zone_id != "" ? aws_acm_certificate.cloudfront[0].arn : null
    ssl_support_method             = var.domain_name != "" && var.hosted_zone_id != "" ? "sni-only" : null
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
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

# ============================================================================
# ACM Certificate for CloudFront (Optional - must be in us-east-1)
# ============================================================================

resource "aws_acm_certificate" "cloudfront" {
  count             = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cloudfront-cert"
  })
}

resource "aws_route53_record" "cloudfront_cert_validation" {
  count   = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = tolist(aws_acm_certificate.cloudfront[0].domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.cloudfront[0].domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.cloudfront[0].domain_validation_options)[0].resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count                   = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [aws_route53_record.cloudfront_cert_validation[0].fqdn]
}

# ============================================================================
# Route53 Record for CloudFront (Optional)
# ============================================================================

resource "aws_route53_record" "cloudfront" {
  count   = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

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
