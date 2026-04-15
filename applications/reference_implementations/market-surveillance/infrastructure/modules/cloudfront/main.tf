# CloudFront Module
# Purpose: CDN distribution for serving web application and/or API

locals {
  distribution_name = "market-surveillance-cdn-${var.environment}"
  api_origin_id     = "API-Gateway"
  alb_origin_id     = "ALB-WebApp"

  # Determine which origin to use as default
  # Priority: ALB > API Gateway
  default_origin_id = var.alb_dns_name != "" ? local.alb_origin_id : local.api_origin_id

  # Validate that at least one origin is provided
  has_alb_origin = var.alb_dns_name != ""
  has_api_origin = var.api_gateway_domain != ""
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "this" {
  #checkov:skip=CKV2_AWS_47:WAFv2 WebACL with AWSManagedRulesKnownBadInputsRuleSet (Log4j) is attached via var.web_acl_arn from the firewall module
  #checkov:skip=CKV_AWS_310:Origin failover requires multi-region standby infrastructure not currently in scope
  #checkov:skip=CKV_AWS_305:ALB origin handles root path routing; default_root_object only applicable to S3 origins
  #checkov:skip=CKV_AWS_374:Geo restriction requires defining allowed country list; deferred until compliance requirements are finalized
  #checkov:skip=CKV_AWS_174:Viewer Certificate with TLS v1.2+ requires certificate; Suitable for development. For Production, move to using certificate for TLS 1.2+
  #checkov:skip=CKV2_AWS_42:Custom SSL is not required for PoC environments

  enabled         = true
  is_ipv6_enabled = true
  comment         = "Market Surveillance CDN - ${var.environment}"
  price_class     = var.price_class
  web_acl_id      = var.web_acl_arn != "" ? var.web_acl_arn : null

  # ALB Origin for Web Application (conditional)
  dynamic "origin" {
    for_each = var.alb_dns_name != "" ? [1] : []
    content {
      domain_name = var.alb_dns_name
      origin_id   = local.alb_origin_id

      custom_origin_config {
        http_port                = 80
        https_port               = 443
        origin_protocol_policy   = "http-only" # Use HTTP for now, change to https-only when certificate is added
        origin_ssl_protocols     = ["TLSv1.2"]
        origin_read_timeout      = 60  # Default max without quota increase; raise to 600 once quota is approved
        origin_keepalive_timeout = 120  # Maximum approved via quota increase from service team
      }

      custom_header {
        name  = "X-Custom-Header"
        value = "CloudFront-${var.environment}"
      }
    }
  }

  # API Gateway Origin (conditional)
  dynamic "origin" {
    for_each = var.api_gateway_domain != "" ? [1] : []
    content {
      domain_name = var.api_gateway_domain
      origin_id   = local.api_origin_id
      origin_path = var.api_gateway_stage != "" ? "/${var.api_gateway_stage}" : ""

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # Default cache behavior
  # Routes to ALB if available, otherwise API Gateway
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.default_origin_id

    forwarded_values {
      query_string = true
      headers      = var.alb_dns_name != "" ? ["Host", "CloudFront-Viewer-Country", "Authorization", "Cache-Control", "Accept-Encoding"] : ["Authorization", "Origin", "Cache-Control"]
      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = var.alb_dns_name != "" ? var.default_ttl : 0
    max_ttl                = var.alb_dns_name != "" ? var.max_ttl : 0
    compress               = false # Disable compression for streaming responses
  }

  # API cache behavior (only when both ALB and API Gateway are present)
  # Routes /api/* to API Gateway when ALB is handling the default behavior
  dynamic "ordered_cache_behavior" {
    for_each = var.alb_dns_name != "" && var.api_gateway_domain != "" ? [1] : []
    content {
      path_pattern     = "/api/*"
      allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = local.api_origin_id

      forwarded_values {
        query_string = true
        headers      = ["Authorization", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
        cookies {
          forward = "all"
        }
      }

      viewer_protocol_policy = "https-only"
      min_ttl                = 0
      default_ttl            = 0
      max_ttl                = 0
      compress               = true
    }
  }

  # Custom error responses for SPA routing (only when ALB is present)
  dynamic "custom_error_response" {
    for_each = var.alb_dns_name != "" ? [1] : []
    content {
      error_code         = 403
      response_code      = 200
      response_page_path = "/index.html"
    }
  }

  dynamic "custom_error_response" {
    for_each = var.alb_dns_name != "" ? [1] : []
    content {
      error_code         = 404
      response_code      = 200
      response_page_path = "/index.html"
    }
  }

  # Restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL/TLS Certificate (CloudFront default)
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  # Logging (optional)
  dynamic "logging_config" {
    for_each = var.enable_logging && var.log_bucket != "" ? [1] : []
    content {
      bucket          = var.log_bucket
      include_cookies = false
      prefix          = "cloudfront-logs/${var.environment}/"
    }
  }

  tags = {
    Name        = local.distribution_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}
