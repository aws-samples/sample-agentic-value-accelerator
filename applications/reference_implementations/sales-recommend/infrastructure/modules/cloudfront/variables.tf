variable "project" {
  description = "Project name used for resource naming"
  type        = string
  default     = "sales-recommend"
}

variable "alb_dns_name" {
  description = "DNS name of the ALB origin"
  type        = string
}

variable "auth_username" {
  description = "Basic auth username for CloudFront function"
  type        = string
  sensitive   = true
}

variable "auth_password" {
  description = "Basic auth password for CloudFront function"
  type        = string
  sensitive   = true
}

variable "origin_secret" {
  description = "Secret header value that CloudFront sends to ALB — ALB rejects requests without it"
  type        = string
  sensitive   = true
}
