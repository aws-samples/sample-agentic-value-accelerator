variable "project_name" {
  description = "Project name"
  type        = string
  default     = "foundation"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "environment" {
  description = "Environment"
  type        = string
  default     = "dev"
}

variable "langfuse_admin_email" {
  description = "Email for the initial Langfuse admin user"
  type        = string
}

variable "langfuse_admin_password" {
  description = "Password for the initial Langfuse admin user"
  type        = string
  sensitive   = true
}

variable "existing_vpc_id" {
  description = "Existing VPC ID to reuse (leave empty to create a new VPC)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
