variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "guardrail_name" {
  description = "Name of the Bedrock Guardrail"
  type        = string
}

variable "description" {
  description = "Description of the guardrail"
  type        = string
  default     = ""
}

variable "blocked_input_messaging" {
  description = "Message returned when the guardrail blocks a user prompt"
  type        = string
  default     = "I'm unable to process this request. It falls outside the scope of what I can assist with. Please rephrase your question to focus on market surveillance topics."
}

variable "blocked_outputs_messaging" {
  description = "Message returned when the guardrail blocks a model response"
  type        = string
  default     = "I'm unable to provide this response as it may contain content outside my permitted scope. Please try rephrasing your question."
}

variable "kms_key_arn" {
  description = "KMS key ARN for encrypting the guardrail at rest"
  type        = string
  default     = null
}

# Content filter strengths
variable "content_filter_input_strength" {
  description = "Strength for content filters on input (NONE, LOW, MEDIUM, HIGH)"
  type        = string
  default     = "HIGH"
}

variable "content_filter_output_strength" {
  description = "Strength for content filters on output (NONE, LOW, MEDIUM, HIGH)"
  type        = string
  default     = "HIGH"
}

# Denied topics
variable "denied_topics" {
  description = "List of denied topic configurations"
  type = list(object({
    name       = string
    definition = string
    examples   = optional(list(string), [])
  }))
  default = []
}

# PII entity types to block or anonymize
variable "pii_entities" {
  description = "List of PII entity configurations"
  type = list(object({
    type          = string
    input_action  = optional(string, "BLOCK")
    output_action = optional(string, "ANONYMIZE")
  }))
  default = []
}

# Custom regex patterns for sensitive data
variable "sensitive_regexes" {
  description = "Custom regex patterns for sensitive information detection"
  type = list(object({
    name        = string
    pattern     = string
    description = optional(string, "")
    action      = optional(string, "BLOCK")
  }))
  default = []
}

# Word filters
variable "blocked_words" {
  description = "List of custom words to block"
  type        = list(string)
  default     = []
}

variable "enable_profanity_filter" {
  description = "Enable managed profanity word list"
  type        = bool
  default     = true
}

# Contextual grounding
variable "enable_contextual_grounding" {
  description = "Enable contextual grounding checks to detect hallucinations"
  type        = bool
  default     = false
}

variable "grounding_threshold" {
  description = "Threshold for contextual grounding filter (0.0 to 1.0)"
  type        = number
  default     = 0.7
}

variable "relevance_threshold" {
  description = "Threshold for relevance filter (0.0 to 1.0)"
  type        = number
  default     = 0.7
}

variable "create_version" {
  description = "Whether to create a published version of the guardrail"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for the guardrail"
  type        = map(string)
  default     = {}
}
