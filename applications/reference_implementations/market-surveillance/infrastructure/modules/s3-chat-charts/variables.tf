variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for S3 bucket encryption"
  type        = string
}

variable "chart_expiration_days" {
  description = "Number of days after which chart PNGs are deleted from S3"
  type        = number
  default     = 95
}

variable "enable_versioning" {
  description = "Enable versioning for the chart bucket"
  type        = bool
  default     = true
}

variable "noncurrent_version_expiration_days" {
  description = "Number of days to retain noncurrent versions"
  type        = number
  default     = 30
}
