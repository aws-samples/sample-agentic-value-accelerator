output "langfuse_url" {
  description = "Langfuse UI URL"
  value       = "http://${aws_lb.langfuse.dns_name}"
}

output "langfuse_alb_dns" {
  description = "ALB DNS name for Langfuse"
  value       = aws_lb.langfuse.dns_name
}

output "database_endpoint" {
  description = "Aurora PostgreSQL cluster endpoint"
  value       = aws_rds_cluster.langfuse.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.langfuse.primary_endpoint_address
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.langfuse.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.langfuse.name
}

output "security_group_ids" {
  description = "Security group IDs for reference"
  value = {
    alb   = aws_security_group.alb.id
    ecs   = aws_security_group.ecs.id
    rds   = aws_security_group.rds.id
    redis = aws_security_group.redis.id
  }
}
