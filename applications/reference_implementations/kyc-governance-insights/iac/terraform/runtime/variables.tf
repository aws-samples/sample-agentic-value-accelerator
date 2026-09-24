variable "aws_region" {
  description = "AWS region for deployment (should match infra module)"
  type        = string
  default     = "us-east-1"
}

variable "use_case_id" {
  description = "Use case ID for resource naming"
  type        = string
  default     = "kyc_governance_insights"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]*$", var.use_case_id))
    error_message = "use_case_id must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, and hyphens."
  }
}

# This module is vendored for a single use case, so the defaults name that use case.
# agentcore_runtime.yaml maps this parameter (NOT use_case_id) onto the container's
# USE_CASE_ID, AGENT_NAME and DATA_PREFIX, so a stale default here makes the runtime
# load a use case that does not exist in the image and fail to start.
variable "use_case_name" {
  description = "Use case name for application configuration. Drives the container's USE_CASE_ID, AGENT_NAME and DATA_PREFIX via agentcore_runtime.yaml."
  type        = string
  default     = "kyc_governance_insights"
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
    # Only LangGraph ships in this reference implementation. Accepting another value
    # would build an image whose use-case source path does not exist and name every
    # resource after a framework that was never deployed.
    condition     = var.framework == "langchain_langgraph"
    error_message = "framework must be \"langchain_langgraph\" — the Strands variant was removed from this reference implementation."
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

# Governance service URLs — used only by the kyc_governance_insights use case.
# Empty by default; the use case falls back to in-process governance logic when
# unset, so leaving these blank is safe for every other use case.
variable "deterministic_check_function" {
  description = "Lambda function name for the deterministic financial-check service (invoked directly with IAM auth; no public endpoint)"
  type        = string
  default     = ""
}

variable "sanctions_check_function" {
  description = "Lambda function name for the sanctions screening service (invoked directly with IAM auth; no public endpoint)"
  type        = string
  default     = ""
}

variable "pep_check_function" {
  description = "Lambda function name for the PEP screening service (invoked directly with IAM auth; no public endpoint)"
  type        = string
  default     = ""
}

variable "policy_cascade_function" {
  description = "Lambda function name for the policy-cascade service (invoked directly with IAM auth; no public endpoint)"
  type        = string
  default     = ""
}

variable "llm_judge_function" {
  description = "Lambda function name for the LLM-as-Judge service (invoked directly with IAM auth; no public endpoint)"
  type        = string
  default     = ""
}

# When set (e.g. "/kyc-gov/demo"), the runtime sources the 5 governance URLs from
# SSM Parameter Store at deploy time instead of requiring them to be passed in via
# -var. The kyc-gov service stacks publish these params (see
# use_cases/kyc_governance_insights/deploy/governance/*/template.yaml). This is the
# decoupled cross-stack reference for invariant #7 (IaC-reproducible URLs).
# Empty by default so all other use cases are unaffected. If set but a param is
# missing, the apply FAILS LOUD (no silent fallback — invariant #5).
variable "governance_ssm_prefix" {
  description = "SSM path prefix that the kyc-gov service stacks publish governance URLs under (e.g. '/kyc-gov/demo'). Empty disables SSM sourcing (all non-governance use cases)."
  type        = string
  default     = ""
}

variable "governance_mode" {
  description = "kyc_governance_insights enforcement mode: 'external' (deployed microservices are authoritative, degraded fails closed) or 'local' (in-process equivalents). Safe default for all use cases."
  type        = string
  default     = "external"

  validation {
    condition     = contains(["external", "local"], var.governance_mode)
    error_message = "governance_mode must be either 'external' or 'local'."
  }
}

variable "enable_agentcore_observability" {
  description = "Wire AgentCore runtime APPLICATION_LOGS to CloudWatch Logs and TRACES to X-Ray (Transaction Search). Independent of Langfuse. Defaults on: the market-surveillance reference implementation creates the equivalent log group and log deliveries unconditionally, and an agent deployed without logs cannot demonstrate how agents are measured and monitored."
  type        = bool
  default     = true
}

variable "agentcore_log_retention_days" {
  description = "Retention (in days) for the AgentCore runtime CloudWatch log group"
  type        = number
  default     = 30
}

variable "enable_xray_transaction_search" {
  description = "Per-account/region setup: create the X-Ray resource policy (fixed name AgentCoreObservabilityXRayAccess) granting the AgentCore service principal X-Ray write access, and switch trace segment destination to CloudWatch Logs. Defaults on because the policy is account-wide: leaving it off makes a redeploy delete it and break trace ingestion for every AgentCore runtime in the account, not just this one."
  type        = bool
  default     = true
}

variable "create_fleet_dashboard" {
  description = "Create the AVA AgentCore fleet CloudWatch dashboard (one per region). The dashboard auto-discovers all AgentCore runtimes via SEARCH() expressions, so it is shared account-wide rather than specific to this use case. Defaults on so a redeploy does not delete a dashboard other deployments rely on; set false when another deployment in the region already owns it."
  type        = bool
  default     = true
}

variable "fleet_dashboard_name" {
  description = "Name of the fleet CloudWatch dashboard"
  type        = string
  default     = "AVA-AgentCore-Fleet"
}

# ---------------------------------------------------------------------------
# Location of the infra module's state, so this module can read its outputs.
#
# Leave infra_state_bucket empty for standalone development: the remote-state
# data source then falls back to infra's local state file. The AVA pipeline
# injects both values so runtime reads the same state infra just wrote.
variable "infra_state_bucket" {
  description = "S3 bucket holding the infra module's Terraform state. Empty means read infra's local state file instead."
  type        = string
  default     = ""
}

variable "infra_state_key" {
  description = "S3 key of the infra module's Terraform state. Required when infra_state_bucket is set."
  type        = string
  default     = ""

  validation {
    condition     = var.infra_state_key != "" || var.infra_state_bucket == ""
    error_message = "infra_state_key must be set when infra_state_bucket is provided, otherwise the infra outputs cannot be located."
  }
}
