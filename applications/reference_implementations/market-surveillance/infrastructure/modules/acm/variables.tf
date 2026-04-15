variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

# Certificate Creation
variable "create_certificate" {
  description = "Whether to create a new ACM certificate (true) or use existing/imported (false)"
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Domain name for the certificate (e.g., trade-alerts.example.com)"
  type        = string
  default     = ""
}

variable "subject_alternative_names" {
  description = "Additional domain names for the certificate (e.g., ['*.example.com'])"
  type        = list(string)
  default     = []
}

variable "validation_method" {
  description = "Certificate validation method: DNS or EMAIL"
  type        = string
  default     = "DNS"
}

# Route 53 DNS Validation
variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for DNS validation (leave empty for manual validation)"
  type        = string
  default     = ""
}

# Certificate Import
variable "certificate_body" {
  description = "PEM-encoded certificate body for import"
  type        = string
  default     = ""
  sensitive   = true
}

variable "private_key" {
  description = "PEM-encoded private key for import"
  type        = string
  default     = ""
  sensitive   = true
}

variable "certificate_chain" {
  description = "PEM-encoded certificate chain for import"
  type        = string
  default     = ""
  sensitive   = true
}

# Existing Certificate
variable "existing_certificate_arn" {
  description = "ARN of existing ACM certificate to use (if not creating or importing)"
  type        = string
  default     = ""
}
