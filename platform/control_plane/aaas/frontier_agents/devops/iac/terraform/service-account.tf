# Part 2 — resources deployed into the secondary (service) account so the
# Agent Space in the monitoring account can assume a role there.
#
# Gated on var.agent_space_arn so the initial deployment is a no-op. After
# Part 1 outputs the ARN, set agent_space_arn + service_account_id and
# configure the aws.service provider alias with credentials for that account.

data "aws_iam_policy_document" "secondary_account_trust" {
  count = var.agent_space_arn != "" ? 1 : 0

  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["aidevops.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [var.agent_space_arn]
    }
  }
}

resource "aws_iam_role" "secondary_account" {
  count    = var.agent_space_arn != "" ? 1 : 0
  provider = aws.service

  name               = "DevOpsAgentRole-SecondaryAccount-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.secondary_account_trust[0].json
  description        = "Secondary-account role trusted by the monitoring Agent Space."
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "secondary_account_access" {
  count    = var.agent_space_arn != "" ? 1 : 0
  provider = aws.service

  role       = aws_iam_role.secondary_account[0].name
  policy_arn = "arn:aws:iam::aws:policy/AIDevOpsAgentAccessPolicy"
}

data "aws_iam_policy_document" "secondary_account_inline" {
  count = var.agent_space_arn != "" ? 1 : 0

  statement {
    sid     = "AllowCreateResourceExplorerServiceLinkedRole"
    effect  = "Allow"
    actions = ["iam:CreateServiceLinkedRole"]
    resources = [
      "arn:aws:iam::${var.service_account_id}:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer"
    ]
  }
}

resource "aws_iam_role_policy" "secondary_account_inline" {
  count    = var.agent_space_arn != "" ? 1 : 0
  provider = aws.service

  name   = "AllowCreateServiceLinkedRoles"
  role   = aws_iam_role.secondary_account[0].id
  policy = data.aws_iam_policy_document.secondary_account_inline[0].json
}

# Example echo Lambda (mirrors the upstream sample) so operators can
# verify cross-account association end-to-end. Optional — remove if the
# consuming deployment does not want a sample target.
data "archive_file" "echo_lambda" {
  count       = var.agent_space_arn != "" ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.artifacts/echo-service.zip"

  source {
    filename = "index.js"
    content  = <<-JS
      exports.handler = async (event) => {
        console.log('Received event:', JSON.stringify(event, null, 2));
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Echo service response',
            echo: event,
            timestamp: new Date().toISOString(),
          }),
        };
      };
    JS
  }
}

data "aws_iam_policy_document" "echo_lambda_trust" {
  count = var.agent_space_arn != "" ? 1 : 0

  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "echo_service_role" {
  count    = var.agent_space_arn != "" ? 1 : 0
  provider = aws.service

  name               = "ava-echo-service-role-${local.role_suffix}"
  assume_role_policy = data.aws_iam_policy_document.echo_lambda_trust[0].json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "echo_service_basic" {
  count    = var.agent_space_arn != "" ? 1 : 0
  provider = aws.service

  role       = aws_iam_role.echo_service_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "echo_service" {
  count    = var.agent_space_arn != "" ? 1 : 0
  provider = aws.service

  function_name    = "ava-echo-service-${local.role_suffix}"
  description      = "Sample target that echoes its input event; exercises the Agent Space cross-account association."
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  timeout          = 30
  memory_size      = 128
  filename         = data.archive_file.echo_lambda[0].output_path
  source_code_hash = data.archive_file.echo_lambda[0].output_base64sha256
  role             = aws_iam_role.echo_service_role[0].arn
  tags             = var.tags
}
