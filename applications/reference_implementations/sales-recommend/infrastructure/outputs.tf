########################################################################
# Sales Recommend — Outputs
########################################################################

output "cloudfront_url" {
  description = "CloudFront distribution URL (access the app here)"
  value       = module.cloudfront.distribution_url
}

output "agent_runtime_arn" {
  description = "Bedrock AgentCore Runtime ARN"
  value       = module.agentcore.agent_runtime_arn
}

output "agent_endpoint_arn" {
  description = "Bedrock AgentCore Endpoint ARN (for invocation)"
  value       = module.agentcore.endpoint_arn
}

output "ui_ecr_repo_url" {
  description = "ECR repository URL for the UI container"
  value       = module.ecr.ui_repo_url
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.ecs.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "agentcore_execution_role_arn" {
  description = "IAM role ARN for AgentCore execution"
  value       = module.iam.agentcore_execution_role_arn
}

output "project_name_with_suffix" {
  description = "Full project name with deployment suffix (used for resource naming)"
  value       = local.project
}

output "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID (created by the knowledge_base module)"
  value       = module.knowledge_base.knowledge_base_id
}

output "knowledge_base_data_bucket" {
  description = "S3 bucket name backing the Knowledge Base data source"
  value       = module.knowledge_base.data_source_bucket_name
}

output "knowledge_base_collection_arn" {
  description = "OpenSearch Serverless collection ARN backing the Knowledge Base"
  value       = module.knowledge_base.collection_arn
}

output "wiki_generator_project" {
  description = "CodeBuild project name that generates repo capability profiles"
  value       = module.wiki_generator.codebuild_project_name
}

output "wiki_generator_source_bucket" {
  description = "S3 bucket where the packaged wiki-agent code must be uploaded"
  value       = module.wiki_generator.source_bucket
}

output "wiki_generator_source_key" {
  description = "S3 key for the wiki-agent code zip"
  value       = module.wiki_generator.source_object_key
}

output "wiki_generator_repos_bucket" {
  description = "Bucket to upload the repo-list file to (triggers one build per URL)"
  value       = module.wiki_generator.repos_config_bucket
}

output "wiki_generator_repos_key" {
  description = "S3 key for the repo-list file (e.g. config/repos.txt)"
  value       = module.wiki_generator.repos_config_key
}
