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
  prefix     = "ava-cp-dev-${substr(data.aws_caller_identity.current.account_id, length(data.aws_caller_identity.current.account_id) - 6, 6)}"
  # AgentCore enforces [a-zA-Z][a-zA-Z0-9_]{0,47} — no hyphens. Underscore-form
  # only used for AgentRuntimeName; all other resources keep the hyphen prefix.
  agent_name = "ava_cp_dev_${substr(data.aws_caller_identity.current.account_id, length(data.aws_caller_identity.current.account_id) - 6, 6)}_sa_spike"
}

# DynamoDB — minimal table the spike writes phase progress into. Schema
# matches the existing service_approval table (pk=GLOBAL/SPIKE, sk=slug)
# so the same UI polling code could read it later.
resource "aws_dynamodb_table" "spike" {
  name         = "${local.prefix}-sa-spike"
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
}

# ECR — holds the spike agent image
resource "aws_ecr_repository" "spike" {
  name                 = "${local.prefix}-sa-spike-agent"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# IAM role assumed by the AgentCore runtime microVM. Mirrors FSI Foundry's
# pattern (assume by bedrock-agentcore.amazonaws.com with SourceAccount
# condition) but with a tighter inline policy — this role only needs DDB
# write to one table and CloudWatch Logs.
resource "aws_iam_role" "agentcore" {
  name = "${local.prefix}-sa-spike-agentcore"

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

resource "aws_iam_role_policy" "agentcore" {
  name = "spike-runtime-policy"
  role = aws_iam_role.agentcore.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DDB"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.spike.arn
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
# doesn't expose `aws_bedrockagentcore_runtime` yet. Same pattern FSI Foundry
# uses at applications/fsi_foundry/foundations/iac/agentcore/runtime/main.tf.
resource "aws_cloudformation_stack" "runtime" {
  name          = "${local.prefix}-sa-spike-runtime"
  template_body = file("${path.module}/../spike/agentcore_runtime.yaml")

  parameters = {
    AgentName    = local.agent_name
    RoleArn      = aws_iam_role.agentcore.arn
    ContainerUri = "${aws_ecr_repository.spike.repository_url}:${var.image_tag}"
    SpikeTable   = aws_dynamodb_table.spike.name
  }

  capabilities = ["CAPABILITY_IAM"]

  # The runtime resource depends on a real image being in ECR — Terraform
  # has no native dependency, so we ask the operator to push first. If
  # apply fails with "image not found", run the build-and-push script
  # then re-apply.
  depends_on = [aws_ecr_repository.spike]
}
