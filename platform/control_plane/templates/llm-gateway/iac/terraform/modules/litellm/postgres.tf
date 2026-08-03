resource "aws_security_group" "postgres" {
  name        = "${var.name}-postgres"
  description = "LiteLLM Aurora PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} Postgres" })
}

resource "aws_db_subnet_group" "postgres" {
  name       = "${var.name}-postgres-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags       = merge(local.common_tags, { Name = local.tag_name })
}

resource "aws_rds_cluster" "postgres" {
  depends_on              = [null_resource.service_linked_roles]
  cluster_identifier      = "${var.name}-postgres"
  engine                  = "aurora-postgresql"
  engine_mode             = "provisioned"
  engine_version          = var.postgres_version
  database_name           = "litellm"
  master_username         = "litellm"
  master_password         = random_password.postgres_password.result
  db_subnet_group_name    = aws_db_subnet_group.postgres.name
  vpc_security_group_ids  = [aws_security_group.postgres.id]
  skip_final_snapshot     = true
  storage_encrypted       = true
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"

  serverlessv2_scaling_configuration {
    min_capacity = var.postgres_min_capacity
    max_capacity = var.postgres_max_capacity
  }

  tags = merge(local.common_tags, { Name = local.tag_name })
}

resource "aws_rds_cluster_instance" "postgres" {
  count                                 = 2
  identifier                            = "${var.name}-postgres-${count.index + 1}"
  cluster_identifier                    = aws_rds_cluster.postgres.id
  instance_class                        = "db.serverless"
  engine                                = aws_rds_cluster.postgres.engine
  engine_version                        = aws_rds_cluster.postgres.engine_version
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  tags                                  = merge(local.common_tags, { Name = "${local.tag_name} ${count.index + 1}" })
}
