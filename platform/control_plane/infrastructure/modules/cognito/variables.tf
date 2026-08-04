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

variable "seed_demo_users" {
  description = "Create admin@example.com (admin) and demo@example.com (viewer) on apply. Convenience for fresh stamps; turn off in production."
  type        = bool
  default     = false
}

variable "demo_admin_password" {
  description = "Permanent password for the seeded admin@example.com user. Required when seed_demo_users=true."
  type        = string
  default     = "AdminPass123!@"
  sensitive   = true
}

variable "demo_viewer_password" {
  description = "Permanent password for the seeded demo@example.com user. Required when seed_demo_users=true."
  type        = string
  default     = "DemoViewer123!@#"
  sensitive   = true
}
