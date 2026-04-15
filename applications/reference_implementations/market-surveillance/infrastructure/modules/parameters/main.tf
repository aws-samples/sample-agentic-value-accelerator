# SSM Parameter Store for Market Surveillance configuration

resource "aws_ssm_parameter" "agentcore_gateway_url" {
  #checkov:skip=CKV2_AWS_34:Non-sensitive data
  name        = "/market-surveillance/${var.environment}/agentcore-gateway-url"
  description = "AgentCore Gateway URL for tool invocations"
  type        = "String"
  value       = var.gateway_url

  tags = {
    Name        = "market-surveillance-gateway-url-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

resource "aws_ssm_parameter" "cognito_client_id" {
  #checkov:skip=CKV2_AWS_34:Non-sensitive data
  name        = "/market-surveillance/${var.environment}/cognito-client-id"
  description = "Cognito User Pool Client ID for OAuth authentication"
  type        = "String"
  value       = var.cognito_client_id

  tags = {
    Name        = "market-surveillance-cognito-client-id-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

resource "aws_ssm_parameter" "cognito_client_secret" {
  name        = "/market-surveillance/${var.environment}/cognito-client-secret"
  description = "Cognito User Pool Client Secret for OAuth authentication"
  type        = "SecureString"
  key_id      = var.kms_key_arn
  value       = var.cognito_client_secret

  tags = {
    Name        = "market-surveillance-cognito-client-secret-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

resource "aws_ssm_parameter" "cognito_oauth_url" {
  #checkov:skip=CKV2_AWS_34:Non-sensitive data
  count       = var.cognito_oauth_url != null ? 1 : 0
  name        = "/market-surveillance/${var.environment}/cognito-oauth-url"
  description = "Cognito OAuth URL (hosted UI) for authentication"
  type        = "String"
  value       = var.cognito_oauth_url

  tags = {
    Name        = "market-surveillance-cognito-oauth-url-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

resource "aws_ssm_parameter" "agentcore_runtime_endpoint" {
  #checkov:skip=CKV2_AWS_34:Non-sensitive data
  count       = 1
  name        = "/market-surveillance/${var.environment}/agentcore-runtime-endpoint"
  description = "AgentCore Runtime endpoint URL for async investigations"
  type        = "String"
  value       = coalesce(var.agentcore_runtime_endpoint, "pending")

  tags = {
    Name        = "market-surveillance-agentcore-runtime-endpoint-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}
