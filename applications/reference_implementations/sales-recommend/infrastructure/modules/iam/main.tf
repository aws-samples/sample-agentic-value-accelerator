###############################################################################
# IAM Module — Roles for AgentCore, ECS Task Execution, and ECS Task
###############################################################################

# ------------------------------------------------------------------------------
# AgentCore Execution Role — trusted by Bedrock
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "agentcore_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "agentcore_execution" {
  name               = "${var.project}-agentcore-execution-role"
  assume_role_policy = data.aws_iam_policy_document.agentcore_assume_role.json

  tags = {
    Name    = "${var.project}-agentcore-execution-role"
    Project = var.project
  }
}

data "aws_iam_policy_document" "agentcore_permissions" {
  # Bedrock model invocation
  statement {
    sid    = "GlobalCrisInferenceProfile"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = [
      "arn:aws:bedrock:${var.aws_region}:${var.account_id}:inference-profile/global.*"
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.aws_region]
    }
  }

  # Regional foundation model access (required for global CRIS)
  statement {
    sid    = "GlobalCrisRegionalModel"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/anthropic.claude-*"
    ]
  }

  # Global foundation model access (enables cross-region routing)
  statement {
    sid    = "GlobalCrisGlobalModel"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = [
      "arn:aws:bedrock:::foundation-model/anthropic.claude-*"
    ]
  }

  # Knowledge Base retrieval
  statement {
    sid    = "KnowledgeBaseRetrieve"
    effect = "Allow"
    actions = [
      "bedrock:Retrieve"
    ]
    resources = [
      "arn:aws:bedrock:${var.aws_region}:${var.account_id}:knowledge-base/${var.knowledge_base_id}"
    ]
  }
}

# S3 read permissions for AgentCore direct CODE deployment (pulls the code zip)
data "aws_iam_policy_document" "agentcore_code" {
  statement {
    sid    = "S3CodeDeploy"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket"
    ]
    resources = [
      "arn:aws:s3:::bedrock-agentcore-codebuild-sources-${var.account_id}-${var.aws_region}",
      "arn:aws:s3:::bedrock-agentcore-codebuild-sources-${var.account_id}-${var.aws_region}/*"
    ]
  }
}

resource "aws_iam_role_policy" "agentcore_code" {
  name   = "${var.project}-agentcore-code"
  role   = aws_iam_role.agentcore_execution.id
  policy = data.aws_iam_policy_document.agentcore_code.json
}

# CloudWatch Logs for AgentCore
resource "aws_iam_role_policy_attachment" "agentcore_cloudwatch" {
  role       = aws_iam_role.agentcore_execution.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

resource "aws_iam_role_policy" "agentcore_permissions" {
  name   = "${var.project}-agentcore-permissions"
  role   = aws_iam_role.agentcore_execution.id
  policy = data.aws_iam_policy_document.agentcore_permissions.json
}

# ------------------------------------------------------------------------------
# ECS Task Execution Role — pulls images, reads secrets
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "ecs_task_execution_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume_role.json

  tags = {
    Name    = "${var.project}-ecs-task-execution-role"
    Project = var.project
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_task_execution_ssm" {
  statement {
    sid    = "ReadSSMParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameters",
      "ssm:GetParameter",
      "ssm:GetParametersByPath"
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${var.account_id}:parameter/${var.project}/*"
    ]
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_ssm" {
  name   = "${var.project}-ecs-task-execution-ssm"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_ssm.json
}

# ------------------------------------------------------------------------------
# ECS Task Role — runtime permissions for the running container
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task" {
  name               = "${var.project}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Name    = "${var.project}-ecs-task-role"
    Project = var.project
  }
}

data "aws_iam_policy_document" "ecs_task_permissions" {
  statement {
    sid    = "InvokeAgentRuntime"
    effect = "Allow"
    actions = [
      "bedrock:InvokeAgent",
      "bedrock:InvokeAgentRuntime",
      "bedrock-agentcore:InvokeAgentRuntime",
      "bedrock-agentcore:Invoke"
    ]
    resources = [
      # Broad wildcard to match any runtime ARN format
      "arn:aws:bedrock-agentcore:${var.aws_region}:${var.account_id}:runtime/*",
      "arn:aws:bedrock-agentcore:${var.aws_region}:${var.account_id}:*",
      "arn:aws:bedrock:${var.aws_region}:${var.account_id}:*"
    ]
  }
}

resource "aws_iam_role_policy" "ecs_task_permissions" {
  name   = "${var.project}-ecs-task-permissions"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_permissions.json
}
