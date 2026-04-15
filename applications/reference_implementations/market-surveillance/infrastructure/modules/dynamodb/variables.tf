variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = true
}

variable "billing_mode" {
  description = "DynamoDB billing mode (PROVISIONED or PAY_PER_REQUEST)"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for production environments"
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "ARN of the KMS CMK for DynamoDB server-side encryption"
  type        = string
  default     = null
}
