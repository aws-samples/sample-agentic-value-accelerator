variable "name_prefix" {
  description = "Common name prefix for all resources in this module."
  type        = string
}

variable "state_machine_arn" {
  description = "ARN of the deployment Step Function whose SUCCEEDED events we listen for."
  type        = string
}

variable "deployments_table_arn" {
  description = "ARN of the DynamoDB deployments table the Lambda reads deployment records from."
  type        = string
}

variable "deployments_table_name" {
  description = "Name of the DynamoDB deployments table."
  type        = string
}

variable "approval_requests_table_arn" {
  description = "ARN of the DynamoDB approval-requests table. The Lambda writes an audit-only 'approved' row here after each successful publish so the Approval Queue mirrors every auto-approved Foundry deploy. Empty string disables the queue write."
  type        = string
  default     = ""
}

variable "approval_requests_table_name" {
  description = "Name of the DynamoDB approval-requests table (env var for the Lambda). Must match the ARN in `approval_requests_table_arn`. Empty string disables the queue write."
  type        = string
  default     = ""
}

variable "agent_registry_id" {
  description = "AWS Agent Registry ID (e.g. `4h0JCw88RghhrH3v`) — the AVA registry the Lambda publishes records into."
  type        = string
}

variable "agent_registry_arn" {
  description = "ARN of the AVA agent registry — used for the IAM policy Resource block."
  type        = string
}

variable "aws_region" {
  description = "Region for the boto3 clients inside the Lambda."
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Shared tags applied to all resources."
  type        = map(string)
  default     = {}
}
