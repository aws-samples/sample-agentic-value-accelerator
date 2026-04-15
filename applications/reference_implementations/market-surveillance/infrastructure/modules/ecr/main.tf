# Purpose: ECR repository for agent-backend container images with automated build/push

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  repository_name = "market-surveillance-${var.repository_name}-${var.environment}"
  full_image_uri  = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
}

# ECR Repository
resource "aws_ecr_repository" "this" {
  #checkov:skip=CKV_AWS_51:Image tags kept mutable during active development to allow iterative builds with the same tag. Will enforce IMMUTABLE for production.
  name                 = local.repository_name
  image_tag_mutability = "MUTABLE"
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }

  encryption_configuration {
    encryption_type = var.kms_key_arn != null ? "KMS" : "AES256"
    kms_key        = var.kms_key_arn
  }

  tags = {
    Name        = local.repository_name
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Lifecycle policy to limit the number of images
resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the last ${var.image_retention_count} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.image_retention_count
      }
      action = { type = "expire" }
    }]
  })
}

# Build and push container image to ECR using Docker
# Re-runs when Dockerfile or source code changes
resource "null_resource" "docker_build_push" {
  triggers = {
    dockerfile_hash = var.dockerfile_hash
    source_hash     = var.source_code_hash
    repository_url  = aws_ecr_repository.this.repository_url
    image_tag       = var.image_tag
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    working_dir = var.dockerfile_path

    command = <<-EOT
      set -e
      AWS_ACCOUNT_ID="${data.aws_caller_identity.current.account_id}"
      AWS_REGION="${data.aws_region.current.region}"
      REPOSITORY_URL="${aws_ecr_repository.this.repository_url}"
      IMAGE_TAG="${var.image_tag}"

      echo "Building container image with Docker..."
      echo "Repository URL: $REPOSITORY_URL"
      echo "Image Tag: $IMAGE_TAG"

      # Authenticate Docker to ECR
      aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

      # Build for ARM64 architecture (used by both AgentCore and EC2 t4g instances)
      PLATFORM="linux/arm64"
      echo "Building for ARM64 architecture..."

      # Build the container image
      BUILD_ARGS="${join(" ", [for k, v in var.docker_build_args : "--build-arg ${k}=${v}"])}"
      docker build \
        --platform $PLATFORM \
        $BUILD_ARGS \
        -t $REPOSITORY_URL:$IMAGE_TAG \
        .

      if [ $? -ne 0 ]; then
        echo "ERROR: Container build failed"
        exit 1
      fi

      # Push the image to ECR
      echo "Pushing image to ECR..."
      docker push $REPOSITORY_URL:$IMAGE_TAG

      if [ $? -ne 0 ]; then
        echo "ERROR: Container push failed"
        exit 1
      fi

      echo "Successfully pushed $REPOSITORY_URL:$IMAGE_TAG"

      # Wait a moment for ECR to register the image
      echo "Waiting for ECR to register the image..."
      sleep 5

      # Verify the image exists
      aws ecr describe-images \
        --repository-name $(basename $REPOSITORY_URL) \
        --image-ids imageTag=$IMAGE_TAG \
        --region $AWS_REGION || {
        echo "WARNING: Image verification failed, but build completed"
      }
    EOT
  }

  depends_on = [aws_ecr_repository.this]
}

# Data source to verify the pushed image exists (optional - may not exist on first run)
# This will be populated after the docker build completes
data "aws_ecr_image" "this" {
  count           = var.verify_image ? 1 : 0
  repository_name = aws_ecr_repository.this.name
  image_tag       = var.image_tag

  depends_on = [null_resource.docker_build_push]
}
