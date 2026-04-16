variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "ava"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = null # Will use provider's region if not specified
}

variable "deployment_suffix" {
  description = "Deployment-specific suffix for IAM resources (e.g., ec2, agentcore, sf)"
  type        = string
}

variable "use_case_id" {
  description = "Use case identifier for resource naming"
  type        = string
  default     = "kyc_banking"
}

variable "framework" {
  description = "AI agent framework identifier (e.g., langchain_langgraph)"
  type        = string

  validation {
    condition     = length(var.framework) > 0
    error_message = "The framework variable must be provided for framework-isolated deployments."
  }
}

variable "data_path" {
  description = "Path to the data directory containing samples. Defaults to auto-detect from module path."
  type        = string
  default     = ""
}

variable "framework_short" {
  description = "Short name for the framework (e.g., langgraph)"
  type        = string
  default     = ""
}

# Local values to use data sources when variables aren't provided
locals {
  aws_region = coalesce(var.aws_region, data.aws_region.current.id)
  account_id = data.aws_caller_identity.current.account_id

  # Framework short name mapping
  framework_short_map = {
    "langchain_langgraph" = "langgraph"
    "strands"             = "strands"
    "crewai"              = "crewai"
    "llamaindex"          = "llamaindex"
  }

  # Derive framework_short from framework if not provided
  framework_short = var.framework_short != "" ? var.framework_short : lookup(local.framework_short_map, var.framework, var.framework)

  # Updated resource prefix with framework
  resource_prefix = "${var.project_name}-${var.use_case_id}-${local.framework_short}"

  # S3 bucket names can only contain lowercase alphanumeric characters and hyphens
  # Convert to lowercase and replace underscores with hyphens for bucket naming
  use_case_id_s3     = lower(replace(var.use_case_id, "_", "-"))
  framework_short_s3 = lower(replace(local.framework_short, "_", "-"))
}
