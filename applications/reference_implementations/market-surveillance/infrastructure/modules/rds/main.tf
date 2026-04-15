# Generate random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
  # Exclude characters that might cause issues in connection strings
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Create Secrets Manager secret for database credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  #checkov:skip=CKV_AWS_149:Using AWS-managed encryption key for non-production; CMK encryption should be enforced in production
  #checkov:skip=CKV2_AWS_57:Secret rotation deferred — requires application code changes (credential refresh on auth failure, lowercase key format support) and Aurora managed master password migration.
  name        = "${var.name_prefix}-db-${var.environment}"
  description = "Database credentials for ${var.name_prefix} ${var.environment} environment"

  tags = {
    Name        = "${var.name_prefix}-db-secret-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Store database credentials in Secrets Manager
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    HOST     = aws_rds_cluster.this.endpoint
    PORT     = aws_rds_cluster.this.port
    DBNAME   = aws_rds_cluster.this.database_name
    USERNAME = aws_rds_cluster.this.master_username
    PASSWORD = random_password.db_password.result
    ENGINE   = "postgres"
    ENDPOINT = aws_rds_cluster.this.endpoint
  })
}

# DB Subnet Group
resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db-subnet-group-${var.environment}"
  description = "Database subnet group for ${var.name_prefix}"
  subnet_ids  = var.subnet_ids

  tags = {
    Name        = "${var.name_prefix}-db-subnet-group-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Aurora PostgreSQL Cluster
resource "aws_rds_cluster" "this" {
  #checkov:skip=CKV2_AWS_8:Aurora-native backup retention is configured (backup_retention_period); AWS Backup plan not required
  #checkov:skip=CKV2_AWS_27:Query logging deferred to production; INFO-level finding accepted for non-production environments

  cluster_identifier = "${var.name_prefix}-db-${var.environment}"

  # Engine configuration
  engine         = "aurora-postgresql"
  engine_version = var.engine_version

  # Database configuration
  database_name   = var.db_name
  master_username = var.db_username
  master_password = random_password.db_password.result

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids

  # NOTE: availability_zones is intentionally omitted. Setting it explicitly
  # causes forced replacement on every apply because AWS returns AZs in a
  # non-deterministic order. Aurora will automatically use the AZs from the
  # subnet group instead.

  # Storage configuration
  storage_encrypted = true

  # Backup configuration
  backup_retention_period      = var.backup_retention_period
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "Mon:04:00-Mon:05:00"

  # Snapshot configuration
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-db-final-${var.environment}"

  # Authentication
  iam_database_authentication_enabled = true

  # Enabling export types to Cloudwatch
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Other settings
  deletion_protection          = var.environment == "prod" ? true : false
  copy_tags_to_snapshot        = true
  apply_immediately            = var.environment != "prod"
  performance_insights_enabled = false

  tags = {
    Name        = "${var.name_prefix}-db-${var.environment}"
    Environment = var.environment
    Project     = var.name_prefix
  }
}

# Aurora Cluster Instances
resource "aws_rds_cluster_instance" "this" {
  count              = var.cluster_instance_count
  identifier         = "${var.name_prefix}-db-${var.environment}-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.this.id
  instance_class     = var.instance_class
  engine             = aws_rds_cluster.this.engine
  engine_version     = aws_rds_cluster.this.engine_version

  # Performance and monitoring
  #checkov:skip=CKV_AWS_118: Enhanced monitoring can be enabled for production environments
  #checkov:skip=CKV_AWS_353: Performance insights are not required
  performance_insights_enabled = false
  monitoring_interval          = 0

  # Other settings
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  apply_immediately          = var.environment != "prod"

  tags = {
    Name        = "${var.name_prefix}-db-instance-${var.environment}-${count.index + 1}"
    Environment = var.environment
    Project     = var.name_prefix
  }
}
