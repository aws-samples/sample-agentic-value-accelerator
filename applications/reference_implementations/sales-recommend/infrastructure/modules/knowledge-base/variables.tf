###############################################################################
# Knowledge Base Module — Input Variables
###############################################################################

variable "project" {
  description = "Project name (with deployment suffix) used for resource naming"
  type        = string
}

variable "aws_region" {
  description = "AWS region for the Knowledge Base and OpenSearch Serverless collection"
  type        = string
  default     = "us-east-1"
}

variable "embedding_model_id" {
  description = "Bedrock embedding model ID used to generate vectors"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "vector_dimension" {
  description = "Dimension of the vectors produced by the embedding model (Titan v2 = 1024)"
  type        = number
  default     = 1024
}

variable "force_destroy_bucket" {
  description = "Allow the data-source S3 bucket to be destroyed even if it contains objects"
  type        = bool
  default     = true
}
