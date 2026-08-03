# -----------------------------------------------------------------------------
# Payments Fraud — root module.
#
# Composes the official AVA control-plane templates:
#   - agent-runtime-agentcore : AgentCore runtime + endpoint + ECR + log delivery
#   - auth-cognito            : Cognito user pool + web/service clients
# and adds this app's own data stores (data.tf) and IAM wiring (iam.tf).
#
# Langfuse is consumed from an existing Foundation Stack via input variables
# (langfuse_*), injected into the runtime's environment — this stack does not
# deploy Langfuse itself.
# -----------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Relative path to the shared templates (repo: platform/control_plane/templates).
locals {
  templates_root = "${path.module}/../../../../../platform/control_plane/templates"

  # Environment variables injected into the agent container. Mirrors the names
  # read in src/strands/config.py. Langfuse keys are only set when provided so
  # the agent's configure_observability() no-ops gracefully (CloudWatch/X-Ray).
  runtime_environment = merge(
    {
      MODEL_ID        = var.model_id
      SCORER_MODEL_ID = var.scorer_model_id
      AWS_REGION      = var.aws_region
      TXN_TABLE       = aws_dynamodb_table.transactions.name
      CASES_TABLE     = aws_dynamodb_table.cases.name
      SARS_TABLE      = aws_dynamodb_table.sars.name
      DATA_BUCKET     = aws_s3_bucket.data.bucket
      DATA_PREFIX     = "samples/payments_fraud"
    },
    var.langfuse_host != "" ? {
      LANGFUSE_HOST       = var.langfuse_host
      LANGFUSE_PUBLIC_KEY = var.langfuse_public_key
      LANGFUSE_SECRET_KEY = var.langfuse_secret_key
    } : {}
  )
}

# -----------------------------------------------------------------------------
# AgentCore runtime (official module)
# -----------------------------------------------------------------------------
module "runtime" {
  # checkov:skip=CKV_TF_1:Module source is a local path within this repo, not a remote git source — commit-hash pinning does not apply.
  # checkov:skip=CKV_TF_2:Local path module; version-tag pinning does not apply.
  source = "${local.templates_root}/agent-runtime-agentcore/iac/terraform"

  project_name        = var.project_name
  aws_region          = var.aws_region
  environment         = var.environment
  container_image_uri = var.container_image_uri
  model_id            = var.model_id
  server_protocol     = "HTTP"

  environment_variables = local.runtime_environment

  runtime_description = "Payments fraud supervisor + scorer/investigation/SAR specialists"
  tags                = var.tags
}

# -----------------------------------------------------------------------------
# Auth (official module)
# -----------------------------------------------------------------------------
module "auth" {
  # checkov:skip=CKV_TF_1:Module source is a local path within this repo, not a remote git source — commit-hash pinning does not apply.
  # checkov:skip=CKV_TF_2:Local path module; version-tag pinning does not apply.
  source = "${local.templates_root}/auth-cognito/iac/terraform"

  project_name = var.project_name
  aws_region   = var.aws_region
  environment  = var.environment

  # Security: disable self-registration — users are created by an administrator
  # only (allow_admin_create_user_only = true). Pinned explicitly rather than
  # relying on the template default so it can't silently regress; open self-signup
  # lets unauthorized users create accounts, and this app has no sign-up flow.
  allow_self_signup = false

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  tags = var.tags
}
