variable "aws_region" {
  description = "AWS region for deployment (should match infra module)"
  type        = string
  default     = "us-east-1"
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

variable "agent_name" {
  description = "Name of the AgentCore runtime (must match pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}). If not provided, derived from project_name and use_case_id."
  type        = string
  default     = ""
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for the agent"
  type        = string
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "image_tag" {
  description = "Docker image tag to deploy (e.g., langgraph-latest, strands-latest)"
  type        = string
  default     = "langgraph-latest"
}

variable "framework" {
  description = "AI agent framework identifier (e.g., langchain_langgraph)"
  type        = string

  validation {
    condition     = length(var.framework) > 0
    error_message = "The framework variable must be provided for framework-isolated deployments."
  }
}
