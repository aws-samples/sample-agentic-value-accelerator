# -----------------------------------------------------------------------------
# CloudFront Distribution for Langfuse
# Provides HTTPS with valid Amazon-managed cert + restricts ALB to CF-only
# -----------------------------------------------------------------------------

resource "random_password" "origin_verify" {
  length  = 64
  special = false
}

resource "aws_cloudfront_distribution" "langfuse" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name} Langfuse"
  price_class     = "PriceClass_100"

  origin {
    domain_name = aws_lb.langfuse.dns_name
    origin_id   = "langfuse-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "x-origin-verify"
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "langfuse-alb"

    forwarded_values {
      query_string = true
      headers      = ["Host", "Origin", "Authorization", "Accept", "Content-Type"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Name = "${local.tag_name} CloudFront"
  }
}
