###############################################################################
# S3 Bucket — Document Source
###############################################################################

resource "aws_s3_bucket" "documents" {
  bucket = "${local.prefix}-kb-documents"
  tags   = local.default_tags
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
