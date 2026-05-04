# S3 Bucket for Data Storage
# Use-case agnostic - sample data is loaded dynamically from data/samples/

resource "aws_s3_bucket" "data" {
  # Use shorter naming to stay within S3's 63 character limit
  # Format: ava-{use_case_id}-{framework_short}-data-{suffix}-{random}
  # Note: S3 bucket names can only contain lowercase alphanumeric characters and hyphens
  bucket = "ava-${local.use_case_id_s3}-${local.framework_short_s3}-data-${var.deployment_suffix}-${random_id.bucket_suffix.hex}"

  tags = {
    Name              = "${local.resource_prefix}-data"
    Region            = local.aws_region
    DeploymentPattern = var.deployment_suffix
    UseCase           = var.use_case_id
    Framework         = var.framework
    FrameworkShort    = local.framework_short
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Dynamic sample data upload
# Scans data/samples/ directory and uploads all sample files (JSON + binary
# documents like PDFs, images, text that the data-builder generates to match
# document_keys declared in profile.json files).
locals {
  # Use explicit data_path if provided, otherwise derive from module path
  # In CI/CD (CodeBuild), path.module resolves through symlinks and ../../ may not reach the workspace root
  data_base_path = var.data_path != "" ? var.data_path : "${path.module}/../../data/samples"

  # File extensions we actually want to upload as sample data. Keeps out
  # stray dotfiles, caches, and editor cruft that might land in the
  # workspace during code generation.
  sample_data_patterns = [
    "**/*.json",
    "**/*.pdf",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.png",
    "**/*.tiff",
    "**/*.txt",
    "**/*.csv",
    "**/*.docx",
  ]

  sample_data_files = toset(flatten([
    for pattern in local.sample_data_patterns :
    tolist(fileset(local.data_base_path, pattern))
  ]))

  # Create a map of S3 key -> local file path
  sample_data_map = {
    for file in local.sample_data_files :
    file => "${local.data_base_path}/${file}"
  }

  # MIME type by extension (S3 serves these back to the agent on GetObject).
  content_type_by_ext = {
    "json" = "application/json"
    "pdf"  = "application/pdf"
    "jpg"  = "image/jpeg"
    "jpeg" = "image/jpeg"
    "png"  = "image/png"
    "tiff" = "image/tiff"
    "txt"  = "text/plain"
    "csv"  = "text/csv"
    "docx" = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
}

resource "aws_s3_object" "sample_data" {
  for_each = local.sample_data_map

  bucket = aws_s3_bucket.data.id
  key    = "samples/${each.key}"
  source = each.value
  content_type = lookup(
    local.content_type_by_ext,
    lower(reverse(split(".", each.key))[0]),
    "application/octet-stream",
  )
  etag = filemd5(each.value)

  tags = {
    DataType = "sample"
  }

  # Serialize bucket configuration before uploading objects.
  # aws provider 5.x can race its own post-PUT Head refresh against a
  # just-applied bucket policy / PAB, surfacing as
  # "reading S3 Object (...): couldn't find resource" on a brand-new bucket.
  depends_on = [
    aws_s3_bucket_public_access_block.data,
    aws_s3_bucket_versioning.data,
    aws_s3_bucket_server_side_encryption_configuration.data,
    aws_s3_bucket_policy.data_tls_enforcement,
  ]
}


# =============================================================================
# S3 Security Enhancements
# =============================================================================

# Bucket policy to enforce TLS/HTTPS for all requests
# This denies any request that doesn't use secure transport
resource "aws_s3_bucket_policy" "data_tls_enforcement" {
  bucket = aws_s3_bucket.data.id

  # Ensure public access block is applied before bucket policy
  depends_on = [aws_s3_bucket_public_access_block.data]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceTLSRequestsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.data.arn,
          "${aws_s3_bucket.data.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}


# =============================================================================
# S3 Access Logging Configuration
# =============================================================================

# Dedicated bucket for access logs
resource "aws_s3_bucket" "access_logs" {
  # Use shorter naming to stay within S3's 63 character limit
  # Format: ava-{use_case_id}-{framework_short}-logs-{suffix}-{random}
  # Note: S3 bucket names can only contain lowercase alphanumeric characters and hyphens
  bucket = "ava-${local.use_case_id_s3}-${local.framework_short_s3}-logs-${var.deployment_suffix}-${random_id.bucket_suffix.hex}"

  tags = {
    Name              = "${local.resource_prefix}-access-logs"
    Region            = local.aws_region
    DeploymentPattern = var.deployment_suffix
    UseCase           = var.use_case_id
    Framework         = var.framework
    FrameworkShort    = local.framework_short
    Purpose           = "S3 Access Logging"
  }
}

# Block public access for logging bucket
resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning for logging bucket (audit trail protection)
resource "aws_s3_bucket_versioning" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for logging bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# TLS enforcement for logging bucket
resource "aws_s3_bucket_policy" "access_logs_tls_enforcement" {
  bucket = aws_s3_bucket.access_logs.id

  depends_on = [aws_s3_bucket_public_access_block.access_logs]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceTLSRequestsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.access_logs.arn,
          "${aws_s3_bucket.access_logs.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "AllowS3LogDelivery"
        Effect = "Allow"
        Principal = {
          Service = "logging.s3.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.access_logs.arn}/*"
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.data.arn
          }
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# Enable access logging for the data bucket
resource "aws_s3_bucket_logging" "data" {
  bucket = aws_s3_bucket.data.id

  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "data-bucket-logs/"

  depends_on = [
    aws_s3_bucket_versioning.access_logs,
    aws_s3_bucket_policy.access_logs_tls_enforcement,
  ]
}