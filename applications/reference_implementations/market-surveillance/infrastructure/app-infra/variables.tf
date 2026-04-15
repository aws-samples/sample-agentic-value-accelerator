variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"
}

# AgentCore variables
variable "agentcore_protocol" {
  description = "Protocol for AgentCore Runtime (HTTP, MCP, or A2A)"
  type        = string
  default     = "HTTP"

  validation {
    condition     = contains(["HTTP", "MCP", "A2A"], var.agentcore_protocol)
    error_message = "Protocol must be one of: HTTP, MCP, A2A"
  }
}

variable "agentcore_image_tag" {
  description = "Docker image tag for the AgentCore container (e.g., latest, v1.0.0)"
  type        = string
  default     = "latest"
}

# ECR variables
variable "ecr_image_retention_count" {
  description = "Number of images to retain in ECR repository"
  type        = number
  default     = 10
}

# Web Application Configuration
variable "webapp_image_tag" {
  description = "Docker image tag for the web application"
  type        = string
  default     = "latest"
}

variable "webapp_instance_type" {
  description = "EC2 instance type for web application (ARM64-based)"
  type        = string
  default     = "t4g.small"
}

variable "webapp_min_size" {
  description = "Minimum number of EC2 instances for web application"
  type        = number
  default     = 1
}

variable "webapp_max_size" {
  description = "Maximum number of EC2 instances for web application"
  type        = number
  default     = 3
}

variable "webapp_desired_capacity" {
  description = "Desired number of EC2 instances for web application"
  type        = number
  default     = 2
}

# Lambda Configuration
variable "enable_lambda_vpc" {
  description = "Enable VPC configuration for Lambda functions (keeps all data within VPC)"
  type        = bool
  default     = true
}

# API Gateway variables
variable "api_throttling_rate_limit" {
  description = "API Gateway throttling rate limit (requests per second)"
  type        = number
  default     = 100
}

variable "api_throttling_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 50
}

# Database username (for AgentCore environment variables)
variable "db_username" {
  description = "Master username for the database (passed to AgentCore as environment variable)"
  type        = string
  default     = "dbadmin"
}

# =============================================================================
# Risk Analyst Agent Variables
# =============================================================================
variable "risk_agentcore_image_tag" {
  description = "Docker image tag for the Risk Analyst AgentCore container (e.g., latest, v1.0.0)"
  type        = string
  default     = "latest"
}

variable "risk_agentcore_protocol" {
  description = "Protocol for Risk Analyst AgentCore Runtime (HTTP, MCP, or A2A)"
  type        = string
  default     = "HTTP"

  validation {
    condition     = contains(["HTTP", "MCP", "A2A"], var.risk_agentcore_protocol)
    error_message = "Protocol must be one of: HTTP, MCP, A2A"
  }
}
