# ============================================================================
# EventBridge Event Bus
# ============================================================================

resource "aws_cloudwatch_event_bus" "deployment" {
  name = var.bus_name

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-${var.bus_name}"
  })
}

# ============================================================================
# SQS Dead-Letter Queue for Failed Deliveries
# ============================================================================

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-eventbridge-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-eventbridge-dlq"
  })
}

resource "aws_sqs_queue_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.dlq.arn
      }
    ]
  })
}

# ============================================================================
# IAM Role for EventBridge to invoke Step Functions
# ============================================================================

resource "aws_iam_role" "eventbridge" {
  name = "${var.name_prefix}-eventbridge-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "eventbridge_sfn" {
  name = "step-functions-invoke"
  role = aws_iam_role.eventbridge.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "states:StartExecution"
        Resource = var.step_functions_arn
      }
    ]
  })
}

# ============================================================================
# EventBridge Rule: Route template job incoming events to Step Functions
# ============================================================================

resource "aws_cloudwatch_event_rule" "template_job_incoming" {
  name           = "${var.name_prefix}-template-job-incoming"
  description    = "Routes template job incoming events to the deployment pipeline"
  event_bus_name = aws_cloudwatch_event_bus.deployment.name

  event_pattern = jsonencode({
    source      = ["fsi.control-plane"]
    detail-type = [{ "suffix" = "_request" }]
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-template-job-incoming"
  })
}

resource "aws_cloudwatch_event_target" "step_functions" {
  rule           = aws_cloudwatch_event_rule.template_job_incoming.name
  event_bus_name = aws_cloudwatch_event_bus.deployment.name
  target_id      = "step-functions-pipeline"
  arn            = var.step_functions_arn
  role_arn       = aws_iam_role.eventbridge.arn

  dead_letter_config {
    arn = aws_sqs_queue.dlq.arn
  }
}