# Cognito Module
# Purpose: User identity provider with username/password authentication

data "aws_caller_identity" "current" {}

locals {
  user_pool_name = "market-surveillance-user-pool-${var.environment}"
  client_name    = "market-surveillance-app-client-${var.environment}"
  domain_prefix  = "market-surveillance-${var.environment}-${data.aws_caller_identity.current.account_id}"
}

# Cognito User Pool
resource "aws_cognito_user_pool" "this" {
  name = local.user_pool_name

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = var.password_min_length
    require_lowercase                = var.password_require_lowercase
    require_uppercase                = var.password_require_uppercase
    require_numbers                  = var.password_require_numbers
    require_symbols                  = var.password_require_symbols
    temporary_password_validity_days = 7
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email verification
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Market Surveillance - Verify your email"
    email_message        = "Your verification code is {####}"
  }

  # User attribute schema
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # MFA configuration (optional, disabled by default)
  mfa_configuration = "OFF"

  # Deletion protection for production
  deletion_protection = var.environment == "prod" ? "ACTIVE" : "INACTIVE"

  tags = {
    Name        = local.user_pool_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "this" {
  name         = local.client_name
  user_pool_id = aws_cognito_user_pool.this.id

  # Token configuration
  access_token_validity  = var.token_validity_hours
  id_token_validity      = var.id_token_validity_hours
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # OAuth configuration
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Callback URLs - to be updated with actual app URLs
  callback_urls = ["https://localhost:3000/callback"]
  logout_urls   = ["https://localhost:3000/logout"]

  # Authentication flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Security configuration
  prevent_user_existence_errors = "ENABLED"
  generate_secret               = true # Required for agent/server authentication

  # Read/write attributes
  read_attributes  = ["email", "email_verified", "name"]
  write_attributes = ["email", "name"]
}

# Cognito User Pool Client for Web App (no secret)
resource "aws_cognito_user_pool_client" "web_app" {
  name         = "${local.client_name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  # Token configuration
  access_token_validity  = var.token_validity_hours
  id_token_validity      = var.id_token_validity_hours
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # OAuth configuration
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Callback URLs - to be updated with actual app URLs
  callback_urls = ["https://localhost:3000/callback", "http://localhost:3000/callback"]
  logout_urls   = ["https://localhost:3000/logout", "http://localhost:3000/logout"]

  # Authentication flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Security configuration
  prevent_user_existence_errors = "ENABLED"
  generate_secret               = false # No secret for web apps (browsers can't securely store secrets)

  # Read/write attributes
  read_attributes  = ["email", "email_verified", "name"]
  write_attributes = ["email", "name"]
}

# Cognito User Pool Domain (Hosted UI)
resource "aws_cognito_user_pool_domain" "this" {
  count = var.enable_hosted_ui ? 1 : 0

  domain       = local.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}
