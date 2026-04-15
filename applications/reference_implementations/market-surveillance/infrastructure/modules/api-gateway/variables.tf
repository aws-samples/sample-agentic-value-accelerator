variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "stage_name" {
  description = "API Gateway stage name (defaults to environment)"
  type        = string
  default     = ""
}

variable "throttling_rate_limit" {
  description = "API Gateway throttling rate limit (requests per second)"
  type        = number
  default     = 100
}

variable "throttling_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 50
}

variable "enable_logging" {
  description = "Enable CloudWatch logging for API Gateway"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain API Gateway logs"
  type        = number
  default     = 365
}

variable "alert_api_lambda_invoke_arn" {
  description = "Invoke ARN of the Alert API Lambda function"
  type        = string
  default     = ""
}

variable "data_api_lambda_invoke_arn" {
  description = "Invoke ARN of the Data API Lambda function"
  type        = string
  default     = ""
}

variable "msp_api_lambda_invoke_arn" {
  description = "Invoke ARN of the Risk Analyst API Lambda function"
  type        = string
  default     = ""
}

variable "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool for API authorization"
  type        = string
  default     = ""
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encrypting CloudWatch Log Group"
  type        = string
  default     = ""
}
