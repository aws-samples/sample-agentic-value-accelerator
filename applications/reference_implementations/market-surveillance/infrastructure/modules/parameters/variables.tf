variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "gateway_url" {
  description = "AgentCore Gateway URL"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  type        = string
}

variable "cognito_client_secret" {
  description = "Cognito User Pool Client Secret"
  type        = string
  sensitive   = true
}

variable "kms_key_arn" {
  description = "ARN of the KMS CMK for encrypting SecureString SSM parameters"
  type        = string
}

variable "cognito_oauth_url" {
  description = "Cognito OAuth URL (hosted UI URL)"
  type        = string
  default     = null
}

variable "agentcore_runtime_endpoint" {
  description = "AgentCore Runtime endpoint URL"
  type        = string
  default     = null
}
