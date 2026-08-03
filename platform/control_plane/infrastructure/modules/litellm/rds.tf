# =============================================================================
# LiteLLM Gateway Module - RDS PostgreSQL
# =============================================================================
# Implements:
#   - RDS PostgreSQL instance (Multi-AZ) for virtual key persistence, spend tracking, audit
#   - KMS encryption at rest with dedicated CMK (key rotation enabled per BSC3)
#   - Automated daily backups with 7-day retention
#   - Subnet group in private subnets
#   - Parameter group for PostgreSQL tuning
#   - Security group allowing inbound only from ECS task SG
#
# Task: 1.4
# Requirements: 8.1, 8.3, 8.5, 8.6
# =============================================================================

# -----------------------------------------------------------------------------
# KMS Key for RDS Encryption at Rest
# -----------------------------------------------------------------------------

resource "aws_kms_key" "rds" {
  description             = "KMS CMK for ${local.resource_prefix} RDS encryption at rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-rds-kms"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.resource_prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# -----------------------------------------------------------------------------
# RDS Subnet Group (Private Subnets)
# -----------------------------------------------------------------------------

resource "aws_db_subnet_group" "litellm" {
  name       = "${local.resource_prefix}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-db-subnet-group"
  })
}

# -----------------------------------------------------------------------------
# RDS Parameter Group
# -----------------------------------------------------------------------------

resource "aws_db_parameter_group" "litellm" {
  name   = "${local.resource_prefix}-pg15-params"
  family = "postgres15"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-pg15-params"
  })
}

# -----------------------------------------------------------------------------
# RDS Security Group
# -----------------------------------------------------------------------------

resource "aws_security_group" "rds" {
  name_prefix = "${local.resource_prefix}-rds-"
  description = "Security group for LiteLLM RDS PostgreSQL - allows inbound from ECS tasks only"
  vpc_id      = var.vpc_id

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-rds-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_ingress_from_ecs" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  description              = "Allow PostgreSQL inbound from LiteLLM ECS tasks"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.litellm_tasks.id
}

resource "aws_security_group_rule" "rds_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  description       = "Allow all outbound traffic"
  security_group_id = aws_security_group.rds.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# -----------------------------------------------------------------------------
# RDS Master Password (stored in Secrets Manager)
# -----------------------------------------------------------------------------

resource "random_password" "rds_master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "rds_master_password" {
  name        = "${local.resource_prefix}-rds-master-password"
  description = "Primary password for LiteLLM RDS PostgreSQL instance"
  kms_key_id  = aws_kms_key.rds.arn

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-rds-master-password"
  })
}

resource "aws_secretsmanager_secret_version" "rds_master_password" {
  secret_id     = aws_secretsmanager_secret.rds_master_password.id
  secret_string = random_password.rds_master.result
}

# -----------------------------------------------------------------------------
# RDS PostgreSQL Instance
# -----------------------------------------------------------------------------

resource "aws_db_instance" "litellm" {
  identifier = "${local.resource_prefix}-postgres"

  # Engine configuration
  engine         = "postgres"
  engine_version = "15"
  instance_class = var.rds_instance_class

  # Database configuration
  db_name  = "litellm"
  username = "litellm_admin"
  password = random_password.rds_master.result

  # Storage
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  # High availability
  multi_az = true

  # Network
  db_subnet_group_name   = aws_db_subnet_group.litellm.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # Parameter group
  parameter_group_name = aws_db_parameter_group.litellm.name

  # Backup configuration
  backup_retention_period  = 7
  backup_window            = "03:00-04:00"
  maintenance_window       = "mon:04:30-mon:05:30"
  copy_tags_to_snapshot    = true
  delete_automated_backups = true

  # Snapshot behavior (skip in dev, keep in prod)
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.resource_prefix}-final-snapshot" : null

  # Monitoring
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Deletion protection (enabled in prod)
  deletion_protection = var.environment == "prod"

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-postgres"
  })
}
