output "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID"
  value       = aws_bedrockagent_knowledge_base.this.id
}

output "knowledge_base_arn" {
  description = "Bedrock Knowledge Base ARN"
  value       = aws_bedrockagent_knowledge_base.this.arn
}

output "data_source_id" {
  description = "Bedrock Data Source ID"
  value       = aws_bedrockagent_data_source.this.id
}

output "collection_arn" {
  description = "OpenSearch Serverless collection ARN"
  value       = aws_opensearchserverless_collection.this.arn
}

output "collection_endpoint" {
  description = "OpenSearch Serverless collection endpoint"
  value       = aws_opensearchserverless_collection.this.collection_endpoint
}

output "s3_bucket_name" {
  description = "Document source S3 bucket name"
  value       = aws_s3_bucket.documents.id
}

output "kb_role_arn" {
  description = "Knowledge Base execution role ARN"
  value       = aws_iam_role.kb_role.arn
}
