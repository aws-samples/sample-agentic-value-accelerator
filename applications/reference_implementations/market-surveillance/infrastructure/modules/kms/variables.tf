variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "deletion_window_in_days" {
  description = "Number of days before a KMS key is deleted after destruction"
  type        = number
  default     = 14
}

variable "enable_key_rotation" {
  description = "Enable automatic annual key rotation"
  type        = bool
  default     = true
}
