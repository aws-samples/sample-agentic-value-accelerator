output "lambda_function_name" {
  description = "Name of the auto-publish Lambda; handy for tailing logs during smoke tests."
  value       = aws_lambda_function.hook.function_name
}

output "lambda_function_arn" {
  description = "ARN of the auto-publish Lambda."
  value       = aws_lambda_function.hook.arn
}

output "event_rule_arn" {
  description = "ARN of the EventBridge rule that triggers the Lambda on SFN SUCCEEDED."
  value       = aws_cloudwatch_event_rule.deploy_succeeded.arn
}
