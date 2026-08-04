# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

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

# -----------------------------------------------------------------------------
# Memory Configuration
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "event_expiry_duration" {
  description = "Memory event expiry in days (7-365)."
  type        = number
  default     = 30

  validation {
    condition     = var.event_expiry_duration >= 7 && var.event_expiry_duration <= 365
    error_message = "event_expiry_duration must be between 7 and 365 days."
  }
}

variable "memory_strategy_type" {
  description = "Strategy type for memory extraction."
  type        = string
  default     = "SEMANTIC"

  validation {
    condition     = contains(["SEMANTIC", "SUMMARIZATION", "USER_PREFERENCE", "EPISODIC"], var.memory_strategy_type)
    error_message = "memory_strategy_type must be one of: SEMANTIC, SUMMARIZATION, USER_PREFERENCE, EPISODIC."
  }
}

variable "namespaces" {
  description = "Namespaces for the memory strategy."
  type        = list(string)
  default     = ["default"]
}

# -----------------------------------------------------------------------------
# Tags
# -----------------------------------------------------------------------------

variable "tags" {
  description = "Additional tags applied to all resources. Merged with default provider tags."
  type        = map(string)
  default     = {}
}
