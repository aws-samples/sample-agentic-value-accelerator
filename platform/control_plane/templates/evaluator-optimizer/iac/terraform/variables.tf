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

variable "environment_variables" {
  description = "Environment variables passed to the agent container."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
