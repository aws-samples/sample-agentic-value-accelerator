###############################################################################
# CloudFront Module — Distribution with edge-authentication
#
# Two mutually-exclusive edge-auth modes:
#
#   1. AVA FSI SSO (preferred, control-plane deploys)
#      When `fsi_app_signing_secret` is non-empty, we attach a
#      CloudFront Function that verifies HMAC-signed handoff tokens
#      minted by the AVA control-plane's fsi_sso.py. Same trust
#      anchor and same JS shape as case-management/jwt_auth_function.js
#      and merchant-onboarding/.../jwt_auth_function.js. Anonymous
#      requests get 302'd to the AVA UI login. Users clicking
#      "Open App" from AVA never see a login screen — the UI's
#      openFsiApp() helper appends ?ava_token=<handoff> which this
#      function consumes and swaps for an httpOnly ava_session cookie.
#
#   2. Basic Auth (standalone laptop deploys — the pre-AVA path)
#      When `fsi_app_signing_secret` is empty, keep the existing
#      HTTP-Basic-Auth CloudFront Function so ./deploy.sh from a
#      laptop still works without any AVA control-plane integration.
#
# The two modes never coexist — only one function is created per
# apply based on the local.use_ava_sso boolean below.
###############################################################################

locals {
  # AVA SSO is the primary path when the control plane's signing
  # secret is exported. Empty secret (standalone deploy) falls back
  # to the legacy basic-auth function.
  use_ava_sso = length(var.fsi_app_signing_secret) > 0
}

# ------------------------------------------------------------------------------
# CloudFront Function — AVA FSI SSO (viewer-request)
# ------------------------------------------------------------------------------
resource "aws_cloudfront_function" "ava_sso" {
  count   = local.use_ava_sso ? 1 : 0
  name    = "${var.project}-ava-sso"
  runtime = "cloudfront-js-2.0"
  comment = "AVA FSI SSO for ${var.project}"
  publish = true

  code = templatefile("${path.module}/ava_sso_function.js.tftpl", {
    SIGNING_SECRET = var.fsi_app_signing_secret
    LOGIN_URL      = var.ava_ui_login_url
  })
}

# ------------------------------------------------------------------------------
# CloudFront Function — HTTP Basic Auth (viewer-request, legacy fallback)
# ------------------------------------------------------------------------------
resource "aws_cloudfront_function" "basic_auth" {
  count   = local.use_ava_sso ? 0 : 1
  name    = "${var.project}-basic-auth"
  runtime = "cloudfront-js-2.0"
  comment = "Basic authentication for ${var.project}"
  publish = true

  code = <<-EOF
    function handler(event) {
      var request = event.request;
      var headers = request.headers;
      var authString = '${base64encode("${var.auth_username}:${var.auth_password}")}';

      if (
        typeof headers.authorization === 'undefined' ||
        headers.authorization.value !== 'Basic ' + authString
      ) {
        return {
          statusCode: 401,
          statusDescription: 'Unauthorized',
          headers: {
            'www-authenticate': { value: 'Basic realm="${var.project}"' }
          }
        };
      }

      return request;
    }
  EOF
}

# ------------------------------------------------------------------------------
# Cache Policy — CachingDisabled (AWS Managed)
# ------------------------------------------------------------------------------
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Origin Request Policy — AllViewer (forward all headers to origin)
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

# ------------------------------------------------------------------------------
# CloudFront Distribution
# ------------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = "${var.project} distribution"
  default_root_object = ""
  price_class         = "PriceClass_100"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "${var.project}-alb-origin"

    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_secret
    }


    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "${var.project}-alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id

    function_association {
      event_type = "viewer-request"
      # One-of: AVA SSO (control-plane deploy) or basic auth
      # (standalone deploy). local.use_ava_sso decides which
      # resource was created above.
      function_arn = local.use_ava_sso ? aws_cloudfront_function.ava_sso[0].arn : aws_cloudfront_function.basic_auth[0].arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name    = "${var.project}-distribution"
    Project = var.project
  }
}
