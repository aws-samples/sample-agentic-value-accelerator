variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "dynamodb_table_arns" {
  description = "List of DynamoDB table ARNs for Lambda access"
  type        = list(string)
  default     = []
}

variable "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing database credentials"
  type        = string
  default     = ""
}

variable "db_secret_name" {
  description = "Name of the Secrets Manager secret containing database credentials"
  type        = string
  default     = ""
}

variable "conversations_table_name" {
  description = "Name of the alert conversations DynamoDB table"
  type        = string
  default     = ""
}

variable "summaries_table_name" {
  description = "Name of the alert summaries DynamoDB table"
  type        = string
  default     = ""
}

# VPC Configuration
variable "vpc_subnet_ids" {
  description = "List of VPC subnet IDs for Lambda deployment"
  type        = list(string)
  default     = []
}

variable "vpc_security_group_ids" {
  description = "List of VPC security group IDs for Lambda"
  type        = list(string)
  default     = []
}

variable "enable_vpc" {
  description = "Enable VPC configuration for Lambda"
  type        = bool
  default     = false
}

# Provisioned Concurrency Configuration
variable "enable_provisioned_concurrency" {
  description = "Enable provisioned concurrency to avoid cold starts"
  type        = bool
  default     = true
}

variable "alert_api_provisioned_concurrency" {
  description = "Number of provisioned concurrent executions for Alert API Lambda"
  type        = number
  default     = 1
}

variable "alert_mcp_provisioned_concurrency" {
  description = "Number of provisioned concurrent executions for Alert MCP Lambda"
  type        = number
  default     = 1
}

variable "data_api_provisioned_concurrency" {
  description = "Number of provisioned concurrent executions for Data API Lambda"
  type        = number
  default     = 1
}

# AgentCore Runtime Configuration
variable "agentcore_runtime_endpoint" {
  description = "AgentCore Runtime invocation endpoint URL"
  type        = string
  default     = ""
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encrypting Lambda environment variables at rest"
  type        = string
  default     = null
}

variable "dynamodb_kms_key_arn" {
  description = "ARN of the KMS key used to encrypt DynamoDB tables accessed by Lambda"
  type        = string
  default     = null
}

variable "msp_conversations_table_name" {
  description = "Name of the Risk Analyst conversations DynamoDB table"
  type        = string
  default     = ""
}

variable "s3_msp_plots_bucket_name" {
  description = "Name of the S3 bucket for Risk Analyst plot images"
  type        = string
  default     = ""
}

variable "s3_msp_plots_bucket_arn" {
  description = "ARN of the S3 bucket for Risk Analyst plot images"
  type        = string
  default     = ""
}

variable "s3_kms_key_arn" {
  description = "ARN of the KMS key used for S3 bucket encryption"
  type        = string
  default     = null
}
