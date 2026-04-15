output "vpc_id" {
  description = "VPC identifier"
  value       = local.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = join(",", local.public_subnet_ids)
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = join(",", local.private_subnet_ids)
}

output "security_group_id" {
  description = "Default security group ID"
  value       = local.use_existing_vpc ? "" : aws_security_group.default[0].id
}

output "langfuse_host" {
  description = "Langfuse server URL"
  value       = module.langfuse.langfuse_host
}

output "langfuse_secret_name" {
  description = "Secrets Manager secret name containing Langfuse API keys"
  value       = module.langfuse.langfuse_secret_name
}

output "langfuse_load_balancer_dns" {
  description = "Langfuse ALB DNS name (not directly accessible — CloudFront only)"
  value       = module.langfuse.load_balancer_dns_name
}

output "langfuse_cloudfront_domain" {
  description = "Langfuse CloudFront domain name (public HTTPS endpoint)"
  value       = module.langfuse.cloudfront_domain_name
}
