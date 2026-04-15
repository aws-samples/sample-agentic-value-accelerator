# IAM Role for AgentCore Runtime
# Include region in name to support multi-region deployments
resource "aws_iam_role" "agentcore_runtime" {
  name = "AgentCoreRuntime-${local.resource_prefix}-${local.region_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "bedrock-agentcore.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${local.resource_prefix}-agentcore-runtime-role"
    Environment = var.environment
    Region      = var.aws_region
    UseCase     = var.use_case_id
  }
}

# Attach shared policies to AgentCore role
resource "aws_iam_role_policy_attachment" "agentcore_s3" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = module.shared.s3_policy_arn
}

resource "aws_iam_role_policy_attachment" "agentcore_bedrock" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = module.shared.bedrock_policy_arn
}

resource "aws_iam_role_policy_attachment" "agentcore_cloudwatch" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = module.shared.cloudwatch_policy_arn
}

# Additional policy for AgentCore to read deployment packages from S3
resource "aws_iam_policy" "agentcore_code_access" {
  name        = "${local.resource_prefix}-agentcore-code-access-${local.region_suffix}"
  description = "Allow AgentCore to read deployment packages from S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.agentcore_code.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_code" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_code_access.arn
}

# Policy for AWS X-Ray tracing (observability)
resource "aws_iam_policy" "agentcore_xray" {
  name        = "${local.resource_prefix}-agentcore-xray-${local.region_suffix}"
  description = "Allow AgentCore to send traces to AWS X-Ray"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        # Note: X-Ray actions require Resource="*" per AWS documentation.
        # Condition restricts scope to the deployment region for least privilege.
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = var.aws_region
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_xray" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_xray.arn
}

# Policy for Amazon ECR access (container images)
resource "aws_iam_policy" "agentcore_ecr" {
  name        = "${local.resource_prefix}-agentcore-ecr-${local.region_suffix}"
  description = "Allow AgentCore to pull container images from Amazon ECR"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuthorizationToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        # Note: ecr:GetAuthorizationToken requires Resource="*" per AWS documentation.
        # This action returns a token valid for all ECR repositories the principal
        # has access to. Repository-level access is controlled in the next statement.
        # See: https://docs.aws.amazon.com/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html
        Resource = "*"
      },
      {
        Sid    = "ECRRepositoryAccess"
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability"
        ]
        # Scoped to specific ECR repository (least privilege)
        Resource = aws_ecr_repository.agentcore.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "agentcore_ecr" {
  role       = aws_iam_role.agentcore_runtime.name
  policy_arn = aws_iam_policy.agentcore_ecr.arn
}
