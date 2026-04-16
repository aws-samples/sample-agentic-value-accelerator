variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "my-rag-app"
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

variable "vector_store" {
  description = "Vector store backend"
  type        = string
  default     = "opensearch"
}

variable "embedding_model" {
  description = "Embedding model for vectors"
  type        = string
  default     = "amazon.titan-embed-text-v1"
}

variable "chunk_size" {
  description = "Document chunk size"
  type        = number
  default     = 1000
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}

variable "llm_model" {
  description = "LLM model for the agent"
  type        = string
  default     = "anthropic.claude-sonnet-4-20250514-v1:0"
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
