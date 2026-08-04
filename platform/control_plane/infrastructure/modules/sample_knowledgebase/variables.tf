variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "region" {
  type        = string
  description = "AWS region"
}

variable "account_id" {
  type        = string
  description = "AWS account ID"
}

variable "embedding_model_id" {
  type        = string
  description = "Bedrock embedding model ID"
  default     = "amazon.titan-embed-text-v2:0"
}

variable "embedding_dimensions" {
  type        = number
  description = "Embedding vector dimensions"
  default     = 1024
}

variable "chunking_strategy" {
  type        = string
  description = "Document chunking strategy"
  default     = "FIXED_SIZE"
}

variable "chunk_max_tokens" {
  type        = number
  description = "Max tokens per chunk"
  default     = 512
}

variable "chunk_overlap_percentage" {
  type        = number
  description = "Overlap percentage between chunks"
  default     = 20
}
