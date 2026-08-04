provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "human-approval-workflow"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.region
  name_prefix = "${var.project_name}-${var.environment}"
  # AgentCore names only allow alphanumeric and underscores
  agentcore_name_prefix = replace(local.name_prefix, "-", "_")
}
