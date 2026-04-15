variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "cors_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
}

variable "task_cpu" {
  description = "CPU units for ECS task"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memory for ECS task in MB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 4
}

variable "container_image" {
  description = "Docker container image URL"
  type        = string
}

variable "application_catalog_table_name" {
  description = "Application Catalog DynamoDB table name"
  type        = string
}

variable "application_catalog_table_arn" {
  description = "Application Catalog DynamoDB table ARN"
  type        = string
}

variable "deployment_metadata_table_name" {
  description = "Deployment Metadata DynamoDB table name"
  type        = string
}

variable "deployment_metadata_table_arn" {
  description = "Deployment Metadata DynamoDB table ARN"
  type        = string
}

variable "project_archives_bucket_name" {
  description = "Project archives S3 bucket name"
  type        = string
}

variable "project_archives_bucket_arn" {
  description = "Project archives S3 bucket ARN"
  type        = string
}

variable "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  type        = string
}

variable "frontend_bucket_arn" {
  description = "Frontend S3 bucket ARN"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}

variable "deployments_table_name" {
  description = "Name of the deployments DynamoDB table"
  type        = string
}

variable "deployments_table_arn" {
  description = "ARN of the deployments DynamoDB table"
  type        = string
}

variable "app_factory_table_name" {
  description = "Name of the App Factory DynamoDB table"
  type        = string
}

variable "app_factory_table_arn" {
  description = "ARN of the App Factory DynamoDB table"
  type        = string
}

variable "deployments_bucket_arn" {
  description = "ARN of the deployments S3 bucket"
  type        = string
}

variable "state_machine_arn" {
  description = "Step Functions state machine ARN for deployment pipeline"
  type        = string
  default     = ""
}
