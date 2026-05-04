output "gateway_url_parameter_name" {
  description = "The name of the SSM parameter for gateway URL"
  value       = aws_ssm_parameter.agentcore_gateway_url.name
}

output "gateway_url_parameter_arn" {
  description = "The ARN of the SSM parameter for gateway URL"
  value       = aws_ssm_parameter.agentcore_gateway_url.arn
}

output "cognito_client_id_parameter_name" {
  description = "The name of the SSM parameter for Cognito client ID"
  value       = aws_ssm_parameter.cognito_client_id.name
}

output "cognito_client_id_parameter_arn" {
  description = "The ARN of the SSM parameter for Cognito client ID"
  value       = aws_ssm_parameter.cognito_client_id.arn
}

output "cognito_client_secret_parameter_name" {
  description = "The name of the SSM parameter for Cognito client secret"
  value       = aws_ssm_parameter.cognito_client_secret.name
}

output "cognito_client_secret_parameter_arn" {
  description = "The ARN of the SSM parameter for Cognito client secret"
  value       = aws_ssm_parameter.cognito_client_secret.arn
}

output "cognito_oauth_url_parameter_name" {
  description = "The name of the SSM parameter for Cognito OAuth URL"
  value       = var.cognito_oauth_url != null ? aws_ssm_parameter.cognito_oauth_url[0].name : null
}

output "cognito_oauth_url_parameter_arn" {
  description = "The ARN of the SSM parameter for Cognito OAuth URL"
  value       = var.cognito_oauth_url != null ? aws_ssm_parameter.cognito_oauth_url[0].arn : null
}
