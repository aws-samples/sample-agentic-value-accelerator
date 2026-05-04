variable "aws_region" {
  description = "AWS region for the DevOps Agent deployment."
  type        = string
  default     = "us-east-1"
}

variable "agent_space_name" {
  description = "Name for the DevOps Agent Space."
  type        = string
  default     = "FSIAgentKitAgentSpace"
}

variable "agent_space_description" {
  description = "Description for the DevOps Agent Space."
  type        = string
  default     = "DevOps Agent Space provisioned by AVA - Terraform"
}

variable "service_account_id" {
  description = "Account ID of the secondary (service) account for cross-account monitoring. Leave empty to skip Part 2."
  type        = string
  default     = ""
}

variable "agent_space_arn" {
  description = "ARN of the Agent Space from the primary deployment. Required before creating the secondary-account role + association."
  type        = string
  default     = ""
}

variable "name_postfix" {
  description = "Postfix appended to IAM role names so multiple deployments in one account do not collide. Leave empty to use a random 4-byte hex suffix."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to all resources this module creates."
  type        = map(string)
  default = {
    Project   = "ava"
    Component = "frontier-agents/devops"
  }
}
