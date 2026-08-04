# =============================================================================
# LiteLLM Gateway Module - Spend Aggregator Scheduled Task
# =============================================================================
# Implements:
#   - EventBridge rule to trigger Spend Aggregator Lambda every 5 minutes
#   - Lambda function running the aggregation cycle
#   - IAM role for the Lambda with least-privilege permissions
#   - CloudWatch log group for Lambda execution logs
#
# Task: 10.3
# Requirements: 10.1, 10.5
#
# The Lambda handler imports SpendAggregator, pulls spend data from LiteLLM,
# aggregates it, writes to the FinOps DynamoDB table, and emits the
# spend_records_synced CloudWatch metric per cycle.
# =============================================================================

# -----------------------------------------------------------------------------
# Variables for Spend Aggregator
# -----------------------------------------------------------------------------

variable "finops_table_name" {
  description = "DynamoDB table name for the Govern FinOps data store"
  type        = string
  default     = "ava-govern-finops"
}

variable "spend_aggregator_schedule" {
  description = "EventBridge schedule expression for Spend Aggregator (default: every 5 minutes)"
  type        = string
  default     = "rate(5 minutes)"
}

variable "spend_aggregator_timeout" {
  description = "Lambda function timeout in seconds for the Spend Aggregator"
  type        = number
  default     = 120
}

variable "spend_aggregator_memory" {
  description = "Lambda function memory in MB for the Spend Aggregator"
  type        = number
  default     = 256
}

# -----------------------------------------------------------------------------
# IAM Role for Spend Aggregator Lambda
# -----------------------------------------------------------------------------

resource "aws_iam_role" "spend_aggregator_lambda" {
  name = "${local.resource_prefix}-spend-aggregator-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaAssume"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-spend-aggregator-role"
  })
}

# CloudWatch Logs permission for Lambda execution logs
resource "aws_iam_role_policy" "spend_aggregator_logs" {
  name = "${local.resource_prefix}-spend-aggregator-logs"
  role = aws_iam_role.spend_aggregator_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.spend_aggregator.arn}:*"
      }
    ]
  })
}

# DynamoDB write permission for FinOps table
resource "aws_iam_role_policy" "spend_aggregator_dynamodb" {
  name = "${local.resource_prefix}-spend-aggregator-dynamodb"
  role = aws_iam_role.spend_aggregator_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBWrite"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.finops_table_name}"
      }
    ]
  })
}

# CloudWatch Metrics permission for emitting spend_records_synced
resource "aws_iam_role_policy" "spend_aggregator_metrics" {
  name = "${local.resource_prefix}-spend-aggregator-metrics"
  role = aws_iam_role.spend_aggregator_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CloudWatchMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "AVA/Gateway"
          }
        }
      }
    ]
  })
}

# Secrets Manager read permission for LiteLLM primary key
resource "aws_iam_role_policy" "spend_aggregator_secrets" {
  name = "${local.resource_prefix}-spend-aggregator-secrets"
  role = aws_iam_role.spend_aggregator_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.master_key.arn
      }
    ]
  })
}

# VPC access for Lambda (to reach internal ALB)
resource "aws_iam_role_policy_attachment" "spend_aggregator_vpc_access" {
  role       = aws_iam_role.spend_aggregator_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group for Spend Aggregator Lambda
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "spend_aggregator" {
  name              = "/aws/lambda/${local.resource_prefix}-spend-aggregator"
  retention_in_days = 30

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-spend-aggregator-logs"
  })
}

# -----------------------------------------------------------------------------
# Lambda Function - Spend Aggregator
# -----------------------------------------------------------------------------

# Package the Lambda handler code
# NOTE: The handler imports `requests` which is not in the Lambda runtime.
# A Lambda layer or pip install into the zip is required for production.
# To build: pip install requests -t .build/python/ && zip layer.zip .build/python/
# Then attach as a Lambda layer, or include in the source zip via:
#   pip install -r requirements.txt -t <source_dir>/vendor
# and add vendor/ to sys.path in the handler.
data "archive_file" "spend_aggregator" {
  type        = "zip"
  source_dir  = "${path.module}/../../../backend/src"
  output_path = "${path.module}/.build/spend_aggregator.zip"
}

# NOTE: In dev environments (environment="dev"), the Lambda is created without
# a dependency layer. It will fail at import time if invoked. This is acceptable
# because the EventBridge schedule is the only invoker and dev environments
# typically do not have a running LiteLLM gateway for the Lambda to query.
# For staging/prod, the validation on spend_aggregator_lambda_layers ensures
# a layer with 'requests' is supplied.
resource "aws_lambda_function" "spend_aggregator" {
  function_name = "${local.resource_prefix}-spend-aggregator"
  description   = "Spend Aggregator - pulls LiteLLM spend data, aggregates, writes to FinOps DynamoDB table every 5 minutes"
  role          = aws_iam_role.spend_aggregator_lambda.arn
  handler       = "services.spend_aggregator_handler.handler"
  runtime       = "python3.12"
  timeout       = var.spend_aggregator_timeout
  memory_size   = var.spend_aggregator_memory
  layers        = var.spend_aggregator_lambda_layers

  filename         = data.archive_file.spend_aggregator.output_path
  source_code_hash = data.archive_file.spend_aggregator.output_base64sha256

  environment {
    variables = {
      LITELLM_GATEWAY_URL = "http://${aws_lb.litellm.dns_name}:4000"
      LITELLM_MASTER_KEY  = aws_secretsmanager_secret_version.master_key.secret_string
      FINOPS_TABLE_NAME   = var.finops_table_name
      AVA_AWS_REGION      = local.region
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.spend_aggregator_lambda.id]
  }

  depends_on = [
    aws_cloudwatch_log_group.spend_aggregator,
    aws_iam_role_policy.spend_aggregator_logs,
  ]

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-spend-aggregator"
  })
}

# -----------------------------------------------------------------------------
# Security Group for Spend Aggregator Lambda
# -----------------------------------------------------------------------------
# Lambda needs outbound access to the internal ALB on port 4000 and
# to DynamoDB/CloudWatch via VPC endpoints (443).
# -----------------------------------------------------------------------------

resource "aws_security_group" "spend_aggregator_lambda" {
  name_prefix = "${local.resource_prefix}-spend-agg-lambda-"
  description = "Security group for Spend Aggregator Lambda - outbound to ALB and AWS services"
  vpc_id      = var.vpc_id

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-spend-aggregator-lambda-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "spend_aggregator_egress_alb" {
  type                     = "egress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  description              = "Allow outbound to LiteLLM ALB on port 4000"
  security_group_id        = aws_security_group.spend_aggregator_lambda.id
  source_security_group_id = aws_security_group.litellm_alb.id
}

resource "aws_security_group_rule" "spend_aggregator_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  description       = "Allow HTTPS outbound for VPC endpoints (DynamoDB, CloudWatch, Secrets Manager)"
  security_group_id = aws_security_group.spend_aggregator_lambda.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# Allow inbound from Spend Aggregator Lambda to ALB
resource "aws_security_group_rule" "alb_ingress_from_spend_aggregator" {
  type                     = "ingress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  description              = "Allow inbound from Spend Aggregator Lambda"
  security_group_id        = aws_security_group.litellm_alb.id
  source_security_group_id = aws_security_group.spend_aggregator_lambda.id
}

# -----------------------------------------------------------------------------
# EventBridge Rule - Trigger Spend Aggregator Every 5 Minutes
# -----------------------------------------------------------------------------
# The schedule is only enabled when a dependency layer is supplied. In dev
# environments with no layer (default), the rule is created but DISABLED so
# the Lambda is never invoked in a known-broken state.
# -----------------------------------------------------------------------------

locals {
  spend_aggregator_schedule_enabled = length(var.spend_aggregator_lambda_layers) > 0
}

resource "aws_cloudwatch_event_rule" "spend_aggregator_schedule" {
  name                = "${local.resource_prefix}-spend-aggregator-schedule"
  description         = "Triggers Spend Aggregator Lambda every 5 minutes to pull and aggregate LiteLLM spend data"
  schedule_expression = var.spend_aggregator_schedule
  state               = local.spend_aggregator_schedule_enabled ? "ENABLED" : "DISABLED"

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-spend-aggregator-schedule"
  })
}

resource "aws_cloudwatch_event_target" "spend_aggregator_lambda" {
  count     = local.spend_aggregator_schedule_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.spend_aggregator_schedule.name
  target_id = "SpendAggregatorLambda"
  arn       = aws_lambda_function.spend_aggregator.arn
}

# Permission for EventBridge to invoke the Lambda function
resource "aws_lambda_permission" "eventbridge_invoke_spend_aggregator" {
  count         = local.spend_aggregator_schedule_enabled ? 1 : 0
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.spend_aggregator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.spend_aggregator_schedule.arn
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "spend_aggregator_lambda_arn" {
  description = "ARN of the Spend Aggregator Lambda function"
  value       = aws_lambda_function.spend_aggregator.arn
}

output "spend_aggregator_lambda_name" {
  description = "Name of the Spend Aggregator Lambda function"
  value       = aws_lambda_function.spend_aggregator.function_name
}

output "spend_aggregator_eventbridge_rule_arn" {
  description = "ARN of the EventBridge rule that triggers the Spend Aggregator"
  value       = aws_cloudwatch_event_rule.spend_aggregator_schedule.arn
}
