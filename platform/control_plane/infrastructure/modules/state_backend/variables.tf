variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "bucket_name_prefix" {
  description = "Prefix for the Terraform state S3 bucket name"
  type        = string
  default     = ""
}

variable "lock_table_name" {
  description = "Name for the DynamoDB lock table"
  type        = string
  default     = ""
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
