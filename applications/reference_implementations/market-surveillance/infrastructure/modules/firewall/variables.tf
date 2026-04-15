variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "rate_limit" {
  description = "Rate limit for requests per 5 minutes"
  type        = number
  default     = 2000
}

variable "enable_cloudwatch_metrics" {
  description = "Enable CloudWatch metrics for WAF"
  type        = bool
  default     = true
}

variable "scope" {
  description = "WAF scope (CLOUDFRONT or REGIONAL)"
  type        = string
  default     = "CLOUDFRONT"

  validation {
    condition     = contains(["CLOUDFRONT", "REGIONAL"], var.scope)
    error_message = "Scope must be either CLOUDFRONT or REGIONAL."
  }
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encrypting CloudWatch Log Group"
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "Number of days to retain WAF logs (minimum 365 for compliance)"
  type        = number
  default     = 365
}
