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

output "minio_endpoint" {
  description = "In-cluster MinIO S3-compatible endpoint"
  value       = "http://minio.langfuse.svc.cluster.local:9000"
}

output "langfuse_host" {
  description = "Langfuse endpoint URL"
  value       = "${var.enable_https ? "https" : "http"}://${trimspace(data.local_file.alb_dns.content)}"
}

output "langfuse_secret_name" {
  description = "Name of the Secrets Manager secret containing Langfuse API keys"
  value       = aws_secretsmanager_secret.langfuse.name
}
