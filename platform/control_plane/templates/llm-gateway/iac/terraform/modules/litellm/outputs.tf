output "gateway_endpoint" {
  description = "Public gateway endpoint (CloudFront). Use as LLM_GATEWAY_BASE_URL for agents."
  value       = "https://${aws_cloudfront_distribution.litellm.domain_name}"
}

output "admin_ui_url" {
  description = "LiteLLM admin UI URL via CloudFront"
  value       = "https://${aws_cloudfront_distribution.litellm.domain_name}/ui"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for invalidations)"
  value       = aws_cloudfront_distribution.litellm.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.litellm.domain_name
}

output "alb_dns_name" {
  description = "ALB DNS name (internal — reachable only from CloudFront edges with x-origin-verify header)"
  value       = aws_lb.litellm.dns_name
}

output "origin_verify_secret" {
  description = "Shared secret for x-origin-verify header (used by CloudFront origin config)"
  value       = random_password.origin_verify.result
  sensitive   = true
}

output "master_key_secret_arn" {
  description = "Secrets Manager ARN holding the LiteLLM master key"
  value       = aws_secretsmanager_secret.litellm.arn
}

output "config_parameter_name" {
  description = "SSM parameter holding the rendered LiteLLM config.yaml"
  value       = aws_ssm_parameter.config.name
}

output "audit_log_group_name" {
  description = "CloudWatch log group for LiteLLM request + audit logs"
  value       = aws_cloudwatch_log_group.litellm.name
}

output "cluster_name" {
  description = "ECS cluster name (used by the backend to trigger redeploys)"
  value       = aws_ecs_cluster.litellm.name
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.litellm.name
}
