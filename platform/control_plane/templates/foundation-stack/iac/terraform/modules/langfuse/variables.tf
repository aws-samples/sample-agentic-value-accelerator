variable "name" {
  description = "Name prefix for resources"
  type        = string
  default     = "langfuse"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "domain" {
  description = "Domain name used for resource naming (e.g., company.com). If not provided, will use load balancer DNS name for NEXTAUTH_URL"
  type        = string
  default     = null
}

variable "vpc_id" {
  description = "CIDR block for VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of CIDR blocks allowed to access the ingress"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of CIDR blocks allowed to access the ingress"
  type        = list(string)
}


variable "use_encryption_key" {
  description = "Whether or not to use an Encryption key for LLM API credential and integration credential store"
  type        = bool
  default     = false
}

variable "postgres_instance_count" {
  description = "Number of PostgreSQL instances to create"
  type        = number
  default     = 2 # Default to 2 instances for high availability
}

variable "postgres_min_capacity" {
  description = "Minimum ACU capacity for PostgreSQL Serverless v2"
  type        = number
  default     = 0.5
}

variable "postgres_max_capacity" {
  description = "Maximum ACU capacity for PostgreSQL Serverless v2"
  type        = number
  default     = 2.0 # Higher default for production readiness
}

variable "postgres_version" {
  description = "PostgreSQL engine version to use"
  type        = string
  default     = "15.12"
}

variable "cache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.small"
}

variable "cache_instance_count" {
  description = "Number of ElastiCache instances used in the cluster"
  type        = number
  default     = 1
}

variable "clickhouse_instance_count" {
  description = "Number of ClickHouse instances used in the cluster"
  type        = number
  default     = 3
}

variable "use_single_nat_gateway" {
  description = "To use a single NAT Gateway (cheaper), or one per AZ (more resilient)"
  type        = bool
  default     = false
}

# ECS-specific variables
# Note: Image URIs are auto-generated from ECR repos created in ecr.tf.
# Override these only if you want to use pre-existing images.

variable "langfuse_cpu" {
  description = "CPU units for Langfuse containers (1024 = 1 vCPU)"
  type        = number
  default     = 2048
}

variable "langfuse_memory" {
  description = "Memory allocation for Langfuse containers in MB"
  type        = number
  default     = 4096
}

variable "langfuse_desired_count" {
  description = "Desired number of Langfuse tasks"
  type        = number
  default     = 2
}

variable "clickhouse_cpu" {
  description = "CPU units for ClickHouse containers (1024 = 1 vCPU)"
  type        = number
  default     = 2048
}

variable "clickhouse_memory" {
  description = "Memory allocation for ClickHouse containers in MB"
  type        = number
  default     = 8192
}

variable "clickhouse_desired_count" {
  description = "Desired number of ClickHouse tasks"
  type        = number
  default     = 3
}

variable "alb_scheme" {
  description = "Scheme for the ALB (internal or internet-facing)"
  type        = string
  default     = "internet-facing"
}

variable "ingress_inbound_cidrs" {
  description = "List of CIDR blocks allowed to access the ingress"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "redis_at_rest_encryption" {
  description = "Whether at-rest encryption is enabled for the Redis cluster"
  type        = bool
  default     = false
}

variable "redis_multi_az" {
  description = "Whether Multi-AZ is enabled for the Redis cluster"
  type        = bool
  default     = false
}

variable "enable_execute_command" {
  description = "Enable ECS Execute Command for debugging"
  type        = bool
  default     = false
}

variable "project_name" {
  description = "Project name"
  type        = string
}

# Langfuse seed user configuration
variable "langfuse_init_user_email" {
  description = "Email for the initial Langfuse admin user"
  type        = string
  default     = "admin@langfuse.local"
}

variable "langfuse_init_user_name" {
  description = "Display name for the initial Langfuse admin user"
  type        = string
  default     = "admin"
}

variable "langfuse_init_user_password" {
  description = "Password for the initial Langfuse admin user. Must contain letters, numbers, and at least one special character."
  type        = string
  sensitive   = true
  default     = "Password123!"
}

variable "langfuse_init_org_name" {
  description = "Name of the initial Langfuse organization"
  type        = string
  default     = "Default Org"
}
