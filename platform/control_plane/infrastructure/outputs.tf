# ============================================================================
# VPC Outputs
# ============================================================================

output "vpc_id" {
  description = "VPC ID"
  value       = local.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = local.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = local.private_subnet_ids
}

# ============================================================================
# DynamoDB Outputs
# ============================================================================

output "application_catalog_table_name" {
  description = "Application Catalog DynamoDB table name"
  value       = module.dynamodb.application_catalog_table_name
}

output "deployment_metadata_table_name" {
  description = "Deployment Metadata DynamoDB table name"
  value       = module.dynamodb.deployment_metadata_table_name
}

# ============================================================================
# S3 Outputs
# ============================================================================

output "project_archives_bucket_name" {
  description = "Project archives S3 bucket name"
  value       = module.s3.project_archives_bucket_name
}

output "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  value       = module.s3.frontend_bucket_name
}

# ============================================================================
# ECR Outputs
# ============================================================================

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = module.ecr.repository_url
}

# ============================================================================
# ECS Outputs
# ============================================================================

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.ecs.service_name
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.ecs.alb_dns_name
}

# ============================================================================
# API Gateway Outputs
# ============================================================================

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = module.api_gateway.api_endpoint
}

output "api_custom_domain_url" {
  description = "API Gateway custom domain URL (if configured)"
  value       = module.api_gateway.custom_domain_url
}

# ============================================================================
# Step Functions Outputs
# ============================================================================

output "state_machine_arn" {
  description = "Step Functions state machine ARN"
  value       = module.step_functions.state_machine_arn
}

output "state_machine_name" {
  description = "Step Functions state machine name"
  value       = module.step_functions.state_machine_name
}

# Frontier Agents (AaaS) pipeline
output "frontier_agents_state_machine_arn" {
  description = "Step Functions state machine ARN for the Frontier Agents pipeline"
  value       = module.frontier_agents_pipeline.state_machine_arn
}

output "frontier_agents_codebuild_project_name" {
  description = "CodeBuild project name for the Frontier Agents pipeline"
  value       = module.frontier_agents_pipeline.codebuild_project_name
}

# ============================================================================
# Cognito Outputs
# ============================================================================

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = module.cognito.user_pool_client_id
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI URL"
  value       = module.cognito.hosted_ui_url
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = module.cognito.identity_pool_id
}

# ============================================================================
# CloudFront Outputs
# ============================================================================

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
}

output "frontend_url" {
  description = "Frontend URL"
  value       = module.cloudfront.frontend_url
}

# ============================================================================
# Observability Outputs
# ============================================================================

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.observability.dashboard_name
}

# ============================================================================
# CodeBuild Outputs
# ============================================================================

output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = module.codebuild.project_name
}

output "codebuild_project_arn" {
  description = "CodeBuild project ARN"
  value       = module.codebuild.project_arn
}

output "codebuild_role_arn" {
  description = "CodeBuild IAM role ARN"
  value       = module.codebuild.role_arn
}

# ============================================================================
# Agent Registry Outputs (AWS Agent Registry - preview)
# ============================================================================

output "agent_registry_arn" {
  description = "Shared AWS Agent Registry ARN. All app-factory agents publish records here."
  value       = module.agent_registry.registry_arn
}

output "agent_registry_name" {
  description = "Shared AWS Agent Registry name."
  value       = module.agent_registry.registry_name
}

# ============================================================================
# EventBridge Outputs
# ============================================================================

output "eventbridge_bus_arn" {
  description = "EventBridge event bus ARN"
  value       = module.eventbridge.event_bus_arn
}

output "eventbridge_bus_name" {
  description = "EventBridge event bus name"
  value       = module.eventbridge.event_bus_name
}

output "eventbridge_dlq_arn" {
  description = "EventBridge dead-letter queue ARN"
  value       = module.eventbridge.dlq_arn
}

# ============================================================================
# State Backend Outputs
# ============================================================================

output "state_backend_bucket_name" {
  description = "Terraform state backend S3 bucket name"
  value       = module.state_backend.bucket_name
}

output "state_backend_bucket_arn" {
  description = "Terraform state backend S3 bucket ARN"
  value       = module.state_backend.bucket_arn
}

output "state_backend_lock_table_name" {
  description = "Terraform state lock DynamoDB table name"
  value       = module.state_backend.lock_table_name
}

output "state_backend_lock_table_arn" {
  description = "Terraform state lock DynamoDB table ARN"
  value       = module.state_backend.lock_table_arn
}

# ============================================================================
# CodeCommit Outputs
# ============================================================================

output "codecommit_repository_name" {
  description = "CodeCommit repository name"
  value       = var.enable_codecommit ? module.codecommit[0].repository_name : ""
}

output "codecommit_repository_arn" {
  description = "CodeCommit repository ARN"
  value       = var.enable_codecommit ? module.codecommit[0].repository_arn : ""
}

output "codecommit_clone_url_http" {
  description = "CodeCommit repository clone URL (HTTPS)"
  value       = var.enable_codecommit ? module.codecommit[0].clone_url_http : ""
}

output "codecommit_clone_url_ssh" {
  description = "CodeCommit repository clone URL (SSH)"
  value       = var.enable_codecommit ? module.codecommit[0].clone_url_ssh : ""
}

output "codecommit_read_policy_arn" {
  description = "IAM policy ARN for read-only CodeCommit access"
  value       = var.enable_codecommit ? module.codecommit[0].read_policy_arn : ""
}

output "codecommit_write_policy_arn" {
  description = "IAM policy ARN for read-write CodeCommit access"
  value       = var.enable_codecommit ? module.codecommit[0].write_policy_arn : ""
}

# ============================================================================
# Summary Output
# ============================================================================

output "deployment_summary" {
  description = "Control Plane deployment summary"
  value = {
    environment          = var.environment
    region               = var.aws_region
    frontend_url         = module.cloudfront.frontend_url
    api_endpoint         = module.api_gateway.api_endpoint
    ecr_repository       = module.ecr.repository_url
    cognito_user_pool    = module.cognito.user_pool_id
    codebuild_project    = module.codebuild.project_name
    eventbridge_bus      = module.eventbridge.event_bus_name
    state_backend_bucket = module.state_backend.bucket_name
    codecommit_repo      = var.enable_codecommit ? module.codecommit[0].repository_name : "disabled"
  }
}
