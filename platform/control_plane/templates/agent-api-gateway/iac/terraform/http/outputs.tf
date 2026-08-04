# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "api_endpoint" {
  description = "HTTP API default endpoint URL"
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "api_id" {
  description = "HTTP API Gateway ID"
  value       = aws_apigatewayv2_api.this.id
}

output "api_arn" {
  description = "HTTP API Gateway ARN"
  value       = aws_apigatewayv2_api.this.arn
}

output "stage_invoke_url" {
  description = "Stage invoke URL"
  value       = aws_apigatewayv2_stage.this.invoke_url
}

output "execution_arn" {
  description = "API execution ARN (for IAM policies and Lambda permissions)"
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "custom_domain_url" {
  description = "Custom domain target domain name (for DNS CNAME/alias)"
  value       = var.custom_domain != "" ? aws_apigatewayv2_domain_name.this[0].domain_name_configuration[0].target_domain_name : null
}

output "log_group_name" {
  description = "CloudWatch log group name for API access logs"
  value       = aws_cloudwatch_log_group.api_logs.name
}
