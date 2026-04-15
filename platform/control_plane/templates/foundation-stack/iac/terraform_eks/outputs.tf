output "vpc_id" {
  description = "VPC identifier"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = join(",", aws_subnet.public[*].id)
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = join(",", aws_subnet.private[*].id)
}

output "security_group_id" {
  description = "Default security group ID"
  value       = aws_security_group.default.id
}

output "langfuse_host" {
  description = "Langfuse server URL"
  value       = module.langfuse.langfuse_host
}

output "langfuse_secret_name" {
  description = "Secrets Manager secret name containing Langfuse API keys"
  value       = module.langfuse.langfuse_secret_name
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.langfuse.cluster_name
}
