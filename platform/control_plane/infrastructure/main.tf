terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state management
  # backend "s3" {
  #   bucket         = "ava-terraform-state"
  #   key            = "control-plane/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
      Owner       = var.owner
      CostCenter  = var.cost_center
    })
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id_short = substr(data.aws_caller_identity.current.account_id, -6, 6)
  name_prefix      = "${var.project_name}-cp-${var.environment}-${local.account_id_short}"

  # Use existing VPC or create new
  use_existing_vpc = var.vpc_id != "" && length(var.public_subnet_ids) > 0 && length(var.private_subnet_ids) > 0

  vpc_id             = local.use_existing_vpc ? var.vpc_id : module.networking[0].vpc_id
  public_subnet_ids  = local.use_existing_vpc ? var.public_subnet_ids : module.networking[0].public_subnet_ids
  private_subnet_ids = local.use_existing_vpc ? var.private_subnet_ids : module.networking[0].private_subnet_ids
}

# ============================================================================
# Networking Module (Optional - only if creating new VPC)
# ============================================================================

module "networking" {
  source = "./modules/networking"
  count  = local.use_existing_vpc ? 0 : 1

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  environment        = var.environment

  tags = var.tags
}

# ============================================================================
# DynamoDB Tables Module
# ============================================================================

module "dynamodb" {
  source = "./modules/dynamodb"

  name_prefix = local.name_prefix
  environment = var.environment

  tags = var.tags
}

# ============================================================================
# S3 Buckets Module
# ============================================================================

module "s3" {
  source = "./modules/s3"

  name_prefix                    = local.name_prefix
  environment                    = var.environment
  project_archive_retention_days = var.project_archive_retention_days

  tags = var.tags
}

# ============================================================================
# Advanced Prompt Optimization Module
# ============================================================================
# S3 bucket for AdvPO eval datasets + results. Bucket name is surfaced to the
# backend container as ADVPO_BUCKET via the ECS module.

module "advanced_prompt_optimization" {
  source = "./modules/advanced_prompt_optimization"

  name_prefix = local.name_prefix
  environment = var.environment

  tags = var.tags
}

# ============================================================================
# ECR Repository Module
# ============================================================================

module "ecr" {
  source = "./modules/ecr"

  name_prefix = local.name_prefix
  environment = var.environment

  tags = var.tags
}

# ============================================================================
# AgentCore Policy Engine + Platform Gateway
# ============================================================================
# Backend's /policies API targets this engine for CRUD; Cedar statements
# in each policy bake in the gateway ARN as the protected resource.

module "agentcore_policy" {
  source = "./modules/agentcore_policy"

  name_prefix = local.name_prefix
  tags        = var.tags
}

# ============================================================================
# ECS Cluster and Service Module
# ============================================================================

module "ecs" {
  source = "./modules/ecs"

  name_prefix        = local.name_prefix
  environment        = var.environment
  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids
  public_subnet_ids  = local.public_subnet_ids

  # Task configuration
  task_cpu        = var.ecs_task_cpu
  task_memory     = var.ecs_task_memory
  desired_count   = var.ecs_desired_count
  min_capacity    = var.ecs_min_capacity
  max_capacity    = var.ecs_max_capacity
  container_image = var.container_image != "" ? var.container_image : module.ecr.repository_url

  # DynamoDB tables
  application_catalog_table_name = module.dynamodb.application_catalog_table_name
  application_catalog_table_arn  = module.dynamodb.application_catalog_table_arn
  deployment_metadata_table_name = module.dynamodb.deployment_metadata_table_name
  deployment_metadata_table_arn  = module.dynamodb.deployment_metadata_table_arn

  # S3 buckets
  project_archives_bucket_name = module.s3.project_archives_bucket_name
  project_archives_bucket_arn  = module.s3.project_archives_bucket_arn
  frontend_bucket_name         = module.s3.frontend_bucket_name
  frontend_bucket_arn          = module.s3.frontend_bucket_arn

  # Advanced Prompt Optimization bucket (surfaced as ADVPO_BUCKET env var)
  advpo_bucket_name = module.advanced_prompt_optimization.prompt_optimization_bucket_name

  # Deployments
  deployments_table_name = module.dynamodb.deployments_table_name
  deployments_table_arn  = module.dynamodb.deployments_table_arn
  deployments_bucket_arn = module.s3.deployments_bucket_arn
  state_machine_arn                 = module.step_functions.state_machine_arn
  frontier_agents_state_machine_arn   = module.frontier_agents_pipeline.state_machine_arn
  frontier_agents_federation_role_arn = aws_iam_role.frontier_agents_federation.arn
  app_factory_table_name              = module.dynamodb.app_factory_table_name
  app_factory_table_arn  = module.dynamodb.app_factory_table_arn
  guardrails_table_name     = module.dynamodb.guardrails_table_name
  guardrails_table_arn      = module.dynamodb.guardrails_table_arn
  policies_table_name       = module.dynamodb.policies_table_name
  policies_table_arn        = module.dynamodb.policies_table_arn
  policy_engine_id          = module.agentcore_policy.policy_engine_id
  policy_gateway_arn        = module.agentcore_policy.gateway_arn
  prioritization_table_name = module.dynamodb.prioritization_table_name
  prioritization_table_arn  = module.dynamodb.prioritization_table_arn
  maturity_table_name       = module.dynamodb.maturity_table_name
  maturity_table_arn        = module.dynamodb.maturity_table_arn
  business_cases_table_name = module.dynamodb.business_cases_table_name
  knowledge_table_name      = module.dynamodb.knowledge_table_name
  knowledge_table_arn       = module.dynamodb.knowledge_table_arn
  datalake_mcp_image_uri    = "${module.ecr.datalake_mcp_repository_url}:latest"
  kb_mcp_image_uri          = "${module.ecr.kb_mcp_repository_url}:latest"
  business_cases_table_arn  = module.dynamodb.business_cases_table_arn
  operating_model_table_name = module.dynamodb.operating_model_table_name
  operating_model_table_arn  = module.dynamodb.operating_model_table_arn
  organization_design_table_name = module.dynamodb.organization_design_table_name
  organization_design_table_arn  = module.dynamodb.organization_design_table_arn
  service_approval_table_name        = module.service_approval.table_name
  service_approval_table_arn         = module.service_approval.table_arn
  service_approval_bucket            = module.service_approval.bucket_name
  service_approval_bucket_arn        = module.service_approval.bucket_arn
  # Service-approval Path B: backend invokes AgentCore directly. The
  # runtime ARN is owned by platform/control_plane/service_approval/runtime/
  # (not a peer of this stack) — capture its terraform output and pass
  # via tfvars to wire the backend's create_run path.
  service_approval_agent_runtime_arn = var.service_approval_agent_runtime_arn
  cors_origins           = concat(["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"], ["https://${module.cloudfront.distribution_domain_name}"], var.domain_name != "" ? ["https://${var.domain_name}"] : [])

  # Cognito wiring — without these the backend's RBAC layer falls into a
  # dev-mode bypass that returns Role.ADMIN for every JWT. See modules/ecs/main.tf.
  cognito_user_pool_id        = module.cognito.user_pool_id
  cognito_user_pool_client_id = module.cognito.user_pool_client_id

  # FSI Foundry SSO signing secret — backend HMAC-signs handoff tokens
  # after RS256-verifying Cognito id_tokens. See random_password below.
  fsi_app_signing_secret = random_password.fsi_app_signing_secret.result

  tags = var.tags
}

# ============================================================================
# Service Approval (Service Onboarding) Module
# DDB + S3 + ECR + ECS task def + SFN for the 9-phase service-approval pipeline
# ============================================================================

module "service_approval" {
  source = "./modules/service_approval"

  # Phase B decommission: this module owns DDB + S3 only. The Fargate
  # runner + SFN orchestration moved to platform/control_plane/service_approval/
  # runtime/. VPC/subnet inputs no longer needed since DDB+S3 don't run
  # in a VPC.
  name_prefix = local.name_prefix
  environment = var.environment
  tags        = var.tags
}

# ============================================================================
# API Gateway Module
# ============================================================================

module "api_gateway" {
  source = "./modules/api_gateway"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix        = local.name_prefix
  environment        = var.environment
  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids
  public_subnet_ids  = local.public_subnet_ids

  # ECS service
  ecs_service_name      = module.ecs.service_name
  ecs_security_group_id = module.ecs.security_group_id
  ecs_target_group_arn  = module.ecs.target_group_arn
  ecs_listener_arn      = module.ecs.listener_arn

  # Domain
  domain_name         = var.domain_name
  api_prefix          = var.api_prefix
  hosted_zone_id      = var.hosted_zone_id
  acm_certificate_arn = var.api_acm_certificate_arn

  tags = var.tags
}

# ============================================================================
# Step Functions Module
# ============================================================================

module "step_functions" {
  source = "./modules/step_functions"

  name_prefix = local.name_prefix
  environment = var.environment

  # DynamoDB tables
  application_catalog_table_name = module.dynamodb.application_catalog_table_name
  application_catalog_table_arn  = module.dynamodb.application_catalog_table_arn
  deployment_metadata_table_name = module.dynamodb.deployment_metadata_table_name
  deployment_metadata_table_arn  = module.dynamodb.deployment_metadata_table_arn

  # S3 buckets
  project_archives_bucket_name = module.s3.project_archives_bucket_name
  project_archives_bucket_arn  = module.s3.project_archives_bucket_arn

  # ECS cluster for executing bootstrap tasks
  ecs_cluster_arn         = module.ecs.cluster_arn
  ecs_task_definition_arn = module.ecs.task_definition_arn
  ecs_subnet_ids          = local.private_subnet_ids
  ecs_security_group_id   = module.ecs.security_group_id

  # CI/CD Pipeline integration
  enable_pipeline           = true
  codebuild_project_arn     = module.codebuild.project_arn
  codebuild_project_name    = module.codebuild.project_name
  eventbridge_bus_arn       = module.eventbridge.event_bus_arn
  eventbridge_bus_name      = module.eventbridge.event_bus_name
  state_backend_bucket_arn  = module.state_backend.bucket_arn
  state_backend_bucket_name = module.state_backend.bucket_name
  deployments_table_name    = module.dynamodb.deployments_table_name
  deployments_table_arn     = module.dynamodb.deployments_table_arn

  tags = var.tags
}

# ============================================================================
# CodeBuild Module (CI/CD Pipeline)
# ============================================================================

module "codebuild" {
  source = "./modules/codebuild"

  name_prefix = local.name_prefix
  environment = var.environment

  compute_type = var.codebuild_compute_type
  image        = var.codebuild_image != "" ? var.codebuild_image : "${module.ecr.repository_url}:codebuild-latest"

  # S3 buckets
  project_archives_bucket_arn = module.s3.project_archives_bucket_arn
  state_backend_bucket_arn    = module.state_backend.bucket_arn

  # DynamoDB tables
  deployment_metadata_table_arn = module.dynamodb.deployment_metadata_table_arn
  deployments_table_arn         = module.dynamodb.deployments_table_arn
  lock_table_arn                = module.state_backend.lock_table_arn

  # Agent registry (publish targets for generated agents)
  agent_registry_arn = module.agent_registry.registry_arn

  # FSI Foundry SSO — the shared HMAC secret + AVA login URL are forwarded
  # into per-use-case ui_iac. Real Cognito RS256 verification happens in
  # the AVA backend before it mints handoff tokens signed with this secret.
  fsi_app_signing_secret = random_password.fsi_app_signing_secret.result
  ava_ui_login_url       = module.cloudfront.frontend_url

  tags = var.tags
}

# =============================================================================
# FSI Foundry SSO — shared HMAC signing secret
# =============================================================================
# Random string minted once by CP terraform. Two consumers:
#   1) AVA backend (via ECS env var) uses it to HMAC-sign short-lived handoff
#      tokens, AFTER verifying the caller's Cognito id_token (real RS256).
#   2) Each FSI app's CloudFront Function uses it to HMAC-verify the same
#      token at the edge (natively supported by CF Functions crypto module).
# Rotation: taint this resource + terraform apply + redeploy all FSI apps.

resource "random_password" "fsi_app_signing_secret" {
  length  = 64
  special = false
}

# ============================================================================
# Agent Registry Module (AWS Agent Registry — preview)
# Shared catalog for every app-factory-generated agent.
# ============================================================================

module "agent_registry" {
  source = "./modules/agent_registry"

  name_prefix = local.name_prefix
  tags        = var.tags
}

# ============================================================================
# Frontier Agents Pipeline (AaaS)
# ============================================================================
# Dedicated state machine + CodeBuild project for deploying managed Frontier
# Agents (AWS DevOps Agent today, more later). Separate from the shared
# `step_functions` + `codebuild` pipeline because Frontier Agents don't need
# Docker builds, Langfuse wiring, or Foundry-specific env vars — keeping them
# on a slim pipeline avoids coupling the two schemas.

module "frontier_agents_pipeline" {
  source = "./modules/frontier_agents_pipeline"

  name_prefix  = local.name_prefix
  environment  = var.environment
  compute_type = var.codebuild_compute_type

  project_archives_bucket_arn = module.s3.project_archives_bucket_arn
  state_backend_bucket_arn    = module.state_backend.bucket_arn
  state_backend_bucket_name   = module.state_backend.bucket_name
  deployments_table_arn       = module.dynamodb.deployments_table_arn
  deployments_table_name      = module.dynamodb.deployments_table_name
  lock_table_arn              = module.state_backend.lock_table_arn

  tags = var.tags
}

# ============================================================================
# EventBridge Module (CI/CD Pipeline)
# ============================================================================

module "eventbridge" {
  source = "./modules/eventbridge"

  name_prefix = local.name_prefix

  bus_name           = var.eventbridge_bus_name
  step_functions_arn = module.step_functions.state_machine_arn

  tags = var.tags
}

# ============================================================================
# State Backend Module (Terraform Remote State)
# ============================================================================

module "state_backend" {
  source = "./modules/state_backend"

  name_prefix = local.name_prefix
  environment = var.environment

  bucket_name_prefix = var.state_backend_bucket_name_prefix
  lock_table_name    = var.state_backend_lock_table_name

  tags = var.tags
}

# ============================================================================
# Cognito Module
# ============================================================================

module "cognito" {
  source = "./modules/cognito"

  name_prefix    = local.name_prefix
  environment    = var.environment
  user_pool_name = var.cognito_user_pool_name
  enable_mfa     = var.cognito_enable_mfa

  # Seed admin@example.com / demo@example.com if requested. Useful for
  # fresh stamps so the first login works without a manual cognito-idp call.
  seed_demo_users      = var.seed_demo_users
  demo_admin_password  = var.demo_admin_password
  demo_viewer_password = var.demo_viewer_password

  # Callback URLs. Always include the CloudFront default DNS so the UI works
  # before/without a custom domain. Only append the custom domain when
  # var.domain_name is non-empty — otherwise we'd emit "https://" which is
  # an invalid Cognito callback (Cognito accepts it on create but rejects
  # any future update, requiring a manual UI fix).
  callback_urls = compact([
    "http://localhost:5173",
    "https://${module.cloudfront.distribution_domain_name}",
    var.domain_name != "" ? "https://${var.domain_name}" : "",
  ])

  logout_urls = compact([
    "http://localhost:5173",
    "https://${module.cloudfront.distribution_domain_name}",
    var.domain_name != "" ? "https://${var.domain_name}" : "",
  ])

  tags = var.tags
}

# ============================================================================
# CloudFront + S3 for Frontend
# ============================================================================

module "cloudfront" {
  source = "./modules/cloudfront"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix         = local.name_prefix
  environment         = var.environment
  frontend_bucket_id  = module.s3.frontend_bucket_id
  frontend_bucket_arn = module.s3.frontend_bucket_arn
  domain_name         = var.domain_name
  hosted_zone_id      = var.hosted_zone_id
  acm_certificate_arn = var.cloudfront_acm_certificate_arn

  # Extra CloudFront distribution ARNs (e.g. the public alias dist that
  # lives outside this state) that also need OAC access to the frontend
  # bucket. Without this, terraform's bucket policy would lock them out.
  extra_distribution_arns = var.frontend_extra_cloudfront_arns

  tags = var.tags
}

# ============================================================================
# Observability Module (CloudWatch, Alarms)
# ============================================================================

module "observability" {
  source = "./modules/observability"

  name_prefix = local.name_prefix
  environment = var.environment

  # ECS monitoring
  ecs_cluster_name = module.ecs.cluster_name
  ecs_service_name = module.ecs.service_name

  # API Gateway monitoring
  api_gateway_id   = module.api_gateway.api_id
  api_gateway_name = module.api_gateway.api_name

  # Step Functions monitoring
  state_machine_arn  = module.step_functions.state_machine_arn
  state_machine_name = module.step_functions.state_machine_name

  tags = var.tags
}

# ============================================================================
# CodeCommit Module (Optional - CI/CD Source Repository)
# ============================================================================

module "codecommit" {
  source = "./modules/codecommit"
  count  = var.enable_codecommit ? 1 : 0

  name_prefix            = local.name_prefix
  repository_name        = var.codecommit_repository_name != "" ? var.codecommit_repository_name : "${local.name_prefix}-source"
  repository_description = var.codecommit_repository_description

  # EventBridge integration
  event_bus_name       = module.eventbridge.event_bus_name
  step_functions_arn   = module.step_functions.state_machine_arn
  eventbridge_role_arn = module.eventbridge.eventbridge_role_arn

  # Trigger configuration
  enable_push_trigger = var.codecommit_enable_push_trigger
  enable_pr_trigger   = var.codecommit_enable_pr_trigger
  trigger_branches    = var.codecommit_trigger_branches

  # Notifications
  enable_notifications = var.codecommit_enable_notifications

  tags = var.tags
}

# ============================================================================
# Sample Data Lake
# ============================================================================

module "sample_datalake" {
  source = "./modules/sample_datalake"
  count  = var.enable_sample_datalake ? 1 : 0

  name_prefix       = local.name_prefix
  region            = var.aws_region
  account_id        = data.aws_caller_identity.current.account_id
  lf_admin_role_arn = var.lf_admin_role_arn
  ecs_task_role_arn = module.ecs.task_role_arn
}

# ============================================================================
# Sample Knowledge Base (Optional — demo Bedrock KB for Knowledge feature)
# ============================================================================

module "sample_knowledgebase" {
  source = "./modules/sample_knowledgebase"

  name_prefix = local.name_prefix
  region      = var.aws_region
  account_id  = data.aws_caller_identity.current.account_id
}
# Frontier Agents — Operator App Federation Role
# ============================================================================
# AVA backend assumes this role to mint a console federation URL via
# signin.aws.amazon.com/federation. Browser opens the URL, AWS console
# drops the federation cookie on *.app.aws, and the operator app loads
# already authenticated. Skips the AWS console sign-in step that
# otherwise blocks deep-linking from AVA.
#
# Trust: ECS task role only.
# Permissions: aidevops:* + securityagent:* on Resource:*  (read/write
# from the federated session — same scope as a logged-in console admin).

resource "aws_iam_role" "frontier_agents_federation" {
  name = "${local.name_prefix}-frontier-agents-federation"

  # max_session_duration is irrelevant here: AWS hard-caps role-chaining
  # (ECS task role -> this role) at 3600s regardless of this setting.

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = module.ecs.task_role_arn }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "frontier_agents_federation" {
  name = "frontier-agents-app-access"
  role = aws_iam_role.frontier_agents_federation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "aidevops:*",
          "securityagent:*",
        ]
        Resource = "*"
      }
    ]
  })
}

# Permission for the ECS task role to assume the federation role.
resource "aws_iam_role_policy" "ecs_task_assume_federation" {
  name = "assume-federation-role"
  role = element(split("/", module.ecs.task_role_arn), 1)

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = aws_iam_role.frontier_agents_federation.arn
      }
    ]
  })
}

# ============================================================================
# Docker Hub credentials secret (optional)
# ============================================================================
# Created when both dockerhub_username and dockerhub_token are non-empty.
# The langfuse foundation-stack buildspec reads `dockerhub-credentials` from
# Secrets Manager to authenticate docker.io pulls — doubles the anonymous
# 100/6hr cap to 200/6hr and eliminates the toomanyrequests failures we hit
# every time langfuse is deployed against a fresh control-plane account.
#
# Leaving both vars empty skips creation; anonymous pulls still work for
# low-volume scenarios. Set them in your gitignored terraform.tfvars to opt in.
resource "aws_secretsmanager_secret" "dockerhub_credentials" {
  count = var.dockerhub_username != "" && var.dockerhub_token != "" ? 1 : 0

  name        = "dockerhub-credentials"
  description = "Docker Hub PAT for langfuse module image pulls (read-only public repos)"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "dockerhub_credentials" {
  count = var.dockerhub_username != "" && var.dockerhub_token != "" ? 1 : 0

  secret_id = aws_secretsmanager_secret.dockerhub_credentials[0].id
  secret_string = jsonencode({
    username = var.dockerhub_username
    token    = var.dockerhub_token
  })
}

# ============================================================================
# AgentCore X-Ray observability prereq (account+region one-time setup)
# ============================================================================
# Foundry agentcore deploys provision aws_cloudwatch_log_delivery for traces.
# X-Ray must be pointed at CloudWatch Logs and allowed to write to the
# aws/spans log group BEFORE any agentcore deploy runs. Without these two
# settings, every agentcore deploy fails its terraform apply on the first
# null_resource.xray_trace_segment_destination.
#
# Both are account+region-scoped, idempotent on subsequent applies.
data "aws_caller_identity" "xray_prereq" {}

# X-Ray Transaction Search prereq.
#
# Two CFN-native resources do all the work:
#   1. aws_cloudwatch_log_resource_policy — grants xray.amazonaws.com permission
#      to PutLogEvents on the (eventually-AWS-created) aws/spans log group.
#   2. AWS::XRay::TransactionSearchConfig (wrapped via aws_cloudformation_stack
#      because Terraform AWS provider <6 doesn't expose it as a native resource
#      yet) — flips the trace segment destination to CloudWatchLogs AND triggers
#      AWS-side auto-creation of the aws/spans log group.
#
# We do NOT pre-create aws/spans ourselves. AWS reserves all `aws/`-prefixed
# log group names — neither the SDK (terraform aws_cloudwatch_log_group) nor
# the CLI (aws logs create-log-group) can create them; only AWS internal
# services can. The X-Ray service does this for us when TransactionSearchConfig
# enables CloudWatchLogs as the destination.
#
# Reference: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search-Cloudformation.html

resource "aws_cloudwatch_log_resource_policy" "xray_to_cwlogs" {
  count = var.enable_xray_transaction_search ? 1 : 0

  policy_name = "AWSServiceRoleForXRayLogs"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TransactionSearchXRayAccess"
      Effect    = "Allow"
      Principal = { Service = "xray.amazonaws.com" }
      Action    = "logs:PutLogEvents"
      Resource = [
        "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.xray_prereq.account_id}:log-group:aws/spans:*",
        "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.xray_prereq.account_id}:log-group:/aws/application-signals/data:*",
      ]
      Condition = {
        ArnLike = {
          "aws:SourceArn" = "arn:aws:xray:${var.aws_region}:${data.aws_caller_identity.xray_prereq.account_id}:*"
        }
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.xray_prereq.account_id
        }
      }
    }]
  })
}

resource "aws_cloudformation_stack" "xray_transaction_search" {
  count = var.enable_xray_transaction_search ? 1 : 0

  name = "${local.name_prefix}-xray-transaction-search"

  # Single resource: AWS::XRay::TransactionSearchConfig.
  # AWS handles aws/spans log group creation on its end.
  template_body = jsonencode({
    Resources = {
      XRayTransactionSearchConfig = {
        Type = "AWS::XRay::TransactionSearchConfig"
      }
    }
  })

  # Resource policy must exist before X-Ray flips the destination, otherwise
  # the AWS-side bootstrap of aws/spans cannot succeed.
  depends_on = [aws_cloudwatch_log_resource_policy.xray_to_cwlogs]
}

# Drop the legacy aws_cloudwatch_log_group.aws_spans from state on existing
# accounts WITHOUT destroying the underlying log group. Without this, accounts
# that previously deployed with the old resource (e.g. golden) would fail the
# next apply because the old resource had `prevent_destroy = true`. Requires
# Terraform 1.7+. Safe to leave in place permanently — `removed` blocks are
# no-ops once the resource is gone from state.
removed {
  from = aws_cloudwatch_log_group.aws_spans
  lifecycle {
    destroy = false
  }
}

# Same cleanup for the failed null_resource workarounds the previous fix
# introduced. They never made it into a stable apply, but in case any state
# carries them, drop without action.
removed {
  from = null_resource.aws_spans_log_group
  lifecycle {
    destroy = false
  }
}

removed {
  from = null_resource.xray_trace_segment_destination
  lifecycle {
    destroy = false
  }
}
