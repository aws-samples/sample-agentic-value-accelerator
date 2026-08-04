# -----------------------------------------------------------------------------
# Glue Job — Seed Iceberg Data Lake
# -----------------------------------------------------------------------------

# S3 bucket for Glue scripts
resource "aws_s3_bucket" "glue_scripts" {
  bucket        = "${var.name_prefix}-glue-scripts-${local.account_id}-${local.region}"
  force_destroy = true
}

# Upload seed script to S3
resource "aws_s3_object" "seed_script" {
  bucket = aws_s3_bucket.glue_scripts.id
  key    = "scripts/seed-datalake.py"
  source = "${path.module}/../../scripts/seed-datalake.py"
  etag   = filemd5("${path.module}/../../scripts/seed-datalake.py")
}

# Glue Job
resource "aws_glue_job" "seed" {
  name     = "${var.name_prefix}-seed-datalake"
  role_arn = aws_iam_role.glue_job.arn

  command {
    name            = "glueetl"
    script_location = "s3://${aws_s3_bucket.glue_scripts.id}/${aws_s3_object.seed_script.key}"
    python_version  = "3"
  }

  default_arguments = {
    "--job-language"            = "python"
    "--datalake_bucket"         = aws_s3_bucket.datalake.id
    "--datalake-formats"        = "iceberg"
    "--enable-glue-datacatalog" = ""
    "--conf"                    = "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=s3://${aws_s3_bucket.datalake.id}/ --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO --conf spark.sql.catalog.glue_catalog.glue.lakeformation-enabled=true --conf spark.sql.catalog.glue_catalog.glue.account-id=${local.account_id} --conf spark.sql.catalog.glue_catalog.client.region=${local.region} --conf spark.sql.defaultCatalog=glue_catalog"
    "--TempDir"                 = "s3://${aws_s3_bucket.glue_scripts.id}/tmp/"
    "--job-bookmark-option"     = "job-bookmark-disable"
  }

  glue_version      = "5.0"
  number_of_workers = 2
  worker_type       = "G.1X"
  timeout           = 10

  depends_on = [aws_s3_object.seed_script]
}
