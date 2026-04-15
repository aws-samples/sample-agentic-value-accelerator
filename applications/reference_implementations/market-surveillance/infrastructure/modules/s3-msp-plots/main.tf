# S3 Bucket for Risk Analyst Agent Plot Images
resource "aws_s3_bucket" "msp_plots" {
  #checkov:skip=CKV2_AWS_62:Bucket stores generated plot images; event notifications not required
  #checkov:skip=CKV_AWS_18:Access Logging not required
  #checkov:skip=CKV_AWS_144:Cross-Region replication not required
  bucket = "market-surveillance-msp-plots-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "market-surveillance-msp-plots-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
    Purpose     = "risk-plot-images"
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "msp_plots" {
  bucket = aws_s3_bucket.msp_plots.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning
resource "aws_s3_bucket_versioning" "msp_plots" {
  bucket = aws_s3_bucket.msp_plots.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "msp_plots" {
  bucket = aws_s3_bucket.msp_plots.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

# Lifecycle policy
resource "aws_s3_bucket_lifecycle_configuration" "msp_plots" {
  bucket = aws_s3_bucket.msp_plots.id

  rule {
    id     = "expire-old-plots"
    status = "Enabled"

    expiration {
      days = var.object_expiration_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
