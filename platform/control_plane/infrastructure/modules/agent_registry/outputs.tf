output "registry_arn" {
  value       = trimspace(data.local_file.registry_arn.content)
  description = "ARN of the AWS Agent Registry. Pass to app-factory deploys so Phase 2e can publish records."
}

output "registry_name" {
  value = var.registry_name
}
