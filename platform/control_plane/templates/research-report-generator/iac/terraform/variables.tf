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

variable "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID for RAG retrieval."
  type        = string
}

# -----------------------------------------------------------------------------
# Optional Variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "model_id" {
  description = "Bedrock model ID for IAM policy scoping and runtime environment."
  type        = string
  default     = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
