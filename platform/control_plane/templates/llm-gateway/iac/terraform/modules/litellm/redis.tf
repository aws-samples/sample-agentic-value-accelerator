resource "aws_security_group" "redis" {
  name        = "${var.name}-redis"
  description = "LiteLLM ElastiCache Valkey"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} Redis" })
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.name}-redis"
  subnet_ids = var.private_subnet_ids
  tags       = merge(local.common_tags, { Name = "${local.tag_name} Redis subnet group" })
}

resource "aws_elasticache_replication_group" "redis" {
  depends_on                 = [null_resource.service_linked_roles]
  replication_group_id       = "${var.name}-cache"
  description                = "LiteLLM rate-limit + prompt-cache"
  node_type                  = var.cache_node_type
  engine                     = "valkey"
  engine_version             = "7.2"
  port                       = 6379
  parameter_group_name       = "default.valkey7"
  automatic_failover_enabled = false
  num_cache_clusters         = 1
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  snapshot_retention_limit   = 3
  auto_minor_version_upgrade = false
  transit_encryption_enabled = true
  transit_encryption_mode    = "preferred"

  tags = merge(local.common_tags, { Name = "${local.tag_name} Cache" })
}
