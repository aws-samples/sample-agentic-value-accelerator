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

# Networking variables
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.3.0/24", "10.0.4.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for isolated database subnets"
  type        = list(string)
  default     = ["10.0.5.0/24", "10.0.6.0/24"]
}

variable "availability_zones" {
  description = "Availability zones for subnet distribution (must use AZs supported by Bedrock AgentCore: use1-az1, use1-az2, use1-az4)"
  type        = list(string)
  default     = ["us-east-1b", "us-east-1c"]
}

# RDS variables
variable "db_name" {
  description = "Name for the database"
  type        = string
  default     = "marketsurveillance"
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
  default     = "dbadmin"
}

variable "db_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_cluster_instance_count" {
  description = "Number of Aurora cluster instances"
  type        = number
  default     = 1
}

variable "db_backup_retention_period" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 7
}

# Risk Analyst RDS variables
variable "msp_db_name" {
  description = "Name for the Risk Analyst database"
  type        = string
  default     = "msp"
}

variable "msp_db_username" {
  description = "Master username for the Risk Analyst database"
  type        = string
  default     = "dbadmin"
}

variable "msp_db_instance_class" {
  description = "Aurora instance class for Risk Analyst cluster"
  type        = string
  default     = "db.t3.medium"
}

variable "msp_db_cluster_instance_count" {
  description = "Number of Aurora cluster instances for Risk Analyst"
  type        = number
  default     = 1
}

variable "msp_db_backup_retention_period" {
  description = "Number of days to retain Risk Analyst database backups"
  type        = number
  default     = 7
}

# WAF variables
variable "waf_rate_limit" {
  description = "WAF rate limit for requests per 5 minutes"
  type        = number
  default     = 2000
}

# ============================================================================
# ACM Certificate Configuration
# ============================================================================

variable "certificate_domain_name" {
  description = "Domain name for ACM certificate (e.g., trade-alerts.example.com). Required if not using existing certificate."
  type        = string
  default     = ""
}

variable "certificate_subject_alternative_names" {
  description = "Subject Alternative Names (SANs) for the certificate (e.g., ['*.example.com'])"
  type        = list(string)
  default     = []
}

variable "certificate_validation_method" {
  description = "Certificate validation method: DNS or EMAIL"
  type        = string
  default     = "DNS"

  validation {
    condition     = contains(["DNS", "EMAIL"], var.certificate_validation_method)
    error_message = "Validation method must be DNS or EMAIL"
  }
}

variable "certificate_route53_zone_id" {
  description = "Route 53 hosted zone ID for automatic DNS validation (leave empty for manual DNS validation)"
  type        = string
  default     = ""
}

variable "certificate_import_enabled" {
  description = "Import an existing certificate instead of creating a new one"
  type        = bool
  default     = false
}

variable "certificate_body" {
  description = "Certificate body (PEM format) for import"
  type        = string
  default     = ""
  sensitive   = true
}

variable "certificate_private_key" {
  description = "Certificate private key (PEM format) for import"
  type        = string
  default     = ""
  sensitive   = true
}

variable "certificate_chain" {
  description = "Certificate chain (PEM format) for import"
  type        = string
  default     = ""
  sensitive   = true
}

variable "certificate_existing_arn" {
  description = "ARN of existing ACM certificate to use (skips creation/import)"
  type        = string
  default     = ""
}

# ALB SSL Configuration
variable "alb_ssl_policy" {
  description = "SSL policy for ALB HTTPS listener"
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}
