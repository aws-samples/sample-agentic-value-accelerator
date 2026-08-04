# =============================================================================
# WebSocket API Gateway
# =============================================================================

resource "aws_apigatewayv2_api" "this" {
  name                       = "${local.name_prefix}-ws-api"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = var.route_selection_expression

  tags = var.tags
}

# =============================================================================
# CloudWatch Log Group — Access Logs
# =============================================================================

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${local.name_prefix}-ws-api"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# =============================================================================
# Deployment
# WebSocket APIs do NOT support auto_deploy — explicit deployment required.
# =============================================================================

resource "aws_apigatewayv2_deployment" "this" {
  api_id = aws_apigatewayv2_api.this.id

  triggers = {
    redeployment = sha1(join(",", [
      jsonencode(aws_apigatewayv2_route.connect),
      jsonencode(aws_apigatewayv2_route.disconnect),
      jsonencode(aws_apigatewayv2_route.default),
      jsonencode(aws_apigatewayv2_integration.connect),
      jsonencode(aws_apigatewayv2_integration.disconnect),
      jsonencode(aws_apigatewayv2_integration.default),
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_apigatewayv2_route.connect,
    aws_apigatewayv2_route.disconnect,
    aws_apigatewayv2_route.default,
    aws_apigatewayv2_integration.connect,
    aws_apigatewayv2_integration.disconnect,
    aws_apigatewayv2_integration.default,
    aws_apigatewayv2_route_response.connect,
    aws_apigatewayv2_route_response.disconnect,
    aws_apigatewayv2_integration_response.connect,
    aws_apigatewayv2_integration_response.disconnect,
  ]
}

# =============================================================================
# Stage
# =============================================================================

resource "aws_apigatewayv2_stage" "this" {
  api_id        = aws_apigatewayv2_api.this.id
  name          = var.environment
  deployment_id = aws_apigatewayv2_deployment.this.id

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      caller         = "$context.identity.caller"
      user           = "$context.identity.user"
      requestTime    = "$context.requestTime"
      eventType      = "$context.eventType"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      connectionId   = "$context.connectionId"
      errorMessage   = "$context.error.message"
    })
  }

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
    data_trace_enabled     = var.environment != "prod"
    logging_level          = var.environment == "prod" ? "ERROR" : "INFO"
  }

  tags = var.tags
}
