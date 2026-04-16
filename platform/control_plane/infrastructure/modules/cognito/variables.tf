variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "user_pool_name" {
  description = "Cognito User Pool name"
  type        = string
}

variable "enable_mfa" {
  description = "Enable MFA for Cognito"
  type        = bool
  default     = false
}

variable "callback_urls" {
  description = "Callback URLs for Cognito app client"
  type        = list(string)
}

variable "logout_urls" {
  description = "Logout URLs for Cognito app client"
  type        = list(string)
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
