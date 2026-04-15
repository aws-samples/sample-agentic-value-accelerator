variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "market-surveillance"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "container_uri" {
  description = "ECR container URI for AgentCore Runtime"
  type        = string
}

variable "container_arn" {
  description = "ECR container ARN for AgentCore Runtime"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for AgentCore Runtime"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs for AgentCore Runtime"
  type        = list(string)
}

variable "protocol" {
  description = "Protocol for AgentCore Runtime (HTTP, MCP, or A2A)"
  type        = string
  default     = "HTTP"

  validation {
    condition     = contains(["HTTP", "MCP", "A2A"], var.protocol)
    error_message = "Protocol must be one of: HTTP, MCP, A2A"
  }
}

variable "environment_variables" {
  description = "Environment variables for the AgentCore Runtime"
  type        = map(string)
  default     = {}
}

variable "description" {
  description = "Description of the AgentCore Runtime"
  type        = string
  default     = "Market Surveillance AI Agent Runtime"
}

variable "ssm_parameter_arns" {
  description = "List of SSM Parameter ARNs the agent can read"
  type        = list(string)
  default     = []
}

variable "s3_config_bucket" {
  description = "S3 bucket name for agent configurations"
  type        = string
  default     = ""
}

variable "s3_kms_key_arn" {
  description = "ARN of the KMS key used for S3 bucket encryption"
  type        = string
  default     = ""
}

variable "agent_runtime_id" {
  description = "Agent runtime ID for OTEL log group configuration"
  type        = string
  default     = "market-surveillance-agent"
}

variable "memory_id" {
  description = "AgentCore Memory ID to attach to the runtime (optional)"
  type        = string
  default     = ""
}

variable "enable_memory" {
  description = "Enable AgentCore Memory integration"
  type        = bool
  default     = false
}

variable "memory_role_arn" {
  description = "IAM role ARN for memory access (optional)"
  type        = string
  default     = ""
}

variable "cognito_user_pool_discovery_url" {
  description = "Cognito User Pool OIDC discovery URL for JWT authorization"
  type        = string
}

variable "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID(s) for JWT authorization (audience claim) - can be a single ID or comma-separated list"
  type        = string
}

variable "dynamodb_table_arns" {
  description = "List of DynamoDB table ARNs the agent can access"
  type        = list(string)
  default     = []
}

variable "dynamodb_kms_key_arn" {
  description = "ARN of the KMS key used for DynamoDB table encryption"
  type        = string
  default     = ""
}

variable "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing database credentials"
  type        = string
  default     = ""
}

variable "secrets_kms_key_arn" {
  description = "ARN of the KMS key used for Secrets Manager encryption"
  type        = string
  default     = ""
}

variable "code_interpreter_supported_az_ids" {
  description = "List of availability zone IDs supported by AgentCore Code Interpreter. Subnets in unsupported AZs will be excluded from the Code Interpreter network configuration."
  type        = list(string)
  default     = ["use1-az4", "use1-az1", "use1-az2"]
}

variable "guardrail_arn" {
  description = "ARN of the Bedrock Guardrail to apply during inference (optional)"
  type        = string
  default     = ""
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encrypting CloudWatch Log Group"
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 365

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch Logs retention period"
  }
}

