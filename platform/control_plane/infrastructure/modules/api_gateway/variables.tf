variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for VPC link (same AZs as ALB)"
  type        = list(string)
}

variable "ecs_service_name" {
  description = "ECS service name"
  type        = string
}

variable "ecs_security_group_id" {
  description = "ECS security group ID"
  type        = string
}

variable "ecs_target_group_arn" {
  description = "ECS target group ARN"
  type        = string
}

variable "ecs_listener_arn" {
  description = "ECS ALB listener ARN"
  type        = string
}

variable "domain_name" {
  description = "Domain name for API Gateway"
  type        = string
  default     = ""
}

variable "api_prefix" {
  description = "Subdomain prefix used to build the API Gateway custom domain (<api_prefix>.<domain_name>). Defaults to \"api\"; override to sidestep global API GW domain-name conflicts."
  type        = string
  default     = "api"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for api.<domain_name>, provisioned externally by scripts/acm.sh. Must be in the same region as this API Gateway (Regional endpoint type). When empty, no custom domain is created and the API is only reachable at its default execute-api URL."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
