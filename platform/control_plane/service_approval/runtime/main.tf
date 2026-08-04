terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  prefix = "ava-cp-dev-${substr(data.aws_caller_identity.current.account_id, length(data.aws_caller_identity.current.account_id) - 6, 6)}"
  # AgentCore enforces [a-zA-Z][a-zA-Z0-9_]{0,47} on agentRuntimeName —
  # underscore-form only used here. All other resources keep hyphens.
  agent_name = "ava_cp_dev_${substr(data.aws_caller_identity.current.account_id, length(data.aws_caller_identity.current.account_id) - 6, 6)}_sa"

  # DDB + S3 owned by modules/service_approval (root infra). The agent
  # writes there directly so the backend's existing list/get/file-browser
  # routes work unchanged.
  prod_ddb_table = "${local.prefix}-service-approval"
  prod_s3_bucket = "${local.prefix}-service-approval-artifacts"
}

# ECR — agent image. Built from platform/control_plane/service_approval/ build
# context (Dockerfile + agent/ + plugin/) and pushed by deploy.sh.
resource "aws_ecr_repository" "agent" {
  name                 = "${local.prefix}-sa-agent"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# IAM role assumed by the AgentCore runtime microVM. Grants DDB write
# to the runs table, S3 put to the artifacts bucket, Bedrock invoke for
# the plugin's claude-code calls, and broad ReadOnlyAccess for the
# plugin's MCP servers (aws-documentation, awsiac, iam, awsknowledge).
resource "aws_iam_role" "agentcore" {
  name = "${local.prefix}-sa-agentcore"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "bedrock-agentcore.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}

# M3b — the v1 plugin's MCP servers (aws-documentation, awsiac, iam,
# awsknowledge) issue read-only describe/list/get calls against AWS to
# verify capability claims. ReadOnlyAccess is the simplest correct grant
# — same approach the v1 runner uses (see modules/service_approval/main.tf
# `task_readonly` attachment). Tighten with an SCP later if needed.
resource "aws_iam_role_policy_attachment" "agentcore_readonly" {
  role       = aws_iam_role.agentcore.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "agentcore" {
  name = "v2-runtime-policy"
  role = aws_iam_role.agentcore.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RunsTable"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
        ]
        Resource = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${local.prod_ddb_table}"
      },
      {
        Sid    = "Artifacts"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ]
        Resource = [
          "arn:aws:s3:::${local.prod_s3_bucket}",
          "arn:aws:s3:::${local.prod_s3_bucket}/*",
        ]
      },
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams",
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"
      },
      {
        Sid    = "ECR"
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Sid    = "Bedrock"
        Effect = "Allow"
        # Future Milestone 2+ agents call Bedrock directly via Strands.
        # Granted here so we don't need a second apply later.
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream",
        ]
        Resource = "*"
      },
      {
        Sid    = "XRay"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = data.aws_region.current.name
          }
        }
      },
    ]
  })
}

# AgentCore Runtime — wrapped in CFN because the AWS Terraform provider
# doesn't yet expose a native `aws_bedrockagentcore_runtime` resource.
resource "aws_cloudformation_stack" "runtime" {
  name          = "${local.prefix}-sa-runtime"
  template_body = file("${path.module}/agentcore_runtime.yaml")

  parameters = {
    AgentName      = local.agent_name
    RoleArn        = aws_iam_role.agentcore.arn
    ContainerUri   = "${aws_ecr_repository.agent.repository_url}:${var.image_tag}"
    DdbTable       = local.prod_ddb_table
    S3Bucket       = local.prod_s3_bucket
    BedrockModelId = var.bedrock_model_id
  }

  capabilities = ["CAPABILITY_IAM"]

  # The runtime resource depends on a real image being in ECR — Terraform
  # has no native dependency, so we ask the operator to push first. If
  # apply fails with "image not found", run the build-and-push script
  # then re-apply.
  depends_on = [aws_ecr_repository.agent]
}
