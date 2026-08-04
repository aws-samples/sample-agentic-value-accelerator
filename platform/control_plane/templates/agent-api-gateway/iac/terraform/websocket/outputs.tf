# =============================================================================
# Outputs
# =============================================================================

output "websocket_url" {
  description = "WebSocket URL (wss://) for client connections"
  value       = aws_apigatewayv2_stage.this.invoke_url
}

output "api_id" {
  description = "API Gateway WebSocket API ID"
  value       = aws_apigatewayv2_api.this.id
}

output "api_arn" {
  description = "API Gateway WebSocket API ARN"
  value       = aws_apigatewayv2_api.this.arn
}

output "execution_arn" {
  description = "Execution ARN — needed for @connections IAM policy"
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "connections_url" {
  description = "HTTPS URL for the @connections callback API (used by backend to push messages)"
  value       = "https://${aws_apigatewayv2_api.this.id}.execute-api.${local.region}.amazonaws.com/${aws_apigatewayv2_stage.this.name}/@connections"
}

output "stage_name" {
  description = "Deployed stage name"
  value       = aws_apigatewayv2_stage.this.name
}

output "custom_domain_url" {
  description = "Custom domain WebSocket URL (empty if no custom domain configured)"
  value       = var.custom_domain != "" ? "wss://${var.custom_domain}" : ""
}

output "log_group_name" {
  description = "CloudWatch log group name for API access logs"
  value       = aws_cloudwatch_log_group.api_logs.name
}
