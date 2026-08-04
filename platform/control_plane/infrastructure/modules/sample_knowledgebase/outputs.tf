# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

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
  value       = aws_bedrockagent_data_source.s3.data_source_id
}

output "documents_bucket" {
  description = "S3 bucket for KB documents"
  value       = aws_s3_bucket.kb_documents.id
}

output "collection_endpoint" {
  description = "OpenSearch Serverless collection endpoint"
  value       = aws_opensearchserverless_collection.kb.collection_endpoint
}

output "kb_role_arn" {
  description = "KB execution role ARN"
  value       = aws_iam_role.kb_role.arn
}
