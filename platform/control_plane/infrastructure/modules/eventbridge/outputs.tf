output "event_bus_arn" {
  description = "EventBridge event bus ARN"
  value       = aws_cloudwatch_event_bus.deployment.arn
}

output "event_bus_name" {
  description = "EventBridge event bus name"
  value       = aws_cloudwatch_event_bus.deployment.name
}

output "dlq_arn" {
  description = "SQS dead-letter queue ARN for failed event deliveries"
  value       = aws_sqs_queue.dlq.arn
}
