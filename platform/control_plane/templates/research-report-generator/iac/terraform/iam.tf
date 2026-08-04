# -----------------------------------------------------------------------------
# AgentCore Runtime IAM Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "runtime" {
  name        = "${local.name_prefix}-agentcore-runtime"
  description = "IAM role assumed by Bedrock AgentCore to run the agent runtime."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "bedrock-agentcore.amazonaws.com" }
        Action    = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:aws:bedrock-agentcore:${local.region}:${local.account_id}:*"
          }
        }
      }
    ]
  })

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Policy: Bedrock Model Invocation
# -----------------------------------------------------------------------------

resource "aws_iam_policy" "bedrock_invoke" {
  name        = "${local.name_prefix}-bedrock-invoke"
  description = "Allows invoking Bedrock foundation models."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeModel"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:${local.region}::foundation-model/${var.model_id}"
        ]
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "bedrock_invoke" {
  role       = aws_iam_role.runtime.name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}

# -----------------------------------------------------------------------------
# Policy: ECR Image Pull
# -----------------------------------------------------------------------------

resource "aws_iam_policy" "ecr_pull" {
  name        = "${local.name_prefix}-ecr-pull"
  description = "Allows pulling container images from ECR."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "GetAuthToken"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "PullImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "arn:aws:ecr:${local.region}:${local.account_id}:repository/*"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecr_pull" {
  role       = aws_iam_role.runtime.name
  policy_arn = aws_iam_policy.ecr_pull.arn
}

# -----------------------------------------------------------------------------
# Policy: CloudWatch Logs
# -----------------------------------------------------------------------------

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${local.name_prefix}-cloudwatch-logs"
  description = "Allows the AgentCore runtime to write logs to CloudWatch."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LogGroupManagement"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogStreams",
          "logs:CreateLogGroup"
        ]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"
      },
      {
        Sid      = "DescribeLogGroups"
        Effect   = "Allow"
        Action   = "logs:DescribeLogGroups"
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:*"
      },
      {
        Sid    = "WriteLogEvents"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  role       = aws_iam_role.runtime.name
  policy_arn = aws_iam_policy.cloudwatch_logs.arn
}

# -----------------------------------------------------------------------------
# Policy: CloudWatch Metrics
# -----------------------------------------------------------------------------

resource "aws_iam_policy" "cloudwatch_metrics" {
  name        = "${local.name_prefix}-cloudwatch-metrics"
  description = "Allows the AgentCore runtime to publish metrics."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PutMetrics"
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "bedrock-agentcore"
          }
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cloudwatch_metrics" {
  role       = aws_iam_role.runtime.name
  policy_arn = aws_iam_policy.cloudwatch_metrics.arn
}

# -----------------------------------------------------------------------------
# Policy: X-Ray Tracing
# -----------------------------------------------------------------------------

resource "aws_iam_policy" "xray" {
  name        = "${local.name_prefix}-xray"
  description = "Allows sending traces to X-Ray for AgentCore observability."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "XRayTracing"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        Resource = "*"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "xray" {
  role       = aws_iam_role.runtime.name
  policy_arn = aws_iam_policy.xray.arn
}
