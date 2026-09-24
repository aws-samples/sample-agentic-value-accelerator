variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "ava"
}

variable "data_path" {
  description = "Path to data/samples directory. Auto-detected if empty."
  type        = string
  default     = ""
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

# Vendored for a single use case — the defaults name that use case rather than the
# kyc_banking values inherited from FSI Foundry.
variable "use_case_id" {
  description = "Use case ID for resource naming"
  type        = string
  default     = "kyc_governance_insights"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]*$", var.use_case_id))
    error_message = "use_case_id must start with a lowercase letter or number and contain only lowercase letters, numbers, underscores, and hyphens."
  }
}

variable "use_case_name" {
  description = "Use case name for application configuration"
  type        = string
  default     = "kyc_governance_insights"
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

# Prefix the governance CloudFormation stacks use for their Lambda function names
# (${ResourcePrefix}-<service>). Kept as a variable so the invoke grant stays scoped
# to those functions instead of "*", without needing a cross-stack reference — the
# governance stacks are deployed by CloudFormation, not this Terraform module.
variable "governance_resource_prefix" {
  description = "ResourcePrefix used by the governance stacks when naming their Lambda functions"
  type        = string
  default     = "kyc-gov"
}
