output "alert_api_function_name" {
  description = "Name of the alert_api Lambda function"
  value       = aws_lambda_function.alert_api.function_name
}

output "alert_api_function_arn" {
  description = "ARN of the alert_api Lambda function"
  value       = aws_lambda_function.alert_api.arn
}

output "alert_api_invoke_arn" {
  description = "Invoke ARN of the alert_api Lambda function"
  value       = aws_lambda_function.alert_api.invoke_arn
}

output "alert_mcp_function_name" {
  description = "Name of the alert_mcp Lambda function"
  value       = aws_lambda_function.alert_mcp.function_name
}

output "alert_mcp_function_arn" {
  description = "ARN of the alert_mcp Lambda function"
  value       = aws_lambda_function.alert_mcp.arn
}

output "alert_mcp_invoke_arn" {
  description = "Invoke ARN of the alert_mcp Lambda function"
  value       = aws_lambda_function.alert_mcp.invoke_arn
}

output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution IAM role"
  value       = aws_iam_role.lambda_execution.arn
}

output "data_api_function_name" {
  description = "Name of the Data API Lambda function"
  value       = aws_lambda_function.data_api.function_name
}

output "data_api_function_arn" {
  description = "ARN of the Data API Lambda function"
  value       = aws_lambda_function.data_api.arn
}

output "data_api_invoke_arn" {
  description = "Invoke ARN of the Data API Lambda function"
  value       = aws_lambda_function.data_api.invoke_arn
}

output "msp_api_function_name" {
  description = "Name of the Risk Analyst API Lambda function"
  value       = aws_lambda_function.msp_api.function_name
}

output "msp_api_function_arn" {
  description = "ARN of the Risk Analyst API Lambda function"
  value       = aws_lambda_function.msp_api.arn
}

output "msp_api_invoke_arn" {
  description = "Invoke ARN of the Risk Analyst API Lambda function"
  value       = aws_lambda_function.msp_api.invoke_arn
}

# Provisioned Concurrency Outputs
output "alert_api_alias_arn" {
  description = "ARN of the Alert API Lambda alias (for provisioned concurrency)"
  value       = var.enable_provisioned_concurrency ? aws_lambda_alias.alert_api[0].arn : null
}

output "alert_mcp_alias_arn" {
  description = "ARN of the Alert MCP Lambda alias (for provisioned concurrency)"
  value       = var.enable_provisioned_concurrency ? aws_lambda_alias.alert_mcp[0].arn : null
}

output "data_api_alias_arn" {
  description = "ARN of the Data API Lambda alias (for provisioned concurrency)"
  value       = var.enable_provisioned_concurrency ? aws_lambda_alias.data_api[0].arn : null
}

output "provisioned_concurrency_enabled" {
  description = "Whether provisioned concurrency is enabled"
  value       = var.enable_provisioned_concurrency
}
