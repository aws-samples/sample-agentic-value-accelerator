variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "ava"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "use_case_id" {
  description = "Use case ID for resource naming"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]*$", var.use_case_id))
    error_message = "use_case_id must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, and hyphens."
  }
}

variable "use_case_name" {
  description = "Use case name for application configuration"
  type        = string
}

variable "framework" {
  description = "AI agent framework identifier"
  type        = string
}

variable "agentcore_runtime_arn" {
  description = "ARN of the deployed AgentCore runtime to proxy requests to"
  type        = string
}
