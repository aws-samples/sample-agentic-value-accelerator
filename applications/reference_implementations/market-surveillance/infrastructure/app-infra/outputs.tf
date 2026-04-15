# ============================================================================
# ECR Outputs
# ============================================================================
output "ecr_repository_url" {
  description = "ECR repository URL for agent-backend"
  value       = module.ecr.repository_url
}

output "ecr_image_uri" {
  description = "Full URI of the deployed agent-backend image"
  value       = module.ecr.image_uri
}

output "ecr_image_digest" {
  description = "Digest of the deployed agent-backend image (empty if not verified)"
  value       = module.ecr.image_digest
}

output "webapp_ecr_repository_url" {
  description = "ECR repository URL for web application"
  value       = module.ecr_webapp.repository_url
}

# ============================================================================
# AgentCore Outputs
# ============================================================================
output "agentcore_runtime_id" {
  description = "AgentCore Runtime ID"
  value       = module.agentcore.agent_runtime_id
}

output "agentcore_runtime_arn" {
  description = "AgentCore Runtime ARN"
  value       = module.agentcore.agent_runtime_arn
}

output "agentcore_runtime_name" {
  description = "AgentCore Runtime name"
  value       = module.agentcore.agent_runtime_name
}

output "agentcore_runtime_endpoint" {
  description = "AgentCore Runtime invocation endpoint URL"
  value       = module.agentcore.agent_runtime_endpoint
}

output "agentcore_execution_role_arn" {
  description = "AgentCore execution IAM role ARN"
  value       = module.agentcore.execution_role_arn
}

output "agentcore_code_interpreter_id" {
  description = "AgentCore Code Interpreter ID"
  value       = module.agentcore.code_interpreter_id
}

output "agentcore_code_interpreter_arn" {
  description = "AgentCore Code Interpreter ARN"
  value       = module.agentcore.code_interpreter_arn
}

# AgentCore Observability Outputs
output "agentcore_log_group_name" {
  description = "CloudWatch Log Group name for AgentCore Runtime logs"
  value       = module.agentcore.log_group_name
}

output "agentcore_log_group_arn" {
  description = "ARN of the CloudWatch Log Group for AgentCore Runtime"
  value       = module.agentcore.log_group_arn
}

output "agentcore_logs_delivery_id" {
  description = "ID of the logs delivery connection"
  value       = module.agentcore.logs_delivery_id
}

output "agentcore_traces_delivery_id" {
  description = "ID of the traces delivery connection"
  value       = module.agentcore.traces_delivery_id
}

# ============================================================================
# Lambda Outputs
# ============================================================================
output "lambda_alert_api_arn" {
  description = "ARN of the alert_api Lambda function"
  value       = module.lambda.alert_api_function_arn
}

output "lambda_alert_api_name" {
  description = "Name of the alert_api Lambda function"
  value       = module.lambda.alert_api_function_name
}

# ============================================================================
# AgentCore Gateway Outputs
# ============================================================================
output "ac_gateway_id" {
  description = "AgentCore Gateway ID"
  value       = module.ac_gateway.gateway_id
}

output "ac_gateway_arn" {
  description = "AgentCore Gateway ARN"
  value       = module.ac_gateway.gateway_arn
}

output "ac_gateway_name" {
  description = "AgentCore Gateway name"
  value       = module.ac_gateway.gateway_name
}

output "ac_gateway_url" {
  description = "AgentCore Gateway URL"
  value       = module.ac_gateway.gateway_url
}

# ============================================================================
# Parameter Store Outputs
# ============================================================================
output "ssm_gateway_url_parameter_name" {
  description = "SSM Parameter name for gateway URL"
  value       = module.parameters.gateway_url_parameter_name
}

output "ssm_gateway_url_parameter_arn" {
  description = "SSM Parameter ARN for gateway URL"
  value       = module.parameters.gateway_url_parameter_arn
}

# ============================================================================
# Memory Outputs
# ============================================================================
output "memory_id" {
  description = "AgentCore Memory ID"
  value       = module.memory.memory_id
}

output "memory_arn" {
  description = "AgentCore Memory ARN"
  value       = module.memory.memory_arn
}

output "memory_name" {
  description = "AgentCore Memory name"
  value       = module.memory.memory_name
}

# ============================================================================
# API Gateway Outputs
# ============================================================================
output "api_gateway_endpoint" {
  description = "API Gateway invoke URL"
  value       = module.api_gateway.api_endpoint
}

output "api_gateway_id" {
  description = "API Gateway REST API ID"
  value       = module.api_gateway.api_id
}

# ============================================================================
# S3 Agent Configs Outputs
# ============================================================================
output "s3_agent_configs_bucket" {
  description = "S3 bucket name for agent configurations"
  value       = module.s3_agent_configs.bucket_name
}

output "s3_agent_configs_bucket_arn" {
  description = "S3 agent configs bucket ARN"
  value       = module.s3_agent_configs.bucket_arn
}

output "s3_schema_config_key" {
  description = "S3 key for schema config file"
  value       = module.s3_agent_configs.schema_config_key
}

# ============================================================================
# EC2 Web Application Outputs
# ============================================================================
output "webapp_autoscaling_group_name" {
  description = "Name of the Auto Scaling Group for web application"
  value       = module.ec2_webapp.autoscaling_group_name
}

# ============================================================================
# Bedrock Guardrail Outputs
# ============================================================================
output "guardrail_id" {
  description = "Bedrock Guardrail ID"
  value       = module.bedrock_guardrail.guardrail_id
}

output "guardrail_arn" {
  description = "Bedrock Guardrail ARN"
  value       = module.bedrock_guardrail.guardrail_arn
}

output "guardrail_version" {
  description = "Published Bedrock Guardrail version"
  value       = module.bedrock_guardrail.guardrail_version
}

# ============================================================================
# Risk Analyst ECR Outputs
# ============================================================================
output "risk_ecr_repository_url" {
  description = "ECR repository URL for Risk Analyst agent-backend"
  value       = module.ecr_msp.repository_url
}

output "risk_ecr_image_uri" {
  description = "Full URI of the deployed Risk Analyst agent-backend image"
  value       = module.ecr_msp.image_uri
}

# ============================================================================
# Risk Analyst AgentCore Outputs
# ============================================================================
output "risk_agentcore_runtime_id" {
  description = "Risk Analyst AgentCore Runtime ID"
  value       = module.risk_agentcore.agent_runtime_id
}

output "risk_agentcore_runtime_arn" {
  description = "Risk Analyst AgentCore Runtime ARN"
  value       = module.risk_agentcore.agent_runtime_arn
}

output "risk_agentcore_runtime_endpoint" {
  description = "Risk Analyst AgentCore Runtime invocation endpoint URL"
  value       = module.risk_agentcore.agent_runtime_endpoint
}

output "risk_agentcore_execution_role_arn" {
  description = "Risk Analyst AgentCore execution IAM role ARN"
  value       = module.risk_agentcore.execution_role_arn
}

# ============================================================================
# Risk Analyst Memory Outputs
# ============================================================================
output "risk_memory_id" {
  description = "Risk Analyst AgentCore Memory ID"
  value       = module.risk_memory.memory_id
}

output "risk_memory_arn" {
  description = "Risk Analyst AgentCore Memory ARN"
  value       = module.risk_memory.memory_arn
}

# ============================================================================
# General Outputs
# ============================================================================
output "aws_region" {
  description = "AWS region where resources are deployed"
  value       = var.aws_region
}

output "environment" {
  description = "Deployment environment"
  value       = var.environment
}
