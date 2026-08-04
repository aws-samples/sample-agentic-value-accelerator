# -----------------------------------------------------------------------------
# Cognito User Pool Domain
# Mutually exclusive: either a Cognito prefix domain OR a custom domain.
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_domain" "prefix" {
  count        = var.custom_domain == "" ? 1 : 0
  domain       = var.domain_prefix != "" ? var.domain_prefix : local.name_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_domain" "custom" {
  count           = var.custom_domain != "" ? 1 : 0
  domain          = var.custom_domain
  certificate_arn = var.certificate_arn
  user_pool_id    = aws_cognito_user_pool.this.id
}
