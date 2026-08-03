# =============================================================================
# LiteLLM Gateway Module - Input Variables
# =============================================================================

variable "name_prefix" {
  description = "Resource naming prefix for all LiteLLM gateway resources"
  type        = string
  default     = "ava-litellm"
}

variable "vpc_id" {
  description = "VPC ID where the gateway will be deployed (same VPC as Control Plane)"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks, RDS, and Redis (no public internet access)"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the internal Application Load Balancer"
  type        = list(string)
}

variable "ecs_cluster_id" {
  description = "Existing ECS cluster NAME (not ARN) where the gateway service will be deployed"
  type        = string
}

# -----------------------------------------------------------------------------
# Container Configuration
# -----------------------------------------------------------------------------

variable "litellm_image_tag" {
  description = "Pinned LiteLLM Docker image tag from ghcr.io/berriai/litellm"
  type        = string
  default     = "main-latest"
}

# -----------------------------------------------------------------------------
# Langfuse Observability
# -----------------------------------------------------------------------------

variable "langfuse_host" {
  description = "Langfuse endpoint URL for trace callbacks"
  type        = string
  default     = ""
}

variable "langfuse_public_key" {
  description = "Langfuse public key for callback authentication"
  type        = string
  default     = ""
  sensitive   = true
}

variable "langfuse_secret_key" {
  description = "Langfuse secret key for callback authentication"
  type        = string
  default     = ""
  sensitive   = true
}

variable "langfuse_flush_interval" {
  description = "Interval in seconds for flushing buffered traces to Langfuse (Requirement 6.4)"
  type        = number
  default     = 60
}

variable "langfuse_buffer_ttl_seconds" {
  description = "Maximum seconds to buffer traces when Langfuse is unreachable before dropping (Requirement 6.4)"
  type        = number
  default     = 300
}

# -----------------------------------------------------------------------------
# ECS Service Scaling
# -----------------------------------------------------------------------------

variable "desired_count" {
  description = "Desired number of ECS tasks for the gateway service"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks for auto-scaling"
  type        = number
  default     = 10
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks for auto-scaling"
  type        = number
  default     = 2
}

variable "cpu_target" {
  description = "CPU utilization target percentage for auto-scaling"
  type        = number
  default     = 70
}

# -----------------------------------------------------------------------------
# RDS PostgreSQL Configuration
# -----------------------------------------------------------------------------

variable "rds_instance_class" {
  description = "RDS instance type for LiteLLM state persistence (virtual keys, spend, audit)"
  type        = string
  default     = "db.t3.medium"
}

# -----------------------------------------------------------------------------
# ElastiCache Redis Configuration
# -----------------------------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache Redis node type for caching and rate limiting"
  type        = string
  default     = "cache.t3.small"
}

variable "redis_num_cache_clusters" {
  description = "Number of Redis cache clusters (nodes) in the replication group"
  type        = number
  default     = 2
}

# -----------------------------------------------------------------------------
# Environment and Region
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for deployment and Bedrock endpoint routing"
  type        = string
  default     = "us-east-2"
}

# -----------------------------------------------------------------------------
# Tags
# -----------------------------------------------------------------------------

variable "tags" {
  description = "Additional resource tags merged with default module tags"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Health Check Configuration
# -----------------------------------------------------------------------------

variable "health_check_interval" {
  description = "Interval in seconds between ECS task health checks (Requirement 9.3)"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Timeout in seconds for each health check attempt (Requirement 9.3)"
  type        = number
  default     = 5
}

variable "health_check_retries" {
  description = "Number of retries before marking a task unhealthy (Requirement 9.3)"
  type        = number
  default     = 3
}

variable "health_check_start_period" {
  description = "Grace period in seconds before health checks begin (allows container startup)"
  type        = number
  default     = 60
}

variable "health_check_grace_period" {
  description = "Grace period in seconds for ECS service health check enforcement during deployments"
  type        = number
  default     = 60
}

variable "deployment_maximum_percent" {
  description = "Maximum percent of desired tasks during rolling deployment"
  type        = number
  default     = 200
}

variable "deployment_minimum_healthy_percent" {
  description = "Minimum percent of healthy tasks maintained during rolling deployment"
  type        = number
  default     = 50
}

# -----------------------------------------------------------------------------
# CloudFront (Optional)
# -----------------------------------------------------------------------------

# CloudFront removed — internal ALB on port 4000 is the only supported endpoint.
# Re-add CloudFront/WAF when VPC origin design is implemented.

# -----------------------------------------------------------------------------
# Config S3 Bucket
# -----------------------------------------------------------------------------

variable "config_s3_bucket" {
  description = "S3 bucket for LiteLLM config storage"
  type        = string
}

variable "config_s3_prefix" {
  description = "S3 key prefix for LiteLLM config files"
  type        = string
  default     = "litellm"
}

# -----------------------------------------------------------------------------
# Lambda Layers
# -----------------------------------------------------------------------------

variable "spend_aggregator_lambda_layers" {
  description = "Lambda layer ARNs containing the 'requests' package. Required for the Spend Aggregator to function."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.spend_aggregator_lambda_layers) > 0 || var.environment == "dev"
    error_message = "spend_aggregator_lambda_layers must contain at least one layer ARN with the 'requests' package for non-dev environments."
  }
}

# -----------------------------------------------------------------------------
# Bedrock Mantle
# -----------------------------------------------------------------------------

variable "bedrock_mantle_api_key" {
  description = "Bedrock Mantle API key for GPT-5.x models. Leave empty to disable mantle models."
  type        = string
  default     = ""
  sensitive   = true
}
