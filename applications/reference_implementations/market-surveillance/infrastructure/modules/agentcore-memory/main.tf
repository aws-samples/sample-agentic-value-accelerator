# AgentCore Memory - Managed service for conversation history
# Storage is automatically managed by AWS

resource "aws_bedrockagentcore_memory" "this" {
  name                  = replace("${var.memory_name}_${var.environment}", "-", "_")
  description           = var.description
  event_expiry_duration = var.event_expiry_duration

  tags = {
    Name        = "${var.memory_name}-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# Semantic Memory Strategy - Extracts and stores facts about trades, alerts, and investigations
resource "aws_bedrockagentcore_memory_strategy" "semantic" {
  count = var.enable_semantic_memory ? 1 : 0

  name        = "MarketSurveillanceFacts"
  memory_id   = aws_bedrockagentcore_memory.this.id
  type        = "SEMANTIC"
  description = "Semantic understanding of market surveillance data, alerts, and investigation context"
  namespaces  = ["default"]
}

# User Preferences Strategy - Tracks user preferences and interaction patterns
#
# depends_on chains the three memory strategies so Terraform issues
# UpdateMemory serially. AgentCore Control's UpdateMemory rejects
# concurrent calls with `Memory is in transitional state UPDATING.`
# (CloudTrail: 2026-08-09T00:01:12Z, three parallel calls, all three
# ValidationException). Serializing is the documented workaround.
resource "aws_bedrockagentcore_memory_strategy" "user_preferences" {
  count = var.enable_user_preferences ? 1 : 0

  name        = "UserPreferences"
  memory_id   = aws_bedrockagentcore_memory.this.id
  type        = "USER_PREFERENCE"
  description = "User preferences for alert filtering, display settings, and investigation workflows"
  namespaces  = ["preferences"]

  depends_on = [aws_bedrockagentcore_memory_strategy.semantic]
}

# Summarization Strategy - Creates summaries of long conversations and investigations
resource "aws_bedrockagentcore_memory_strategy" "summarization" {
  count = var.enable_summarization ? 1 : 0

  name        = "InvestigationSummaries"
  memory_id   = aws_bedrockagentcore_memory.this.id
  type        = "SUMMARIZATION"
  description = "Summarizes investigation conversations and findings"
  namespaces  = ["{sessionId}"]

  depends_on = [aws_bedrockagentcore_memory_strategy.user_preferences]
}
