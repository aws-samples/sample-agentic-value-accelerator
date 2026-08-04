# =============================================================================
# $connect Route — MOCK integration (no backend needed for basic connect)
# =============================================================================

resource "aws_apigatewayv2_integration" "connect" {
  api_id           = aws_apigatewayv2_api.this.id
  integration_type = "MOCK"

  request_templates = {
    "200" = "{\"statusCode\": 200}"
  }

  template_selection_expression = "200"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id                              = aws_apigatewayv2_api.this.id
  route_key                           = "$connect"
  target                              = "integrations/${aws_apigatewayv2_integration.connect.id}"
  route_response_selection_expression = "$default"
}

resource "aws_apigatewayv2_route_response" "connect" {
  api_id             = aws_apigatewayv2_api.this.id
  route_id           = aws_apigatewayv2_route.connect.id
  route_response_key = "$default"
}

resource "aws_apigatewayv2_integration_response" "connect" {
  api_id                   = aws_apigatewayv2_api.this.id
  integration_id           = aws_apigatewayv2_integration.connect.id
  integration_response_key = "/200/"
}

# =============================================================================
# $disconnect Route — MOCK integration
# =============================================================================

resource "aws_apigatewayv2_integration" "disconnect" {
  api_id           = aws_apigatewayv2_api.this.id
  integration_type = "MOCK"

  request_templates = {
    "200" = "{\"statusCode\": 200}"
  }

  template_selection_expression = "200"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id                              = aws_apigatewayv2_api.this.id
  route_key                           = "$disconnect"
  target                              = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
  route_response_selection_expression = "$default"
}

resource "aws_apigatewayv2_route_response" "disconnect" {
  api_id             = aws_apigatewayv2_api.this.id
  route_id           = aws_apigatewayv2_route.disconnect.id
  route_response_key = "$default"
}

resource "aws_apigatewayv2_integration_response" "disconnect" {
  api_id                   = aws_apigatewayv2_api.this.id
  integration_id           = aws_apigatewayv2_integration.disconnect.id
  integration_response_key = "/200/"
}

# =============================================================================
# $default Route — HTTP_PROXY integration to backend agent handler
# =============================================================================

resource "aws_apigatewayv2_integration" "default" {
  api_id             = aws_apigatewayv2_api.this.id
  integration_type   = "HTTP_PROXY"
  integration_method = "POST"
  integration_uri    = var.backend_endpoint
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.default.id}"
}
