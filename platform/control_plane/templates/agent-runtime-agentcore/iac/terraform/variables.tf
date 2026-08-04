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

variable "container_image_uri" {
  description = "ECR image URI for the agent container (e.g., 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest)."
  type        = string
}

# -----------------------------------------------------------------------------
# Runtime Configuration
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

variable "runtime_description" {
  description = "Description for the AgentCore runtime."
  type        = string
  default     = ""
}

variable "environment_variables" {
  description = "Environment variables passed to the agent container."
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "network_mode" {
  description = "Network mode for the runtime. PUBLIC for internet access, VPC for private networking."
  type        = string
  default     = "PUBLIC"

  validation {
    condition     = contains(["PUBLIC", "VPC"], var.network_mode)
    error_message = "network_mode must be PUBLIC or VPC."
  }
}

variable "vpc_subnet_ids" {
  description = "Subnet IDs for VPC mode. Required when network_mode is VPC."
  type        = list(string)
  default     = []
}

variable "vpc_security_group_ids" {
  description = "Security group IDs for VPC mode. Required when network_mode is VPC."
  type        = list(string)
  default     = []
}

# -----------------------------------------------------------------------------
# Model Access
# -----------------------------------------------------------------------------

variable "model_id" {
  description = <<-EOT
    Informational default Bedrock model ID for this runtime. The IAM policy now
    allows invoking any foundation model (arn:aws:bedrock:*::foundation-model/*) so
    that cross-region inference profiles work, so this value is no longer used for
    IAM scoping — pass the actual model to the container via environment_variables.
  EOT
  type        = string
  default     = "anthropic.claude-sonnet-4-5-20250929"
}

# -----------------------------------------------------------------------------
# Protocol & Lifecycle
# -----------------------------------------------------------------------------

variable "server_protocol" {
  description = "Server protocol for the runtime. HTTP for REST APIs, MCP for Model Context Protocol, A2A for agent-to-agent."
  type        = string
  default     = "HTTP"

  validation {
    condition     = contains(["HTTP", "MCP", "A2A"], var.server_protocol)
    error_message = "server_protocol must be HTTP, MCP, or A2A."
  }
}

variable "idle_session_timeout" {
  description = "Seconds before an idle session is terminated. Default 300 (5 minutes)."
  type        = number
  default     = 300
}

variable "max_session_lifetime" {
  description = "Maximum session lifetime in seconds. Default 3600 (1 hour)."
  type        = number
  default     = 3600
}

# -----------------------------------------------------------------------------
# Observability
# -----------------------------------------------------------------------------

variable "log_retention_days" {
  description = "CloudWatch log retention in days for the vended log delivery destination. 0 means never expire."
  type        = number
  default     = 30

  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value."
  }
}

# -----------------------------------------------------------------------------
# Tags
# -----------------------------------------------------------------------------

variable "tags" {
  description = "Additional tags applied to all resources. Merged with default provider tags."
  type        = map(string)
  default     = {}
}
