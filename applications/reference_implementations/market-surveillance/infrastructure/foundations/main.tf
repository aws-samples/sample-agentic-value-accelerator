provider "aws" {
  region = var.aws_region
}

# Local values from networking.tf outputs
locals {
  vpc_id                           = try(module.vpc.vpc_id, "")
  public_subnet_ids                = try(module.vpc.public_subnets, [])
  private_subnet_ids               = try(module.vpc.private_subnets, [])
  database_subnet_ids              = try(module.vpc.database_subnets, [])
  alb_security_group_id            = try(aws_security_group.alb.id, "")
  webapp_ec2_security_group_id     = try(aws_security_group.webapp_ec2.id, "")
  rds_security_group_id            = try(aws_security_group.rds.id, "")
  agentcore_security_group_id      = try(aws_security_group.agentcore.id, "")
  lambda_security_group_id         = try(aws_security_group.lambda.id, "")
  private_subnet_security_group_id = try(aws_security_group.private_subnet.id, "")
}

# KMS module for Customer Managed Keys
module "kms" {
  source = "../modules/kms"

  environment = var.environment
}

# Cognito module
module "cognito" {
  source = "../modules/cognito"

  environment                 = var.environment
  password_min_length         = 8
  token_validity_hours        = 1
  refresh_token_validity_days = 30
  enable_hosted_ui            = true
}

# RDS module (Aurora PostgreSQL)
module "rds" {
  source = "../modules/rds"

  environment             = var.environment
  db_name                 = var.db_name
  db_username             = var.db_username
  instance_class          = var.db_instance_class
  cluster_instance_count  = var.db_cluster_instance_count
  availability_zones      = var.availability_zones
  subnet_ids              = local.database_subnet_ids
  security_group_ids      = [local.rds_security_group_id]
  vpc_id                  = local.vpc_id
  backup_retention_period = var.db_backup_retention_period
}

# Risk Analyst RDS module (Aurora PostgreSQL) — separate cluster for Risk Analyst agent
module "msp_rds" {
  source = "../modules/rds"

  name_prefix             = "msp"
  environment             = var.environment
  db_name                 = var.msp_db_name
  db_username             = var.msp_db_username
  instance_class          = var.msp_db_instance_class
  cluster_instance_count  = var.msp_db_cluster_instance_count
  availability_zones      = var.availability_zones
  subnet_ids              = local.database_subnet_ids
  security_group_ids      = [local.rds_security_group_id]
  vpc_id                  = local.vpc_id
  backup_retention_period = var.msp_db_backup_retention_period
}

# ACM Certificate module (optional - only if domain name is provided)
module "acm" {
  source = "../modules/acm"

  environment = var.environment

  # Certificate creation control
  create_certificate = var.certificate_existing_arn == "" && !var.certificate_import_enabled && var.certificate_domain_name != ""

  # Certificate configuration (for new certificates)
  domain_name               = var.certificate_domain_name
  subject_alternative_names = var.certificate_subject_alternative_names
  validation_method         = var.certificate_validation_method

  # Route 53 DNS validation (optional - automatic if zone_id provided)
  route53_zone_id = var.certificate_route53_zone_id

  # Import existing certificate (optional)
  certificate_body  = var.certificate_body
  private_key       = var.certificate_private_key
  certificate_chain = var.certificate_chain

  # Use existing certificate (optional)
  existing_certificate_arn = var.certificate_existing_arn
}

# ============================================================================
# DynamoDB Tables for Alert Investigation System
# ============================================================================

# Table 1: AlertConversations - User-specific chat messages with AI agent
resource "aws_dynamodb_table" "alert_conversations" {
  name         = "market-surveillance-alert-conversations-${var.environment}"
  billing_mode = "PAY_PER_REQUEST" # On-demand pricing for variable workload
  hash_key     = "PK"              # ALERT#{alertId}#USER#{userId}
  range_key    = "SK"              # MSG#{timestamp}

  # Enable point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = true
  }

  # Enable deletion protection in production
  deletion_protection_enabled = var.environment == "prod" ? true : false

  # Primary key attributes
  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Encrypt with Customer Managed KMS key
  server_side_encryption {
    enabled     = true
    kms_key_arn = module.kms.dynamodb_key_arn
  }

  # TTL for automatic data cleanup (90 days for conversations)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Tags for resource management
  tags = {
    Name        = "market-surveillance-alert-conversations-${var.environment}"
    Environment = var.environment
    Purpose     = "Alert investigation chat messages"
    ManagedBy   = "Terraform"
  }
}

# Table 2: AlertSummaries - Investigation summaries with async audit trails
resource "aws_dynamodb_table" "alert_summaries" {
  name         = "market-surveillance-alert-summaries-${var.environment}"
  billing_mode = "PAY_PER_REQUEST" # On-demand pricing
  hash_key     = "PK"              # ALERT#{alertId}
  range_key    = "SK"              # SUMMARY#{timestamp} or SUMMARY#LATEST

  # Enable point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = true
  }

  # Enable deletion protection in production
  deletion_protection_enabled = var.environment == "prod" ? true : false

  # Primary key attributes
  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Encrypt with Customer Managed KMS key (CKV_AWS_119)
  server_side_encryption {
    enabled     = true
    kms_key_arn = module.kms.dynamodb_key_arn
  }

  # TTL for automatic data cleanup (7 years for regulatory compliance)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Tags for resource management
  tags = {
    Name        = "market-surveillance-alert-summaries-${var.environment}"
    Environment = var.environment
    Purpose     = "Alert investigation summaries and audit trails"
    ManagedBy   = "Terraform"
  }
}

# Table 3: Risk Analyst Conversations - Risk Analyst agent chat messages per user
resource "aws_dynamodb_table" "msp_conversations" {
  name         = "market-surveillance-msp-conversations-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK" # USER#{userId}
  range_key    = "SK" # MSG#{timestamp}

  point_in_time_recovery { enabled = true }
  deletion_protection_enabled = var.environment == "prod" ? true : false

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = module.kms.dynamodb_key_arn
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "market-surveillance-msp-conversations-${var.environment}"
    Environment = var.environment
    Purpose     = "Risk Analyst agent chat messages"
    ManagedBy   = "Terraform"
  }
}

# WAF/Firewall module
# Note: For CloudFront, WAF must be in us-east-1 (which is our default region)
module "firewall" {
  source = "../modules/firewall"

  environment               = var.environment
  rate_limit                = var.waf_rate_limit
  enable_cloudwatch_metrics = true
  scope                     = "CLOUDFRONT"

  # KMS encryption for CloudWatch Log Group
  kms_key_arn = module.kms.logs_key_arn
}

# Application Load Balancer module
module "alb" {
  source = "../modules/alb"

  environment                      = var.environment
  vpc_id                           = local.vpc_id
  public_subnet_ids                = local.public_subnet_ids
  security_group_ids               = [local.alb_security_group_id]
  enable_deletion_protection       = var.environment == "prod" ? true : false
  idle_timeout                     = 600 # 10 minutes — match CloudFront origin_read_timeout for streaming agent responses
  health_check_path                = "/"
  health_check_interval            = 30
  health_check_timeout             = 5
  health_check_healthy_threshold   = 2
  health_check_unhealthy_threshold = 2
  target_port                      = 3000

  # HTTPS Configuration (optional - only if certificate is available)
  certificate_arn = var.certificate_existing_arn != "" ? var.certificate_existing_arn : (
    var.certificate_domain_name != "" ? module.acm.certificate_arn : ""
  )
  ssl_policy = var.alb_ssl_policy

  depends_on = [module.acm]
}

# CloudFront module
module "cloudfront" {
  source = "../modules/cloudfront"

  environment  = var.environment
  alb_dns_name = module.alb.alb_dns_name
  web_acl_arn  = module.firewall.web_acl_arn

  depends_on = [module.alb]
}

# Bastion Host to access DB
module "bastion" {
  source = "../modules/bastion"

  app_name                   = "market-surveillance"
  environment                = var.environment
  subnet_id                  = local.private_subnet_ids[0] # Use first private subnet
  security_group_id          = local.private_subnet_security_group_id
  instance_type              = "t3.micro"
  root_volume_size           = 30
  db_secret_arn              = module.rds.db_secret_arn
  enable_detailed_monitoring = false
  enable_secrets             = true
}

# =============================================================================
# SSM Parameter Store — Publish foundation outputs for app-infra consumption
# =============================================================================
module "output_params" {
  source = "../modules/foundations-output-params"

  environment = var.environment
  kms_key_arn = module.kms.secrets_key_arn

  string_parameters = {
    # KMS keys
    "kms/ecr-key-arn"      = module.kms.ecr_key_arn
    "kms/s3-key-arn"       = module.kms.s3_key_arn
    "kms/lambda-key-arn"   = module.kms.lambda_key_arn
    "kms/dynamodb-key-arn" = module.kms.dynamodb_key_arn
    "kms/logs-key-arn"     = module.kms.logs_key_arn
    "kms/secrets-key-arn"  = module.kms.secrets_key_arn

    # Cognito (non-sensitive)
    "cognito/user-pool-id"        = module.cognito.user_pool_id
    "cognito/user-pool-arn"       = module.cognito.user_pool_arn
    "cognito/user-pool-client-id" = module.cognito.user_pool_client_id
    "cognito/web-app-client-id"   = module.cognito.web_app_client_id
    "cognito/hosted-ui-url"       = module.cognito.hosted_ui_url

    # RDS
    "rds/db-address"     = module.rds.db_address
    "rds/db-port"        = tostring(module.rds.db_port)
    "rds/db-name"        = module.rds.db_name
    "rds/db-secret-arn"  = module.rds.db_secret_arn
    "rds/db-secret-name" = module.rds.db_secret_name

    # Risk Analyst RDS
    "msp-rds/db-address"     = module.msp_rds.db_address
    "msp-rds/db-port"        = tostring(module.msp_rds.db_port)
    "msp-rds/db-name"        = module.msp_rds.db_name
    "msp-rds/db-username"    = var.msp_db_username
    "msp-rds/db-secret-arn"  = module.msp_rds.db_secret_arn
    "msp-rds/db-secret-name" = module.msp_rds.db_secret_name

    # DynamoDB
    "dynamodb/alert-conversations-table-arn"  = aws_dynamodb_table.alert_conversations.arn
    "dynamodb/alert-summaries-table-arn"      = aws_dynamodb_table.alert_summaries.arn
    "dynamodb/alert-conversations-table-name" = aws_dynamodb_table.alert_conversations.name
    "dynamodb/alert-summaries-table-name"     = aws_dynamodb_table.alert_summaries.name
    "dynamodb/msp-conversations-table-arn"    = aws_dynamodb_table.msp_conversations.arn
    "dynamodb/msp-conversations-table-name"   = aws_dynamodb_table.msp_conversations.name

    # Networking
    "networking/vpc-id" = local.vpc_id

    # ALB
    "alb/target-group-arn" = module.alb.target_group_arn
    "alb/dns-name"         = module.alb.alb_dns_name

    # CloudFront
    "cloudfront/domain"          = module.cloudfront.distribution_domain_name
    "cloudfront/distribution-id" = module.cloudfront.distribution_id

    # Security Groups
    "security-groups/lambda-sg-id"     = local.lambda_security_group_id
    "security-groups/agentcore-sg-id"  = local.agentcore_security_group_id
    "security-groups/webapp-ec2-sg-id" = local.webapp_ec2_security_group_id
  }

  secure_string_keys = ["cognito/user-pool-client-secret"]
  secure_string_values = {
    "cognito/user-pool-client-secret" = module.cognito.user_pool_client_secret
  }

  string_list_parameters = {
    "networking/private-subnet-ids" = local.private_subnet_ids
  }
}
