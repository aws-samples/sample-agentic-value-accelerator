output "gateway_endpoint" {
  description = "Public gateway endpoint (CloudFront HTTPS). Use as LLM_GATEWAY_BASE_URL for agents."
  value       = module.litellm.gateway_endpoint
}

output "admin_ui_url" {
  description = "LiteLLM admin UI URL via CloudFront (Cognito-protected when SSO enabled)"
  value       = module.litellm.admin_ui_url
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID fronting the gateway"
  value       = module.litellm.cloudfront_distribution_id
}

output "alb_dns_name" {
  description = "Internal ALB DNS (reachable only from CloudFront edges with x-origin-verify header)"
  value       = module.litellm.alb_dns_name
}

output "master_key_secret_arn" {
  description = "Secrets Manager ARN holding the LiteLLM master key"
  value       = module.litellm.master_key_secret_arn
}

output "config_parameter_name" {
  description = "SSM Parameter holding the rendered LiteLLM config.yaml"
  value       = module.litellm.config_parameter_name
}

output "vpc_id" {
  description = "VPC ID the gateway runs in"
  value       = local.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs the gateway tasks attach to"
  value       = local.private_subnet_ids
}

output "model_list_endpoint" {
  description = "OpenAI-compatible /v1/models endpoint for discovery"
  value       = "${module.litellm.gateway_endpoint}/v1/models"
}

output "audit_log_group_name" {
  description = "CloudWatch log group for LiteLLM audit / request logs"
  value       = module.litellm.audit_log_group_name
}
