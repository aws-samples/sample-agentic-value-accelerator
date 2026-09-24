output "table_name" {
  description = "Name of the leads DynamoDB table"
  value       = aws_dynamodb_table.leads.name
}

output "table_arn" {
  description = "ARN of the leads DynamoDB table"
  value       = aws_dynamodb_table.leads.arn
}
