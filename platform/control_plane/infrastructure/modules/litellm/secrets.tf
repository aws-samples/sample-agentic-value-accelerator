# =============================================================================
# LiteLLM Gateway Module - Secrets Manager
# =============================================================================
# Implements:
#   - Secrets Manager entry for LITELLM_MASTER_KEY (generated random 32-char)
#   - Secrets Manager entry for DATABASE_URL (proper PostgreSQL connection URL)
#   - Secrets Manager entry for REDIS_PASSWORD (Redis AUTH token)
#   - Secrets Manager entry for Langfuse keys (public_key, secret_key, host)
#
# Task: 1.5
# Requirements: 7.4
#
# ARCC Compliance:
#   - BSC5 Secrets Manager: all credentials stored in Secrets Manager
#   - BSC5 IAM Roles Over Keys: no long-term access keys, ECS uses IAM roles
# =============================================================================

# =============================================================================
# Random Password Generation
# =============================================================================

resource "random_password" "litellm_master_key" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}:?"
}

# Single Redis auth token used by BOTH ElastiCache (redis.tf) and ECS (main.tf)
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false # Redis AUTH tokens work best without special chars
}

# =============================================================================
# LiteLLM Primary Key
# =============================================================================

resource "aws_secretsmanager_secret" "master_key" {
  name        = "${var.name_prefix}-master-key"
  description = "LiteLLM primary admin key for gateway authentication"

  tags = merge(local.tags, {
    Name      = "${var.name_prefix}-master-key"
    Component = "litellm-gateway"
  })
}

resource "aws_secretsmanager_secret_version" "master_key" {
  secret_id     = aws_secretsmanager_secret.master_key.id
  secret_string = random_password.litellm_master_key.result
}

# =============================================================================
# Database Credentials (PostgreSQL connection URL)
# =============================================================================
# Stored as a proper PostgreSQL connection URL string that LiteLLM expects
# for the DATABASE_URL environment variable.
# Format: postgresql://<user>:<password>@<host>:<port>/<dbname>
# =============================================================================

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.name_prefix}-db-credentials"
  description = "PostgreSQL connection URL for LiteLLM state persistence"

  tags = merge(local.tags, {
    Name      = "${var.name_prefix}-db-credentials"
    Component = "litellm-gateway"
  })
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id     = aws_secretsmanager_secret.db_credentials.id
  secret_string = "postgresql://litellm_admin:${urlencode(random_password.rds_master.result)}@${aws_db_instance.litellm.address}:5432/litellm"
}

# =============================================================================
# Redis AUTH Token
# =============================================================================
# Uses the same random_password.redis_auth_token that is configured on the
# ElastiCache replication group in redis.tf. This ensures the ECS container
# and Redis cluster use the same auth token.
# =============================================================================

resource "aws_secretsmanager_secret" "redis_auth" {
  name        = "${var.name_prefix}-redis-auth"
  description = "Redis AUTH token for LiteLLM ElastiCache cluster"

  tags = merge(local.tags, {
    Name      = "${var.name_prefix}-redis-auth"
    Component = "litellm-gateway"
  })
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis_auth_token.result
}

# =============================================================================
# Langfuse Keys (public_key, secret_key, host)
# =============================================================================

resource "aws_secretsmanager_secret" "langfuse_keys" {
  name        = "${var.name_prefix}-langfuse-keys"
  description = "Langfuse callback authentication keys for LiteLLM observability"

  tags = merge(local.tags, {
    Name      = "${var.name_prefix}-langfuse-keys"
    Component = "litellm-gateway"
  })
}

resource "aws_secretsmanager_secret_version" "langfuse_keys" {
  secret_id = aws_secretsmanager_secret.langfuse_keys.id
  secret_string = jsonencode({
    public_key = var.langfuse_public_key
    secret_key = var.langfuse_secret_key
    host       = var.langfuse_host
  })
}

# =============================================================================
# Bedrock Mantle API Key (for GPT-5.x models via bedrock-mantle endpoint)
# =============================================================================

resource "aws_secretsmanager_secret" "bedrock_mantle_api_key" {
  count       = var.bedrock_mantle_api_key != "" ? 1 : 0
  name        = "${var.name_prefix}-bedrock-mantle-api-key"
  description = "Bedrock Mantle API key for OpenAI GPT models (GPT-5.5, GPT-5.4)"

  tags = merge(local.tags, {
    Name      = "${var.name_prefix}-bedrock-mantle-api-key"
    Component = "litellm-gateway"
  })
}

resource "aws_secretsmanager_secret_version" "bedrock_mantle_api_key" {
  count         = var.bedrock_mantle_api_key != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.bedrock_mantle_api_key[0].id
  secret_string = var.bedrock_mantle_api_key
}
