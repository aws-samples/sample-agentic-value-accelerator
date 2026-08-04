# -----------------------------------------------------------------------------
# Aurora PostgreSQL Serverless v2
# -----------------------------------------------------------------------------

resource "aws_db_subnet_group" "langfuse" {
  name       = "${local.name_prefix}-langfuse"
  subnet_ids = var.private_subnet_ids
}

resource "aws_rds_cluster" "langfuse" {
  cluster_identifier = "${local.name_prefix}-langfuse"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "16.6"
  database_name      = local.db_name
  master_username    = local.db_username
  master_password    = random_password.db_password.result
  port               = local.db_port

  db_subnet_group_name   = aws_db_subnet_group.langfuse.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  serverlessv2_scaling_configuration {
    min_capacity = var.db_min_capacity
    max_capacity = var.db_max_capacity
  }

  skip_final_snapshot = true
  storage_encrypted   = true
}

resource "aws_rds_cluster_instance" "langfuse" {
  identifier         = "${local.name_prefix}-langfuse-1"
  cluster_identifier = aws_rds_cluster.langfuse.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.langfuse.engine
  engine_version     = aws_rds_cluster.langfuse.engine_version
}
