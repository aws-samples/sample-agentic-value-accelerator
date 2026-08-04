variable "project_name" {
  description = "Project name"
  type        = string
  default     = "foundation"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "environment" {
  description = "Environment"
  type        = string
  default     = "dev"
}

variable "langfuse_admin_email" {
  description = "Email for the initial Langfuse admin user"
  type        = string
}

variable "langfuse_admin_password" {
  description = "Password for the initial Langfuse admin user"
  type        = string
  sensitive   = true
}

variable "existing_vpc_id" {
  description = "Existing VPC ID to reuse (leave empty to create a new VPC)"
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Control plane Cognito User Pool ID for Langfuse SSO (leave empty to skip SSO setup)"
  type        = string
  default     = ""
}

variable "cognito_region" {
  description = "AWS region of the Cognito User Pool"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}

# =============================================================================
# AVA FSI SSO edge auth (opt-in; both defaults empty → gate disabled)
# =============================================================================
# CodeBuild exports these as TF_VAR_fsi_app_signing_secret and
# TF_VAR_ava_ui_login_url at the top of the terraform stage, sourced from
# CP's random_password.fsi_app_signing_secret + module.cloudfront.frontend_url.
# See platform/control_plane/infrastructure/modules/codebuild/buildspec.yml.

variable "fsi_app_signing_secret" {
  description = "Shared HMAC secret with AVA backend. Empty disables SSO gating on Langfuse."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ava_ui_login_url" {
  description = "AVA UI login URL. Browsers without a valid AVA session are 302'd here."
  type        = string
  default     = ""
}
