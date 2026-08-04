# -----------------------------------------------------------------------------
# Cognito User Pool
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool" "this" {
  name = "${local.name_prefix}-users"

  # Sign-in configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Password policy
  password_policy {
    minimum_length                   = var.password_min_length
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # MFA
  mfa_configuration = var.mfa_configuration

  dynamic "software_token_mfa_configuration" {
    for_each = var.mfa_configuration != "OFF" ? [1] : []
    content {
      enabled = true
    }
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Admin configuration
  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_self_signup
  }

  # Attribute verification
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  # Deletion protection
  deletion_protection = var.deletion_protection

  # Advanced security (adaptive auth, compromised credential detection)
  user_pool_add_ons {
    advanced_security_mode = var.environment == "prod" ? "ENFORCED" : "AUDIT"
  }

  # Email
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Schema
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }

  tags = var.tags

  # Schema attributes are immutable — ignore ordering diffs from AWS API
  lifecycle {
    ignore_changes = [schema]
  }
}
