variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "my-tool-agent"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "llm_model" {
  description = "LLM model identifier"
  type        = string
  default     = "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

variable "max_iterations" {
  description = "Maximum tool invocation iterations"
  type        = number
  default     = 10
}

variable "langfuse_host" {
  description = "Langfuse server endpoint"
  type        = string
  default     = "https://cloud.langfuse.com"
}

variable "langfuse_secret_name" {
  description = "Secrets Manager secret name containing Langfuse API keys"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}
