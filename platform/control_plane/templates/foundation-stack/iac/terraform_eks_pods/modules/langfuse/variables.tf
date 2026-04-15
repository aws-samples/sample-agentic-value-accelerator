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
  description = "Domain name used for NEXTAUTH_URL and resource naming (e.g., company.com). If not provided, defaults to the name variable."
  type        = string
  default     = null
}

variable "enable_https" {
  description = "Whether to enable HTTPS on the ALB ingress. When false, only HTTP on port 80 is used. Set to true when you have a valid ACM certificate for the domain."
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "VPC ID for deployment"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
  default     = []
}

variable "kubernetes_version" {
  description = "Kubernetes version to use for the EKS cluster"
  type        = string
  default     = "1.32"
}

variable "use_encryption_key" {
  description = "Whether to use an Encryption key for LLM API credential and integration credential store"
  type        = bool
  default     = true
}

variable "enable_clickhouse_log_tables" {
  description = "Whether to enable Clickhouse logging tables."
  type        = bool
  default     = false
}

variable "fargate_profile_namespaces" {
  description = "List of Namespaces which are created with a fargate profile. Note: namespaces with EBS-backed pods (langfuse) must use managed node groups, not Fargate."
  type        = list(string)
  default = [
    "default",
    "kube-system",
  ]
}

variable "node_instance_type" {
  description = "EC2 instance type for the managed node group running EBS-backed workloads"
  type        = string
  default     = "m5.xlarge"
}

variable "node_desired_size" {
  description = "Desired number of nodes in the managed node group"
  type        = number
  default     = 4
}

variable "node_min_size" {
  description = "Minimum number of nodes in the managed node group"
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum number of nodes in the managed node group"
  type        = number
  default     = 5
}

variable "use_single_nat_gateway" {
  description = "To use a single NAT Gateway (cheaper), or one per AZ (more resilient)"
  type        = bool
  default     = false
}

variable "langfuse_helm_chart_version" {
  description = "Version of the Langfuse Helm chart to deploy"
  type        = string
  default     = "1.5.24"
}

# Resource configuration variables
variable "langfuse_cpu" {
  description = "CPU allocation for Langfuse containers"
  type        = string
  default     = "2"
}

variable "langfuse_memory" {
  description = "Memory allocation for Langfuse containers"
  type        = string
  default     = "4Gi"
}

variable "langfuse_web_replicas" {
  description = "Number of replicas for Langfuse web container"
  type        = number
  default     = 1
  validation {
    condition     = var.langfuse_web_replicas > 0
    error_message = "There must be at least one Langfuse web replica."
  }
}

variable "langfuse_worker_replicas" {
  description = "Number of replicas for Langfuse worker container"
  type        = number
  default     = 1
  validation {
    condition     = var.langfuse_worker_replicas > 0
    error_message = "There must be at least one Langfuse worker replica."
  }
}

variable "clickhouse_replicas" {
  description = "Number of replicas of ClickHouse containers"
  type        = number
  default     = 3
  validation {
    condition     = var.clickhouse_replicas > 1
    error_message = "There must be at least two clickhouse replicas for high availability."
  }
}

variable "clickhouse_cpu" {
  description = "CPU allocation for ClickHouse containers"
  type        = string
  default     = "2"
}

variable "clickhouse_memory" {
  description = "Memory allocation for ClickHouse containers"
  type        = string
  default     = "8Gi"
}

variable "clickhouse_keeper_cpu" {
  description = "CPU allocation for ClickHouse Keeper containers"
  type        = string
  default     = "1"
}

variable "clickhouse_keeper_memory" {
  description = "Memory allocation for ClickHouse Keeper containers"
  type        = string
  default     = "2Gi"
}

# In-cluster PostgreSQL sizing
variable "postgres_cpu" {
  description = "CPU allocation for in-cluster PostgreSQL pod"
  type        = string
  default     = "1"
}

variable "postgres_memory" {
  description = "Memory allocation for in-cluster PostgreSQL pod"
  type        = string
  default     = "2Gi"
}

variable "postgres_storage_size" {
  description = "Persistent volume size for PostgreSQL data"
  type        = string
  default     = "20Gi"
}

# In-cluster Redis sizing
variable "redis_cpu" {
  description = "CPU allocation for in-cluster Redis pod"
  type        = string
  default     = "0.5"
}

variable "redis_memory" {
  description = "Memory allocation for in-cluster Redis pod"
  type        = string
  default     = "1Gi"
}

# In-cluster MinIO (S3-compatible) sizing
variable "minio_cpu" {
  description = "CPU allocation for in-cluster MinIO pod"
  type        = string
  default     = "0.5"
}

variable "minio_memory" {
  description = "Memory allocation for in-cluster MinIO pod"
  type        = string
  default     = "1Gi"
}

variable "minio_storage_size" {
  description = "Persistent volume size for MinIO data"
  type        = string
  default     = "50Gi"
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

# Langfuse admin user
variable "langfuse_init_user_email" {
  description = "Email for the initial Langfuse admin user"
  type        = string
  default     = "admin@langfuse.local"
}

variable "langfuse_init_user_password" {
  description = "Password for the initial Langfuse admin user"
  type        = string
  sensitive   = true
  default     = "Password123!"
}

variable "langfuse_init_org_name" {
  description = "Name of the initial Langfuse organization"
  type        = string
  default     = "Default Org"
}

# Additional environment variables
variable "additional_env" {
  description = "Additional environment variables to set on Langfuse pods"
  type = list(object({
    name  = string
    value = optional(string)
    valueFrom = optional(object({
      secretKeyRef = optional(object({
        name = string
        key  = string
      }))
      configMapKeyRef = optional(object({
        name = string
        key  = string
      }))
    }))
  }))
  default = []

  validation {
    condition = alltrue([
      for env in var.additional_env :
      (env.value != null && env.valueFrom == null) || (env.value == null && env.valueFrom != null)
    ])
    error_message = "Each environment variable must have either 'value' or 'valueFrom' specified, but not both."
  }
}
