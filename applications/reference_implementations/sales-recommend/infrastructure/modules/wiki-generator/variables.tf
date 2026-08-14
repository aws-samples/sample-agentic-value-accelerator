###############################################################################
# Wiki Generator Module — Input Variables
###############################################################################

variable "project" {
  description = "Project name (with deployment suffix) used for resource naming"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "account_id" {
  description = "AWS account ID for ARN construction"
  type        = string
}

variable "model_id" {
  description = "Bedrock model ID used to synthesize the capability profile"
  type        = string
  default     = "global.anthropic.claude-sonnet-4-6"
}

variable "kb_data_bucket" {
  description = "Name of the KB data-source S3 bucket to write profiles into"
  type        = string
}

variable "kb_data_bucket_arn" {
  description = "ARN of the KB data-source S3 bucket"
  type        = string
}

variable "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID to ingest into"
  type        = string
}

variable "knowledge_base_arn" {
  description = "Bedrock Knowledge Base ARN (for StartIngestionJob permission)"
  type        = string
}

variable "data_source_id" {
  description = "Bedrock KB S3 data source ID to sync"
  type        = string
}

variable "s3_prefix" {
  description = "Key prefix under which repo profiles are written"
  type        = string
  default     = "repos"
}

variable "source_object_key" {
  description = "S3 key of the zipped wiki-agent code in the source bucket"
  type        = string
  default     = "wiki-agent.zip"
}

variable "config_prefix" {
  description = "Key prefix (in the source bucket) for the managed repo list (read by the scheduler)"
  type        = string
  default     = "config"
}

variable "manual_prefix" {
  description = "Key prefix watched by the S3 notification for ad-hoc/manual repo-list uploads"
  type        = string
  default     = "manual"
}

variable "trigger_delay_minutes" {
  description = "Cloud-side delay before the managed repo list is processed after it changes (via EventBridge Scheduler). Held on the cloud, not in the deploy."
  type        = number
  default     = 15
}

variable "repos_file_name" {
  description = "File name for the repo-list object under the config prefix"
  type        = string
  default     = "repos.txt"
}

variable "wiki_agent_source_dir" {
  description = "Local path to the wiki-agent source directory (zipped + uploaded for CodeBuild)"
  type        = string
}

variable "repos_file_path" {
  description = "Local path to the repo-list file uploaded to trigger fan-out"
  type        = string
}

variable "build_timeout_minutes" {
  description = "CodeBuild build timeout in minutes"
  type        = number
  default     = 60
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the build logs"
  type        = number
  default     = 30
}
