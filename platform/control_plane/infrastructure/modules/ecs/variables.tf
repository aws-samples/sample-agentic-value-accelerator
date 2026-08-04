variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "cors_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
}

variable "task_cpu" {
  description = "CPU units for ECS task"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memory for ECS task in MB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 4
}

variable "container_image" {
  description = "Docker container image URL"
  type        = string
}

variable "application_catalog_table_name" {
  description = "Application Catalog DynamoDB table name"
  type        = string
}

variable "application_catalog_table_arn" {
  description = "Application Catalog DynamoDB table ARN"
  type        = string
}

variable "deployment_metadata_table_name" {
  description = "Deployment Metadata DynamoDB table name"
  type        = string
}

variable "deployment_metadata_table_arn" {
  description = "Deployment Metadata DynamoDB table ARN"
  type        = string
}

variable "project_archives_bucket_name" {
  description = "Project archives S3 bucket name"
  type        = string
}

variable "project_archives_bucket_arn" {
  description = "Project archives S3 bucket ARN"
  type        = string
}

variable "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  type        = string
}

variable "frontend_bucket_arn" {
  description = "Frontend S3 bucket ARN"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}

variable "deployments_table_name" {
  description = "Name of the deployments DynamoDB table"
  type        = string
}

variable "deployments_table_arn" {
  description = "ARN of the deployments DynamoDB table"
  type        = string
}

variable "app_factory_table_name" {
  description = "Name of the App Factory DynamoDB table"
  type        = string
}

variable "app_factory_table_arn" {
  description = "ARN of the App Factory DynamoDB table"
  type        = string
}

variable "guardrails_table_name" {
  description = "Name of the guardrails DynamoDB table"
  type        = string
}

variable "guardrails_table_arn" {
  description = "ARN of the guardrails DynamoDB table"
  type        = string
}

variable "policies_table_name" {
  description = "Name of the policies DynamoDB table"
  type        = string
}

variable "policies_table_arn" {
  description = "ARN of the policies DynamoDB table"
  type        = string
}

variable "policy_engine_id" {
  description = "AgentCore Policy Engine ID — passed to backend as POLICY_ENGINE_ID"
  type        = string
}

variable "policy_gateway_arn" {
  description = "AgentCore platform Gateway ARN — passed to backend as GATEWAY_ARN (baked into Cedar statements)"
  type        = string
}

variable "prioritization_table_name" {
  description = "Name of the prioritization DynamoDB table"
  type        = string
}

variable "prioritization_table_arn" {
  description = "ARN of the prioritization DynamoDB table"
  type        = string
}

variable "maturity_table_name" {
  description = "Name of the maturity assessment DynamoDB table"
  type        = string
}

variable "maturity_table_arn" {
  description = "ARN of the maturity assessment DynamoDB table"
  type        = string
}

variable "business_cases_table_name" {
  description = "Name of the business cases DynamoDB table"
  type        = string
}

variable "knowledge_table_name" {
  description = "Name of the knowledge registry DynamoDB table"
  type        = string
}

variable "knowledge_table_arn" {
  description = "ARN of the knowledge registry DynamoDB table"
  type        = string
}

variable "datalake_mcp_image_uri" {
  description = "ECR image URI for the data lake MCP server"
  type        = string
  default     = ""
}

variable "kb_mcp_image_uri" {
  description = "ECR image URI for the knowledge base MCP server"
  type        = string
  default     = ""
}

variable "advpo_bucket_name" {
  description = "S3 bucket for advanced prompt optimization datasets and results"
  type        = string
  default     = ""
}

variable "business_cases_table_arn" {
  description = "ARN of the business cases DynamoDB table"
  type        = string
}

variable "operating_model_table_name" {
  description = "Name of the operating model DynamoDB table"
  type        = string
}

variable "operating_model_table_arn" {
  description = "ARN of the operating model DynamoDB table"
  type        = string
}

variable "organization_design_table_name" {
  description = "Name of the organization design DynamoDB table"
  type        = string
}

variable "organization_design_table_arn" {
  description = "ARN of the organization design DynamoDB table"
  type        = string
}

variable "deployments_bucket_arn" {
  description = "ARN of the deployments S3 bucket"
  type        = string
}

variable "state_machine_arn" {
  description = "Step Functions state machine ARN for deployment pipeline"
  type        = string
  default     = ""
}

variable "frontier_agents_state_machine_arn" {
  description = "Step Functions state machine ARN for the Frontier Agents (AaaS) pipeline."
  type        = string
  default     = ""
}

variable "service_approval_table_name" {
  description = "Service-approval DynamoDB table name"
  type        = string
  default     = ""
}

variable "service_approval_table_arn" {
  description = "Service-approval DynamoDB table ARN"
  type        = string
  default     = ""
}

variable "service_approval_bucket" {
  description = "Service-approval artifacts S3 bucket"
  type        = string
  default     = ""
}

variable "service_approval_bucket_arn" {
  description = "Service-approval artifacts S3 bucket ARN"
  type        = string
  default     = ""
}

variable "service_approval_agent_runtime_arn" {
  description = "Service-approval AgentCore Runtime ARN. Backend invokes this directly — SFN/Fargate paths are gone post-Phase B decommission."
  type        = string
  default     = ""
}

variable "frontier_agents_federation_role_arn" {
  description = "ARN of the IAM role the backend assumes to mint AWS console federation URLs for the frontier agents (DevOps, Security) operator apps. Empty string if federation isn't configured."
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool ID for backend JWT validation. Without this the backend falls back to a dev-mode auth bypass that returns Role.ADMIN for every caller."
  type        = string
}

variable "cognito_user_pool_client_id" {
  description = "Cognito user pool client ID (the audience claim the backend validates against)."
  type        = string
}

variable "fsi_app_signing_secret" {
  description = "HMAC-SHA256 secret used to sign FSI Foundry SSO handoff tokens. Backend mints tokens with this secret after RS256-verifying Cognito id_tokens; each FSI app's CloudFront Function verifies the HMAC with the same secret."
  type        = string
  default     = ""
  sensitive   = true
}
