# =============================================================================
# CloudFront Distribution for the LLM Gateway
# =============================================================================
# Mirrors the Langfuse foundation-stack pattern:
#   - Public entry point is CloudFront (edge-terminated HTTPS with Amazon cert)
#   - ALB is locked to the CloudFront-managed prefix list at the SG
#   - CloudFront attaches a shared secret as x-origin-verify custom header,
#     which the ALB listener rule requires before forwarding to LiteLLM
#
# Simpler than Langfuse because this is an API endpoint, not a browser UI:
#   - No Lambda@Edge (no auto-login or iframe/CSP munging)
#   - Full HTTP method set (LiteLLM /chat/completions is POST)
#   - No caching (min/default/max TTL all 0)
#   - Authorization header explicitly forwarded so Bearer <virtual-key> works
# =============================================================================

resource "aws_cloudfront_distribution" "litellm" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name} LLM Gateway"
  price_class     = "PriceClass_100"

  origin {
    domain_name = aws_lb.litellm.dns_name
    origin_id   = "litellm-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Shared secret the ALB listener rule requires before forwarding.
    # Same random_password already used by aws_lb_listener_rule.http_origin_verify.
    custom_header {
      name  = "x-origin-verify"
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "litellm-alb"

    forwarded_values {
      query_string = true
      # Authorization is required for Bearer virtual-key auth; Host and
      # Content-Type are required for LiteLLM to route + parse the body.
      headers = ["Host", "Authorization", "Content-Type", "Accept"]

      # Forward the LiteLLM admin UI session cookie (`token`) and the AVA
      # gate cookie (`ava_session`). Whitelist to keep API calls (which
      # send no cookies) cache-key-neutral. When the auth gate is disabled
      # the cookies are absent from every request so this is a no-op.
      cookies {
        forward           = local.auth_enabled ? "whitelist" : "none"
        whitelisted_names = local.auth_enabled ? ["ava_session", "token"] : null
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true

    # AVA SSO gate + LiteLLM cookie mint (viewer-request) and iframe-header
    # strip (viewer-response). Wired only when fsi_app_signing_secret is set.
    #
    # `slice(list, 0, count)` is used instead of `local.auth_enabled ?
    # ["viewer-request"] : []` — terraform 1.9's ternary can't unify a list
    # literal with an empty tuple for dynamic-block for_each and errors
    # "Cannot use a list of string value in for_each". Same workaround used
    # by applications/fsi_foundry/foundations/iac/agentcore/ui/cloudfront/.
    dynamic "function_association" {
      for_each = slice(["viewer-request"], 0, local.auth_enabled ? 1 : 0)
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.auth[0].arn
      }
    }
    dynamic "function_association" {
      for_each = slice(["viewer-response"], 0, local.auth_enabled ? 1 : 0)
      content {
        event_type   = "viewer-response"
        function_arn = aws_cloudfront_function.frame_headers[0].arn
      }
    }
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

  tags = merge(local.common_tags, { Name = "${local.tag_name} CloudFront" })
}
