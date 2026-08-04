# -----------------------------------------------------------------------------
# ElastiCache Redis
# -----------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "langfuse" {
  name       = "${local.name_prefix}-langfuse"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "langfuse" {
  replication_group_id = "${local.name_prefix}-langfuse"
  description          = "Redis for Langfuse session and cache"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_clusters   = 1
  port                 = local.redis_port

  subnet_group_name  = aws_elasticache_subnet_group.langfuse.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
}
