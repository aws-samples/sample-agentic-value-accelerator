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

# ------------------------------------------------------------------------------
# Cognito App Client ID (audience) — passed to the dual-token Lambda authorizer
# so it can verify the `aud` claim on Cognito id_tokens. Empty disables the
# audience check (any client from the pool passes). The pool ID is derived
# from the ARN so it doesn't need a separate variable.
# ------------------------------------------------------------------------------
variable "cognito_app_client_id" {
  description = "Cognito App Client ID — expected `aud` claim on id_tokens. Empty disables audience check."
  type        = string
  default     = ""
}

# ------------------------------------------------------------------------------
# AVA FSI SSO (optional) — when set, the Lambda authorizer also accepts
# HMAC-signed handoff tokens minted by the AVA control plane. Empty means
# the authorizer only accepts Cognito tokens (standalone-mode behavior).
# When BOTH this and cognito_user_pool_arn are empty, the authorizer denies
# every request (fail-closed).
# ------------------------------------------------------------------------------
variable "fsi_app_signing_secret" {
  description = "HMAC secret shared with the AVA control plane. Empty disables the AVA SSO branch of the authorizer."
  type        = string
  default     = ""
  sensitive   = true
}
