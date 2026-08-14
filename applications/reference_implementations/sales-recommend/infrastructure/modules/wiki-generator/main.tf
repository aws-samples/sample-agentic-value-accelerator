###############################################################################
# Wiki Generator Module
#
# On-demand CodeBuild job that turns a repo URL into a single capability
# profile in the Knowledge Base S3 bucket, then triggers KB ingestion.
#
#   Trigger:  aws codebuild start-build --project-name <name> \
#               --environment-variables-override name=REPO_URL,value=<url>
#
# The agent code (wiki-agent/) is packaged to a small source bucket as a zip;
# CodeBuild pulls + extracts it and runs buildspec.yml. No ECR image, no
# long-running compute — adding a repo is just another build.
###############################################################################

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.17.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }
}

# --------------------------------------------------------------------------
# Source bucket — holds the zipped wiki-agent code CodeBuild runs
# --------------------------------------------------------------------------
resource "random_id" "src_suffix" {
  byte_length = 6
}

resource "aws_s3_bucket" "source" {
  bucket        = "${var.project}-wiki-src-${random_id.src_suffix.hex}"
  force_destroy = true

  tags = {
    Name    = "${var.project}-wiki-src"
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "source" {
  bucket                  = aws_s3_bucket.source.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "source" {
  bucket = aws_s3_bucket.source.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# --------------------------------------------------------------------------
# CloudWatch log group
# --------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/codebuild/${var.project}-wiki-generator"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "${var.project}-wiki-generator"
    Project = var.project
  }
}

# --------------------------------------------------------------------------
# IAM role for CodeBuild
# --------------------------------------------------------------------------
data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = "${var.project}-wiki-generator-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = {
    Name    = "${var.project}-wiki-generator-role"
    Project = var.project
  }
}

data "aws_iam_policy_document" "permissions" {
  # CloudWatch Logs
  statement {
    sid     = "Logs"
    effect  = "Allow"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      aws_cloudwatch_log_group.this.arn,
      "${aws_cloudwatch_log_group.this.arn}:*"
    ]
  }

  # Read the packaged agent code from the source bucket
  statement {
    sid       = "ReadSource"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket"]
    resources = [aws_s3_bucket.source.arn, "${aws_s3_bucket.source.arn}/*"]
  }

  # Write generated profiles + metadata sidecars into the KB data bucket.
  # Delete/List let a re-run clear stale objects for a repo prefix.
  statement {
    sid    = "WriteKbData"
    effect = "Allow"
    actions = [
      "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"
    ]
    resources = [var.kb_data_bucket_arn, "${var.kb_data_bucket_arn}/*"]
  }

  # Invoke the synthesis model (mirrors the AgentCore role's global-CRIS grants)
  statement {
    sid       = "InvokeModelInferenceProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:${var.aws_region}:${var.account_id}:inference-profile/global.*"]
  }
  statement {
    sid     = "InvokeModelFoundation"
    effect  = "Allow"
    actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-*",
      "arn:aws:bedrock:::foundation-model/anthropic.claude-*"
    ]
  }

  # Trigger KB ingestion after writing the profile
  statement {
    sid       = "StartIngestion"
    effect    = "Allow"
    actions   = ["bedrock:StartIngestionJob", "bedrock:GetIngestionJob"]
    resources = [var.knowledge_base_arn]
  }
}

resource "aws_iam_role_policy" "this" {
  name   = "${var.project}-wiki-generator-permissions"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.permissions.json
}

# --------------------------------------------------------------------------
# CodeBuild project
# --------------------------------------------------------------------------
resource "aws_codebuild_project" "this" {
  name           = "${var.project}-wiki-generator"
  description    = "Generates a RAG capability profile from a repo URL and ingests it into the KB"
  service_role   = aws_iam_role.this.arn
  build_timeout  = var.build_timeout_minutes
  queued_timeout = 30

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.source.bucket}/${var.source_object_key}"
    buildspec = "buildspec.yml"
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type = "BUILD_GENERAL1_SMALL"
    image        = "aws/codebuild/standard:7.0"
    type         = "LINUX_CONTAINER"

    environment_variable {
      name  = "KB_DATA_BUCKET"
      value = var.kb_data_bucket
    }
    environment_variable {
      name  = "KNOWLEDGE_BASE_ID"
      value = var.knowledge_base_id
    }
    environment_variable {
      name  = "DATA_SOURCE_ID"
      value = var.data_source_id
    }
    environment_variable {
      name  = "BEDROCK_MODEL_ID"
      value = var.model_id
    }
    environment_variable {
      name  = "S3_PREFIX"
      value = var.s3_prefix
    }
    # Default REPO_URL is a placeholder; callers override it at start-build.
    environment_variable {
      name  = "REPO_URL"
      value = ""
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.this.name
    }
  }

  tags = {
    Name    = "${var.project}-wiki-generator"
    Project = var.project
  }
}

# --------------------------------------------------------------------------
# Dispatch Lambda — fans out one CodeBuild build per repo URL when a file
# lands under the config/ prefix of the source bucket.
# --------------------------------------------------------------------------
data "archive_file" "dispatch" {
  type        = "zip"
  source_file = "${path.module}/lambda/dispatch.py"
  output_path = "${path.module}/.build/dispatch.zip"
}

data "aws_iam_policy_document" "dispatch_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dispatch" {
  name               = "${var.project}-wiki-dispatch-role"
  assume_role_policy = data.aws_iam_policy_document.dispatch_assume_role.json

  tags = {
    Name    = "${var.project}-wiki-dispatch-role"
    Project = var.project
  }
}

data "aws_iam_policy_document" "dispatch_permissions" {
  # Read the uploaded repo-list file(s) under config/
  statement {
    sid       = "ReadConfig"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.source.arn}/${var.config_prefix}/*"]
  }

  # Start one build per URL
  statement {
    sid       = "StartBuilds"
    effect    = "Allow"
    actions   = ["codebuild:StartBuild"]
    resources = [aws_codebuild_project.this.arn]
  }

  # Own log group
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${var.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "dispatch" {
  name   = "${var.project}-wiki-dispatch-permissions"
  role   = aws_iam_role.dispatch.id
  policy = data.aws_iam_policy_document.dispatch_permissions.json
}

resource "aws_cloudwatch_log_group" "dispatch" {
  name              = "/aws/lambda/${var.project}-wiki-dispatch"
  retention_in_days = var.log_retention_days

  tags = {
    Name    = "${var.project}-wiki-dispatch"
    Project = var.project
  }
}

resource "aws_lambda_function" "dispatch" {
  function_name    = "${var.project}-wiki-dispatch"
  role             = aws_iam_role.dispatch.arn
  handler          = "dispatch.handler"
  runtime          = "python3.12"
  timeout          = 60
  filename         = data.archive_file.dispatch.output_path
  source_code_hash = data.archive_file.dispatch.output_base64sha256

  environment {
    variables = {
      CODEBUILD_PROJECT = aws_codebuild_project.this.name
      REPOS_BUCKET      = aws_s3_bucket.source.id
      REPOS_KEY         = "${var.config_prefix}/${var.repos_file_name}"
    }
  }

  depends_on = [
    aws_iam_role_policy.dispatch,
    aws_cloudwatch_log_group.dispatch,
  ]

  tags = {
    Name    = "${var.project}-wiki-dispatch"
    Project = var.project
  }
}

# Allow S3 to invoke the Lambda
resource "aws_lambda_permission" "allow_s3" {
  statement_id   = "AllowInvokeFromS3"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.dispatch.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.source.arn
  source_account = var.account_id
}

# Fire the Lambda when an ad-hoc repo-list file lands under the manual/ prefix.
# The managed list (config/repos.txt) is handled by the scheduler instead, so
# a deploy never double-triggers.
resource "aws_s3_bucket_notification" "config_upload" {
  bucket = aws_s3_bucket.source.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.dispatch.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "${var.manual_prefix}/"
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

# --------------------------------------------------------------------------
# TF-managed uploads — so a single `terraform apply` (the AVA deploy) does
# EVERYTHING with no manual steps and no user interaction.
#
# Ordering (enforced by depends_on) eliminates the race:
#   1. wiki-agent code zip is uploaded (CodeBuild source must exist first)
#   2. repos.txt is uploaded LAST -> S3 event -> dispatch Lambda -> one build
#      per URL. By then the Lambda, notification, CodeBuild project, KB, and
#      data source all exist (the CodeBuild project references the KB ids, so
#      depending on it transitively waits for the Knowledge Base).
# --------------------------------------------------------------------------
data "archive_file" "code" {
  type        = "zip"
  source_dir  = var.wiki_agent_source_dir
  output_path = "${path.module}/.build/wiki-agent.zip"
  excludes    = ["__pycache__", "*.pyc"]
}

resource "aws_s3_object" "code" {
  bucket = aws_s3_bucket.source.id
  key    = var.source_object_key
  source = data.archive_file.code.output_path
  etag   = data.archive_file.code.output_md5
}

resource "aws_s3_object" "repos" {
  bucket = aws_s3_bucket.source.id
  key    = "${var.config_prefix}/${var.repos_file_name}"
  source = var.repos_file_path
  etag   = filemd5(var.repos_file_path)

  # Upload the managed list after the code zip + consumers exist. Processing is
  # NOT triggered by this upload (the notification watches manual/ only) — the
  # EventBridge Scheduler below fires the dispatch Lambda after a cloud-side
  # delay, so nothing blocks the deploy and there's no notification race.
  depends_on = [
    aws_s3_object.code,
    aws_codebuild_project.this,
  ]
}

# --------------------------------------------------------------------------
# Cloud-side delayed trigger — EventBridge Scheduler fires the dispatch Lambda
# `trigger_delay_minutes` after the repo list CHANGES. The delay is held by
# EventBridge on the cloud; Terraform just creates the schedule and returns.
#
# time_static freezes a timestamp that only advances when the repo-list content
# hash changes, so:
#   - unrelated deploys do NOT reschedule (no needless catalog rebuilds, no
#     perpetual plan diff),
#   - a deploy that changes repos.txt reschedules to (change time + delay).
# --------------------------------------------------------------------------
resource "time_static" "repos_version" {
  triggers = {
    repos_hash = filemd5(var.repos_file_path)
  }
}

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.project}-wiki-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json

  tags = {
    Name    = "${var.project}-wiki-scheduler-role"
    Project = var.project
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name = "${var.project}-wiki-scheduler-invoke"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "InvokeDispatch"
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = [aws_lambda_function.dispatch.arn, "${aws_lambda_function.dispatch.arn}:*"]
    }]
  })
}

resource "aws_scheduler_schedule" "initial_trigger" {
  name = "${var.project}-wiki-initial-trigger"

  flexible_time_window {
    mode = "OFF"
  }

  # One-time schedule at (repo-list change time + delay), in UTC.
  schedule_expression          = "at(${formatdate("YYYY-MM-DD'T'hh:mm:ss", timeadd(time_static.repos_version.rfc3339, "${var.trigger_delay_minutes}m"))})"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.dispatch.arn
    role_arn = aws_iam_role.scheduler.arn
  }

  depends_on = [
    aws_s3_object.repos,
    aws_iam_role_policy.scheduler,
  ]
}
