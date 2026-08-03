# -----------------------------------------------------------------------------
# Data stores — DynamoDB tables + S3 buckets.
#
# These back the agent data-access tools in src/strands/tools.py:
#   get_transactions     -> txn table   (query by account_id)
#   get_case             -> cases table (get by case_id)
#   get_account_profile  -> data bucket (key ${DATA_PREFIX}/<account_id>/profile.json)
# SARs produced by the SAR agent are persisted to the sars table.
# -----------------------------------------------------------------------------

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# --- Transactions: partition by account_id, sort by transaction_id ---
# tools.get_transactions queries KeyConditionExpression account_id = :id, newest first.
resource "aws_dynamodb_table" "transactions" {
  name         = "${local.name_prefix}-transactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "account_id"
  range_key    = "transaction_id"

  attribute {
    name = "account_id"
    type = "S"
  }
  attribute {
    name = "transaction_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.data.arn
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-transactions" })
}

# --- Cases: keyed by case_id ---
resource "aws_dynamodb_table" "cases" {
  name         = "${local.name_prefix}-cases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "case_id"

  attribute {
    name = "case_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.data.arn
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-cases" })
}

# --- SARs: keyed by sar_id ---
resource "aws_dynamodb_table" "sars" {
  name         = "${local.name_prefix}-sars"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sar_id"

  attribute {
    name = "sar_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.data.arn
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-sars" })
}

# --- Data bucket: account profiles + bundled sample data ---
# The skipped checkov rules below are intentional: this bucket holds only
# synthetic, fully fabricated demo data (see data/README.md). There is no real or
# sensitive data, so enterprise resilience/audit controls are disproportionate for
# a reference implementation. (checkov reads checkov:skip comments inside the block.)
resource "aws_s3_bucket" "data" {
  #checkov:skip=CKV_AWS_144:Cross-region replication is unnecessary for synthetic demo data.
  #checkov:skip=CKV_AWS_18:Access logging would require a second log bucket; not warranted for demo data.
  #checkov:skip=CKV2_AWS_62:S3 event notifications are not part of this app's data flow.
  bucket = "${local.name_prefix}-data-${data.aws_caller_identity.current.account_id}"
  tags   = merge(var.tags, { Name = "${local.name_prefix}-data" })
}

# Expire noncurrent versions so the bucket doesn't accumulate object versions
# indefinitely (CKV2_AWS_61 — lifecycle configuration present).
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_caller_identity" "current" {}
