variable "aws_region" {
  description = "AWS region for the api.<zone> cert. The apex cert is always issued in us-east-1 regardless of this value (CloudFront requirement)."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment tag."
  type        = string
  default     = "dev"
}

variable "domain_name" {
  description = "Apex domain covered by the certs. The API cert covers <api_prefix>.<domain_name>. Set via -var when applying (acm.sh reads HOSTED_ZONE_DOMAIN from repo-root .env and passes it in)."
  type        = string
}

variable "api_prefix" {
  description = "Subdomain prefix for the API custom domain (e.g. \"api\" → api.<domain_name>). Override to sidestep global API Gateway domain-name conflicts with other AWS accounts. Set via -var when applying (acm.sh reads API_PREFIX from repo-root .env and passes it in)."
  type        = string
  default     = "api"
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID that will hold both DNS-01 validation CNAMEs. Must be the zone this bootstrap/hosted_zone module created and that the parent zone has already delegated to."
  type        = string
}
