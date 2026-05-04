variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "enable_versioning" {
  description = "Enable versioning for the S3 bucket"
  type        = bool
  default     = true
}

variable "noncurrent_version_expiration_days" {
  description = "Number of days to retain noncurrent versions"
  type        = number
  default     = 90
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for S3 bucket encryption"
  type        = string
}
