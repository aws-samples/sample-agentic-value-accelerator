variable "name_prefix" {
  description = "Prefix for the generated IAM role name (used when role_name is unset)."
  type        = string
  default     = "ava"
}

variable "role_name" {
  description = "Full IAM role name. If empty, derived from name_prefix + region."
  type        = string
  default     = ""
}

variable "guardrail_arns" {
  description = "Optional list of Bedrock guardrail ARNs the harness may attach at runtime (grants bedrock:ApplyGuardrail on each)."
  type        = list(string)
  default     = []
}

variable "extra_policy_arns" {
  description = "Additional IAM policy ARNs to attach for advanced harnesses (VPC mode, custom container ECR, BYO memory, gateways, skill S3 buckets, API-key credential providers, etc.)."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}
