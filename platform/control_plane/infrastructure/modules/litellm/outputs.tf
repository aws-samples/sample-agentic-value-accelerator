# =============================================================================
# LiteLLM Gateway Module - Outputs
# =============================================================================

output "gateway_endpoint" {
  description = "Primary gateway endpoint — internal ALB on port 4000"
  value       = "http://${aws_lb.litellm.dns_name}:4000"
}

output "gateway_alb_dns" {
  description = "Internal ALB DNS name for gateway traffic within the VPC"
  value       = aws_lb.litellm.dns_name
}

output "rds_endpoint" {
  description = "PostgreSQL connection endpoint for virtual key persistence and spend tracking"
  value       = aws_db_instance.litellm.endpoint
}

output "redis_endpoint" {
  description = "Redis primary endpoint for prompt caching and rate limiting"
  value       = aws_elasticache_replication_group.litellm.primary_endpoint_address
}

output "gateway_security_group_id" {
  description = "Security group ID attached to gateway ECS tasks"
  value       = aws_security_group.litellm_tasks.id
}

output "litellm_master_key_secret_arn" {
  description = "Secrets Manager ARN for the LiteLLM primary key"
  value       = aws_secretsmanager_secret.master_key.arn
}

output "ecs_service_name" {
  description = "ECS service name for the gateway"
  value       = aws_ecs_service.litellm.name
}

output "ecs_task_definition_arn" {
  description = "ECS task definition ARN for the gateway"
  value       = aws_ecs_task_definition.litellm.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name for gateway logs"
  value       = aws_cloudwatch_log_group.litellm.name
}

output "alb_target_group_arn" {
  description = "ALB target group ARN for the gateway"
  value       = aws_lb_target_group.litellm.arn
}

output "config_s3_bucket" {
  description = "S3 bucket name for LiteLLM config storage"
  value       = aws_s3_bucket.config.id
}

output "config_s3_prefix" {
  description = "S3 key prefix for LiteLLM config files"
  value       = var.config_s3_prefix
}

# -----------------------------------------------------------------------------
# Backend Integration Wiring
# -----------------------------------------------------------------------------
# The Control Plane backend (deployed separately) requires these values as
# environment variables for ConfigGenerator and gateway management to function.
#
# Deployment layer must:
# 1. Set literal values directly as env vars on the backend ECS task.
# 2. For LITELLM_MASTER_KEY: use ECS Secrets Manager injection:
#      { "name": "LITELLM_MASTER_KEY", "valueFrom": "<secret_arn>" }
#    The "from:<arn>" notation below indicates the source ARN for the
#    deployment automation to wire as a Secrets Manager reference.
#
# Example ECS task definition environment wiring:
#   environment = [
#     { name = "LITELLM_GATEWAY_URL",      value = module.litellm.backend_environment_variables.LITELLM_GATEWAY_URL },
#     { name = "LITELLM_CONFIG_S3_BUCKET", value = module.litellm.backend_environment_variables.LITELLM_CONFIG_S3_BUCKET },
#     { name = "LITELLM_CONFIG_S3_PREFIX", value = module.litellm.backend_environment_variables.LITELLM_CONFIG_S3_PREFIX },
#     { name = "LITELLM_ECS_CLUSTER",      value = module.litellm.backend_environment_variables.LITELLM_ECS_CLUSTER },
#     { name = "LITELLM_ECS_SERVICE",      value = module.litellm.backend_environment_variables.LITELLM_ECS_SERVICE },
#   ]
#   secrets = [
#     { name = "LITELLM_MASTER_KEY", valueFrom = module.litellm.litellm_master_key_secret_arn },
#   ]
# -----------------------------------------------------------------------------

output "backend_environment_variables" {
  description = "Environment variables that must be set on the Control Plane backend for gateway integration. LITELLM_MASTER_KEY uses 'from:<arn>' to indicate Secrets Manager injection."
  value = {
    LITELLM_GATEWAY_URL      = "http://${aws_lb.litellm.dns_name}:4000"
    LITELLM_MASTER_KEY       = "from:${aws_secretsmanager_secret.master_key.arn}"
    LITELLM_CONFIG_S3_BUCKET = aws_s3_bucket.config.id
    LITELLM_CONFIG_S3_PREFIX = var.config_s3_prefix
    LITELLM_ECS_CLUSTER      = local.ecs_cluster_name
    LITELLM_ECS_SERVICE      = aws_ecs_service.litellm.name
  }
}
