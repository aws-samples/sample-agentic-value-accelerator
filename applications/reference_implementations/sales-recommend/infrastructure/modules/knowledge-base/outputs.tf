###############################################################################
# Knowledge Base Module — Outputs
###############################################################################

output "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID"
  value       = aws_bedrockagent_knowledge_base.this.id
}

output "knowledge_base_arn" {
  description = "Bedrock Knowledge Base ARN"
  value       = aws_bedrockagent_knowledge_base.this.arn
}

output "data_source_id" {
  description = "Bedrock S3 data source ID"
  value       = aws_bedrockagent_data_source.s3.data_source_id
}

output "data_source_bucket_name" {
  description = "Name of the S3 bucket backing the data source"
  value       = aws_s3_bucket.data_source.bucket
}

output "data_source_bucket_arn" {
  description = "ARN of the S3 bucket backing the data source"
  value       = aws_s3_bucket.data_source.arn
}

output "collection_arn" {
  description = "OpenSearch Serverless collection ARN"
  value       = aws_opensearchserverless_collection.this.arn
}

output "collection_endpoint" {
  description = "OpenSearch Serverless collection endpoint"
  value       = aws_opensearchserverless_collection.this.collection_endpoint
}

output "kb_role_arn" {
  description = "IAM role ARN used by the Knowledge Base"
  value       = aws_iam_role.kb.arn
}
