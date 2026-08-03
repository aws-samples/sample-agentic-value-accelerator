########################################################################
# Sales Recommend — Input Variables
########################################################################

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "sales-recommend"
}

variable "deployment_id" {
  description = <<-EOT
    Short unique suffix to prevent resource name collisions in shared accounts.
    AVA injects this automatically. For local testing, leave empty (auto-generated).
  EOT
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "knowledge_base_id" {
  description = <<-EOT
    DEPRECATED / UNUSED. The Knowledge Base is now created by the
    `knowledge_base` module (OpenSearch Serverless + S3 data source), and its
    ID is wired directly into the iam and agentcore modules.
    Kept declared for backward compatibility so AVA can still inject it without
    a "value for undeclared variable" error.
  EOT
  type        = string
  default     = ""
}

variable "model_id" {
  description = "Bedrock model ID for the agent"
  type        = string
  default     = "global.anthropic.claude-sonnet-4-6"
}

variable "basic_auth_username" {
  description = "Username for CloudFront basic auth (from AVA deploy form)"
  type        = string
  default     = "admin"
}

variable "basic_auth_password" {
  description = "Password for CloudFront basic auth (from AVA deploy form)"
  type        = string
  sensitive   = true
  default     = "changeme"
}

