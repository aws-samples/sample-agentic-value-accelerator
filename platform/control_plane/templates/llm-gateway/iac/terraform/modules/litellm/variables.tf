variable "name" {
  description = "Name prefix for resources"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for ECS tasks + RDS + ElastiCache"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnets for the ALB"
  type        = list(string)
}

variable "master_key" {
  description = "LiteLLM master/admin key"
  type        = string
  sensitive   = true
}

variable "enabled_models" {
  description = "Bedrock model ids exposed by the gateway"
  type        = list(string)
}

variable "litellm_version" {
  description = "LiteLLM container image tag"
  type        = string
}

variable "attach_guardrail_id" {
  description = "Bedrock Guardrail id (optional)"
  type        = string
  default     = ""
}

variable "attach_guardrail_version" {
  description = "Bedrock Guardrail version"
  type        = string
  default     = "DRAFT"
}

variable "langfuse_host" {
  description = "Langfuse host URL (optional)"
  type        = string
  default     = ""
}

variable "langfuse_public_key_secret_arn" {
  description = "Secrets Manager ARN containing langfuse_public_key"
  type        = string
  default     = ""
}

variable "langfuse_secret_key_secret_arn" {
  description = "Secrets Manager ARN containing langfuse_secret_key"
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Optional Cognito user pool for admin UI SSO"
  type        = string
  default     = ""
}

variable "cognito_region" {
  description = "Cognito region"
  type        = string
  default     = "us-east-1"
}

variable "litellm_cpu" {
  description = "CPU units for LiteLLM tasks"
  type        = number
  default     = 1024
}

variable "litellm_memory" {
  # LiteLLM runs the proxy with --num_workers 2; each uvicorn worker loads the
  # full litellm app and, together with the Prisma engine, the pair exceeds
  # 2048 MiB and the kernel OOM-kills a worker (container exit 137). 4096 MiB
  # gives the two workers + Prisma enough headroom to stay up.
  description = "Memory MB for LiteLLM tasks"
  type        = number
  default     = 4096
}

variable "litellm_desired_count" {
  description = "Desired LiteLLM task count"
  type        = number
  default     = 2
}

variable "postgres_min_capacity" {
  description = "Aurora Serverless v2 min ACU"
  type        = number
  default     = 0.5
}

variable "postgres_max_capacity" {
  description = "Aurora Serverless v2 max ACU"
  type        = number
  default     = 2.0
}

variable "postgres_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.12"
}

variable "cache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.small"
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the HTTPS listener (optional — when empty, ALB uses HTTP:80 with origin-verify only)"
  type        = string
  default     = ""
}

variable "disable_admin_ui" {
  description = "Disable LiteLLM admin UI and docs endpoints to reduce probe surface"
  type        = bool
  default     = true
}

variable "additional_ingress_cidrs" {
  description = "Extra CIDR blocks allowed to reach the ALB on 80/443 in addition to the CloudFront-managed prefix list. Use for in-VPC callers like AgentCore runtimes that egress from the VPC CIDR, not CloudFront edge IPs. Leave empty to keep ALB reachable only via CloudFront."
  type        = list(string)
  default     = []
}

variable "fsi_app_signing_secret" {
  description = "Shared HMAC secret used to verify AVA handoff tokens at the CloudFront edge. Same secret the AVA backend uses to sign ava_token on POST /api/v1/fsi/sign-app-token. Leave empty to disable the SSO gate."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ava_ui_login_url" {
  description = "Absolute URL of the AVA UI login page. The CloudFront Function 302s here when a request lacks a valid ava_session cookie."
  type        = string
  default     = ""
}
