variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer (optional). At least one of alb_dns_name or api_gateway_domain must be provided."
  type        = string
  default     = ""
}

variable "api_gateway_domain" {
  description = "The domain of the API Gateway (optional). At least one of alb_dns_name or api_gateway_domain must be provided."
  type        = string
  default     = ""
}

variable "api_gateway_stage" {
  description = "The stage name of the API Gateway"
  type        = string
  default     = ""
}

variable "web_acl_arn" {
  description = "The ARN of the WAF Web ACL"
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Price class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "min_ttl" {
  description = "Minimum TTL for cached objects"
  type        = number
  default     = 0
}

variable "default_ttl" {
  description = "Default TTL for cached objects"
  type        = number
  default     = 300  # 5 minutes instead of 24 hours
}

variable "max_ttl" {
  description = "Maximum TTL for cached objects"
  type        = number
  default     = 3600  # 1 hour instead of 1 year
}

variable "enable_logging" {
  description = "Enable CloudFront access logging"
  type        = bool
  default     = false
}

variable "log_bucket" {
  description = "S3 bucket for CloudFront access logs"
  type        = string
  default     = ""
}
