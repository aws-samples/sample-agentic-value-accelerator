# -----------------------------------------------------------------------------
# Bedrock Guardrail
# -----------------------------------------------------------------------------

resource "aws_bedrock_guardrail" "this" {
  name                      = "${local.name_prefix}-guardrail"
  description               = "Bedrock Guardrail for ${var.project_name} (${var.environment})"
  blocked_input_messaging   = var.blocked_input_messaging
  blocked_outputs_messaging = var.blocked_outputs_messaging

  # --- Content Filters ---
  content_policy_config {
    dynamic "filters_config" {
      for_each = var.content_filters
      content {
        type            = filters_config.value.type
        input_strength  = filters_config.value.input_strength
        output_strength = filters_config.value.output_strength
      }
    }
  }

  # --- PII Protection ---
  dynamic "sensitive_information_policy_config" {
    for_each = length(var.pii_entities) > 0 ? [1] : []
    content {
      dynamic "pii_entities_config" {
        for_each = var.pii_entities
        content {
          type   = pii_entities_config.value.type
          action = pii_entities_config.value.action
        }
      }
    }
  }

  # --- Topic Denial ---
  dynamic "topic_policy_config" {
    for_each = length(var.denied_topics) > 0 ? [1] : []
    content {
      dynamic "topics_config" {
        for_each = var.denied_topics
        content {
          name       = topics_config.value.name
          definition = topics_config.value.definition
          examples   = topics_config.value.examples
          type       = "DENY"
        }
      }
    }
  }

  # --- Word Policy (Profanity) ---
  dynamic "word_policy_config" {
    for_each = var.enable_profanity_filter ? [1] : []
    content {
      managed_word_lists_config {
        type = "PROFANITY"
      }
    }
  }

  # --- Contextual Grounding (hallucination prevention) ---
  dynamic "contextual_grounding_policy_config" {
    for_each = var.grounding_threshold > 0 ? [1] : []
    content {
      filters_config {
        type      = "GROUNDING"
        threshold = var.grounding_threshold
      }
      filters_config {
        type      = "RELEVANCE"
        threshold = var.relevance_threshold
      }
    }
  }

  tags = local.default_tags
}

# -----------------------------------------------------------------------------
# Bedrock Guardrail Version
# -----------------------------------------------------------------------------

resource "aws_bedrock_guardrail_version" "this" {
  guardrail_arn = aws_bedrock_guardrail.this.guardrail_arn
  description   = "Version for ${local.name_prefix}"
  skip_destroy  = true
}
