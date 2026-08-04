# -----------------------------------------------------------------------------
# S3 Bucket — Document storage for the Knowledge Base
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "kb_documents" {
  bucket        = "${var.name_prefix}-kb-docs-${var.account_id}-${var.region}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "kb_documents" {
  bucket = aws_s3_bucket.kb_documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "kb_documents" {
  bucket = aws_s3_bucket.kb_documents.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
