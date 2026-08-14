variable "project" {
  description = "Project name used for resource naming"
  type        = string
  default     = "sales-recommend"
}

variable "alb_dns_name" {
  description = "DNS name of the ALB origin"
  type        = string
}

variable "auth_username" {
  description = "Basic auth username for CloudFront function"
  type        = string
  sensitive   = true
}

variable "auth_password" {
  description = "Basic auth password for CloudFront function"
  type        = string
  sensitive   = true
}

variable "origin_secret" {
  description = "Secret header value that CloudFront sends to ALB — ALB rejects requests without it"
  type        = string
  sensitive   = true
}

# ------------------------------------------------------------------------------
# AVA FSI SSO (optional) — when set, switches edge auth from HTTP Basic
# to AVA-signed HMAC handoff tokens. Same trust anchor as
# case-management/jwt_auth_function.js and merchant-onboarding. Empty
# string keeps the legacy basic-auth path (standalone laptop deploys).
# ------------------------------------------------------------------------------
variable "fsi_app_signing_secret" {
  description = "HMAC secret shared with AVA control plane (fsi_sso.py). Empty disables AVA SSO — falls back to basic auth."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ava_ui_login_url" {
  description = "AVA UI URL to redirect unauthenticated users to. Only used when fsi_app_signing_secret is non-empty."
  type        = string
  default     = ""
}
