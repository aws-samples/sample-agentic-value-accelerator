
# Security Group for clients that need to access the Valkey/Redis cluster
resource "aws_security_group" "redis_client_sg" {
  name        = "${var.name}-redis-client-sg"
  description = "Security group for redis client"
  vpc_id      = var.vpc_id

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "redis-client-sg"
  }
}

# Security Group for the Valkey/Redis cluster itself
resource "aws_security_group" "redis_server_sg" {
  name        = "${var.name}-redis-server-sg"
  description = "Security group for redis server"
  vpc_id      = var.vpc_id

  # Allow inbound traffic on the Valkey/Redis port (6379) from the client security group
  ingress {
    description     = "redis-client-sg"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.redis_client_sg.id]
  }

  # Allow inbound traffic from other nodes within the same security group for cluster communication
  ingress {
    description = "redis-server-sg"
    from_port   = 0
    to_port     = 0
    protocol    = "tcp"
    self        = true # Allows traffic from the group itself
  }

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "redis-server-sg"
  }
}

# ElastiCache Subnet Group to define which subnets the cluster can use
resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name       = "${var.name}-redis-cluster"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name}-redis-cluster-subnet-group"
  }
}

# The ElastiCache Replication Group (the Valkey cluster)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${var.name}-langfuse-cache"
  description                   = "Langfuse Cache/Queue Replication Group"
  node_type                     = var.cache_node_type
  engine                        = "valkey"
  engine_version                = "7.2"
  port                          = 6379
  parameter_group_name          = "default.valkey7"
  automatic_failover_enabled    = false
  num_cache_clusters            = 1
  subnet_group_name             = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids            = [aws_security_group.redis_server_sg.id]
  snapshot_retention_limit      = 3
  snapshot_window               = "19:00-21:00"
  maintenance_window            = "mon:21:00-mon:22:30"
  auto_minor_version_upgrade    = false
  transit_encryption_enabled    = true
  transit_encryption_mode       = "preferred"

  tags = {
    Name = "${var.name}-langfuse-cache"
  }
}