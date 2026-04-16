variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
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

variable "ecs_cluster_arn" {
  description = "ECS cluster ARN for running bootstrap tasks"
  type        = string
}

variable "ecs_task_definition_arn" {
  description = "ECS task definition ARN"
  type        = string
}

variable "ecs_subnet_ids" {
  description = "ECS subnet IDs"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "ECS security group ID"
  type        = string
}

variable "enable_pipeline" {
  description = "Enable CI/CD pipeline integration (CodeBuild, EventBridge, State Backend)"
  type        = bool
  default     = false
}

variable "codebuild_project_arn" {
  description = "CodeBuild project ARN for deployment builds"
  type        = string
  default     = ""
}

variable "eventbridge_bus_arn" {
  description = "EventBridge event bus ARN for deployment events"
  type        = string
  default     = ""
}

variable "eventbridge_bus_name" {
  description = "EventBridge event bus name for deployment events"
  type        = string
  default     = "fsi-deployment-events"
}

variable "state_backend_bucket_arn" {
  description = "S3 bucket ARN for Terraform state backend"
  type        = string
  default     = ""
}

variable "state_backend_bucket_name" {
  description = "S3 bucket name for Terraform state backend"
  type        = string
  default     = ""
}

variable "codebuild_project_name" {
  description = "CodeBuild project name for deployment builds"
  type        = string
  default     = ""
}

variable "deployments_table_name" {
  description = "Deployments DynamoDB table name (pk/sk schema used by backend)"
  type        = string
  default     = ""
}

variable "deployments_table_arn" {
  description = "Deployments DynamoDB table ARN"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
