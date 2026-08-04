resource "aws_cloudwatch_log_group" "runtime" {
  name              = "/aws/vendedlogs/bedrock-agentcore/${aws_bedrockagentcore_agent_runtime.this.agent_runtime_id}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# APPLICATION_LOGS Delivery Pipeline
resource "aws_cloudwatch_log_delivery_source" "logs" {
  name         = "${local.name_prefix}-logs-source"
  log_type     = "APPLICATION_LOGS"
  resource_arn = aws_bedrockagentcore_agent_runtime.this.agent_runtime_arn

  tags = var.tags
}

resource "aws_cloudwatch_log_delivery_destination" "logs" {
  name = "${local.name_prefix}-logs-destination"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.runtime.arn
  }

  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.runtime]
}

resource "aws_cloudwatch_log_delivery" "logs" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.logs.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.logs.arn

  tags = var.tags

  depends_on = [
    aws_cloudwatch_log_delivery_source.logs,
    aws_cloudwatch_log_delivery_destination.logs
  ]
}

# TRACES Delivery Pipeline
resource "aws_cloudwatch_log_delivery_source" "traces" {
  name         = "${local.name_prefix}-traces-source"
  log_type     = "TRACES"
  resource_arn = aws_bedrockagentcore_agent_runtime.this.agent_runtime_arn

  tags = var.tags
}

resource "aws_cloudwatch_log_delivery_destination" "traces" {
  name                      = "${local.name_prefix}-traces-destination"
  delivery_destination_type = "XRAY"

  tags = var.tags
}

resource "aws_cloudwatch_log_delivery" "traces" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.traces.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.traces.arn

  tags = var.tags

  depends_on = [
    aws_cloudwatch_log_delivery_source.traces,
    aws_cloudwatch_log_delivery_destination.traces
  ]
}
