output "cluster_name" {
  description = "EKS Cluster Name to use for a Kubernetes terraform provider"
  value       = aws_eks_cluster.langfuse.name
}

output "cluster_host" {
  description = "EKS Cluster host to use for a Kubernetes terraform provider"
  value       = aws_eks_cluster.langfuse.endpoint
}

output "cluster_ca_certificate" {
  description = "EKS Cluster CA certificate to use for a Kubernetes terraform provider"
  value       = base64decode(aws_eks_cluster.langfuse.certificate_authority[0].data)
  sensitive   = true
}

output "langfuse_alb_dns" {
  description = "DNS name of the Langfuse ALB"
  value       = trimspace(data.local_file.alb_dns.content)
}

output "private_subnet_ids" {
  description = "Private subnet IDs from the VPC module"
  value       = var.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs from the VPC module"
  value       = var.public_subnet_ids
}

output "bucket_name" {
  description = "Name of the S3 bucket for Langfuse"
  value       = aws_s3_bucket.langfuse.bucket
}

output "bucket_id" {
  description = "ID of the S3 bucket for Langfuse"
  value       = aws_s3_bucket.langfuse.id
}

output "langfuse_host" {
  description = "Langfuse endpoint URL"
  value       = "${var.enable_https ? "https" : "http"}://${trimspace(data.local_file.alb_dns.content)}"
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
