# Service Approval — shared state resources.
#
# Phase B decommission (2026-06): the SFN state machine, dedicated ECS
# cluster, Fargate task definition, runner ECR repo, runner IAM roles, and
# runner security group all moved to Path B (AgentCore). Their definitions
# live at `platform/control_plane/service_approval/runtime/` now.
#
# THIS module retains ONLY the persistent state both paths share:
#   - DynamoDB table for run records (consumed by backend list/get/file UI)
#   - S3 bucket for per-phase artifacts (consumed by backend file browser)
#
# Both still have stable resource addresses so existing terraform state
# survives the decommission with no `terraform state mv` needed.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  table_name  = "${var.name_prefix}-service-approval"
  bucket_name = "${var.name_prefix}-service-approval-artifacts"
}

# ----------------------------------------------------------------------------
# DynamoDB — runs table (one item per pipeline run)
# ----------------------------------------------------------------------------

resource "aws_dynamodb_table" "runs" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, { Name = local.table_name })
}

# ----------------------------------------------------------------------------
# S3 — per-phase artifacts (slug/<phase>/...)
# ----------------------------------------------------------------------------

resource "aws_s3_bucket" "artifacts" {
  bucket        = local.bucket_name
  force_destroy = false
  tags          = merge(var.tags, { Name = local.bucket_name })
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
