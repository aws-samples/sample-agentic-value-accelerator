variable "project" {
  description = "Project name for resource naming"
  type        = string
}

variable "auth_username" {
  description = "Basic auth username (from AVA deploy form)"
  type        = string
  default     = "admin"
}

variable "auth_password" {
  description = "Basic auth password (from AVA deploy form)"
  type        = string
  sensitive   = true
  default     = "changeme"
}
