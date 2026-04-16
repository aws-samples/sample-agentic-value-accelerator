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

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (optional)"
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
