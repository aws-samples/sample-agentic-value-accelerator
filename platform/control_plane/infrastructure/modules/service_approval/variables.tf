# Phase B decommission: this module owns DDB + S3 only. The Fargate task
# variables (vpc_id, private_subnet_ids, task_cpu/memory, runner_image,
# bedrock_model_id, log_retention_days, ecs_cluster_arn, task_timeout_minutes)
# moved to platform/control_plane/service_approval/runtime/variables.tf along with
# the AgentCore runtime resources that consume them.

variable "name_prefix" {
  description = "Resource name prefix"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
