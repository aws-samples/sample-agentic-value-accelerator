# ============================================================================
# Advanced Prompt Optimization Bucket
# ============================================================================
# Stores prompt evaluation datasets and optimization results.

resource "aws_s3_bucket" "prompt_optimization" {
  bucket = "${var.name_prefix}-prompt-optimization"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-prompt-optimization"
  })
}

resource "aws_s3_bucket_versioning" "prompt_optimization" {
  bucket = aws_s3_bucket.prompt_optimization.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "prompt_optimization" {
  bucket = aws_s3_bucket.prompt_optimization.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "prompt_optimization" {
  bucket = aws_s3_bucket.prompt_optimization.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
