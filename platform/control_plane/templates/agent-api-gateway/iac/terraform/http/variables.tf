# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-30 chars, start with lowercase letter, end with lowercase alphanumeric, and contain only lowercase alphanumeric and hyphens."
  }
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
}

variable "backend_endpoint" {
  description = "AgentCore or backend URL to proxy requests to"
  type        = string
}

# -----------------------------------------------------------------------------
# Optional Variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "cors_allow_origins" {
  description = "Allowed CORS origins"
  type        = list(string)
  default     = ["*"]
}

variable "cors_allow_methods" {
  description = "Allowed CORS HTTP methods"
  type        = list(string)
  default     = ["POST", "GET", "OPTIONS"]
}

variable "cors_allow_headers" {
  description = "Allowed CORS headers"
  type        = list(string)
  default     = ["Content-Type", "Authorization", "X-Amz-Date"]
}

variable "throttling_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "API Gateway throttling rate limit"
  type        = number
  default     = 50
}

variable "auth_type" {
  description = "Authorization type for API routes"
  type        = string
  default     = "NONE"

  validation {
    condition     = contains(["NONE", "JWT", "AWS_IAM"], var.auth_type)
    error_message = "auth_type must be one of: NONE, JWT, AWS_IAM."
  }
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID (required when auth_type = JWT)"
  type        = string
  default     = ""
}

variable "cognito_app_client_id" {
  description = "Cognito App Client ID (required when auth_type = JWT)"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Custom domain name for the API"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN (required when custom_domain is set)"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value."
  }
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
