# -----------------------------------------------------------------------------
# S3 — Data Lake Storage + Athena Results
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "datalake" {
  bucket        = local.bucket
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "datalake" {
  bucket = aws_s3_bucket.datalake.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "datalake" {
  bucket = aws_s3_bucket.datalake.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket" "athena_results" {
  bucket        = "${var.name_prefix}-athena-results-${local.account_id}-${local.region}"
  force_destroy = true
}

# -----------------------------------------------------------------------------
# Athena Workgroup
# -----------------------------------------------------------------------------

resource "aws_athena_workgroup" "demo" {
  name          = "${var.name_prefix}-workgroup"
  force_destroy = true

  configuration {
    result_configuration {
      output_location = "s3://${aws_s3_bucket.athena_results.id}/results/"
    }
    bytes_scanned_cutoff_per_query = 1073741824
  }
}
