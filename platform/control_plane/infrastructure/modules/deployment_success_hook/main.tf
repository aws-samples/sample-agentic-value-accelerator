# ============================================================================
# Deployment Success Hook — additive to the existing deployment Step Function.
#
# Watches the AWS-managed `aws.states` event bus for `SUCCEEDED` executions
# of the deployment SM and invokes a Lambda that publishes the newly-
# deployed application as an AGENT record in AWS Agent Registry.
#
# By design this module DOES NOT modify the Step Function; if the hook is
# ever removed, the pipeline still ships. The Lambda is idempotent — if
# an AGENT record already carries the DeploymentId tag, it skips.
# ============================================================================

data "aws_caller_identity" "this" {}
data "aws_region" "this" {}

# ─── Lambda code package ───────────────────────────────────────────────
# The AWS-managed Lambda runtime's bundled boto3 does not yet know about
# `agent-registry-control` (Aug 2026 preview namespace), so we vendor a
# newer boto3+botocore into the zip. `null_resource` runs pip on every
# apply that sees a change to the handler or requirements — the trigger
# hashes both so we don't reinstall when nothing changed.
resource "null_resource" "install_deps" {
  triggers = {
    handler_hash      = filesha256("${path.module}/lambda_src/index.py")
    requirements_hash = filesha256("${path.module}/requirements.txt")
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      BUILD_DIR="${path.module}/build/package"
      rm -rf "$BUILD_DIR"
      mkdir -p "$BUILD_DIR"
      cp "${path.module}/lambda_src/index.py" "$BUILD_DIR/index.py"
      # --platform manylinux2014_x86_64 + --only-binary=:all: ensures the
      # wheels we grab actually match the Lambda runtime, not the host.
      python3 -m pip install \
        --quiet \
        --target "$BUILD_DIR" \
        --platform manylinux2014_x86_64 \
        --only-binary=:all: \
        --python-version 3.12 \
        -r "${path.module}/requirements.txt"
    EOT
  }
}

data "archive_file" "hook" {
  type        = "zip"
  source_dir  = "${path.module}/build/package"
  output_path = "${path.module}/build/deployment_success_hook.zip"

  depends_on = [null_resource.install_deps]
}

# ─── Lambda execution role ─────────────────────────────────────────────
resource "aws_iam_role" "hook" {
  name = "${var.name_prefix}-deploy-success-hook-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.hook.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Read deployments (GetItem/Scan) and publish to AWS Agent Registry.
# Only the AVA registry ARN is granted — the module wires a single registry.
resource "aws_iam_role_policy" "hook" {
  name = "deployment-success-hook-policy"
  role = aws_iam_role.hook.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadDeployments"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
        ]
        Resource = [
          var.deployments_table_arn,
          "${var.deployments_table_arn}/index/*",
        ]
      },
      # PutItem on the approval-requests table so the Lambda can write
      # an audit-only 'approved' row after each successful publish. The
      # audit-only queue write is best-effort: if the ARN is empty the
      # env var is empty and the Lambda skips writing. To keep IAM
      # least-privilege in that case, we point the Resource at an
      # unreachable ARN so the statement grants nothing.
      {
        Sid    = "WriteApprovalQueueRow"
        Effect = "Allow"
        Action = ["dynamodb:PutItem"]
        Resource = [
          var.approval_requests_table_arn != "" ? var.approval_requests_table_arn : "arn:aws:dynamodb:us-east-1:000000000000:table/approval-queue-disabled"
        ]
      },
      {
        Sid    = "PublishRegistryRecord"
        Effect = "Allow"
        # AWS namespaces IAM actions under `agent-registry:*` even though
        # the boto3 client / control-plane API is `agent-registry-control`.
        # Using the `-control` prefix here returns AccessDenied at runtime
        # ("no identity-based policy allows the ... action").
        # The record ARN isn't known until create time; scope to the
        # registry ARN + record wildcard beneath it. ListTagsForResource
        # is used for the idempotency probe.
        Action = [
          "agent-registry:CreateRegistryRecord",
          "agent-registry:GetRegistryRecord",
          "agent-registry:ListRegistryRecords",
          "agent-registry:SubmitRegistryRecordForApproval",
          "agent-registry:UpdateRegistryRecordStatus",
          "agent-registry:ListTagsForResource",
          "agent-registry:TagResource",
        ]
        Resource = [
          var.agent_registry_arn,
          "${var.agent_registry_arn}/record/*",
        ]
      },
    ]
  })
}

# ─── Lambda ────────────────────────────────────────────────────────────
resource "aws_lambda_function" "hook" {
  function_name    = "${var.name_prefix}-deployment-success-hook"
  role             = aws_iam_role.hook.arn
  handler          = "index.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.hook.output_path
  source_code_hash = data.archive_file.hook.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      AGENT_REGISTRY_ID            = var.agent_registry_id
      DEPLOYMENTS_TABLE_NAME       = var.deployments_table_name
      APPROVAL_REQUESTS_TABLE_NAME = var.approval_requests_table_name
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-deployment-success-hook"
  })
}

resource "aws_cloudwatch_log_group" "hook" {
  name              = "/aws/lambda/${aws_lambda_function.hook.function_name}"
  retention_in_days = 14
  tags              = var.tags
}

# ─── EventBridge rule ──────────────────────────────────────────────────
# Watches the AWS-managed default bus for Step Function state-change
# events that match: source=aws.states, status=SUCCEEDED, and the SM
# ARN matches the deployment pipeline.
resource "aws_cloudwatch_event_rule" "deploy_succeeded" {
  name        = "${var.name_prefix}-deploy-succeeded"
  description = "Fires when the deployment Step Function reports SUCCEEDED, triggering the auto-publish hook."

  event_pattern = jsonencode({
    source      = ["aws.states"]
    detail-type = ["Step Functions Execution Status Change"]
    detail = {
      status          = ["SUCCEEDED"]
      stateMachineArn = [var.state_machine_arn]
    }
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-deploy-succeeded"
  })
}

resource "aws_cloudwatch_event_target" "hook" {
  rule      = aws_cloudwatch_event_rule.deploy_succeeded.name
  target_id = "deployment-success-hook"
  arn       = aws_lambda_function.hook.arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.hook.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.deploy_succeeded.arn
}
