variable "langfuse_version" {
  description = "Langfuse image version to pull and push"
  type        = string
  default     = "3.161.0"
}

variable "clickhouse_version" {
  description = "ClickHouse image version to pull and push"
  type        = string
  default     = "24.12"
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
      docker logout ${local.ecr_base} 2>/dev/null || true
      aws ecr get-login-password --region ${data.aws_region.current.id} | \
        docker login --username AWS --password-stdin ${local.ecr_base}
      docker pull --platform linux/amd64 ${each.value.source}:${each.value.tag}
      docker tag ${each.value.source}:${each.value.tag} ${aws_ecr_repository.images[each.key].repository_url}:${each.value.tag}
      docker push ${aws_ecr_repository.images[each.key].repository_url}:${each.value.tag}
    EOT
  }

  depends_on = [aws_ecr_repository.images]
}
