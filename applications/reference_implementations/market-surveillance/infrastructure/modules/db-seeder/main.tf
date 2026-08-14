###############################################################################
# db-seeder — In-VPC Lambda that populates Aurora on first deploy.
#
# Replaces the previous CodeBuild-via-bastion port-forward seeding path, which
# silently skipped seeding whenever the SSM tunnel didn't open (see the
# git-history commit message on Step 3 for the original failure mode).
#
# What this module builds:
#
#   1. A deployment zip containing:
#        - lambda/seed_handler.py (the thin orchestrator wrapper)
#        - lambda/site-packages/  (psycopg[binary], PyYAML, boto3 layer bits)
#        - seeding_scripts/       (the existing package + static CSVs)
#
#      The whole zip is built at `terraform apply` time via
#      `null_resource` (pip install into a build dir) + `archive_file`
#      (zip the build dir). No pre-build step required in deploy.sh.
#
#   2. A Lambda function attached to Aurora's private subnets + security
#      group, so it reaches the DB directly — no port-forward.
#
#   3. IAM role scoped down to just:
#        - AWSLambdaVPCAccessExecutionRole (ENI create/delete)
#        - AWSLambdaBasicExecutionRole (CloudWatch logs)
#        - secretsmanager:GetSecretValue on the specific DB secret ARN
#
# deploy.sh Step 3 becomes an `aws lambda invoke` + response parse; the
# CodeBuild step fails loudly if the Lambda returns an error.
###############################################################################

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
    null = { source = "hashicorp/null" }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── Build the Lambda deployment zip at apply time ──────────────────────────
# The build directory contains:
#   - seed_handler.py (from lambda/)
#   - seeding_scripts/ (rsynced from the user-supplied source dir)
#   - Python deps installed with `pip install -t <build_dir>`
#
# We regenerate on every apply if any input changes — cheap because pip is
# incremental and the seeding_scripts tree is only ~2 MB. Explicit triggers on
# the Python source hashes so `terraform apply` re-runs when we change code.

locals {
  build_dir = "${path.module}/.build"
  # Hash of every .py under lambda/ and the seeding_scripts tree, so the
  # null_resource re-runs when we touch code. Static data files (CSVs) don't
  # trigger a rebuild — the package remains the same shape.
  handler_hash = filesha256("${path.module}/lambda/seed_handler.py")
  reqs_hash    = filesha256("${path.module}/lambda/requirements.txt")
  # For seeding_scripts we use a directory hash approximation: hash of the
  # sorted file list. Data-file changes don't force a rebuild (the CSVs still
  # get copied fresh every time because rsync is destination-mode). This is a
  # rebuild-trigger, not a correctness guarantee — the rsync below is
  # authoritative.
  seeder_dir_hint = var.seeding_scripts_dir
}

resource "null_resource" "build" {
  triggers = {
    handler_hash    = local.handler_hash
    reqs_hash       = local.reqs_hash
    seeder_dir_hint = local.seeder_dir_hint
    # Force at least one rebuild per apply run for the source dir, since
    # Terraform can't hash a whole tree cheaply.
    always_rebuild = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail

      BUILD_DIR="${local.build_dir}"
      rm -rf "$BUILD_DIR"
      mkdir -p "$BUILD_DIR"

      # 1. Copy the Lambda entry point to the zip root.
      cp "${path.module}/lambda/seed_handler.py" "$BUILD_DIR/seed_handler.py"

      # 2. Copy the seeding_scripts package next to the handler so
      #    `from seeding_scripts.db_ops import db_init` resolves.
      cp -R "${var.seeding_scripts_dir}" "$BUILD_DIR/seeding_scripts"
      # Drop caches and pyc so the zip stays lean and stable.
      find "$BUILD_DIR/seeding_scripts" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
      find "$BUILD_DIR/seeding_scripts" -name '*.pyc' -delete 2>/dev/null || true
      # Drop the seeder's own requirements.txt to avoid confusion inside the
      # deployment package — we've already vendored the deps below.
      rm -f "$BUILD_DIR/seeding_scripts/requirements.txt"

      # 3. Install Python deps into the zip root. --platform pin ensures
      #    we grab manylinux wheels compatible with Lambda's Amazon Linux
      #    runtime. psycopg[binary] ships a pre-built .so for the target.
      python3 -m pip install \
        --quiet \
        --target "$BUILD_DIR" \
        --platform manylinux2014_x86_64 \
        --only-binary=:all: \
        --python-version 3.12 \
        -r "${path.module}/lambda/requirements.txt"

      # 4. Drop __pycache__ and *.dist-info to shrink the zip. dist-info
      #    is metadata not needed at runtime and can add 2-3 MB.
      find "$BUILD_DIR" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
      find "$BUILD_DIR" -type d -name '*.dist-info' -exec rm -rf {} + 2>/dev/null || true

      echo "Seeder Lambda build complete. Size:"
      du -sh "$BUILD_DIR"
    EOT
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = local.build_dir
  output_path = "${path.module}/.build/seeder-lambda.zip"
  depends_on  = [null_resource.build]
}

# ─── IAM role for the Lambda ────────────────────────────────────────────────

resource "aws_iam_role" "seeder" {
  name = "${var.name_prefix}-db-seeder"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

# CloudWatch logs (basic execution) + VPC access (ENI create/delete).
resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.seeder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "vpc" {
  role       = aws_iam_role.seeder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Read the DB credentials secret — scoped to the specific ARN.
resource "aws_iam_role_policy" "secrets" {
  name = "read-db-secret"
  role = aws_iam_role.seeder.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.db_secret_arn]
    }]
  })
}

# ─── Lambda ─────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "seeder" {
  name              = "/aws/lambda/${var.name_prefix}-db-seeder"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_lambda_function" "seeder" {
  function_name    = "${var.name_prefix}-db-seeder"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  handler          = "seed_handler.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.seeder.arn
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory_mb

  # Aurora sits in private subnets; attach the Lambda ENIs to the same
  # VPC so DNS resolution + routing to the DB endpoint works without a
  # bastion or NAT. The security group MUST be allowed in by Aurora's SG
  # on port 5432 (wired at the app-infra level, see module.db_seeder call).
  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      DB_SECRET_ARN = var.db_secret_arn
      DB_NAME       = var.db_name
    }
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy_attachment.basic,
    aws_iam_role_policy_attachment.vpc,
    aws_iam_role_policy.secrets,
    aws_cloudwatch_log_group.seeder,
  ]
}
