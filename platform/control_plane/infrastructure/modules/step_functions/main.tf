# ============================================================================
# CloudWatch Log Group
# ============================================================================

resource "aws_cloudwatch_log_group" "step_functions" {
  name              = "/aws/vendedlogs/states/${var.name_prefix}-deployment"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-step-functions-logs"
  })
}

# ============================================================================
# IAM Role for Step Functions
# ============================================================================

resource "aws_iam_role" "step_functions" {
  name = "${var.name_prefix}-step-functions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

# Policy for DynamoDB access
resource "aws_iam_role_policy" "step_functions_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = compact([
          var.application_catalog_table_arn,
          "${var.application_catalog_table_arn}/index/*",
          var.deployment_metadata_table_arn,
          "${var.deployment_metadata_table_arn}/index/*",
          var.deployments_table_arn,
          var.deployments_table_arn != "" ? "${var.deployments_table_arn}/index/*" : "",
        ])
      }
    ]
  })
}

# Policy for S3 access
resource "aws_iam_role_policy" "step_functions_s3" {
  name = "s3-access"
  role = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${var.project_archives_bucket_arn}/*"
        ]
      }
    ]
  })
}

# Policy for ECS access
resource "aws_iam_role_policy" "step_functions_ecs" {
  name = "ecs-access"
  role = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "ecs:StopTask"
        ]
        Resource = [
          var.ecs_task_definition_arn,
          "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:task/${split("/", var.ecs_cluster_arn)[1]}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = ["*"]
        Condition = {
          StringLike = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}

# Policy for CloudWatch Logs
resource "aws_iam_role_policy" "step_functions_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy for CodeBuild access (pipeline builds)
resource "aws_iam_role_policy" "step_functions_codebuild" {
  count = var.enable_pipeline ? 1 : 0
  name  = "codebuild-access"
  role  = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codebuild:StartBuild",
          "codebuild:BatchGetBuilds",
          "codebuild:StopBuild"
        ]
        Resource = var.codebuild_project_arn
      }
    ]
  })
}

# Policy for EventBridge access (deployment events)
resource "aws_iam_role_policy" "step_functions_eventbridge" {
  count = var.enable_pipeline ? 1 : 0
  name  = "eventbridge-access"
  role  = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = var.eventbridge_bus_arn
      }
    ]
  })
}

# Policy for State Backend S3 access
resource "aws_iam_role_policy" "step_functions_state_backend" {
  count = var.enable_pipeline ? 1 : 0
  name  = "state-backend-s3-access"
  role  = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.state_backend_bucket_arn,
          "${var.state_backend_bucket_arn}/*"
        ]
      }
    ]
  })
}

# ============================================================================
# Step Functions State Machine - Enhanced CI/CD Pipeline
# ============================================================================

resource "aws_sfn_state_machine" "deployment" {
  name     = "${var.name_prefix}-deployment"
  role_arn = aws_iam_role.step_functions.arn

  definition = jsonencode({
    Comment = "CI/CD Deployment Pipeline Orchestration"
    StartAt = "ValidateInput"
    States = {
      # Stage 1: ValidateInput
      ValidateInput = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:getItem"
        Parameters = {
          TableName = var.application_catalog_table_name
          Key = {
            application_id = { "S.$" = "$.template_id" }
            version        = { S = "latest" }
          }
        }
        ResultPath = "$.catalogData"
        Next       = "UpdateStatusValidating"
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailureValidateInput"
          }
        ]
      }

      UpdateStatusValidating = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "validating" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "validating" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { S = "Pipeline validation started" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        Next       = "PackageTemplate"
      }

      RecordFailureValidateInput = {
        Type       = "Pass"
        Parameters = {
          "failed_stage" = "ValidateInput"
          "error"        = { "Cause" = "Template validation failed" }
        }
        ResultPath = "$.failureInfo"
        Next       = "RecordFailureWrite"
      }

      # Stage 2: PackageTemplate
      PackageTemplate = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "packaging" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "packaging" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { S = "Packaging template" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        Next       = "StartBuild"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailurePackageTemplate"
          }
        ]
      }

      RecordFailurePackageTemplate = {
        Type       = "Pass"
        Parameters = {
          "failed_stage" = "PackageTemplate"
          "error"        = { "Cause" = "Template packaging failed" }
        }
        ResultPath = "$.failureInfo"
        Next       = "RecordFailureWrite"
      }

      # Stage 3: StartBuild
      StartBuild = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "deploying" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "deploying" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { S = "Starting infrastructure deployment" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        Next       = "InvokeCodeBuild"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailureStartBuild"
          }
        ]
      }

      InvokeCodeBuild = {
        Type     = "Task"
        Resource = "arn:aws:states:::codebuild:startBuild"
        Parameters = {
          ProjectName = var.codebuild_project_name
          EnvironmentVariablesOverride = [
            { Name = "DEPLOYMENT_ID", "Value.$" = "$.deployment_id", Type = "PLAINTEXT" },
            { Name = "TEMPLATE_ID", "Value.$" = "$.template_id", Type = "PLAINTEXT" },
            { Name = "DEPLOYMENT_NAME", "Value.$" = "$.deployment_name", Type = "PLAINTEXT" },
            { Name = "IAC_TYPE", "Value.$" = "$.iac_type", Type = "PLAINTEXT" },
            { Name = "AWS_TARGET_REGION", "Value.$" = "$.aws_region", Type = "PLAINTEXT" },
            { Name = "STATE_BUCKET", Value = var.state_backend_bucket_name, Type = "PLAINTEXT" },
            { Name = "ARCHIVE_BUCKET", "Value.$" = "$.s3_bucket", Type = "PLAINTEXT" },
            { Name = "ARCHIVE_KEY", "Value.$" = "$.s3_key", Type = "PLAINTEXT" },
            { Name = "DEPLOYMENTS_TABLE", Value = var.deployments_table_name, Type = "PLAINTEXT" },
            { Name = "USE_CASE_ID", "Value.$" = "$.parameters.USE_CASE_ID", Type = "PLAINTEXT" },
            { Name = "FRAMEWORK", "Value.$" = "$.parameters.FRAMEWORK", Type = "PLAINTEXT" },
            { Name = "DEPLOYMENT_PATTERN", "Value.$" = "$.parameters.DEPLOYMENT_PATTERN", Type = "PLAINTEXT" },
            { Name = "ACTION", "Value.$" = "$.action", Type = "PLAINTEXT" }
          ]
        }
        ResultPath = "$.buildResult"
        Next       = "StoreBuildId"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailureStartBuild"
          }
        ]
      }

      # Store build_id in DynamoDB so logs endpoint can retrieve them
      StoreBuildId = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET build_id = :bid, updated_at = :ts"
          ExpressionAttributeValues = {
            ":bid" = { "S.$" = "$.buildResult.Build.Id" }
            ":ts"  = { "S.$" = "$$.State.EnteredTime" }
          }
        }
        ResultPath = null
        Next       = "MonitorBuild"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = null
            Next        = "MonitorBuild"
          }
        ]
      }

      RecordFailureStartBuild = {
        Type       = "Pass"
        Parameters = {
          "failed_stage" = "StartBuild"
          "error"        = { "Cause" = "CodeBuild start failed" }
        }
        ResultPath = "$.failureInfo"
        Next       = "RecordFailureWrite"
      }

      # Stage 4: MonitorBuild (wait-loop)
      MonitorBuild = {
        Type    = "Wait"
        Seconds = 30
        Next    = "CheckBuildStatus"
      }

      CheckBuildStatus = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:codebuild:batchGetBuilds"
        Parameters = {
          "Ids.$" = "States.Array($.buildResult.Build.Id)"
        }
        ResultPath = "$.buildStatus"
        Next       = "EvaluateBuildStatus"
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailureMonitorBuild"
          }
        ]
      }

      EvaluateBuildStatus = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.buildStatus.Builds[0].BuildStatus"
            StringEquals = "SUCCEEDED"
            Next         = "CaptureOutputs"
          },
          {
            Variable     = "$.buildStatus.Builds[0].BuildStatus"
            StringEquals = "FAILED"
            Next         = "RecordFailureMonitorBuild"
          },
          {
            Variable     = "$.buildStatus.Builds[0].BuildStatus"
            StringEquals = "FAULT"
            Next         = "RecordFailureMonitorBuild"
          },
          {
            Variable     = "$.buildStatus.Builds[0].BuildStatus"
            StringEquals = "TIMED_OUT"
            Next         = "RecordFailureMonitorBuild"
          },
          {
            Variable     = "$.buildStatus.Builds[0].BuildStatus"
            StringEquals = "STOPPED"
            Next         = "RecordFailureMonitorBuild"
          }
        ]
        Default = "MonitorBuild"
      }

      RecordFailureMonitorBuild = {
        Type       = "Pass"
        Parameters = {
          "failed_stage" = "MonitorBuild"
          "error"        = { "Cause" = "CodeBuild execution failed" }
        }
        ResultPath = "$.failureInfo"
        Next       = "RecordFailureWrite"
      }

      # Stage 5: CaptureOutputs
      CaptureOutputs = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "verifying" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "verifying" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { S = "Verifying deployment outputs" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        Next       = "ReadOutputArtifact"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailureCaptureOutputs"
          }
        ]
      }

      ReadOutputArtifact = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:s3:getObject"
        Parameters = {
          Bucket  = var.state_backend_bucket_name
          "Key.$" = "States.Format('{}/outputs.json', $.deployment_id)"
        }
        ResultPath = "$.outputArtifact"
        Next       = "RecordSuccess"
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "RecordFailureCaptureOutputs"
          }
        ]
      }

      RecordFailureCaptureOutputs = {
        Type       = "Pass"
        Parameters = {
          "failed_stage" = "CaptureOutputs"
          "error"        = { "Cause" = "Failed to capture deployment outputs" }
        }
        ResultPath = "$.failureInfo"
        Next       = "RecordFailureWrite"
      }

      # Stage 6: RecordSuccess — branch on action type
      RecordSuccess = {
        Type    = "Choice"
        Choices = [
          {
            Variable     = "$.action"
            StringEquals = "destroy"
            Next         = "RecordSuccessDestroy"
          }
        ]
        Default = "RecordSuccessDeploy"
      }

      RecordSuccessDeploy = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "deployed" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "deployed" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { S = "Deployment completed successfully" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        End        = true
      }

      RecordSuccessDestroy = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "destroyed" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "destroyed" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { S = "Destroy completed successfully" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        End        = true
      }

      # Error Path: RecordFailure -> FailState
      RecordFailureWrite = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = var.deployments_table_name
          Key = {
            pk = { "S.$" = "States.Format('DEPLOY#{}', $.deployment_id)" }
            sk = { S = "META" }
          }
          UpdateExpression         = "SET #status = :status, updated_at = :ts, error_message = :err, failed_stage = :stage, status_history = list_append(if_not_exists(status_history, :empty), :entry)"
          ExpressionAttributeNames = { "#status" = "status" }
          ExpressionAttributeValues = {
            ":status" = { S = "failed" }
            ":ts"     = { "S.$" = "$$.State.EnteredTime" }
            ":err"    = { "S.$" = "$.failureInfo.error.Cause" }
            ":stage"  = { "S.$" = "$.failureInfo.failed_stage" }
            ":entry"  = { "L" = [{ "M" = { "status" = { S = "failed" }, "timestamp" = { "S.$" = "$$.State.EnteredTime" }, "message" = { "S.$" = "States.Format('Failed at stage: {}', $.failureInfo.failed_stage)" } } }] }
            ":empty"  = { L = [] }
          }
        }
        ResultPath = null
        Next       = "FailState"
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
      }

      FailState = {
        Type  = "Fail"
        Cause = "Deployment pipeline failed"
        Error = "DeploymentPipelineError"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.step_functions.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-deployment"
  })
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}