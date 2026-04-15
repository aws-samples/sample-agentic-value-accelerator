variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "password_min_length" {
  description = "Minimum password length"
  type        = number
  default     = 8
}

variable "password_require_lowercase" {
  description = "Require lowercase characters in password"
  type        = bool
  default     = true
}

variable "password_require_uppercase" {
  description = "Require uppercase characters in password"
  type        = bool
  default     = true
}

variable "password_require_numbers" {
  description = "Require numbers in password"
  type        = bool
  default     = true
}

variable "password_require_symbols" {
  description = "Require symbols in password"
  type        = bool
  default     = true
}

variable "token_validity_hours" {
  description = "Access token validity in hours"
  type        = number
  default     = 1
}

variable "refresh_token_validity_days" {
  description = "Refresh token validity in days"
  type        = number
  default     = 30
}

variable "id_token_validity_hours" {
  description = "ID token validity in hours"
  type        = number
  default     = 1
}

variable "enable_hosted_ui" {
  description = "Enable Cognito hosted UI domain"
  type        = bool
  default     = true
}
