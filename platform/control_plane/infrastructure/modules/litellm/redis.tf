# =============================================================================
# LiteLLM Gateway Module - ElastiCache Redis
# =============================================================================
# Implements:
#   - ElastiCache Redis replication group for prompt caching and rate limiting
#   - Encryption in transit (TLS) and at rest (KMS)
#   - Subnet group in private subnets
#   - Parameter group for Redis tuning
#   - Auth token for connection authentication
#   - Security group allowing inbound only from ECS task SG
#
# Task: 1.4
# Requirements: 8.2, 8.4, 8.5, 8.6
# =============================================================================

# -----------------------------------------------------------------------------
# KMS Key for Redis Encryption at Rest
# -----------------------------------------------------------------------------

resource "aws_kms_key" "redis" {
  description             = "KMS CMK for ${local.resource_prefix} ElastiCache Redis encryption at rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-redis-kms"
  })
}

resource "aws_kms_alias" "redis" {
  name          = "alias/${local.resource_prefix}-redis"
  target_key_id = aws_kms_key.redis.key_id
}

# -----------------------------------------------------------------------------
# Redis Subnet Group (Private Subnets)
# -----------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "litellm" {
  name       = "${local.resource_prefix}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-redis-subnet-group"
  })
}

# -----------------------------------------------------------------------------
# Redis Parameter Group
# -----------------------------------------------------------------------------

resource "aws_elasticache_parameter_group" "litellm" {
  name   = "${local.resource_prefix}-redis7-params"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-redis7-params"
  })
}

# -----------------------------------------------------------------------------
# Redis Security Group
# Note: Security group is defined in security.tf as aws_security_group.litellm_redis
# with ingress rules allowing port 6379 from ECS tasks only.
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Redis Auth Token
# -----------------------------------------------------------------------------
# Uses the single random_password.redis_auth_token defined in secrets.tf.
# This ensures the same token is used for both the ElastiCache cluster and
# the ECS task injection (via Secrets Manager).
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# ElastiCache Redis Replication Group
# -----------------------------------------------------------------------------

resource "aws_elasticache_replication_group" "litellm" {
  replication_group_id = "${local.resource_prefix}-redis"
  description          = "LiteLLM Redis cluster for prompt caching, rate limiting, and session data"

  # Engine configuration
  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type

  # Cluster configuration
  num_cache_clusters         = var.redis_num_cache_clusters
  automatic_failover_enabled = var.redis_num_cache_clusters > 1
  multi_az_enabled           = var.redis_num_cache_clusters > 1

  # Network
  subnet_group_name  = aws_elasticache_subnet_group.litellm.name
  security_group_ids = [aws_security_group.litellm_redis.id]
  port               = 6379

  # Parameter group
  parameter_group_name = aws_elasticache_parameter_group.litellm.name

  # Encryption at rest
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.redis.arn

  # Encryption in transit (TLS)
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  # Maintenance and snapshots
  maintenance_window       = "tue:04:00-tue:05:00"
  snapshot_window          = "03:00-04:00"
  snapshot_retention_limit = 7

  # Auto minor version upgrade
  auto_minor_version_upgrade = true

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-redis"
  })
}
