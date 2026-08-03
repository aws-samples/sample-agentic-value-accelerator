variable "project" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "sales-recommend"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "enable_nat" {
  description = <<-EOT
    Enable NAT Gateway for private subnet egress. Set to false for testing
    accounts with EIP/VPC limits — ECS tasks will use public subnets instead.
  EOT
  type        = bool
  default     = false
}
