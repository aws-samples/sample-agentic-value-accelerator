# ──────────────────────────────────────────────
# Per-key outputs (individual access)
# ──────────────────────────────────────────────

# RDS
output "rds_key_arn" {
  description = "ARN of the KMS key for RDS encryption"
  value       = aws_kms_key.this["rds"].arn
}

output "rds_key_id" {
  description = "ID of the KMS key for RDS encryption"
  value       = aws_kms_key.this["rds"].key_id
}

# S3
output "s3_key_arn" {
  description = "ARN of the KMS key for S3 encryption"
  value       = aws_kms_key.this["s3"].arn
}

output "s3_key_id" {
  description = "ID of the KMS key for S3 encryption"
  value       = aws_kms_key.this["s3"].key_id
}

# DynamoDB
output "dynamodb_key_arn" {
  description = "ARN of the KMS key for DynamoDB encryption"
  value       = aws_kms_key.this["dynamodb"].arn
}

output "dynamodb_key_id" {
  description = "ID of the KMS key for DynamoDB encryption"
  value       = aws_kms_key.this["dynamodb"].key_id
}

# Secrets Manager
output "secrets_key_arn" {
  description = "ARN of the KMS key for Secrets Manager encryption"
  value       = aws_kms_key.this["secrets"].arn
}

output "secrets_key_id" {
  description = "ID of the KMS key for Secrets Manager encryption"
  value       = aws_kms_key.this["secrets"].key_id
}

# Lambda
output "lambda_key_arn" {
  description = "ARN of the KMS key for Lambda encryption"
  value       = aws_kms_key.this["lambda"].arn
}

output "lambda_key_id" {
  description = "ID of the KMS key for Lambda encryption"
  value       = aws_kms_key.this["lambda"].key_id
}

# EBS
output "ebs_key_arn" {
  description = "ARN of the KMS key for EBS encryption"
  value       = aws_kms_key.this["ebs"].arn
}

output "ebs_key_id" {
  description = "ID of the KMS key for EBS encryption"
  value       = aws_kms_key.this["ebs"].key_id
}

# CloudWatch Logs
output "logs_key_arn" {
  description = "ARN of the KMS key for CloudWatch Logs encryption"
  value       = aws_kms_key.this["logs"].arn
}

output "logs_key_id" {
  description = "ID of the KMS key for CloudWatch Logs encryption"
  value       = aws_kms_key.this["logs"].key_id
}

# ECR
output "ecr_key_arn" {
  description = "ARN of the KMS key for ECR encryption"
  value       = aws_kms_key.this["ecr"].arn
}

output "ecr_key_id" {
  description = "ID of the KMS key for ECR encryption"
  value       = aws_kms_key.this["ecr"].key_id
}

# ──────────────────────────────────────────────
# Map outputs (bulk access)
# ──────────────────────────────────────────────

output "key_arns" {
  description = "Map of all KMS key ARNs keyed by service name"
  value       = { for k, v in aws_kms_key.this : k => v.arn }
}

output "key_ids" {
  description = "Map of all KMS key IDs keyed by service name"
  value       = { for k, v in aws_kms_key.this : k => v.key_id }
}

output "key_aliases" {
  description = "Map of all KMS key alias names keyed by service name"
  value       = { for k, v in aws_kms_alias.this : k => v.name }
}
