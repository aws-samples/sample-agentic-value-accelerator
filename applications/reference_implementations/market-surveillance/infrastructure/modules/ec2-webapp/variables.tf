variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where EC2 instances will be created"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for EC2 instances"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs for EC2 instances"
  type        = list(string)
}

variable "target_group_arns" {
  description = "List of target group ARNs to attach instances to"
  type        = list(string)
}

variable "ecr_repository_url" {
  description = "ECR repository URL for web app Docker image"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "instance_type" {
  description = "EC2 instance type (ARM64-based for cost efficiency)"
  type        = string
  default     = "t4g.small"
}

variable "min_size" {
  description = "Minimum number of instances in Auto Scaling Group"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum number of instances in Auto Scaling Group"
  type        = number
  default     = 3
}

variable "desired_capacity" {
  description = "Desired number of instances in Auto Scaling Group"
  type        = number
  default     = 2
}

variable "health_check_grace_period" {
  description = "Time after instance launch before health checks start"
  type        = number
  default     = 300
}

variable "health_check_type" {
  description = "Type of health check (EC2 or ELB)"
  type        = string
  default     = "ELB"
}

variable "container_port" {
  description = "Port on which the Docker container listens"
  type        = number
  default     = 3000
}

variable "enable_monitoring" {
  description = "Enable detailed monitoring"
  type        = bool
  default     = true
}

variable "key_name" {
  description = "SSH key pair name for EC2 instances (optional)"
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for authentication"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito Client ID for authentication"
  type        = string
}

variable "api_endpoint" {
  description = "API Gateway endpoint URL"
  type        = string
}

variable "agentcore_endpoint" {
  description = "AgentCore Runtime endpoint URL"
  type        = string
}

variable "risk_agentcore_endpoint" {
  description = "Risk Analyst AgentCore Runtime endpoint URL"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encrypting CloudWatch Log Group"
  type        = string
  default     = null
}

variable "target_cpu_utilization" {
  description = "Target CPU utilization for auto scaling"
  type        = number
  default     = 70
}

variable "scale_up_cooldown" {
  description = "Cooldown period after scale up in seconds"
  type        = number
  default     = 300
}

variable "scale_down_cooldown" {
  description = "Cooldown period after scale down in seconds"
  type        = number
  default     = 300
}
