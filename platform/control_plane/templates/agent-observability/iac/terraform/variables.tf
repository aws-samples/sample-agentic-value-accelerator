variable "project_name" {
  type        = string
  description = "Project name prefix for all resources"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-30 characters, lowercase alphanumeric and hyphens, starting with a letter."
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
}

variable "environment" {
  type        = string
  default     = "dev"
  description = "Environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID for deployment"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for ECS, RDS, Redis"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs for ALB"
}

variable "langfuse_admin_email" {
  type        = string
  description = "Admin email for initial Langfuse setup"
}

variable "langfuse_image_tag" {
  type        = string
  default     = "2"
  description = "Langfuse Docker image tag"
}

variable "db_min_capacity" {
  type        = number
  default     = 0.5
  description = "Aurora Serverless v2 minimum ACU"
}

variable "db_max_capacity" {
  type        = number
  default     = 4
  description = "Aurora Serverless v2 maximum ACU"
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN for HTTPS. If empty, ALB uses HTTP only (not recommended for production)."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional resource tags"
}
