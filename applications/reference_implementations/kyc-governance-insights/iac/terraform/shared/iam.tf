# Random ID for unique IAM resource naming
resource "random_id" "iam_suffix" {
  byte_length = 4
}

resource "aws_iam_policy" "s3_access" {
  name        = "${local.resource_prefix}-s3-access-${random_id.iam_suffix.hex}-${var.deployment_suffix}"
  description = "Allow access to S3 bucket for customer data"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.data.arn,
          "${aws_s3_bucket.data.arn}/*"
        ]
      }
    ]
  })

  tags = {
    UseCase = var.use_case_id
  }
}

resource "aws_iam_policy" "bedrock_access" {
  name        = "${local.resource_prefix}-bedrock-access-${random_id.iam_suffix.hex}-${var.deployment_suffix}"
  description = "Allow access to Amazon Bedrock for LLM inference"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:ApplyGuardrail"
        ]
        Resource = "arn:aws:bedrock:${local.aws_region}:${local.account_id}:guardrail/*"
      }
    ]
  })

  tags = {
    UseCase = var.use_case_id
  }
}

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${local.resource_prefix}-cloudwatch-logs-${random_id.iam_suffix.hex}-${var.deployment_suffix}"
  description = "Allow writing to CloudWatch Logs and Metrics"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        # Scoped to AVA log groups only (least privilege)
        Resource = [
          "arn:aws:logs:${local.aws_region}:${local.account_id}:log-group:/aws/ava/*",
          "arn:aws:logs:${local.aws_region}:${local.account_id}:log-group:/aws/ava/*:log-stream:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    UseCase = var.use_case_id
  }
}
