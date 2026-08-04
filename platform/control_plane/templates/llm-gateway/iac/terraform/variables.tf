variable "project_name" {
  description = "Project name used for resource tagging and naming"
  type        = string
  default     = "llm-gateway"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "vpc_cidr" {
  description = "VPC CIDR block (used only when existing_vpc_id is empty)"
  type        = string
  default     = "10.20.0.0/16"
}

variable "existing_vpc_id" {
  description = "Existing VPC ID to reuse (leave empty to create new)"
  type        = string
  default     = ""
}

variable "master_key" {
  description = "LiteLLM master key (admin). Stored in Secrets Manager; never logged."
  type        = string
  sensitive   = true
}

variable "enabled_models" {
  description = "List of Bedrock cross-region inference profile IDs (preferred over bare model IDs — they auto-route across us-east-1/us-east-2/us-west-2 for higher throughput and automatic failover)"
  type        = list(string)
  default = [
    # Claude 4.x and newer only — Claude 3.5 and older (3.5 Sonnet/Haiku,
    # 3 Opus) are intentionally excluded.
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "us.anthropic.claude-sonnet-5",
    # Amazon Nova — Nova 2 Lite supersedes Nova Lite v1
    "us.amazon.nova-pro-v1:0",
    "us.amazon.nova-2-lite-v1:0",
  ]
}

variable "attach_guardrail_id" {
  description = "Optional Bedrock Guardrail ID to attach to all gateway requests (leave empty to skip)"
  type        = string
  default     = ""
}

variable "attach_guardrail_version" {
  description = "Bedrock Guardrail version (DRAFT or numeric)"
  type        = string
  default     = "DRAFT"
}

variable "langfuse_host" {
  description = "Optional Langfuse host URL — when set the gateway emits traces to Langfuse"
  type        = string
  default     = ""
}

variable "langfuse_public_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing langfuse_public_key (key inside the JSON)"
  type        = string
  default     = ""
}

variable "langfuse_secret_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing langfuse_secret_key (key inside the JSON)"
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Optional Control Plane Cognito User Pool ID for admin UI SSO (leave empty to skip)"
  type        = string
  default     = ""
}

variable "cognito_region" {
  description = "AWS region of the Cognito User Pool"
  type        = string
  default     = ""
}

variable "litellm_version" {
  description = "LiteLLM container image tag to deploy"
  type        = string
  default     = "main-stable"
}

variable "additional_ingress_cidrs" {
  description = "Extra CIDR blocks allowed to reach the ALB on 80/443 in addition to the CloudFront-managed prefix list. Callers should normally reach the gateway via the CloudFront distribution (see cloudfront.tf) which handles all cross-VPC/internet clients — leave empty for that path. Only populate for exceptional cases (e.g. debugging from a bastion in the same VPC)."
  type        = list(string)
  default     = []
}

variable "fsi_app_signing_secret" {
  description = "Shared HMAC secret used by the AVA SSO gate CloudFront Function on the LLM Gateway distribution. Leave empty to disable the gate."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ava_ui_login_url" {
  description = "Absolute URL of the AVA UI login page — unauthenticated LLM Gateway requests 302 here."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
