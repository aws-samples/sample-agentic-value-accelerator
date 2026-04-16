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
# ECR Repository Module
# ============================================================================

module "ecr" {
  source = "./modules/ecr"

  name_prefix = local.name_prefix
  environment = var.environment

  tags = var.tags
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

  # Deployments
  deployments_table_name = module.dynamodb.deployments_table_name
  deployments_table_arn  = module.dynamodb.deployments_table_arn
  deployments_bucket_arn = module.s3.deployments_bucket_arn
  state_machine_arn      = module.step_functions.state_machine_arn
  app_factory_table_name = module.dynamodb.app_factory_table_name
  app_factory_table_arn  = module.dynamodb.app_factory_table_arn
  cors_origins           = concat(["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"], ["https://${module.cloudfront.distribution_domain_name}"], var.domain_name != "" ? ["https://${var.domain_name}"] : [])

  tags = var.tags
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

  # ECS service
  ecs_service_name      = module.ecs.service_name
  ecs_security_group_id = module.ecs.security_group_id
  ecs_target_group_arn  = module.ecs.target_group_arn
  ecs_listener_arn      = module.ecs.listener_arn

  # Domain
  domain_name    = var.domain_name
  hosted_zone_id = var.hosted_zone_id

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

  # Callback URLs
  callback_urls = [
    "http://localhost:5173",
    "https://${var.domain_name}"
  ]

  logout_urls = [
    "http://localhost:5173",
    "https://${var.domain_name}"
  ]

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
