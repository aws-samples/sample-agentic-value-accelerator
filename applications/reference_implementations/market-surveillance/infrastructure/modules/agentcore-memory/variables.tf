variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "memory_name" {
  description = "Name of the AgentCore Memory"
  type        = string
  default     = "market-surveillance-memory"
}

variable "description" {
  description = "Description of the memory"
  type        = string
  default     = "Memory for Market Surveillance Agent conversations"
}

variable "event_expiry_duration" {
  description = "Number of days after which memory events expire. Must be between 7 and 365 days"
  type        = number
  default     = 7 # 7 days minimum
  validation {
    condition     = var.event_expiry_duration >= 7 && var.event_expiry_duration <= 365
    error_message = "Event expiry duration must be between 7 and 365 days"
  }
}

variable "enable_semantic_memory" {
  description = "Enable semantic memory strategy for extracting facts and contextual knowledge about trades and alerts"
  type        = bool
  default     = true
}

variable "enable_user_preferences" {
  description = "Enable user preferences memory strategy for capturing user choices and preferences"
  type        = bool
  default     = false
}

variable "enable_summarization" {
  description = "Enable summarization strategy for creating conversation and investigation summaries"
  type        = bool
  default     = false
}
