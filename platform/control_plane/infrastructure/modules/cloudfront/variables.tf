variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "frontend_bucket_id" {
  description = "Frontend S3 bucket ID"
  type        = string
}

variable "frontend_bucket_arn" {
  description = "Frontend S3 bucket ARN"
  type        = string
}

variable "domain_name" {
  description = "Domain name for CloudFront"
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the apex domain, provisioned externally by scripts/acm.sh. Must be in us-east-1 (CloudFront requirement). When empty, CloudFront uses its default *.cloudfront.net certificate and the alias record is not created."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}

# Optional: extra CloudFront distribution ARNs that should also be allowed
# to read from the frontend S3 bucket. Use this when a separate CF (e.g.
# the public alias dist that lives outside this terraform state) needs OAC
# access. Without this, terraform's bucket policy would lock those CFs out.
variable "extra_distribution_arns" {
  description = "Additional CloudFront distribution ARNs to grant s3:GetObject on the frontend bucket."
  type        = list(string)
  default     = []
}
