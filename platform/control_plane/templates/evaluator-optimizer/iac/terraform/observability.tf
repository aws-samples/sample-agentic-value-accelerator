resource "aws_cloudwatch_log_group" "runtime" {
  name              = "/aws/agentcore/${local.name_prefix}-eval-opt"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}
