###############################################################################
# Provider
###############################################################################

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "knowledge-base-bedrock"
    }
  }
}

###############################################################################
# Data Sources
###############################################################################

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

###############################################################################
# Locals
###############################################################################

locals {
  prefix             = "${var.project_name}-${var.environment}"
  embedding_model_arn = "arn:aws:bedrock:${data.aws_region.current.region}::foundation-model/${var.embedding_model_id}"
  vector_index_name  = "${local.prefix}-index"

  default_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}
