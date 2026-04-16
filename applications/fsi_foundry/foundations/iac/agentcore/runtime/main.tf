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

# Local variables for workspace-aware state path
locals {
  # Determine the correct state file path based on workspace
  # Default workspace uses terraform.tfstate directly
  # Named workspaces use terraform.tfstate.d/<workspace>/terraform.tfstate
  # Workspace naming convention: {use_case_id}-{framework_short}-{aws_region}
  workspace_name   = terraform.workspace
  infra_state_path = local.workspace_name == "default" ? "../infra/terraform.tfstate" : "../infra/terraform.tfstate.d/${local.workspace_name}/terraform.tfstate"

  # Framework short name mapping for resource naming
  framework_short_map = {
    "langchain_langgraph" = "langgraph"
    "strands"             = "strands"
    "crewai"              = "crewai"
    "llamaindex"          = "llamaindex"
  }

  # Use case short name mapping to handle AWS naming length limits
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

  # Derive framework short name from framework variable
  framework_short = lookup(local.framework_short_map, var.framework, var.framework)

  # Derive use case short name with fallback to original
  use_case_short = lookup(local.use_case_short_map, var.use_case_id, var.use_case_id)

  # Derive agent_name from use_case_id and framework if not explicitly provided
  # AgentCore requires: [a-zA-Z][a-zA-Z0-9_]{0,47} (max 48 characters)
  # Convert hyphens to underscores and ensure valid format
  # Include framework_short for framework isolation (Requirement 2.8)
  # Stable name — buildspec imports existing CloudFormation stacks so no AlreadyExists conflicts
  use_case_short_safe  = replace(local.use_case_short, "-", "_")
  framework_short_safe = replace(local.framework_short, "-", "_")
  derived_agent_name   = "ava_${local.use_case_short_safe}_${local.framework_short_safe}"
  agent_name           = var.agent_name != "" ? var.agent_name : local.derived_agent_name
}

# Reference infrastructure module outputs (workspace-aware)
data "terraform_remote_state" "infra" {
  backend = "local"

  config = {
    path = local.infra_state_path
  }
}

# Local variables for resource naming
locals {
  # Resource prefix includes framework for isolation (Requirement 2.1)
  resource_prefix = "${data.terraform_remote_state.infra.outputs.project_name}-${var.use_case_id}-${local.framework_short}"
  region_suffix   = replace(var.aws_region, "-", "")
  # CloudFormation stack names must match [a-zA-Z][-a-zA-Z0-9]* (no underscores)
  # Convert underscores to hyphens for stack naming
  use_case_id_cfn     = replace(var.use_case_id, "_", "-")
  framework_short_cfn = replace(local.framework_short, "_", "-")
}

# AgentCore Runtime via CloudFormation
# Include use_case_id, framework, and region in stack name to support multi-deployment isolation
resource "aws_cloudformation_stack" "agentcore_runtime" {
  # CloudFormation stack names can only contain alphanumeric characters and hyphens
  # Include framework_short_cfn for framework isolation (Requirement 2.8)
  name = "ava-${local.use_case_id_cfn}-${local.framework_short_cfn}-agentcore-runtime-${local.region_suffix}"

  template_body = file("${path.module}/agentcore_runtime.yaml")

  parameters = {
    AgentName      = local.agent_name
    RoleArn        = data.terraform_remote_state.infra.outputs.agentcore_role_arn
    ECRRepository  = data.terraform_remote_state.infra.outputs.agentcore_ecr_repository
    ImageTag       = var.image_tag
    DataBucket     = data.terraform_remote_state.infra.outputs.s3_data_bucket
    BedrockModelId = var.bedrock_model_id
    Description    = "AVA - ${var.use_case_name} (${var.framework})"
    Environment    = data.terraform_remote_state.infra.outputs.environment
    AwsRegion      = data.terraform_remote_state.infra.outputs.aws_region
    UseCaseId      = var.use_case_id
    UseCaseName    = var.use_case_name
    Framework      = var.framework
  }

  capabilities = ["CAPABILITY_IAM"]

  tags = {
    Name           = "${local.resource_prefix}-agentcore-runtime"
    Environment    = data.terraform_remote_state.infra.outputs.environment
    Region         = var.aws_region
    UseCase        = var.use_case_id
    Framework      = var.framework
    FrameworkShort = local.framework_short
  }
}
