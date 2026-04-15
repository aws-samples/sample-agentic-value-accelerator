# =============================================================================
# AWS Amplify Hosting for Testing Dashboard
# =============================================================================
# Supports two deployment modes:
# 1. Git-based: Connect to a repository for CI/CD (set repository_url)
# 2. Manual: Deploy via zip upload (leave repository_url empty)
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

locals {
  name_prefix = "ava-${var.environment}"
  is_manual   = var.repository_url == ""
  
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - cd platform/ui/testing-dashboard
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: platform/ui/testing-dashboard/build
        files:
          - '**/*'
      cache:
        paths:
          - platform/ui/testing-dashboard/node_modules/**/*
  EOT
}

# =============================================================================
# Amplify App
# =============================================================================

resource "aws_amplify_app" "testing_dashboard" {
  name = "${local.name_prefix}-testing-dashboard"
  
  # Only set repository for git-based deployments
  repository   = local.is_manual ? null : var.repository_url
  access_token = local.is_manual ? null : (var.github_access_token != "" ? var.github_access_token : null)
  
  # Platform: WEB for manual deployments, WEB_COMPUTE for git-based
  platform = local.is_manual ? "WEB" : "WEB_COMPUTE"

  # Build settings (only for git-based)
  build_spec = local.is_manual ? null : local.build_spec

  # Environment variables
  environment_variables = {
    REACT_APP_AWS_REGION            = var.aws_region
    REACT_APP_USER_POOL_ID          = var.cognito_user_pool_id
    REACT_APP_USER_POOL_CLIENT_ID   = var.cognito_user_pool_client_id
    REACT_APP_IDENTITY_POOL_ID      = var.cognito_identity_pool_id
  }

  # Custom rules for SPA routing
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  tags = {
    Name        = "${local.name_prefix}-testing-dashboard"
    Environment = var.environment
  }
}

# =============================================================================
# Amplify Branch (for git-based deployments only)
# =============================================================================

resource "aws_amplify_branch" "main" {
  count = local.is_manual ? 0 : 1
  
  app_id      = aws_amplify_app.testing_dashboard.id
  branch_name = var.branch_name

  enable_auto_build = true
  stage = var.environment == "prod" ? "PRODUCTION" : "DEVELOPMENT"

  environment_variables = {
    REACT_APP_ENV = var.environment
  }

  tags = {
    Name        = "${local.name_prefix}-branch-${var.branch_name}"
    Environment = var.environment
  }
}

# =============================================================================
# Manual Deployment Branch (for manual deployments)
# =============================================================================

resource "aws_amplify_branch" "manual" {
  count = local.is_manual ? 1 : 0
  
  app_id      = aws_amplify_app.testing_dashboard.id
  branch_name = "main"
  
  stage = var.environment == "prod" ? "PRODUCTION" : "DEVELOPMENT"

  tags = {
    Name        = "${local.name_prefix}-manual-branch"
    Environment = var.environment
  }
}

# =============================================================================
# Custom Domain (optional)
# =============================================================================

resource "aws_amplify_domain_association" "custom" {
  count = var.custom_domain != "" ? 1 : 0

  app_id      = aws_amplify_app.testing_dashboard.id
  domain_name = var.custom_domain

  sub_domain {
    branch_name = local.is_manual ? aws_amplify_branch.manual[0].branch_name : aws_amplify_branch.main[0].branch_name
    prefix      = ""
  }
}
