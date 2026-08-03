###############################################################################
# CloudFront Module — Distribution with Basic Auth via CloudFront Function
###############################################################################

# ------------------------------------------------------------------------------
# CloudFront Function for Basic Authentication (viewer-request)
# ------------------------------------------------------------------------------
resource "aws_cloudfront_function" "basic_auth" {
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
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.basic_auth.arn
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
