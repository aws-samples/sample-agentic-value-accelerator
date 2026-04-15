variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "ava"
}

variable "data_path" {
  description = "Path to data/samples directory. Auto-detected if empty."
  type        = string
  default     = ""
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
  description = "Use case ID for resource naming (e.g., 'B01', 'I03')"
  type        = string
  default     = "kyc_banking"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]*$", var.use_case_id))
    error_message = "use_case_id must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, and hyphens."
  }
}

variable "use_case_name" {
  description = "Use case name for application configuration (e.g., 'kyc_banking', 'customer_engagement')"
  type        = string
  default     = "kyc_banking"
}

variable "framework" {
  description = "AI agent framework identifier (e.g., langchain_langgraph)"
  type        = string

  validation {
    condition     = length(var.framework) > 0
    error_message = "The framework variable must be provided for framework-isolated deployments."
  }
}
