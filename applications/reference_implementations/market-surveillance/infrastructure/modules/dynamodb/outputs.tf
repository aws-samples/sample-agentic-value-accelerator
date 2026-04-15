output "chat_history_table_name" {
  description = "Name of the chat history DynamoDB table"
  value       = aws_dynamodb_table.chat_history.name
}

output "chat_history_table_arn" {
  description = "ARN of the chat history DynamoDB table"
  value       = aws_dynamodb_table.chat_history.arn
}

output "session_metadata_table_name" {
  description = "Name of the session metadata DynamoDB table"
  value       = aws_dynamodb_table.session_metadata.name
}

output "session_metadata_table_arn" {
  description = "ARN of the session metadata DynamoDB table"
  value       = aws_dynamodb_table.session_metadata.arn
}
