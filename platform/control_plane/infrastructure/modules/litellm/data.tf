# =============================================================================
# LiteLLM Gateway Module - Data Sources
# =============================================================================

# Current AWS region
data "aws_region" "current" {}

# Current AWS account identity
data "aws_caller_identity" "current" {}

# Existing VPC (shared with Control Plane backend)
data "aws_vpc" "existing" {
  id = var.vpc_id
}

# =============================================================================
# Local Values
# =============================================================================

locals {
  # Merge user-provided tags with default module tags
  default_tags = {
    Module      = "litellm-gateway"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "ava"
    Component   = "ai-gateway"
  }

  tags = merge(local.default_tags, var.tags)

  # Common naming convention
  resource_prefix = "${var.name_prefix}-${var.environment}"

  # Account and region references
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  # ECS cluster: accept either an ARN or a name, derive both forms.
  # This avoids using a data source lookup which fails when the cluster
  # is created in the same terraform apply (e.g., the dev bootstrap).
  ecs_cluster_arn = (
    startswith(var.ecs_cluster_id, "arn:")
    ? var.ecs_cluster_id
    : "arn:aws:ecs:${local.region}:${local.account_id}:cluster/${var.ecs_cluster_id}"
  )
  ecs_cluster_name = (
    startswith(var.ecs_cluster_id, "arn:")
    ? element(split("/", var.ecs_cluster_id), length(split("/", var.ecs_cluster_id)) - 1)
    : var.ecs_cluster_id
  )
}
