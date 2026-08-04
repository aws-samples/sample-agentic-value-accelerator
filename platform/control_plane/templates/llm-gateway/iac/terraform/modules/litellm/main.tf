data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_vpc" "vpc" { id = var.vpc_id }

locals {
  tag_name   = "${var.name}-${var.environment}"
  enable_sso = var.cognito_user_pool_id != ""
  attach_lf  = var.langfuse_host != "" && var.langfuse_public_key_secret_arn != "" && var.langfuse_secret_key_secret_arn != ""
  attach_gr  = var.attach_guardrail_id != ""

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    Module      = "llm-gateway"
    ManagedBy   = "terraform"
  })
}

# Service-linked roles (RDS + ElastiCache) — same pattern as foundation-stack/langfuse
resource "null_resource" "service_linked_roles" {
  provisioner "local-exec" {
    command = <<-EOT
      aws iam create-service-linked-role --aws-service-name rds.amazonaws.com 2>/dev/null || true
      aws iam create-service-linked-role --aws-service-name elasticache.amazonaws.com 2>/dev/null || true
      echo "service-linked roles ensured"
      sleep 10
    EOT
  }
}

resource "random_password" "postgres_password" {
  length      = 48
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "random_password" "redis_password" {
  length      = 48
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "random_bytes" "salt" { length = 32 }

# Shared secret injected by CloudFront as x-origin-verify header; ALB rejects
# requests that don't carry it, preventing direct-to-ALB access from the internet.
resource "random_password" "origin_verify" {
  length  = 64
  special = false
}
