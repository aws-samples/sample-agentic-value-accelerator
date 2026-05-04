variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "repository_name" {
  description = "Name suffix for the ECR repository"
  type        = string
  default     = "agent-backend"
}

variable "image_tag" {
  description = "Tag for the Docker image"
  type        = string
  default     = "latest"
}

variable "dockerfile_path" {
  description = "Absolute path to the directory containing the Dockerfile"
  type        = string
}

variable "dockerfile_hash" {
  description = "Hash of the Dockerfile content for change detection"
  type        = string
}

variable "source_code_hash" {
  description = "Hash of application source code for change detection"
  type        = string
}

variable "image_retention_count" {
  description = "Number of images to retain in the repository"
  type        = number
  default     = 10
}

variable "scan_on_push" {
  description = "Enable image scanning on push"
  type        = bool
  default     = true
}

variable "force_delete" {
  description = "Force delete repository even if it contains images"
  type        = bool
  default     = false
}

variable "verify_image" {
  description = "Verify image exists after build (disable if image doesn't exist yet)"
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "ARN of the KMS CMK for ECR repository encryption"
  type        = string
  default     = null
}

variable "docker_build_args" {
  description = "Map of build arguments to pass to docker build"
  type        = map(string)
  default     = {}
}
