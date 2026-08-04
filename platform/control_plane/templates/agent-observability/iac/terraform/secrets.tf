# -----------------------------------------------------------------------------
# Random Secrets
# -----------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "nextauth_secret" {
  length  = 32
  special = false
}

resource "random_password" "salt" {
  length  = 32
  special = false
}

resource "random_password" "encryption_key" {
  length  = 64
  special = false
}

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name_prefix}-langfuse-db-password"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name                    = "${local.name_prefix}-langfuse-nextauth-secret"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "nextauth_secret" {
  secret_id     = aws_secretsmanager_secret.nextauth_secret.id
  secret_string = random_password.nextauth_secret.result
}

resource "aws_secretsmanager_secret" "salt" {
  name                    = "${local.name_prefix}-langfuse-salt"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "salt" {
  secret_id     = aws_secretsmanager_secret.salt.id
  secret_string = random_password.salt.result
}

resource "aws_secretsmanager_secret" "encryption_key" {
  name                    = "${local.name_prefix}-langfuse-encryption-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "encryption_key" {
  secret_id     = aws_secretsmanager_secret.encryption_key.id
  secret_string = random_password.encryption_key.result
}
