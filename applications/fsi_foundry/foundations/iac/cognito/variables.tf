# =============================================================================
# Variables for Cognito Infrastructure
# =============================================================================

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

variable "agentcore_runtime_arn" {
  description = "ARN of the AgentCore runtime to allow invocation (leave empty to allow all)"
  type        = string
  default     = ""
}
