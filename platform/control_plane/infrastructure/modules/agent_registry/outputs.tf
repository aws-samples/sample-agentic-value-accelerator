output "registry_arn" {
  value       = trimspace(data.local_file.registry_arn.content)
  description = "ARN of the AWS Agent Registry. Pass to app-factory deploys so Phase 2e can publish records."
}

output "registry_id" {
  # Extract the registry ID from the ARN — everything after the last "/".
  # ARN shape: arn:aws:agent-registry:<region>:<account>:registry/<id>
  # Used by the backend as AGENT_REGISTRY_ID for direct API calls.
  value       = element(split("/", trimspace(data.local_file.registry_arn.content)), length(split("/", trimspace(data.local_file.registry_arn.content))) - 1)
  description = "ID of the AWS Agent Registry (last path segment of the ARN)."
}

output "registry_name" {
  value = var.registry_name
}
