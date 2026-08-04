# Private ECR mirror of ghcr.io/berriai/litellm-database — keeps the image inside
# the account and avoids GHCR rate limits.
resource "aws_ecr_repository" "litellm" {
  name                 = "${var.name}-litellm"
  image_tag_mutability = "MUTABLE"

  # Terraform destroy has repeatedly failed on this repo because it still
  # contains the mirrored litellm-database image at teardown time. force_delete
  # lets terraform delete the repo (and its images) as part of the destroy
  # plan, avoiding manual `aws ecr delete-repository --force` cleanup.
  force_delete = true

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} ECR" })
}

resource "null_resource" "push_image" {
  triggers = {
    repo_url = aws_ecr_repository.litellm.repository_url
    version  = var.litellm_version
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      AWS_REGION="${data.aws_region.current.region}"
      ACCOUNT_ID="${data.aws_caller_identity.current.account_id}"
      REPO_URL="${aws_ecr_repository.litellm.repository_url}"
      VERSION="${var.litellm_version}"

      aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

      # Force linux/amd64 — the ECS task definition pins
      # runtime_platform.cpu_architecture = "X86_64", so the mirrored image
      # must match. Without --platform, docker pulls whichever variant
      # matches the CodeBuild host (often ARM64 on Graviton runners) and
      # the resulting Fargate container fails with "exec format error".
      docker pull --platform linux/amd64 ghcr.io/berriai/litellm-database:$VERSION
      docker tag  ghcr.io/berriai/litellm-database:$VERSION "$REPO_URL:$VERSION"
      docker push "$REPO_URL:$VERSION"
    EOT
  }

  depends_on = [aws_ecr_repository.litellm]
}
