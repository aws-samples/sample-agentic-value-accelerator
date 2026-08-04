# -----------------------------------------------------------------------------
# Backend Integration (HTTP Proxy)
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "backend" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = var.backend_endpoint
  payload_format_version = "1.0"
  timeout_milliseconds   = 29000
}

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

# Proxy route — forwards all method/path combinations to the backend
resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.backend.id}"

  authorization_type = var.auth_type == "JWT" ? "JWT" : (var.auth_type == "AWS_IAM" ? "AWS_IAM" : "NONE")
  authorizer_id      = var.auth_type == "JWT" ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

# Default catch-all route
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.backend.id}"

  authorization_type = var.auth_type == "JWT" ? "JWT" : (var.auth_type == "AWS_IAM" ? "AWS_IAM" : "NONE")
  authorizer_id      = var.auth_type == "JWT" ? aws_apigatewayv2_authorizer.jwt[0].id : null
}
