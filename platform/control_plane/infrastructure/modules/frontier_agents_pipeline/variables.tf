variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
}

variable "environment" {
  description = "Environment name (dev / staging / prod)."
  type        = string
}

variable "compute_type" {
  description = "CodeBuild compute type."
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "project_archives_bucket_arn" {
  description = "S3 bucket ARN holding the packaged IaC zips (read-only)."
  type        = string
}

variable "state_backend_bucket_arn" {
  description = "S3 bucket ARN used as the Terraform state backend."
  type        = string
}

variable "state_backend_bucket_name" {
  description = "S3 bucket name used as the Terraform state backend."
  type        = string
}

variable "deployments_table_arn" {
  description = "DynamoDB deployments table ARN."
  type        = string
}

variable "deployments_table_name" {
  description = "DynamoDB deployments table name."
  type        = string
}

variable "lock_table_arn" {
  description = "DynamoDB lock table ARN for Terraform state locking."
  type        = string
}

variable "tags" {
  description = "Common tags."
  type        = map(string)
  default     = {}
}
