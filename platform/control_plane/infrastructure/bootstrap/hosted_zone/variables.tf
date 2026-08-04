variable "aws_region" {
  description = "AWS region for the provider. Route 53 itself is global, but the provider still requires a region."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment tag."
  type        = string
  default     = "dev"
}

variable "domain_name" {
  description = "Hosted zone name. Do NOT include a trailing dot; terraform adds it. Set via -var when applying (deploy-full.sh reads HOSTED_ZONE_DOMAIN from repo-root .env and passes it in)."
  type        = string
}
