###############################################################################
# Observability Module - CloudWatch Log Groups
###############################################################################

# NOTE: The UI log group is created by the ECS module (via name_prefix).
# This module only creates the agent log group.

resource "aws_cloudwatch_log_group" "agent" {
  name_prefix       = "/agentcore/${var.project}-agent-"
  retention_in_days = 30

  tags = {
    Name    = "${var.project}-agent-logs"
    Project = var.project
  }
}
