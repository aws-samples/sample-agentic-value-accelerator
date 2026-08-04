# -----------------------------------------------------------------------------
# AgentCore Memory
# -----------------------------------------------------------------------------

resource "aws_bedrockagentcore_memory" "this" {
  name                       = "${local.agentcore_name_prefix}_memory"
  description                = "Agent memory store for ${var.project_name} (${var.environment})"
  event_expiry_duration      = var.event_expiry_duration
  memory_execution_role_arn  = aws_iam_role.memory.arn

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Memory Strategy
# -----------------------------------------------------------------------------

resource "aws_bedrockagentcore_memory_strategy" "this" {
  name       = "${local.agentcore_name_prefix}_strategy"
  memory_id  = aws_bedrockagentcore_memory.this.id
  type       = var.memory_strategy_type
  namespaces = toset(var.namespaces)
  description = "${var.memory_strategy_type} strategy for ${var.project_name}"
}
