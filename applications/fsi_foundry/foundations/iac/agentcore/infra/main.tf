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

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Local variables for resource naming
locals {
  # Framework short name mapping for resource naming
  framework_short_map = {
    "langchain_langgraph" = "langgraph"
    "strands"             = "strands"
    "crewai"              = "crewai"
    "llamaindex"          = "llamaindex"
  }

  # Derive framework short name from framework variable
  framework_short = lookup(local.framework_short_map, var.framework, var.framework)

  # Convert to lowercase and replace underscores with hyphens for S3 and ECR naming
  # Shorten long use case names to stay within AWS naming limits (e.g., IAM role max 64 chars)
  use_case_short_map = {
    "customer_engagement"      = "custeng"
    "customer_service"         = "custsvc"
    "customer_chatbot"         = "custbot"
    "customer_support"         = "custsup"
    "kyc_banking"              = "kyc"
    "agentic_payments"         = "agpay"
    "agentic_commerce"         = "agcom"
    "payment_operations"       = "payops"
    "corporate_sales"          = "corpsales"
    "document_processing"      = "docproc"
    "document_search"          = "docsrch"
    "fraud_detection"          = "fraud"
    "credit_risk"              = "credrisk"
    "compliance_investigation" = "compinv"
    "adverse_media"            = "advmedia"
    "market_surveillance"      = "mktsurv"
    "investment_advisory"      = "invadv"
    "investment_management"    = "invmgmt"
    "earnings_summarization"   = "earnsum"
    "economic_research"        = "econres"
    "email_triage"             = "emailtri"
    "trading_assistant"        = "tradeast"
    "trading_insights"         = "tradeins"
    "research_credit_memo"     = "credmemo"
    "data_analytics"           = "dataanly"
    "call_center_analytics"    = "ccanalytics"
    "post_call_analytics"      = "postcall"
    "call_summarization"       = "callsum"
    "claims_management"        = "claims"
    "life_insurance_agent"     = "lifeins"
    "legacy_migration"         = "legmig"
    "code_generation"          = "codegen"
    "mainframe_migration"      = "mfmig"
    "ai_assistant"             = "aiasst"
  }

  use_case_id_lower     = lower(replace(lookup(local.use_case_short_map, var.use_case_id, var.use_case_id), "_", "-"))
  framework_short_lower = lower(replace(local.framework_short, "_", "-"))

  # Resource prefix includes framework for isolation
  resource_prefix = "${var.project_name}-${local.use_case_id_lower}-${local.framework_short_lower}"

  # Include region in resource names to support multi-region deployments
  region_suffix = replace(var.aws_region, "-", "")

  # S3 and ECR use lowercase identifiers
  use_case_id_s3     = local.use_case_id_lower
  framework_short_s3 = local.framework_short_lower
}

# Reference shared infrastructure
module "shared" {
  source = "../../shared"

  project_name      = var.project_name
  aws_region        = var.aws_region
  deployment_suffix = "agentcore"
  use_case_id       = var.use_case_id
  framework         = var.framework
  data_path         = var.data_path
}

# S3 bucket for AgentCore deployment packages (shorter name for API constraints)
# Include region and framework in bucket name to support multi-region and multi-framework deployments
resource "aws_s3_bucket" "agentcore_code" {
  # Note: S3 bucket names can only contain lowercase alphanumeric characters and hyphens
  # Include framework_short_s3 for framework isolation (Requirement 2.2)
  bucket = "agentcore-code-${local.use_case_id_s3}-${local.framework_short_s3}-${local.region_suffix}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "${local.resource_prefix}-agentcore-code"
    Environment = var.environment
    Region      = var.aws_region
    UseCase     = var.use_case_id
    Framework   = var.framework
  }

  lifecycle {
    ignore_changes = [bucket]
  }
}

resource "aws_s3_bucket_versioning" "agentcore_code" {
  bucket = aws_s3_bucket.agentcore_code.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "agentcore_code" {
  bucket = aws_s3_bucket.agentcore_code.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "agentcore_code" {
  bucket = aws_s3_bucket.agentcore_code.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ECR repository for AgentCore container images
# Include region in name to support multi-region deployments
resource "aws_ecr_repository" "agentcore" {
  name                 = "${local.resource_prefix}-agentcore-${local.region_suffix}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${local.resource_prefix}-agentcore-ecr"
    Environment = var.environment
    Region      = var.aws_region
    UseCase     = var.use_case_id
  }
}

resource "aws_ecr_lifecycle_policy" "agentcore" {
  repository = aws_ecr_repository.agentcore.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}
