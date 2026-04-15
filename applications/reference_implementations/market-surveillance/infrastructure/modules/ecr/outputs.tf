output "repository_url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  description = "The ARN of the ECR repository"
  value       = aws_ecr_repository.this.arn
}

output "repository_name" {
  description = "The name of the ECR repository"
  value       = aws_ecr_repository.this.name
}

output "image_uri" {
  description = "The full URI of the Docker image (repository_url:tag)"
  value       = local.full_image_uri
}

output "image_digest" {
  description = "The digest of the pushed Docker image (empty if verify_image is false)"
  value       = var.verify_image && length(data.aws_ecr_image.this) > 0 ? data.aws_ecr_image.this[0].image_digest : ""
}

output "docker_build_id" {
  description = "ID of the Docker build resource (changes when image is rebuilt)"
  value       = null_resource.docker_build_push.id
}

output "registry_id" {
  description = "The registry ID where the repository was created"
  value       = aws_ecr_repository.this.registry_id
}
