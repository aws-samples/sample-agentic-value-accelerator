variable "project_name" {
  description = "Project name used as prefix for all resources"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-30 characters, lowercase alphanumeric and hyphens, starting with a letter."
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "embedding_model_id" {
  description = "Bedrock embedding model ID"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "chunking_strategy" {
  description = "Document chunking strategy"
  type        = string
  default     = "FIXED_SIZE"

  validation {
    condition     = contains(["FIXED_SIZE", "SEMANTIC", "HIERARCHICAL", "NONE"], var.chunking_strategy)
    error_message = "chunking_strategy must be one of: FIXED_SIZE, SEMANTIC, HIERARCHICAL, NONE"
  }
}

variable "chunk_max_tokens" {
  description = "Maximum tokens per chunk (used with FIXED_SIZE strategy)"
  type        = number
  default     = 512
}

variable "chunk_overlap_percentage" {
  description = "Overlap percentage between chunks (used with FIXED_SIZE strategy)"
  type        = number
  default     = 20
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
