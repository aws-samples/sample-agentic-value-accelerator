# =============================================================================
# Required Variables
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "Project name must be 3-30 chars, start with lowercase letter, end with lowercase alphanumeric, and contain only lowercase alphanumeric and hyphens."
  }
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
}

variable "backend_endpoint" {
  description = "Backend URL for the $default route (agent message handler)"
  type        = string
}

# =============================================================================
# Optional Variables
# =============================================================================

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "route_selection_expression" {
  description = "Route selection expression for the WebSocket API"
  type        = string
  default     = "$request.body.action"
}

variable "throttling_burst_limit" {
  description = "Throttling burst limit for the default stage"
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "Throttling rate limit for the default stage"
  type        = number
  default     = 50
}

variable "custom_domain" {
  description = "Custom domain name for the WebSocket API (leave empty to skip)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the custom domain (required if custom_domain is set)"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "Log retention must be a valid CloudWatch retention value."
  }
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
