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
          "bedrock:InvokeModelWithResponseStream"
        ]
        # Cross-region inference profiles route to different regions within the same geographic area
        # For example, eu.* profiles may route to eu-west-1, eu-central-1, etc.
        # We allow access to the deployment region and common routing destinations
        Resource = [
          # Foundation models in deployment region
          "arn:aws:bedrock:${local.aws_region}::foundation-model/anthropic.claude-*",
          # Inference profiles in deployment region
          "arn:aws:bedrock:${local.aws_region}:${local.account_id}:inference-profile/*",
          # Cross-region inference may route to other regions in the same geographic area
          # EU regions: eu-west-1, eu-central-1, eu-west-2, eu-west-3, eu-north-1
          "arn:aws:bedrock:eu-west-1::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:eu-central-1::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:eu-west-2::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:eu-west-3::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:eu-north-1::foundation-model/anthropic.claude-*",
          # US regions: us-east-1, us-east-2, us-west-2
          "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-*",
          # APAC regions: ap-southeast-1, ap-northeast-1
          "arn:aws:bedrock:ap-southeast-1::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-*"
        ]
      }
    ]
  })

  tags = {
    UseCase = var.use_case_id
  }
}

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${local.resource_prefix}-cloudwatch-logs-${random_id.iam_suffix.hex}-${var.deployment_suffix}"
  description = "Allow writing to CloudWatch Logs"

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
      }
    ]
  })

  tags = {
    UseCase = var.use_case_id
  }
}
