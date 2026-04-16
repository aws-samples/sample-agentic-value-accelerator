output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_arn" {
  description = "CloudWatch dashboard ARN"
  value       = aws_cloudwatch_dashboard.main.dashboard_arn
}

output "ecs_cpu_alarm_arn" {
  description = "ECS CPU alarm ARN"
  value       = aws_cloudwatch_metric_alarm.ecs_cpu_high.arn
}

output "ecs_memory_alarm_arn" {
  description = "ECS memory alarm ARN"
  value       = aws_cloudwatch_metric_alarm.ecs_memory_high.arn
}

output "api_5xx_alarm_arn" {
  description = "API Gateway 5XX errors alarm ARN"
  value       = aws_cloudwatch_metric_alarm.api_5xx_errors.arn
}

output "step_functions_failed_alarm_arn" {
  description = "Step Functions failed executions alarm ARN"
  value       = aws_cloudwatch_metric_alarm.step_functions_failed.arn
}
