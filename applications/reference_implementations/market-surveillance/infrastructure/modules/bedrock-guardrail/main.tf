locals {
  # Content filter categories that support both input and output
  content_filter_types = ["HATE", "INSULTS", "SEXUAL", "VIOLENCE", "MISCONDUCT"]

  tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

resource "aws_bedrock_guardrail" "this" {
  name                      = "${var.guardrail_name}-${var.environment}"
  description               = var.description != "" ? var.description : "Bedrock Guardrail for ${var.guardrail_name} (${var.environment})"
  blocked_input_messaging   = var.blocked_input_messaging
  blocked_outputs_messaging = var.blocked_outputs_messaging
  kms_key_arn               = var.kms_key_arn

  # Content filters for harmful content categories
  content_policy_config {
    dynamic "filters_config" {
      for_each = local.content_filter_types
      content {
        type            = filters_config.value
        input_strength  = var.content_filter_input_strength
        output_strength = var.content_filter_output_strength
      }
    }

    # PROMPT_ATTACK is input-only — output_strength must be NONE
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = var.content_filter_input_strength
      output_strength = "NONE"
    }
  }

  # Denied topics
  dynamic "topic_policy_config" {
    for_each = length(var.denied_topics) > 0 ? [1] : []
    content {
      dynamic "topics_config" {
        for_each = var.denied_topics
        content {
          name       = topics_config.value.name
          definition = topics_config.value.definition
          type       = "DENY"
          examples   = topics_config.value.examples
        }
      }
    }
  }

  # Sensitive information policy (PII + custom regex)
  # dynamic "sensitive_information_policy_config" {
  #   for_each = length(var.pii_entities) > 0 || length(var.sensitive_regexes) > 0 ? [1] : []
  #   content {
  #     dynamic "pii_entities_config" {
  #       for_each = var.pii_entities
  #       content {
  #         type           = pii_entities_config.value.type
  #         action         = pii_entities_config.value.input_action
  #         input_action   = pii_entities_config.value.input_action
  #         output_action  = pii_entities_config.value.output_action
  #         input_enabled  = true
  #         output_enabled = true
  #       }
  #     }

  #     dynamic "regexes_config" {
  #       for_each = var.sensitive_regexes
  #       content {
  #         name          = regexes_config.value.name
  #         pattern       = regexes_config.value.pattern
  #         description   = regexes_config.value.description
  #         action        = regexes_config.value.action
  #         input_action  = regexes_config.value.action
  #         output_action = regexes_config.value.action
  #         input_enabled = true
  #         output_enabled = true
  #       }
  #     }
  #   }
  # }

  # Word filters
  # dynamic "word_policy_config" {
  #   for_each = var.enable_profanity_filter || length(var.blocked_words) > 0 ? [1] : []
  #   content {
  #     dynamic "managed_word_lists_config" {
  #       for_each = var.enable_profanity_filter ? [1] : []
  #       content {
  #         type = "PROFANITY"
  #       }
  #     }

  #     dynamic "words_config" {
  #       for_each = var.blocked_words
  #       content {
  #         text = words_config.value
  #       }
  #     }
  #   }
  # }

  # Contextual grounding checks
  # dynamic "contextual_grounding_policy_config" {
  #   for_each = var.enable_contextual_grounding ? [1] : []
  #   content {
  #     filters_config {
  #       type      = "GROUNDING"
  #       threshold = var.grounding_threshold
  #     }
  #     filters_config {
  #       type      = "RELEVANCE"
  #       threshold = var.relevance_threshold
  #     }
  #   }
  # }

  tags = local.tags
}

# Publish a version so it can be referenced by guardrail ID + version
resource "aws_bedrock_guardrail_version" "this" {
  count = var.create_version ? 1 : 0

  guardrail_arn = aws_bedrock_guardrail.this.guardrail_arn
  description   = "Published version for ${var.environment}"
  skip_destroy  = true
}
