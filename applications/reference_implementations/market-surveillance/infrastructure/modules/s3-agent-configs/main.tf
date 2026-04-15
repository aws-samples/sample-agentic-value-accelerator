# S3 Bucket for Agent Configurations
resource "aws_s3_bucket" "agent_configs" {
  #checkov:skip=CKV2_AWS_62:Bucket stores static agent config files uploaded via Terraform; event notifications not required
  #checkov:skip=CKV_AWS_18:Access Logging not required
  #checkov:skip=CKV_AWS_144:Cross-Region replication not required
  bucket = "market-surveillance-agent-configs-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "market-surveillance-agent-configs-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
    Purpose     = "agent-configurations"
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "agent_configs" {
  bucket = aws_s3_bucket.agent_configs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning
resource "aws_s3_bucket_versioning" "agent_configs" {
  bucket = aws_s3_bucket.agent_configs.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "agent_configs" {
  bucket = aws_s3_bucket.agent_configs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

# Lifecycle policy
resource "aws_s3_bucket_lifecycle_configuration" "agent_configs" {
  bucket = aws_s3_bucket.agent_configs.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    abort_incomplete_multipart_upload {
     days_after_initiation = 7
   }
  }
}

# Upload schema config file
resource "aws_s3_object" "schema_config" {
  bucket       = aws_s3_bucket.agent_configs.id
  key          = "configs/data-shape/schema_config.yaml"
  source       = "${path.module}/../../../agent-backend/configs/schema_config.yaml"
  etag         = filemd5("${path.module}/../../../agent-backend/configs/schema_config.yaml")
  content_type = "application/x-yaml"

  tags = {
    Name        = "schema-config"
    Environment = var.environment
    Project     = "market-surveillance"
    ConfigType  = "data-shape"
  }
}

# Upload orchestrator config file
resource "aws_s3_object" "orchestrator_config" {
  bucket       = aws_s3_bucket.agent_configs.id
  key          = "configs/orchestrator/orchestrator_config.yaml"
  source       = "${path.module}/../../../agent-backend/configs/orchestrator_config.yaml"
  etag         = filemd5("${path.module}/../../../agent-backend/configs/orchestrator_config.yaml")
  content_type = "application/x-yaml"

  tags = {
    Name        = "orchestrator-config"
    Environment = var.environment
    Project     = "market-surveillance"
    ConfigType  = "orchestrator"
  }
}

# Upload rule definition config file
resource "aws_s3_object" "rule_definition_config" {
  bucket       = aws_s3_bucket.agent_configs.id
  key          = "configs/rules/rule_definition_config.yml"
  source       = "${path.module}/../../../agent-backend/configs/rule_definition_config.yml"
  etag         = filemd5("${path.module}/../../../agent-backend/configs/rule_definition_config.yml")
  content_type = "application/x-yaml"

  tags = {
    Name        = "rule-definition-config"
    Environment = var.environment
    Project     = "market-surveillance"
    ConfigType  = "rule-definition"
  }
}

# Upload analyst metrics config file
resource "aws_s3_object" "analyst_metrics_config" {
  bucket       = aws_s3_bucket.agent_configs.id
  key          = "configs/metrics/analyst_metrics.yaml"
  source       = "${path.module}/../../../agent-backend/configs/analyst_metrics.yaml"
  etag         = filemd5("${path.module}/../../../agent-backend/configs/analyst_metrics.yaml")
  content_type = "application/x-yaml"

  tags = {
    Name        = "analyst-metrics-config"
    Environment = var.environment
    Project     = "market-surveillance"
    ConfigType  = "metrics"
  }
}

# Upload output schema config file
resource "aws_s3_object" "output_schema_config" {
  bucket       = aws_s3_bucket.agent_configs.id
  key          = "configs/output_schema_config.yaml"
  source       = "${path.module}/../../../agent-backend/configs/output_schema_config.yaml"
  etag         = filemd5("${path.module}/../../../agent-backend/configs/output_schema_config.yaml")
  content_type = "application/x-yaml"

  tags = {
    Name        = "output-schema-config"
    Environment = var.environment
    Project     = "market-surveillance"
    ConfigType  = "output-schema"
  }
}

# vocabulary_v1.jsonld and synonyms_v1.jsonld removed — no longer used by agents

# Upload Risk Analyst schema config file
resource "aws_s3_object" "msp_schema_config" {
  bucket       = aws_s3_bucket.agent_configs.id
  key          = "configs/msp/schema_config.yaml"
  source       = "${path.module}/../../../risk-agent-backend/configs/schema_config.yaml"
  etag         = filemd5("${path.module}/../../../risk-agent-backend/configs/schema_config.yaml")
  content_type = "application/x-yaml"

  tags = {
    Name        = "risk-schema-config"
    Environment = var.environment
    Project     = "market-surveillance"
    ConfigType  = "risk-schema"
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
