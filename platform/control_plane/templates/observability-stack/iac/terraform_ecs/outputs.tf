output "cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.langfuse.name
}

output "cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.langfuse.id
}

output "cluster_arn" {
  description = "ECS Cluster ARN"
  value       = aws_ecs_cluster.langfuse.arn
}

output "load_balancer_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.langfuse.dns_name
}

output "load_balancer_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.langfuse.zone_id
}


output "bucket_name" {
  description = "Name of the S3 bucket for Langfuse"
  value       = aws_s3_bucket.langfuse.bucket
}

output "bucket_id" {
  description = "ID of the S3 bucket for Langfuse"
  value       = aws_s3_bucket.langfuse.id
}

output "postgres_endpoint" {
  description = "PostgreSQL cluster endpoint"
  value       = aws_rds_cluster.postgres.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "langfuse_service_name" {
  description = "Name of the Langfuse ECS service"
  value       = aws_ecs_service.langfuse.name
}

output "clickhouse_service_name" {
  description = "Name of the ClickHouse ECS service"
  value       = aws_ecs_service.clickhouse.name
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret containing application secrets"
  value       = aws_secretsmanager_secret.langfuse.arn
  sensitive   = true
}

output "efs_file_system_id" {
  description = "ID of the EFS file system for ClickHouse"
  value       = aws_efs_file_system.clickhouse.id
}

output "service_discovery_namespace_id" {
  description = "ID of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.langfuse.id
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

output "ecs_execution_role_arn" {
  description = "ARN of the ECS execution role"
  value       = aws_iam_role.ecs_execution_role.arn
}

output "langfuse_secret_name" {
  description = "Name of the LangFuse secret in SecretsManager"
  value = aws_secretsmanager_secret.langfuse.name
}

output "langfuse_host" {
  description = "Host address of the LangFuse container"
  value = "http://${aws_lb.langfuse.dns_name}"
}