# =============================================================================
# Cognito Authentication Infrastructure
# =============================================================================
# Creates Cognito User Pool and Identity Pool for authenticating
# the Testing Dashboard UI to invoke AgentCore.
#
# Components:
# - User Pool: Handles user authentication (sign up, sign in)
# - User Pool Client: App client for the React UI
# - Identity Pool: Provides temporary AWS credentials for authenticated users
# - IAM Role: Grants authenticated users permission to invoke AgentCore
# =============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "ava-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
}

# =============================================================================
# Cognito User Pool
# =============================================================================

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-user-pool"

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  # Allow users to sign up
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # Use email as username
  username_attributes = ["email"]
  
  auto_verified_attributes = ["email"]

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Name        = "${local.name_prefix}-user-pool"
    Environment = var.environment
  }
}

# =============================================================================
# Cognito User Pool Client
# =============================================================================

resource "aws_cognito_user_pool_client" "web_client" {
  name         = "${local.name_prefix}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # No client secret for public web apps
  generate_secret = false

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"
}

# =============================================================================
# Cognito Identity Pool
# =============================================================================

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "${local.name_prefix}-identity-pool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.web_client.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = false
  }

  tags = {
    Name        = "${local.name_prefix}-identity-pool"
    Environment = var.environment
  }
}

# =============================================================================
# IAM Role for Authenticated Users
# =============================================================================

resource "aws_iam_role" "authenticated" {
  name = "${local.name_prefix}-cognito-authenticated"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${local.name_prefix}-cognito-authenticated"
    Environment = var.environment
  }
}

# Policy to invoke AgentCore
resource "aws_iam_role_policy" "agentcore_invoke" {
  name = "${local.name_prefix}-agentcore-invoke"
  role = aws_iam_role.authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:InvokeAgentRuntime"
        ]
        Resource = var.agentcore_runtime_arn != "" ? var.agentcore_runtime_arn : "arn:aws:bedrock-agentcore:${var.aws_region}:${local.account_id}:runtime/*"
      }
    ]
  })
}

# Policy to describe Step Functions executions (for async polling)
resource "aws_iam_role_policy" "stepfunctions_describe" {
  name = "${local.name_prefix}-stepfunctions-describe"
  role = aws_iam_role.authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:DescribeExecution"
        ]
        Resource = "arn:aws:states:${var.aws_region}:${local.account_id}:execution:*:*"
      }
    ]
  })
}

# Attach role to identity pool
resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated" = aws_iam_role.authenticated.arn
  }
}
