# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

locals {
  # Resolve domain from whichever resource was created
  domain = var.custom_domain != "" ? var.custom_domain : (
    var.domain_prefix != "" ? var.domain_prefix : local.name_prefix
  )
}

# --- User Pool ---

output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.this.arn
}

output "user_pool_endpoint" {
  description = "Cognito User Pool endpoint"
  value       = aws_cognito_user_pool.this.endpoint
}

# --- App Clients ---

output "web_client_id" {
  description = "Web application client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "service_client_id" {
  description = "Machine-to-machine client ID"
  value       = aws_cognito_user_pool_client.service.id
}

output "service_client_secret" {
  description = "Machine-to-machine client secret"
  value       = aws_cognito_user_pool_client.service.client_secret
  sensitive   = true
}

# --- Domain & URLs ---

output "domain" {
  description = "Cognito domain (prefix or custom)"
  value       = local.domain
}

output "hosted_ui_url" {
  description = "Cognito Hosted UI login URL"
  value       = "https://${local.domain}.auth.${local.region}.amazoncognito.com"
}

output "token_endpoint" {
  description = "OAuth2 token endpoint for client_credentials flow"
  value       = "https://${local.domain}.auth.${local.region}.amazoncognito.com/oauth2/token"
}

# --- Resource Server ---

output "resource_server_identifier" {
  description = "Resource server identifier"
  value       = aws_cognito_resource_server.this.identifier
}

output "resource_server_scope_identifiers" {
  description = "List of all resource server scope identifiers"
  value       = aws_cognito_resource_server.this.scope_identifiers
}
