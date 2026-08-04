# =============================================================================
# Dev Environment Outputs
# =============================================================================

output "gateway_endpoint" {
  description = "LiteLLM gateway endpoint (internal ALB URL)"
  value       = module.litellm.gateway_endpoint
}

output "config_s3_bucket" {
  description = "S3 bucket for LiteLLM config storage"
  value       = module.litellm.config_s3_bucket
}

output "backend_environment_variables" {
  description = "Environment variables for the Control Plane backend to integrate with the gateway"
  value       = module.litellm.backend_environment_variables
}

output "vpc_id" {
  description = "VPC ID created for this deployment"
  value       = aws_vpc.main.id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "master_key_secret_arn" {
  description = "Secrets Manager ARN for the LiteLLM primary key"
  value       = module.litellm.litellm_master_key_secret_arn
}


output "bastion_instance_id" {
  description = "SSM bastion instance ID — connect with: aws ssm start-session --target <id>"
  value       = module.bastion.instance_id
}

output "backend_endpoint" {
  description = "Control Plane backend API endpoint"
  value       = "http://${aws_lb.backend.dns_name}:8000"
}

output "frontend_endpoint" {
  description = "Control Plane frontend URL (public, IP-restricted)"
  value       = "http://${aws_lb.frontend.dns_name}"
}
