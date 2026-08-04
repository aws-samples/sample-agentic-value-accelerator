# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
output "agentcore_runtime_arn" {
  description = "AgentCore runtime ARN."
  value       = module.runtime.runtime_arn
}

output "agentcore_endpoint_arn" {
  description = "AgentCore runtime endpoint ARN (invoke the agent here)."
  value       = module.runtime.endpoint_arn
}

output "ecr_repository_url" {
  description = "ECR repo to build & push the agent image to (then set container_image_uri and re-apply)."
  value       = module.runtime.ecr_repository_url
}

output "runtime_log_group_name" {
  description = "CloudWatch log group for the runtime."
  value       = module.runtime.log_group_name
}

# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------
output "cognito_user_pool_id" {
  description = "Cognito user pool id."
  value       = module.auth.user_pool_id
}

output "cognito_web_client_id" {
  description = "Cognito web client id (frontend auth; JWT aud claim)."
  value       = module.auth.web_client_id
}

output "cognito_token_endpoint" {
  description = "Cognito OAuth2 token endpoint."
  value       = module.auth.token_endpoint
}

output "cognito_discovery_url" {
  description = "OIDC discovery URL for JWT authorizer configuration."
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${module.auth.user_pool_id}/.well-known/openid-configuration"
}

# -----------------------------------------------------------------------------
# Data stores
# -----------------------------------------------------------------------------
output "transactions_table" {
  description = "DynamoDB transactions table name."
  value       = aws_dynamodb_table.transactions.name
}

output "cases_table" {
  description = "DynamoDB cases table name."
  value       = aws_dynamodb_table.cases.name
}

output "sars_table" {
  description = "DynamoDB SARs table name."
  value       = aws_dynamodb_table.sars.name
}

output "data_bucket" {
  description = "S3 bucket for account profiles + sample data."
  value       = aws_s3_bucket.data.bucket
}
