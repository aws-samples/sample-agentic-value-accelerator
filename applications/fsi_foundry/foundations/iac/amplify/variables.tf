# =============================================================================
# Variables for Amplify Hosting
# =============================================================================

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

variable "repository_url" {
  description = "Git repository URL. Leave empty for manual deployment mode (zip upload)."
  type        = string
  default     = ""
}

variable "branch_name" {
  description = "Git branch to deploy (only used for git-based deployments)"
  type        = string
  default     = "main"
}

variable "github_access_token" {
  description = "GitHub/GitLab personal access token for private repos"
  type        = string
  default     = ""
  sensitive   = true
}

variable "custom_domain" {
  description = "Custom domain name (optional, leave empty for Amplify default domain)"
  type        = string
  default     = ""
}

# Cognito configuration (from cognito module outputs)
variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
  default     = ""
}

variable "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  type        = string
  default     = ""
}

variable "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID"
  type        = string
  default     = ""
}
