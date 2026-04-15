output "app_factory_table_name" {
  description = "Name of App Factory DynamoDB table"
  value       = aws_dynamodb_table.app_factory.name
}

output "app_factory_table_arn" {
  description = "ARN of App Factory DynamoDB table"
  value       = aws_dynamodb_table.app_factory.arn
}

output "application_catalog_table_name" {
  description = "Name of Application Catalog DynamoDB table"
  value       = aws_dynamodb_table.application_catalog.name
}

output "application_catalog_table_arn" {
  description = "ARN of Application Catalog DynamoDB table"
  value       = aws_dynamodb_table.application_catalog.arn
}

output "deployment_metadata_table_name" {
  description = "Name of Deployment Metadata DynamoDB table"
  value       = aws_dynamodb_table.deployment_metadata.name
}

output "deployment_metadata_table_arn" {
  description = "ARN of Deployment Metadata DynamoDB table"
  value       = aws_dynamodb_table.deployment_metadata.arn
}

output "deployments_table_name" {
  description = "Name of the deployments DynamoDB table"
  value       = aws_dynamodb_table.deployments.name
}

output "deployments_table_arn" {
  description = "ARN of the deployments DynamoDB table"
  value       = aws_dynamodb_table.deployments.arn
}
