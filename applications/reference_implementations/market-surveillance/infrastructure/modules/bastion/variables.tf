variable "app_name" {
  description = "Application name"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for the bastion host (should be a private subnet with NAT gateway)"
  type        = string
}

variable "security_group_id" {
  description = "Security group ID for the bastion host"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for bastion host"
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size" {
  description = "Size of the root EBS volume in GB"
  type        = number
  default     = 30
}

variable "db_secret_arn" {
  description = "ARN of the RDS database secret (optional)"
  type        = string
  default     = ""
}

variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring for the bastion host"
  type        = bool
  default     = true
}

variable "enable_secrets" {
  description = "Enable Access to Secrets Manager to read RDS"
  type        = bool
  default     = false
}