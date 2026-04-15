# ============================================================================
# VPC Link for Private Integration
# ============================================================================

resource "aws_apigatewayv2_vpc_link" "main" {
  name               = "${var.name_prefix}-vpc-link"
  security_group_ids = [var.ecs_security_group_id]
  subnet_ids         = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vpc-link"
  })
}

# ============================================================================
# HTTP API Gateway
# ============================================================================

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.name_prefix}-api"
  protocol_type = "HTTP"
  description   = "Control Plane API Gateway"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 300
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api"
  })
}

# ============================================================================
# Integration with ALB
# ============================================================================

resource "aws_apigatewayv2_integration" "alb" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "HTTP_PROXY"
  integration_uri  = var.ecs_listener_arn

  integration_method = "ANY"
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.main.id

  payload_format_version = "1.0"
}

# ============================================================================
# Routes
# ============================================================================

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

# ============================================================================
# Stage
# ============================================================================

resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
    })
  }

  default_route_settings {
    throttling_burst_limit = 5000
    throttling_rate_limit  = 10000
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-stage"
  })
}

# ============================================================================
# CloudWatch Log Group
# ============================================================================

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.name_prefix}"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-logs"
  })
}

# ============================================================================
# Custom Domain (Optional)
# ============================================================================

resource "aws_apigatewayv2_domain_name" "main" {
  count       = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  domain_name = "api.${var.domain_name}"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api[0].certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-domain"
  })
}

resource "aws_apigatewayv2_api_mapping" "main" {
  count       = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.main[0].id
  stage       = aws_apigatewayv2_stage.main.id
}

# ============================================================================
# ACM Certificate (Optional)
# ============================================================================

resource "aws_acm_certificate" "api" {
  count             = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  domain_name       = "api.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-cert"
  })
}

resource "aws_route53_record" "api_cert_validation" {
  count   = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = tolist(aws_acm_certificate.api[0].domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.api[0].domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.api[0].domain_validation_options)[0].resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  count                   = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  certificate_arn         = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [aws_route53_record.api_cert_validation[0].fqdn]
}

# ============================================================================
# Route53 Record (Optional)
# ============================================================================

resource "aws_route53_record" "api" {
  count   = var.domain_name != "" && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
