# =============================================================================
# Outputs for Cognito Infrastructure
# =============================================================================
# These values are needed to configure the Testing Dashboard UI

output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.web_client.id
}

output "identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = aws_cognito_identity_pool.main.id
}

output "aws_region" {
  description = "AWS Region"
  value       = var.aws_region
}

# Output for .env.local file
output "env_config" {
  description = "Environment variables for the Testing Dashboard"
  value       = <<-EOT
    # Add these to applications/fsi_foundry/foundations/ui/testing-dashboard/.env.local
    REACT_APP_AWS_REGION=${var.aws_region}
    REACT_APP_USER_POOL_ID=${aws_cognito_user_pool.main.id}
    REACT_APP_USER_POOL_CLIENT_ID=${aws_cognito_user_pool_client.web_client.id}
    REACT_APP_IDENTITY_POOL_ID=${aws_cognito_identity_pool.main.id}
  EOT
}
