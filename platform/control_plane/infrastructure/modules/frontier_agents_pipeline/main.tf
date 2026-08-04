data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  module_prefix = "${var.name_prefix}-frontier-agents"
}

# ============================================================================
# CloudWatch log groups
# ============================================================================

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${local.module_prefix}-deploy"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "state_machine" {
  name              = "/aws/vendedlogs/states/${local.module_prefix}-pipeline"
  retention_in_days = 7
  tags              = var.tags
}

# ============================================================================
# CodeBuild IAM role — scoped to what a Terraform-only Frontier Agent deploy needs
# ============================================================================

resource "aws_iam_role" "codebuild" {
  name = "${local.module_prefix}-codebuild-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "codebuild.amazonaws.com" }
        Action    = "sts:AssumeRole"
      },
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "codebuild_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = [aws_cloudwatch_log_group.codebuild.arn, "${aws_cloudwatch_log_group.codebuild.arn}:*"]
    }]
  })
}

resource "aws_iam_role_policy" "codebuild_s3" {
  name = "s3-access"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Project archives (shared) — read-only.
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetBucketLocation"]
        Resource = [var.project_archives_bucket_arn, "${var.project_archives_bucket_arn}/*"]
      },
      # Per-deployment buckets created by DeploymentService (fsi-*) — read the
      # zipped IaC and list contents. Matches the pattern the FSI Foundry
      # CodeBuild role uses for the same reason.
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation",
        ]
        Resource = ["arn:aws:s3:::fsi-*", "arn:aws:s3:::fsi-*/*"]
      },
      # Terraform state backend — read/write.
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [var.state_backend_bucket_arn, "${var.state_backend_bucket_arn}/*"]
      },
      # CDK bootstrap staging bucket (cdk-hnb659fds-assets-*).
      {
        Effect = "Allow"
        Action = [
          "s3:CreateBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject",
          "s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketPolicy",
          "s3:PutBucketPolicy", "s3:PutBucketVersioning", "s3:PutEncryptionConfiguration",
          "s3:PutLifecycleConfiguration", "s3:PutBucketPublicAccessBlock",
        ]
        Resource = ["arn:aws:s3:::cdk-*", "arn:aws:s3:::cdk-*/*"]
      },
    ]
  })
}

resource "aws_iam_role_policy" "codebuild_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]
      Resource = [var.deployments_table_arn, var.lock_table_arn]
    }]
  })
}

# The IaC that runs inside this CodeBuild job provisions AWS DevOps Agent
# resources — IAM roles, agent space, associations, optional sample Lambda.
# Supports Terraform (Cloud Control API), CDK, and CloudFormation.
resource "aws_iam_role_policy" "codebuild_provisioning" {
  name = "iac-provisioning"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        # Cloud Control API — the awscc Terraform provider issues every resource
        # through CreateResource/GetResource/UpdateResource/DeleteResource.
        "cloudformation:CreateResource",
        "cloudformation:GetResource",
        "cloudformation:UpdateResource",
        "cloudformation:DeleteResource",
        "cloudformation:ListResources",
        "cloudformation:CancelResourceRequest",
        "cloudformation:GetResourceRequestStatus",
        # CloudFormation stack management — needed by CDK deploy and raw
        # CloudFormation deploy (aws cloudformation deploy).
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:GetTemplateSummary",
        "cloudformation:ValidateTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ListStacks",
        "cloudformation:ListStackResources",
        # CDK bootstrap uses SSM parameter store for version tracking.
        "ssm:GetParameter",
        "ssm:PutParameter",
        # Frontier Agent services (accessed via Cloud Control for awscc resources,
        # but direct API is used for reads + deletes).
        "aidevops:*",
        "securityagent:*",
        # IAM — create/attach/tag the Agent Space + operator roles.
        "iam:CreateRole", "iam:DeleteRole",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy",
        "iam:GetRole", "iam:GetRolePolicy",
        "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
        "iam:PassRole", "iam:TagRole", "iam:UntagRole",
        "iam:CreateServiceLinkedRole",
        # Lambda + logs for the optional sample echo service in Part 2.
        "lambda:*",
        "logs:*",
        "sts:GetCallerIdentity",
      ]
      Resource = "*"
    }]
  })
}

# ============================================================================
# CodeBuild project
# ============================================================================

resource "aws_codebuild_project" "deploy" {
  name                   = "${local.module_prefix}-deploy"
  description            = "Runs IaC (Terraform/CDK/CloudFormation) for Frontier Agent deployments."
  service_role           = aws_iam_role.codebuild.arn
  build_timeout          = 30
  concurrent_build_limit = 10

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = var.compute_type
    image                       = "aws/codebuild/amazonlinux2-aarch64-standard:3.0"
    type                        = "ARM_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

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

  tags = var.tags
}

# ============================================================================
# Step Functions state machine
# ============================================================================

resource "aws_iam_role" "state_machine" {
  name = "${local.module_prefix}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "state_machine_codebuild" {
  name = "codebuild-access"
  role = aws_iam_role.state_machine.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["codebuild:StartBuild", "codebuild:BatchGetBuilds", "codebuild:StopBuild"]
        Resource = aws_codebuild_project.deploy.arn
      },
      # `startBuild.sync` uses a managed EventBridge rule to signal completion.
      # Step Functions creates and attaches a managed rule on first invocation.
      # AWS docs call for wildcard on these three actions for sync patterns.
      {
        Effect   = "Allow"
        Action   = ["events:PutTargets", "events:PutRule", "events:DescribeRule"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy" "state_machine_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.state_machine.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:UpdateItem", "dynamodb:GetItem"]
      Resource = [var.deployments_table_arn]
    }]
  })
}

resource "aws_iam_role_policy" "state_machine_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.state_machine.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
        "logs:DeleteLogDelivery", "logs:ListLogDeliveries",
        "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_sfn_state_machine" "deployment" {
  name     = "${local.module_prefix}-pipeline"
  role_arn = aws_iam_role.state_machine.arn

  definition = jsonencode({
    Comment = "Frontier Agents deployment pipeline — Terraform, CDK, and CloudFormation."
    StartAt = "MarkDeploying"
    States = {
      MarkDeploying = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "deploying" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
          }
        }
        ResultPath = null
        Next       = "InvokeCodeBuild"
        Catch = [
          { ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "RecordFailure" },
        ]
      }

      InvokeCodeBuild = {
        Type     = "Task"
        Resource = "arn:aws:states:::codebuild:startBuild.sync"
        Parameters = {
          ProjectName = aws_codebuild_project.deploy.name
          EnvironmentVariablesOverride = [
            { Name = "DEPLOYMENT_ID", "Value.$" = "$.deployment_id", Type = "PLAINTEXT" },
            { Name = "DEPLOYMENT_NAME", "Value.$" = "$.deployment_name", Type = "PLAINTEXT" },
            { Name = "AGENT_ID", "Value.$" = "$.agent_id", Type = "PLAINTEXT" },
            { Name = "IAC_TYPE", "Value.$" = "$.iac_type", Type = "PLAINTEXT" },
            { Name = "AWS_TARGET_REGION", "Value.$" = "$.aws_region", Type = "PLAINTEXT" },
            { Name = "ARCHIVE_BUCKET", "Value.$" = "$.s3_bucket", Type = "PLAINTEXT" },
            { Name = "ARCHIVE_KEY", "Value.$" = "$.s3_key", Type = "PLAINTEXT" },
            { Name = "STATE_BUCKET", Value = var.state_backend_bucket_name, Type = "PLAINTEXT" },
            { Name = "DEPLOYMENTS_TABLE", Value = var.deployments_table_name, Type = "PLAINTEXT" },
            { Name = "ACTION", "Value.$" = "$.action", Type = "PLAINTEXT" },
            { Name = "PARAMETERS_JSON", "Value.$" = "States.JsonToString($.parameters)", Type = "PLAINTEXT" },
          ]
        }
        ResultPath = "$.buildResult"
        Next       = "StoreBuildId"
        Catch = [
          { ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "RecordFailure" },
        ]
      }

      StoreBuildId = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression = "SET build_id = :bid, updated_at = :ts"
          ExpressionAttributeValues = {
            ":bid" = { "S.$" = "$.buildResult.Build.Id" }
            ":ts"  = { "S.$" = "$$.State.EnteredTime" }
          }
        }
        ResultPath = null
        Next       = "MarkDeployed"
        Catch = [
          { ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "RecordFailure" },
        ]
      }

      MarkDeployed = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "deployed" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
          }
        }
        ResultPath = null
        End        = true
      }

      RecordFailure = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, error_message = :err, updated_at = :ts"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "failed" }
            ":err"    = { "S.$" = "States.JsonToString($.error)" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
          }
        }
        ResultPath = null
        Next       = "Fail"
      }

      Fail = {
        Type  = "Fail"
        Error = "FrontierAgentsPipelineFailure"
        Cause = "Deployment failed — see DynamoDB record for details."
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.state_machine.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  tags = var.tags
}
