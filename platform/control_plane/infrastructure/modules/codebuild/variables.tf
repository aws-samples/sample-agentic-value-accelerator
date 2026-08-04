variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "compute_type" {
  description = "CodeBuild compute type (BUILD_GENERAL1_SMALL, BUILD_GENERAL1_MEDIUM, BUILD_GENERAL1_LARGE)"
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "image" {
  description = "Docker image URI for CodeBuild environment"
  type        = string
}

variable "project_archives_bucket_arn" {
  description = "S3 bucket ARN for project archives (read access)"
  type        = string
}

variable "state_backend_bucket_arn" {
  description = "S3 bucket ARN for Terraform state backend (read/write)"
  type        = string
}

variable "deployment_metadata_table_arn" {
  description = "DynamoDB table ARN for deployment metadata"
  type        = string
}

variable "deployments_table_arn" {
  description = "DynamoDB table ARN for deployments"
  type        = string
}

variable "lock_table_arn" {
  description = "DynamoDB lock table ARN for Terraform state locking"
  type        = string
}

variable "agent_registry_arn" {
  description = "ARN of the shared AWS Agent Registry. Passed to the app-factory build so it can publish records per generated agent."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}

# =============================================================================
# FSI Foundry SSO — HMAC edge auth (opt-in)
# =============================================================================
# The buildspec forwards these into each FSI app's ui_iac/deploy.auto.tfvars.
# When fsi_app_signing_secret is non-empty, ui_iac attaches a CloudFront
# Function on viewer-request that HMAC-verifies handoff tokens minted by
# the AVA backend. Empty values leave the FSI app publicly accessible.

variable "fsi_app_signing_secret" {
  description = "Shared HMAC secret. Empty disables edge auth on FSI apps."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ava_ui_login_url" {
  description = "AVA UI login URL. Users hitting an FSI app without a valid token are redirected here."
  type        = string
  default     = ""
}
