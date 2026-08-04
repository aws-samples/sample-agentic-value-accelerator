variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "ava"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "use_case_id" {
  description = "Use case ID for resource naming"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]*$", var.use_case_id))
    error_message = "use_case_id must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, and hyphens."
  }
}

variable "use_case_name" {
  description = "Use case name for application configuration"
  type        = string
}

variable "framework" {
  description = "AI agent framework identifier"
  type        = string
}

variable "agentcore_runtime_arn" {
  description = "ARN of the deployed AgentCore runtime to proxy requests to"
  type        = string
}

# =============================================================================
# FSI Foundry SSO edge auth (opt-in — leave empty to keep the app open)
# =============================================================================
# When fsi_app_signing_secret is non-empty, a CloudFront Function is
# attached on viewer-request that HMAC-SHA256 verifies handoff tokens
# minted by the AVA backend. The AVA backend has already RS256-verified
# the caller's Cognito id_token before signing the handoff token — so the
# effective auth chain is:
#   Cognito RS256 (real, at AVA backend) → HMAC (fast, at this app's edge).
# Bootstrap flow: AVA UI navigates here with ?ava_token=<hmac_blob>, the
# CF Function verifies, sets an ava_session cookie, 302s to strip the token.

variable "fsi_app_signing_secret" {
  description = "Shared HMAC secret with AVA backend. Empty disables edge auth."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ava_ui_login_url" {
  description = "AVA UI login URL. Users are redirected here when the token is missing or invalid."
  type        = string
  default     = ""
}
