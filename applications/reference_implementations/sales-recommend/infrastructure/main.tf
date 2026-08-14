########################################################################
# Sales Recommend — Root Terraform Configuration
########################################################################

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.17.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    opensearch = {
      source  = "opensearch-project/opensearch"
      version = ">= 2.2.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Partial backend config — AVA's CodeBuild pipeline injects the bucket
  # and DynamoDB table at runtime via:
  #   terraform init -backend-config="bucket=$STATE_BUCKET" \
  #                  -backend-config="dynamodb_table=$LOCK_TABLE"
  backend "s3" {
    key     = "sales-recommend/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "sales-recommend"
      Environment = var.environment
      ManagedBy   = "terraform"
      AVA         = "true"
    }
  }
}

# ---------- Modules ----------

# Generate a short random suffix if deployment_id is not provided.
# This ensures resource names are unique even in shared accounts.
resource "random_id" "suffix" {
  byte_length = 4
}

# Secret shared between CloudFront and ALB to prevent direct ALB access
resource "random_password" "origin_secret" {
  length  = 32
  special = false
}

locals {
  # AVA injects a full 36-char UUID as deployment_id, which pushes resource
  # names past their limits (IAM role names cap at 64 chars; OpenSearch
  # Serverless security-policy names cap at 32). Derive a short, stable 8-char
  # suffix (hyphens stripped) for resource naming. Per-deployment state
  # isolation is unaffected — deploy.sh keys the Terraform state on the full
  # deployment_id, so parallel deploys never collide.
  deploy_id = var.deployment_id != "" ? substr(replace(var.deployment_id, "-", ""), 0, 8) : random_id.suffix.hex
  # All child modules use this as the project prefix
  project = "${var.project_name}-${local.deploy_id}"
}

module "networking" {
  source      = "./modules/networking"
  project     = local.project
  environment = var.environment
  aws_region  = var.aws_region
}

module "ecr" {
  source  = "./modules/ecr"
  project = local.project
}

module "knowledge_base" {
  source     = "./modules/knowledge-base"
  project    = local.project
  aws_region = var.aws_region
}

module "wiki_generator" {
  source             = "./modules/wiki-generator"
  project            = local.project
  aws_region         = var.aws_region
  account_id         = data.aws_caller_identity.current.account_id
  model_id           = var.model_id
  kb_data_bucket     = module.knowledge_base.data_source_bucket_name
  kb_data_bucket_arn = module.knowledge_base.data_source_bucket_arn
  knowledge_base_id  = module.knowledge_base.knowledge_base_id
  knowledge_base_arn = module.knowledge_base.knowledge_base_arn
  data_source_id     = module.knowledge_base.data_source_id

  wiki_agent_source_dir = "${path.root}/../wiki-agent"
  repos_file_path       = "${path.root}/repos.txt"
}

module "iam" {
  source            = "./modules/iam"
  project           = local.project
  aws_region        = var.aws_region
  account_id        = data.aws_caller_identity.current.account_id
  knowledge_base_id = module.knowledge_base.knowledge_base_id
  # agent_runtime_arn removed — uses wildcard pattern scoped to project name
  ui_ecr_repo_arn = module.ecr.ui_repo_arn
}

module "ssm" {
  source        = "./modules/ssm"
  project       = local.project
  auth_username = var.basic_auth_username
  auth_password = var.basic_auth_password
}

module "agentcore" {
  source             = "./modules/agentcore"
  project            = local.project
  environment        = var.environment
  aws_region         = var.aws_region
  knowledge_base_id  = module.knowledge_base.knowledge_base_id
  model_id           = var.model_id
  code_s3_bucket     = "bedrock-agentcore-codebuild-sources-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  code_s3_prefix     = "${local.project}/deployment.zip"
  execution_role_arn = module.iam.agentcore_execution_role_arn
}

module "ecs" {
  source                  = "./modules/ecs"
  project                 = local.project
  environment             = var.environment
  aws_region              = var.aws_region
  vpc_id                  = module.networking.vpc_id
  private_subnet_ids      = module.networking.ecs_subnet_ids
  public_subnet_ids       = module.networking.public_subnet_ids
  ui_image_uri            = "${module.ecr.ui_repo_url}:latest"
  task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn           = module.iam.ecs_task_role_arn
  agent_runtime_arn       = module.agentcore.agent_runtime_arn
  alb_security_group_id   = module.networking.alb_security_group_id
  ecs_security_group_id   = module.networking.ecs_security_group_id
  origin_secret           = random_password.origin_secret.result
}

module "cloudfront" {
  source        = "./modules/cloudfront"
  project       = local.project
  alb_dns_name  = module.ecs.alb_dns_name
  auth_username = module.ssm.auth_username
  auth_password = module.ssm.auth_password
  origin_secret = random_password.origin_secret.result

  # AVA FSI SSO — when the AVA control-plane CodeBuild deploy exports
  # these env vars, the CloudFront Function switches from HTTP Basic
  # Auth to AVA-signed HMAC token verification. Same trust anchor as
  # case-management/jwt_auth_function.js and merchant-onboarding.
  # Empty strings (standalone laptop deploy) keep the legacy
  # basic-auth path so ./deploy.sh from a laptop still works.
  fsi_app_signing_secret = var.fsi_app_signing_secret
  ava_ui_login_url       = var.ava_ui_login_url
}

module "observability" {
  source  = "./modules/observability"
  project = local.project
}

# ---------- Data Sources ----------

data "aws_caller_identity" "current" {}
