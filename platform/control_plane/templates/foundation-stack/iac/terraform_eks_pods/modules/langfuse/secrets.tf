# Generate random Langfuse API keys
resource "random_string" "langfuse_public_key_suffix" {
  length  = 32
  special = false
  upper   = false
}

resource "random_string" "langfuse_secret_key_suffix" {
  length  = 32
  special = false
  upper   = false
}

locals {
  langfuse_public_key = "pk-lf-${random_string.langfuse_public_key_suffix.result}"
  langfuse_secret_key = "sk-lf-${random_string.langfuse_secret_key_suffix.result}"
}

# AWS Secrets Manager secret for agent templates to consume
resource "aws_secretsmanager_secret" "langfuse" {
  name = "${var.name}-secrets"

  tags = merge(local.common_tags, {
    Name = "${var.name} Langfuse API Keys"
  })
}

resource "aws_secretsmanager_secret_version" "langfuse" {
  secret_id = aws_secretsmanager_secret.langfuse.id
  secret_string = jsonencode({
    langfuse_public_key = local.langfuse_public_key
    langfuse_secret_key = local.langfuse_secret_key
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
