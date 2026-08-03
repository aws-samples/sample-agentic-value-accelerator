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

output "guardrails_table_name" {
  description = "Name of the guardrails DynamoDB table"
  value       = aws_dynamodb_table.guardrails.name
}

output "guardrails_table_arn" {
  description = "ARN of the guardrails DynamoDB table"
  value       = aws_dynamodb_table.guardrails.arn
}

output "policies_table_name" {
  description = "Name of the policies DynamoDB table"
  value       = aws_dynamodb_table.policies.name
}

output "policies_table_arn" {
  description = "ARN of the policies DynamoDB table"
  value       = aws_dynamodb_table.policies.arn
}

output "prioritization_table_name" {
  description = "Name of the prioritization DynamoDB table"
  value       = aws_dynamodb_table.prioritization.name
}

output "prioritization_table_arn" {
  description = "ARN of the prioritization DynamoDB table"
  value       = aws_dynamodb_table.prioritization.arn
}

output "maturity_table_name" {
  description = "Name of the maturity assessment DynamoDB table"
  value       = aws_dynamodb_table.maturity.name
}

output "maturity_table_arn" {
  description = "ARN of the maturity assessment DynamoDB table"
  value       = aws_dynamodb_table.maturity.arn
}

output "business_cases_table_name" {
  description = "Name of the business cases DynamoDB table"
  value       = aws_dynamodb_table.business_cases.name
}

output "business_cases_table_arn" {
  description = "ARN of the business cases DynamoDB table"
  value       = aws_dynamodb_table.business_cases.arn
}

output "knowledge_table_name" {
  description = "Knowledge registry DynamoDB table name"
  value       = aws_dynamodb_table.knowledge.name
}

output "knowledge_table_arn" {
  description = "Knowledge registry DynamoDB table ARN"
  value       = aws_dynamodb_table.knowledge.arn
}

output "operating_model_table_name" {
  description = "Name of the operating model DynamoDB table"
  value       = aws_dynamodb_table.operating_model.name
}

output "operating_model_table_arn" {
  description = "ARN of the operating model DynamoDB table"
  value       = aws_dynamodb_table.operating_model.arn
}

output "organization_design_table_name" {
  description = "Name of the organization design DynamoDB table"
  value       = aws_dynamodb_table.organization_design.name
}

output "organization_design_table_arn" {
  description = "ARN of the organization design DynamoDB table"
  value       = aws_dynamodb_table.organization_design.arn
}
