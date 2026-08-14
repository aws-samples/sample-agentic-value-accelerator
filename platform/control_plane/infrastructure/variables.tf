variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "control-plane"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "ava"
}

# VPC Configuration (optional - use existing or create new)
variable "vpc_id" {
  description = "Existing VPC ID (leave empty to create new VPC)"
  type        = string
  default     = ""
}

variable "public_subnet_ids" {
  description = "Existing public subnet IDs (comma-separated)"
  type        = list(string)
  default     = []
}

variable "private_subnet_ids" {
  description = "Existing private subnet IDs (comma-separated)"
  type        = list(string)
  default     = []
}

variable "create_vpc" {
  description = "Whether to create a new VPC (false if using existing)"
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  description = "CIDR block for VPC (only used if creating new VPC)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# Domain Configuration
variable "domain_name" {
  description = "Domain name for Control Plane"
  type        = string
  default     = "ava-platform.example.com"
}

variable "api_prefix" {
  description = "Subdomain prefix for the API Gateway custom domain (<api_prefix>.<domain_name>). Defaults to \"api\"; override to sidestep global API GW domain-name conflicts. Set via -var or TF_VAR_api_prefix; deploy-full.sh reads API_PREFIX from repo-root .env."
  type        = string
  default     = "api"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (optional)"
  type        = string
  default     = ""
}

variable "cloudfront_acm_certificate_arn" {
  description = "ACM certificate ARN for the apex domain used by CloudFront. Must be in us-east-1. Provisioned externally by scripts/acm.sh; leave empty to keep CloudFront on its default *.cloudfront.net certificate."
  type        = string
  default     = ""
}

variable "api_acm_certificate_arn" {
  description = "ACM certificate ARN for api.<domain_name> used by API Gateway. Must be in the CP's own region. Provisioned externally by scripts/acm.sh; leave empty to skip the API Gateway custom domain."
  type        = string
  default     = ""
}

# ECS Configuration
variable "ecs_task_cpu" {
  description = "CPU units for ECS task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Memory for ECS task in MB"
  type        = number
  default     = 1024
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_min_capacity" {
  description = "Minimum number of ECS tasks (auto-scaling)"
  type        = number
  default     = 1
}

variable "ecs_max_capacity" {
  description = "Maximum number of ECS tasks (auto-scaling)"
  type        = number
  default     = 4
}

variable "container_image" {
  description = "Docker container image URL (ECR)"
  type        = string
  default     = "" # Will be set to ECR URL after first build
}

# S3 Configuration
variable "project_archive_retention_days" {
  description = "Number of days to retain project archives in S3"
  type        = number
  default     = 7
}

# Cognito Configuration
variable "cognito_user_pool_name" {
  description = "Cognito User Pool name"
  type        = string
  default     = "control-plane-users"
}

variable "cognito_enable_mfa" {
  description = "Enable MFA for Cognito"
  type        = bool
  default     = false
}

# CodeBuild Configuration
variable "codebuild_compute_type" {
  description = "CodeBuild compute type for deployment builds"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "codebuild_image" {
  description = "Docker image URI for CodeBuild (leave empty to use ECR default)"
  type        = string
  default     = ""
}

# EventBridge Configuration
variable "eventbridge_bus_name" {
  description = "EventBridge event bus name for deployment events"
  type        = string
  default     = "fsi-deployment-events"
}

# State Backend Configuration
variable "state_backend_bucket_name_prefix" {
  description = "Prefix for the Terraform state backend S3 bucket name (leave empty for auto-generated)"
  type        = string
  default     = ""
}

variable "state_backend_lock_table_name" {
  description = "Name for the Terraform state lock DynamoDB table (leave empty for auto-generated)"
  type        = string
  default     = ""
}

# Tags
variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project   = "ava"
    Component = "control-plane"
    ManagedBy = "terraform"
  }
}

variable "owner" {
  description = "Owner tag"
  type        = string
  default     = "platform-team"
}

variable "cost_center" {
  description = "Cost center tag"
  type        = string
  default     = "ai-platform"
}

# CodeCommit Configuration
variable "enable_codecommit" {
  description = "Enable CodeCommit repository for CI/CD source control"
  type        = bool
  default     = false
}

variable "codecommit_repository_name" {
  description = "CodeCommit repository name (leave empty for auto-generated)"
  type        = string
  default     = ""
}

variable "codecommit_repository_description" {
  description = "Description for the CodeCommit repository"
  type        = string
  default     = "AVA Control Plane CI/CD Source Repository"
}

variable "codecommit_enable_push_trigger" {
  description = "Enable automatic deployment on git push to CodeCommit"
  type        = bool
  default     = true
}

variable "codecommit_enable_pr_trigger" {
  description = "Enable automatic deployment on pull request merge in CodeCommit"
  type        = bool
  default     = true
}

variable "codecommit_trigger_branches" {
  description = "List of branch names that trigger deployments from CodeCommit"
  type        = list(string)
  default     = ["main", "develop"]
}

variable "codecommit_enable_notifications" {
  description = "Enable SNS notifications for CodeCommit events"
  type        = bool
  default     = false
}

# --- Sample Data Lake ---

variable "enable_sample_datalake" {
  description = "Deploy sample FSI data lake (Glue + Iceberg + Athena) for Knowledge feature demo"
  type        = bool
  default     = true
}

variable "lf_admin_role_arn" {
  description = "IAM role ARN to register as Lake Formation admin (required when enable_sample_datalake = true)"
  type        = string
  default     = ""
}

variable "enable_sample_knowledgebase" {
  description = "Deploy sample Bedrock Knowledge Base for Knowledge feature demo"
  type        = bool
  default     = false
}

# X-Ray TransactionSearchConfig is a singleton per account+region. Some
# accounts already have it enabled outside
# Terraform via the prereq script. Setting this to false skips creating
# the wrapper CFN stack + log resource policy on those accounts so the
# apply doesn't fail with AlreadyExists.
variable "enable_xray_transaction_search" {
  description = "Create the X-Ray TransactionSearch CFN stack + log resource policy. Set false on accounts where TS is already configured."
  type        = bool
  default     = true
}

# Optional: extra CloudFront distribution ARNs that should also be allowed
# OAC read access to the frontend S3 bucket. Used when a separate public
# alias CloudFront distribution (mapped to a custom demo domain) is
# managed outside this terraform state.
variable "frontend_extra_cloudfront_arns" {
  description = "Additional CloudFront distribution ARNs to grant s3:GetObject on the frontend bucket."
  type        = list(string)
  default     = []
}
# ============================================================================
# Docker Hub credentials (optional, used by langfuse foundation-stack deploys)
# ============================================================================
# The langfuse module pulls 3 images (langfuse, langfuse-worker, clickhouse)
# from docker.io to mirror into ECR. Anonymous pulls hit the 100/6hr cap fast,
# so the deploy script reads `dockerhub-credentials` from Secrets Manager and
# authenticates if it exists. Leave both empty to skip — the script falls back
# to anonymous pulls (which work for low-volume but break under demo traffic).

variable "dockerhub_username" {
  description = "Docker Hub username (optional). Used by langfuse deploys to authenticate to docker.io and double the pull rate limit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "dockerhub_token" {
  description = "Docker Hub personal access token (optional). Pair with dockerhub_username. Use a read-only Public Repos PAT — that's all the langfuse pulls need."
  type        = string
  default     = ""
  sensitive   = true
}

# ============================================================================
# Demo user seeding (optional, off by default)
# ============================================================================
# When seed_demo_users = true, the cognito module creates admin@example.com
# (admin group) and demo@example.com (viewer group) with permanent passwords.
# Convenience for fresh stamps so the first login works without a manual
# cognito-idp admin-create-user call. Leave off in production stamps.

variable "seed_demo_users" {
  description = "Create demo admin + viewer users in Cognito (admin@example.com / demo@example.com). Off by default."
  type        = bool
  default     = false
}

variable "demo_admin_password" {
  description = "Permanent password for the seeded admin@example.com user. Used only when seed_demo_users=true."
  type        = string
  default     = "AdminPass123!@"
  sensitive   = true
}

variable "demo_viewer_password" {
  description = "Permanent password for the seeded demo@example.com user. Used only when seed_demo_users=true."
  type        = string
  default     = "DemoViewer123!@#"
  sensitive   = true
}

# Service-approval AgentCore Runtime ARN. Source:
# applications/service_approval_v2/runtime/ terraform output. Capture
# from there and pass via -var or tfvars; the backend's create_run
# invokes this directly.
variable "service_approval_agent_runtime_arn" {
  description = "AgentCore Runtime ARN for service-approval Path B"
  type        = string
  default     = ""
}

# AWS Agent Registry values are sourced from `module.agent_registry`
# (see infrastructure/modules/agent_registry/). No top-level variables here.
