# ============================================================================
# CloudWatch Log Group for CodeBuild
# ============================================================================

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.name_prefix}-deployment"
  retention_in_days = 14

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-codebuild-logs"
  })
}

# ============================================================================
# IAM Role for CodeBuild
# ============================================================================

resource "aws_iam_role" "codebuild" {
  name = "${var.name_prefix}-codebuild-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

# Policy for CloudWatch Logs
resource "aws_iam_role_policy" "codebuild_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.codebuild.id

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
        Resource = [
          aws_cloudwatch_log_group.codebuild.arn,
          "${aws_cloudwatch_log_group.codebuild.arn}:*"
        ]
      }
    ]
  })
}

# Policy for S3 access (archives read + state backend read/write + deployment buckets)
resource "aws_iam_role_policy" "codebuild_s3" {
  name = "s3-access"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetBucketLocation"
        ]
        Resource = [
          var.project_archives_bucket_arn,
          "${var.project_archives_bucket_arn}/*",
          "arn:aws:s3:::fsi-*",
          "arn:aws:s3:::fsi-*/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = [
          var.state_backend_bucket_arn,
          "${var.state_backend_bucket_arn}/*"
        ]
      }
    ]
  })
}

# Policy for DynamoDB access (deployment status + state locking)
resource "aws_iam_role_policy" "codebuild_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          var.deployment_metadata_table_arn,
          var.deployments_table_arn,
          var.lock_table_arn
        ]
      }
    ]
  })
}

# Policy for STS AssumeRole (cross-account deployments)
resource "aws_iam_role_policy" "codebuild_sts" {
  name = "sts-assume-role"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = [
          "arn:aws:iam::*:role/fsi-deployment-*",
          "arn:aws:iam::*:role/cdk-*"
        ]
      }
    ]
  })
}

# Policy for CloudFormation (stack operations)
resource "aws_iam_role_policy" "codebuild_cloudformation" {
  name = "cloudformation-access"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudformation:CreateStack",
          "cloudformation:UpdateStack",
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:GetTemplate",
          "cloudformation:ListStackResources",
          "cloudformation:CreateChangeSet",
          "cloudformation:DescribeChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet",
          "cloudformation:ListStacks",
          "cloudformation:GetTemplateSummary"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "cloudformation:GetTemplate"
        Resource = "*"
      }
    ]
  })
}

# Policy for IaC resource provisioning (Bedrock, ECR, IAM, Lambda, etc.)
resource "aws_iam_role_policy" "codebuild_iac_provisioning" {
  name = "iac-provisioning"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:*",
          "bedrock-agentcore:*",
          "ecr:*",
          "ecs:*",
          "ec2:*",
          "elasticloadbalancing:*",
          "lambda:*",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:PassRole",
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
          "iam:GetInstanceProfile",
          "iam:TagInstanceProfile",
          "iam:UntagInstanceProfile",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:TagPolicy",
          "iam:UntagPolicy",
          "iam:ListInstanceProfilesForRole",
          "iam:CreateServiceLinkedRole",
          "s3:*",
          "dynamodb:*",
          "logs:*",
          "states:*",
          "events:*",
          "sqs:*",
          "sns:*",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
          "ssm:DeleteParameters",
          "ssm:DescribeParameters",
          "ssm:AddTagsToResource",
          "ssm:RemoveTagsFromResource",
          "ssm:ListTagsForResource",
          "sts:GetCallerIdentity",
          "cognito-idp:*",
          "cognito-identity:*",
          "appsync:*",
          "amplify:*",
          "cloudfront:*",
          "apigateway:*",
          "execute-api:*",
          "acm:*",
          "route53:*",
          "wafv2:*",
          "secretsmanager:*",
          "kms:*",
          "elasticache:*",
          "rds:*",
          "rds-db:*",
          "elasticfilesystem:*",
          "servicediscovery:*",
          "xray:*",
          "autoscaling:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# CodeBuild Project
# ============================================================================

resource "aws_codebuild_project" "deployment" {
  name                   = "${var.name_prefix}-deployment"
  description            = "Executes IaC commands for AVA deployments"
  service_role           = aws_iam_role.codebuild.arn
  build_timeout          = 60
  concurrent_build_limit = 60

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = var.compute_type
    image                       = "aws/codebuild/amazonlinux2-aarch64-standard:3.0"
    type                        = "ARM_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "ENVIRONMENT"
      value = var.environment
    }

    environment_variable {
      name  = "LOCK_TABLE"
      value = "${var.name_prefix}-tf-lock"
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = file("${path.module}/buildspec.yml")
  }


  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
      status     = "ENABLED"
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-deployment"
  })
}