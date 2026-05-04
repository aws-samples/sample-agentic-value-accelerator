variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN used to encrypt SecureString parameters"
  type        = string
}

variable "string_parameters" {
  description = "Map of parameter keys to string values (key format: category/name)"
  type        = map(string)
  default     = {}
}

variable "secure_string_keys" {
  description = "List of parameter keys for SecureString parameters (non-sensitive key names)"
  type        = set(string)
  default     = []
}

variable "secure_string_values" {
  description = "Map of parameter keys to sensitive string values, encrypted with KMS"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "layer" {
  description = "Infrastructure layer name used in SSM path prefix (e.g., foundations, app-infra)"
  type        = string
  default     = "foundations"
}

variable "string_list_parameters" {
  description = "Map of parameter keys to lists of strings (stored as comma-separated StringList)"
  type        = map(list(string))
  default     = {}
}
