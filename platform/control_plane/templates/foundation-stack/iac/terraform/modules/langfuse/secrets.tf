# Generate random keys for Langfuse project initialization
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

# Create the formatted keys with prefixes
locals {
  langfuse_public_key = "pk-lf-${random_string.langfuse_public_key_suffix.result}"
  langfuse_secret_key = "sk-lf-${random_string.langfuse_secret_key_suffix.result}"
}

# Add the generated keys to the existing secrets manager secret
resource "aws_secretsmanager_secret_version" "langfuse_generated_keys" {
  secret_id = aws_secretsmanager_secret.langfuse.id
  secret_string = jsonencode(merge(
    jsondecode(aws_secretsmanager_secret_version.langfuse.secret_string),
    {
      langfuse_public_key = local.langfuse_public_key
      langfuse_secret_key = local.langfuse_secret_key
    }
  ))

  depends_on = [aws_secretsmanager_secret_version.langfuse]

  lifecycle {
    ignore_changes = [secret_string]
  }
}
