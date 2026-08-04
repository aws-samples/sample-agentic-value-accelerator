variable "aws_region" {
  description = "AWS region for the Security Agent deployment."
  type        = string
  default     = "us-east-1"
}

variable "agent_space_name" {
  description = "Name for the Security Agent Space."
  type        = string
  default     = "FSIAgentKitSecurityAgentSpace"
}

variable "agent_space_description" {
  description = "Description for the Security Agent Space."
  type        = string
  default     = "Security Agent Space provisioned by AVA - Terraform"
}

variable "external_id" {
  description = "External ID used in PenTest Service Role and Actor Role trust policies. Improves security on cross-account or service trust. Leave empty to use a random value."
  type        = string
  default     = ""
}

variable "name_postfix" {
  description = "Postfix appended to IAM role names so multiple deployments in one account do not collide. Leave empty to use a random 4-byte hex suffix."
  type        = string
  default     = ""
}

variable "create_application" {
  description = "Create AWS::SecurityAgent::Application as part of this deployment. Set to true on the FIRST deployment in an account; AWS allows only ONE Application per account, so subsequent deploys must set this to false and pass existing_application_domain instead."
  type        = bool
  default     = false
}

variable "existing_application_domain" {
  description = "Domain of the pre-existing Security Agent Application (e.g. app-xxxxx.securityagent.global.app.aws). Required when create_application = false. Used to compose the operator_app_url output. Find it via: aws cloudcontrol list-resources --type-name AWS::SecurityAgent::Application."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to all resources this module creates."
  type        = map(string)
  default = {
    Project   = "ava"
    Component = "frontier-agents/security"
  }
}
