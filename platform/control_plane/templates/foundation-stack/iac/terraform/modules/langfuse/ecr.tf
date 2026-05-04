variable "langfuse_version" {
  description = "Langfuse image version to pull and push"
  type        = string
  default     = "3.161.0"
}

variable "clickhouse_version" {
  description = "ClickHouse image version to pull and push"
  type        = string
  default     = "24.12.3"
}

locals {
  ecr_base = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.id}.amazonaws.com"

  ecr_repos = {
    langfuse        = { source = "langfuse/langfuse", tag = var.langfuse_version }
    langfuse-worker = { source = "langfuse/langfuse-worker", tag = var.langfuse_version }
    clickhouse      = { source = "clickhouse/clickhouse-server", tag = var.clickhouse_version }
  }
}

resource "aws_ecr_repository" "images" {
  for_each = local.ecr_repos

  name                 = "${var.name}-${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.tag_name} ${each.key}"
  }
}

resource "null_resource" "push_images" {
  for_each = local.ecr_repos

  triggers = {
    repo_url = aws_ecr_repository.images[each.key].repository_url
    tag      = each.value.tag
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      aws ecr get-login-password --region ${data.aws_region.current.id} | \
        docker login --username AWS --password-stdin ${local.ecr_base}

      TARGET_REPO="${aws_ecr_repository.images[each.key].repository_url}"
      if aws ecr describe-images --repository-name "${var.name}-${each.key}" --image-ids imageTag="${each.value.tag}" --region ${data.aws_region.current.id} >/dev/null 2>&1; then
        echo "Image already exists in ECR: $TARGET_REPO:${each.value.tag} — skipping pull"
        exit 0
      fi

      # Optional Docker Hub auth (doubles rate limit from 100 to 200 pulls/6hrs)
      # Reads from Secrets Manager secret "dockerhub-credentials" if it exists
      # Secret format: {"username":"...","token":"..."}
      DOCKERHUB_SECRET=$(aws secretsmanager get-secret-value --secret-id dockerhub-credentials --region ${data.aws_region.current.id} --query SecretString --output text 2>/dev/null || true)
      if [ -n "$DOCKERHUB_SECRET" ]; then
        DH_USER=$(echo "$DOCKERHUB_SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null)
        DH_TOKEN=$(echo "$DOCKERHUB_SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
        if [ -n "$DH_USER" ] && [ -n "$DH_TOKEN" ]; then
          echo "$DH_TOKEN" | docker login --username "$DH_USER" --password-stdin 2>/dev/null && echo "Docker Hub: authenticated" || echo "Docker Hub: auth failed, continuing unauthenticated"
        fi
      fi

      PULLED=false
      for i in 1 2 3 4 5; do
        if docker pull --platform linux/amd64 ${each.value.source}:${each.value.tag}; then
          PULLED=true
          break
        fi
        echo "Pull attempt $i failed, waiting 60s before retry..."
        sleep 60
      done
      if [ "$PULLED" = "false" ]; then
        echo "ERROR: Failed to pull image after 5 attempts"
        exit 1
      fi
      docker tag ${each.value.source}:${each.value.tag} $TARGET_REPO:${each.value.tag}
      docker push $TARGET_REPO:${each.value.tag}
    EOT
  }

  depends_on = [aws_ecr_repository.images]
}
