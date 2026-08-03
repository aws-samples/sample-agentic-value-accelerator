# -----------------------------------------------------------------------------
# Required
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used in resource naming. Lowercase alphanumeric + hyphens, 3-30 chars."
  type        = string
  default     = "payments-fraud"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-30 chars, lowercase alphanumeric and hyphens, starting with a letter."
  }
}

variable "aws_region" {
  description = "AWS region for deployment."
  type        = string
  default     = "us-east-1"
}

variable "container_image_uri" {
  description = <<-EOT
    ECR image URI for the agent container. On the first apply this repository does
    not exist yet — leave the default, apply once to create the ECR repo (see the
    ecr_repository_url output), build & push the image, then set this to the pushed
    image URI and apply again so the runtime picks it up.
  EOT
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "model_id" {
  description = "Bedrock model ID for the supervisor/investigation/SAR agents (also used for IAM scoping)."
  type        = string
  default     = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "scorer_model_id" {
  description = "Bedrock model ID for the high-volume Transaction Scorer (faster/cheaper)."
  type        = string
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

# -----------------------------------------------------------------------------
# Observability — consume an existing Langfuse (Foundation Stack / agent-observability)
# -----------------------------------------------------------------------------

variable "langfuse_host" {
  description = "Langfuse server URL from a deployed Foundation Stack. Empty disables Langfuse (falls back to CloudWatch/X-Ray)."
  type        = string
  default     = ""
}

variable "langfuse_public_key" {
  description = "Langfuse public key (pk-...). Created in the Langfuse UI post-deploy."
  type        = string
  default     = ""
}

variable "langfuse_secret_key" {
  description = "Langfuse secret key (sk-...). Created in the Langfuse UI post-deploy."
  type        = string
  default     = ""
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Auth (Cognito)
# -----------------------------------------------------------------------------

variable "callback_urls" {
  description = "Allowed OAuth redirect URIs for the web client (set to your CloudFront URL once known)."
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "logout_urls" {
  description = "Allowed post-logout redirect URIs."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

# -----------------------------------------------------------------------------
# Tags
# -----------------------------------------------------------------------------

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
