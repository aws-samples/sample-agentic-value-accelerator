# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "Project name must be 3-30 chars, start with lowercase letter, end with lowercase alphanumeric, and contain only lowercase alphanumeric and hyphens."
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
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
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "mfa_configuration" {
  description = "MFA configuration for the user pool"
  type        = string
  default     = "OFF"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "MFA configuration must be one of: OFF, OPTIONAL, ON."
  }
}

variable "password_min_length" {
  description = "Minimum password length"
  type        = number
  default     = 12

  validation {
    condition     = var.password_min_length >= 8 && var.password_min_length <= 99
    error_message = "Password minimum length must be between 8 and 99."
  }
}

variable "allow_self_signup" {
  description = "Whether users can sign up themselves"
  type        = bool
  default     = false
}

variable "callback_urls" {
  description = "Allowed callback URLs for the web client"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "logout_urls" {
  description = "Allowed logout URLs for the web client"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "domain_prefix" {
  description = "Cognito hosted UI domain prefix. If empty, uses project_name-environment."
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Custom domain for Cognito hosted UI. Requires certificate_arn."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for custom domain"
  type        = string
  default     = ""
}

variable "resource_server_identifier" {
  description = "Identifier for the resource server"
  type        = string
  default     = "api"
}

variable "resource_server_scopes" {
  description = "OAuth2 scopes for the resource server"
  type = list(object({
    name        = string
    description = string
  }))
  default = [
    { name = "invoke", description = "Invoke agents" },
    { name = "manage", description = "Manage agents and deployments" },
    { name = "read", description = "Read agent metadata" }
  ]
}

variable "deletion_protection" {
  description = "Deletion protection for the user pool"
  type        = string
  default     = "INACTIVE"

  validation {
    condition     = contains(["ACTIVE", "INACTIVE"], var.deletion_protection)
    error_message = "Deletion protection must be one of: ACTIVE, INACTIVE."
  }
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
