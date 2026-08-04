# -----------------------------------------------------------------------------
# JWT Authorizer (Cognito)
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "jwt" {
  count = var.auth_type == "JWT" ? 1 : 0

  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  name             = "${local.name_prefix}-jwt-authorizer"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.cognito_app_client_id]
    issuer   = "https://cognito-idp.${local.region}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}
