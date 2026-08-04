# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-30 characters, lowercase alphanumeric and hyphens, starting with a letter."
  }
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
}

# -----------------------------------------------------------------------------
# Optional Variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "blocked_input_messaging" {
  description = "Message returned when input is blocked by the guardrail"
  type        = string
  default     = "I can't process this request due to content policy."
}

variable "blocked_outputs_messaging" {
  description = "Message returned when output is blocked by the guardrail"
  type        = string
  default     = "I can't provide this response due to content policy."
}

variable "content_filters" {
  description = "Content filter configuration with type and input/output strengths"
  type = list(object({
    type            = string
    input_strength  = string
    output_strength = string
  }))
  default = [
    { type = "SEXUAL", input_strength = "MEDIUM", output_strength = "MEDIUM" },
    { type = "VIOLENCE", input_strength = "MEDIUM", output_strength = "MEDIUM" },
    { type = "HATE", input_strength = "MEDIUM", output_strength = "MEDIUM" },
    { type = "INSULTS", input_strength = "MEDIUM", output_strength = "MEDIUM" },
    { type = "MISCONDUCT", input_strength = "MEDIUM", output_strength = "MEDIUM" },
    { type = "PROMPT_ATTACK", input_strength = "MEDIUM", output_strength = "NONE" }
  ]
}

variable "pii_entities" {
  description = "PII entity types and actions (BLOCK or ANONYMIZE)"
  type = list(object({
    type   = string
    action = string
  }))
  default = [
    { type = "EMAIL", action = "ANONYMIZE" },
    { type = "PHONE", action = "ANONYMIZE" },
    { type = "CREDIT_DEBIT_CARD_NUMBER", action = "ANONYMIZE" }
  ]
}

variable "denied_topics" {
  description = "Topics to deny with name, definition, and examples"
  type = list(object({
    name       = string
    definition = string
    examples   = list(string)
  }))
  default = []
}

variable "enable_profanity_filter" {
  description = "Enable AWS managed profanity word list"
  type        = bool
  default     = true
}

variable "grounding_threshold" {
  description = "Contextual grounding threshold (0.0-0.99). Set to 0 to disable. Blocks responses not grounded in source documents."
  type        = number
  default     = 0.75
}

variable "relevance_threshold" {
  description = "Relevance threshold (0.0-0.99). Blocks responses not relevant to the user query."
  type        = number
  default     = 0.7
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
