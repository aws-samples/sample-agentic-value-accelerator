# S3 Bucket for Chat Chart Images
# Stores PNG charts emitted by the agent's execute_python tool so they can be
# rendered in conversation history after the live stream ends.
resource "aws_s3_bucket" "chat_charts" {
  #checkov:skip=CKV2_AWS_62:Bucket stores ephemeral chart PNGs; event notifications not required
  #checkov:skip=CKV_AWS_18:Access logging not required for reference implementation
  #checkov:skip=CKV_AWS_144:Cross-region replication not required
  bucket = "market-surveillance-chat-charts-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "market-surveillance-chat-charts-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
    Purpose     = "chat-chart-images"
  }
}

resource "aws_s3_bucket_public_access_block" "chat_charts" {
  bucket = aws_s3_bucket.chat_charts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "chat_charts" {
  bucket = aws_s3_bucket.chat_charts.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "chat_charts" {
  bucket = aws_s3_bucket.chat_charts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "chat_charts" {
  bucket = aws_s3_bucket.chat_charts.id

  rule {
    id     = "expire-chart-objects"
    status = "Enabled"

    filter {
      prefix = "charts/"
    }

    expiration {
      days = var.chart_expiration_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_caller_identity" "current" {}
