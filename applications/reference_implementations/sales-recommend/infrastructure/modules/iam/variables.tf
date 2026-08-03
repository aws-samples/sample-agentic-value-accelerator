variable "project" {
  description = "Project name used for resource naming"
  type        = string
  default     = "sales-recommend"
}

variable "aws_region" {
  description = "AWS region for ARN construction"
  type        = string
  default     = "us-east-1"
}

variable "account_id" {
  description = "AWS account ID for ARN construction"
  type        = string
}

variable "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID for retrieval permissions"
  type        = string
}

variable "ui_ecr_repo_arn" {
  description = "ARN of the UI ECR repository"
  type        = string
}
