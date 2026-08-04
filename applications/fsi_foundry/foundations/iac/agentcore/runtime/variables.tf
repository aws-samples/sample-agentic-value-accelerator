variable "aws_region" {
  description = "AWS region for deployment (should match infra module)"
  type        = string
  default     = "us-east-1"
}

variable "use_case_id" {
  description = "Use case ID for resource naming (e.g., 'B01', 'I03')"
  type        = string
  default     = "kyc_banking"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]*$", var.use_case_id))
    error_message = "use_case_id must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, and hyphens."
  }
}

variable "use_case_name" {
  description = "Use case name for application configuration (e.g., 'kyc_banking', 'customer_engagement')"
  type        = string
  default     = "kyc_banking"
}

variable "agent_name" {
  description = "Name of the AgentCore runtime (must match pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}). If not provided, derived from project_name and use_case_id."
  type        = string
  default     = ""
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for the agent"
  type        = string
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "image_tag" {
  description = "Docker image tag to deploy (e.g., langgraph-latest, strands-latest)"
  type        = string
  default     = "langgraph-latest"
}

variable "framework" {
  description = "AI agent framework identifier (e.g., langchain_langgraph)"
  type        = string

  validation {
    condition     = length(var.framework) > 0
    error_message = "The framework variable must be provided for framework-isolated deployments."
  }
}

variable "enable_tracing" {
  description = "Enable Langfuse OTEL tracing"
  type        = string
  default     = "false"
}

variable "langfuse_host" {
  description = "Langfuse server URL"
  type        = string
  default     = ""
}

variable "langfuse_secret_name" {
  description = "Secrets Manager secret name for Langfuse API keys"
  type        = string
  default     = ""
}

variable "guardrail_id" {
  description = "Bedrock Guardrail ID to apply to model invocations"
  type        = string
  default     = ""
}

variable "guardrail_version" {
  description = "Bedrock Guardrail version (DRAFT or published version number)"
  type        = string
  default     = ""
}

variable "llm_gateway_base_url" {
  description = "LLM Gateway (LiteLLM) base URL. When set, foundation model calls route through the gateway instead of direct Bedrock. Auto-injected at deploy time by the Control Plane backend if a gateway exists in the same account."
  type        = string
  default     = ""
}

variable "llm_gateway_api_key_secret_arn" {
  description = "Secrets Manager ARN holding the LLM Gateway virtual key minted for this deployment."
  type        = string
  default     = ""
}

variable "enable_agentcore_observability" {
  description = "Wire AgentCore runtime APPLICATION_LOGS to CloudWatch Logs and TRACES to X-Ray (Transaction Search). Independent of Langfuse."
  type        = bool
  default     = false
}

variable "agentcore_log_retention_days" {
  description = "Retention (in days) for the AgentCore runtime CloudWatch log group"
  type        = number
  default     = 30
}

variable "enable_xray_transaction_search" {
  description = "One-time per-account/region setup: create the X-Ray resource policy and switch trace segment destination to CloudWatch Logs. Set true on the first deployment in a new account/region only."
  type        = bool
  default     = false
}

variable "create_fleet_dashboard" {
  description = "Create the AVA AgentCore fleet CloudWatch dashboard (one per region). Flip on for exactly one deployment per region — the dashboard auto-discovers all AgentCore runtimes via SEARCH() expressions."
  type        = bool
  default     = false
}

variable "fleet_dashboard_name" {
  description = "Name of the fleet CloudWatch dashboard"
  type        = string
  default     = "AVA-AgentCore-Fleet"
}
