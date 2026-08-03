resource "aws_secretsmanager_secret" "litellm" {
  name                    = "${var.name}-secrets"
  recovery_window_in_days = 0
  tags                    = merge(local.common_tags, { Name = "${local.tag_name} Secrets" })
}

resource "aws_secretsmanager_secret_version" "litellm" {
  secret_id = aws_secretsmanager_secret.litellm.id
  secret_string = jsonencode({
    master_key        = var.master_key
    postgres_password = random_password.postgres_password.result
    redis_password    = random_password.redis_password.result
    salt              = random_bytes.salt.base64
  })
}

# Optional Cognito SSO client (admin UI)
resource "aws_cognito_user_pool_client" "litellm" {
  count           = local.enable_sso ? 1 : 0
  name            = "${var.name}-litellm-sso"
  user_pool_id    = var.cognito_user_pool_id
  generate_secret = true

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = ["https://${aws_lb.litellm.dns_name}/sso/callback"]
  logout_urls   = ["https://${aws_lb.litellm.dns_name}"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}
