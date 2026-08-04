# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "datalake_bucket" {
  description = "S3 bucket for data lake storage"
  value       = aws_s3_bucket.datalake.id
}

output "athena_workgroup" {
  description = "Athena workgroup name"
  value       = aws_athena_workgroup.demo.name
}

output "databases" {
  description = "Glue database names"
  value       = [aws_glue_catalog_database.trading.name, aws_glue_catalog_database.risk.name]
}

output "reader_role_arn" {
  description = "IAM role ARN for reading the data lake (use with MCP server)"
  value       = aws_iam_role.datalake_reader.arn
}

output "glue_job_name" {
  description = "Glue job name — run to seed sample data"
  value       = aws_glue_job.seed.name
}
