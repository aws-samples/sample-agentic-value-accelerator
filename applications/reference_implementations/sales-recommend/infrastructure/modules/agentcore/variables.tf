variable "project" {
  description = "Project name (with deployment suffix)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "execution_role_arn" {
  description = "IAM role ARN for AgentCore (must trust bedrock-agentcore.amazonaws.com)"
  type        = string
}

variable "code_s3_bucket" {
  description = "S3 bucket containing the agent code zip"
  type        = string
}

variable "code_s3_prefix" {
  description = "S3 key prefix for the agent code zip (e.g. sales-recommend/deployment.zip)"
  type        = string
}

variable "model_id" {
  description = "Bedrock model ID"
  type        = string
  default     = "global.anthropic.claude-sonnet-4-6"
}

variable "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID"
  type        = string
}
