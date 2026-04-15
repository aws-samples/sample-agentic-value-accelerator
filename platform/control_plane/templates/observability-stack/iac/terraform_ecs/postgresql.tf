resource "aws_security_group" "postgres" {
  name        = "${var.name}-postgres"
  description = "Security group for Langfuse PostgreSQL"
  vpc_id      = data.aws_vpc.vpc.id

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

  tags = {
    Name = "${local.tag_name} Postgres"
  }
}

# Aurora PostgreSQL Serverless v2 Cluster
resource "aws_db_subnet_group" "postgres" {
  name       = "${var.name}-postgres-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = local.tag_name
  }
}

resource "aws_rds_cluster" "postgres" {
  cluster_identifier           = "${var.name}-postgres"
  engine                       = "aurora-postgresql"
  engine_mode                  = "provisioned"
  engine_version               = var.postgres_version
  database_name                = "langfuse"
  master_username              = "langfuse"
  master_password              = random_password.postgres_password.result
  db_subnet_group_name         = aws_db_subnet_group.postgres.name
  vpc_security_group_ids       = [aws_security_group.postgres.id]
  skip_final_snapshot          = true
  storage_encrypted            = true
  backup_retention_period      = 7
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"

  serverlessv2_scaling_configuration {
    min_capacity = var.postgres_min_capacity
    max_capacity = var.postgres_max_capacity
  }

  tags = {
    Name = local.tag_name
  }
}

resource "aws_rds_cluster_parameter_group" "postgres" {
  name        = "${var.name}-postgres-parameter-group"
  family      = "aurora-postgresql15"
  description = "Parameter group for ${local.tag_name} Postgres"
}

resource "aws_rds_cluster_instance" "postgres" {
  count              = var.postgres_instance_count
  identifier         = "${var.name}-postgres-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.postgres.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.postgres.engine
  engine_version     = aws_rds_cluster.postgres.engine_version

  # Enable Performance Insights
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = {
    Name = "${local.tag_name} ${count.index + 1}"
  }
}
