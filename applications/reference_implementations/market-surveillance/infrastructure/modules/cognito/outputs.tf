output "user_pool_id" {
  description = "The ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "The ARN of the Cognito User Pool"
  value       = aws_cognito_user_pool.this.arn
}

output "user_pool_endpoint" {
  description = "The endpoint of the Cognito User Pool"
  value       = aws_cognito_user_pool.this.endpoint
}

output "user_pool_client_id" {
  description = "The ID of the Cognito User Pool Client (for agent/server authentication)"
  value       = aws_cognito_user_pool_client.this.id
}

output "user_pool_client_secret" {
  description = "The client secret of the Cognito User Pool Client (for agent/server authentication)"
  value       = aws_cognito_user_pool_client.this.client_secret
  sensitive   = true
}

output "web_app_client_id" {
  description = "The ID of the Cognito User Pool Client for web app (no secret)"
  value       = aws_cognito_user_pool_client.web_app.id
}

output "user_pool_domain" {
  description = "The domain of the Cognito User Pool (if hosted UI is enabled)"
  value       = var.enable_hosted_ui ? aws_cognito_user_pool_domain.this[0].domain : null
}

output "hosted_ui_url" {
  description = "The URL for the hosted UI login page"
  value       = var.enable_hosted_ui ? "https://${aws_cognito_user_pool_domain.this[0].domain}.auth.${data.aws_region.current.region}.amazoncognito.com" : null
}

data "aws_region" "current" {}
