variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "compute_type" {
  description = "CodeBuild compute type (BUILD_GENERAL1_SMALL, BUILD_GENERAL1_MEDIUM, BUILD_GENERAL1_LARGE)"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "image" {
  description = "Docker image URI for CodeBuild environment"
  type        = string
}

variable "project_archives_bucket_arn" {
  description = "S3 bucket ARN for project archives (read access)"
  type        = string
}

variable "state_backend_bucket_arn" {
  description = "S3 bucket ARN for Terraform state backend (read/write)"
  type        = string
}

variable "deployment_metadata_table_arn" {
  description = "DynamoDB table ARN for deployment metadata"
  type        = string
}

variable "deployments_table_arn" {
  description = "DynamoDB table ARN for deployments"
  type        = string
}

variable "lock_table_arn" {
  description = "DynamoDB lock table ARN for Terraform state locking"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
