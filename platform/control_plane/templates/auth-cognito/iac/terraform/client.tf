# -----------------------------------------------------------------------------
# Web Client (Browser / SPA)
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
}

# -----------------------------------------------------------------------------
# Service Client (Machine-to-Machine)
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_client" "service" {
  name         = "${local.name_prefix}-service"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = true

  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_scopes                 = aws_cognito_resource_server.this.scope_identifiers
  allowed_oauth_flows_user_pool_client = true

  enable_token_revocation = true

  token_validity_units {
    access_token = "hours"
  }

  access_token_validity = 1

  depends_on = [aws_cognito_resource_server.this]
}
