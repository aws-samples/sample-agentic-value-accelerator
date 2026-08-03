variable "project_name" {
  description = "Project name used in resource naming. Must be lowercase alphanumeric with hyphens."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-30 characters, lowercase alphanumeric and hyphens, starting with a letter."
  }
}

variable "aws_region" {
  description = "AWS region for deployment."
  type        = string
}

variable "container_image_uri" {
  description = "ECR image URI for the agent container."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "model_id" {
  description = "Bedrock model ID for IAM policy scoping."
  type        = string
  default     = "anthropic.claude-sonnet-4-5-20250929"
}

variable "event_bucket_name" {
  description = "S3 bucket name the agent reads event source objects from. Leave empty to skip S3 policy."
  type        = string
  default     = ""
}

variable "enable_cross_region_inference" {
  description = "Allow cross-region model inference via inference profiles."
  type        = bool
  default     = false
}

variable "network_mode" {
  description = "Network mode for the runtime. PUBLIC or VPC."
  type        = string
  default     = "PUBLIC"

  validation {
    condition     = contains(["PUBLIC", "VPC"], var.network_mode)
    error_message = "network_mode must be PUBLIC or VPC."
  }
}

variable "vpc_subnet_ids" {
  description = "Subnet IDs for VPC mode."
  type        = list(string)
  default     = []
}

variable "vpc_security_group_ids" {
  description = "Security group IDs for VPC mode."
  type        = list(string)
  default     = []
}

variable "environment_variables" {
  description = "Environment variables passed to the agent container."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30

  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value."
  }
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
