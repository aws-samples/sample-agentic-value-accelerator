variable "name_prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "region" {
  type        = string
  description = "AWS region"
}

variable "account_id" {
  type        = string
  description = "AWS account ID"
}

variable "lf_admin_role_arn" {
  type        = string
  description = "IAM role ARN to register as Lake Formation admin"
}

variable "ecs_task_role_arn" {
  type        = string
  description = "ECS task role ARN — needs LF grants for knowledge discovery"
  default     = ""
}

# Boolean gate for the four ECS-task LakeFormation grants below. Has to be
# a plan-time-known boolean (not derived from ecs_task_role_arn != "")
# because the ARN is computed at apply time (it comes from
# `module.ecs.task_role_arn` in the parent), and Terraform refuses to
# compute `count` from values that don't exist until apply.
variable "grant_ecs_permissions" {
  type        = bool
  description = "Whether to grant the ECS task role LakeFormation DESCRIBE permissions on the datalake databases."
  default     = true
}

locals {
  account_id = var.account_id
  region     = var.region
  bucket     = "${var.name_prefix}-datalake-${local.account_id}-${local.region}"
}
