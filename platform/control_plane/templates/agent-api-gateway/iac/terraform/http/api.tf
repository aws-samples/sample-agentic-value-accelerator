# -----------------------------------------------------------------------------
# HTTP API Gateway
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "this" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"
  description   = "HTTP API Gateway for ${var.project_name} agent backend"

  # Disable default endpoint when using custom domain (security best practice)
  disable_execute_api_endpoint = var.custom_domain != ""

  cors_configuration {
    allow_origins     = var.cors_allow_origins
    allow_methods     = var.cors_allow_methods
    allow_headers     = var.cors_allow_headers
    allow_credentials = true
    max_age           = 3600
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Access Log Group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Default Stage
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn

    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }

  default_route_settings {
    throttling_burst_limit   = var.throttling_burst_limit
    throttling_rate_limit    = var.throttling_rate_limit
    detailed_metrics_enabled = true
  }

  tags = var.tags
}
