# ============================================================================
# KMS Outputs
# ============================================================================
output "kms_s3_key_arn" {
  description = "KMS key ARN for S3 encryption"
  value       = module.kms.s3_key_arn
}

output "kms_ecr_key_arn" {
  description = "KMS key ARN for ECR encryption"
  value       = module.kms.ecr_key_arn
}

output "kms_lambda_key_arn" {
  description = "KMS key ARN for Lambda encryption"
  value       = module.kms.lambda_key_arn
}

output "kms_dynamodb_key_arn" {
  description = "KMS key ARN for DynamoDB encryption"
  value       = module.kms.dynamodb_key_arn
}

output "kms_logs_key_arn" {
  description = "KMS key ARN for CloudWatch Logs encryption"
  value       = module.kms.logs_key_arn
}

output "kms_secrets_key_arn" {
  description = "KMS key ARN for Secrets Manager encryption"
  value       = module.kms.secrets_key_arn
}

# ============================================================================
# Cognito Outputs
# ============================================================================
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for authentication"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = module.cognito.user_pool_arn
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID (for agent/server authentication with secret)"
  value       = module.cognito.user_pool_client_id
}

output "cognito_user_pool_client_secret" {
  description = "Cognito User Pool Client secret"
  value       = module.cognito.user_pool_client_secret
  sensitive   = true
}

output "cognito_web_app_client_id" {
  description = "Cognito User Pool Client ID for web app (no secret)"
  value       = module.cognito.web_app_client_id
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI URL"
  value       = module.cognito.hosted_ui_url
}

# ============================================================================
# RDS Outputs
# ============================================================================
output "rds_db_address" {
  description = "RDS database hostname"
  value       = module.rds.db_address
}

output "rds_db_port" {
  description = "RDS database port"
  value       = module.rds.db_port
}

output "rds_db_name" {
  description = "RDS database name"
  value       = module.rds.db_name
}

output "rds_db_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.db_endpoint
}

output "rds_db_secret_arn" {
  description = "ARN of Secrets Manager secret containing database credentials"
  value       = module.rds.db_secret_arn
}

output "rds_db_secret_name" {
  description = "Name of Secrets Manager secret containing database credentials"
  value       = module.rds.db_secret_name
}

# ============================================================================
# DynamoDB Outputs
# ============================================================================
output "alert_conversations_table_name" {
  description = "DynamoDB table name for alert conversations"
  value       = aws_dynamodb_table.alert_conversations.name
}

output "alert_conversations_table_arn" {
  description = "DynamoDB table ARN for alert conversations"
  value       = aws_dynamodb_table.alert_conversations.arn
}

output "alert_summaries_table_name" {
  description = "DynamoDB table name for alert summaries"
  value       = aws_dynamodb_table.alert_summaries.name
}

output "alert_summaries_table_arn" {
  description = "DynamoDB table ARN for alert summaries"
  value       = aws_dynamodb_table.alert_summaries.arn
}

output "msp_conversations_table_name" {
  description = "DynamoDB table name for Risk Analyst conversations"
  value       = aws_dynamodb_table.msp_conversations.name
}

output "msp_conversations_table_arn" {
  description = "DynamoDB table ARN for Risk Analyst conversations"
  value       = aws_dynamodb_table.msp_conversations.arn
}

# ============================================================================
# ALB Outputs
# ============================================================================
output "alb_target_group_arn" {
  description = "ARN of the ALB target group"
  value       = module.alb.target_group_arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = module.alb.alb_arn
}

output "alb_https_enabled" {
  description = "Whether HTTPS is enabled on the ALB"
  value       = module.alb.https_enabled
}

# ============================================================================
# Networking Outputs
# ============================================================================
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "database_subnet_ids" {
  description = "List of database subnet IDs"
  value       = module.vpc.database_subnets
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr_block
}

output "database_subnet_group_name" {
  description = "Database subnet group name"
  value       = module.vpc.database_subnet_group_name
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = module.vpc.natgw_ids
}

output "vpc_flow_log_id" {
  description = "VPC Flow Log ID"
  value       = module.vpc.vpc_flow_log_id
}

# ============================================================================
# Security Group Outputs
# ============================================================================
output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

output "webapp_ec2_security_group_id" {
  description = "Web application EC2 security group ID"
  value       = aws_security_group.webapp_ec2.id
}

output "rds_security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

output "lambda_security_group_id" {
  description = "Lambda security group ID"
  value       = aws_security_group.lambda.id
}

output "agentcore_security_group_id" {
  description = "AgentCore security group ID"
  value       = aws_security_group.agentcore.id
}

output "private_subnet_security_group_id" {
  description = "Private subnet security group ID"
  value       = aws_security_group.private_subnet.id
}

output "public_subnet_security_group_id" {
  description = "Public subnet security group ID"
  value       = aws_security_group.public_subnet.id
}

output "eice_id" {
  description = "EC2 Instance Connect Endpoint ID"
  value       = aws_ec2_instance_connect_endpoint.bastion.id
}

output "eice_dns_name" {
  description = "EC2 Instance Connect Endpoint DNS name"
  value       = aws_ec2_instance_connect_endpoint.bastion.dns_name
}

# ============================================================================
# ACM / CloudFront / Bastion / Firewall Outputs
# ============================================================================
output "certificate_arn" {
  description = "ARN of the ACM certificate for ALB HTTPS (empty if not configured)"
  value       = var.certificate_domain_name != "" || var.certificate_existing_arn != "" ? module.acm.certificate_arn : ""
  sensitive   = true
}

output "certificate_domain_name" {
  description = "Domain name of the ACM certificate"
  value       = module.acm.domain_name
}

output "certificate_status" {
  description = "Status of the ACM certificate"
  value       = var.certificate_domain_name != "" ? module.acm.certificate_status : "NOT_CONFIGURED"
  sensitive   = true
}

output "certificate_validation_records" {
  description = "DNS validation records to add to your DNS provider (if not using Route 53)"
  value       = var.certificate_domain_name != "" ? module.acm.domain_validation_options : []
  sensitive   = true
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.distribution_domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
}

output "bastion_instance_id" {
  description = "Bastion host EC2 instance ID"
  value       = module.bastion.instance_id
}

output "bastion_private_ip" {
  description = "Bastion host private IP address"
  value       = module.bastion.private_ip
}

output "bastion_cloudwatch_log_group" {
  description = "CloudWatch Log Group for bastion host logs"
  value       = module.bastion.cloudwatch_log_group_name
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
