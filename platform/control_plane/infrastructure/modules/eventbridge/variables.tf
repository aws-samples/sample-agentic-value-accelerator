variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "bus_name" {
  description = "EventBridge event bus name"
  type        = string
  default     = "fsi-deployment-events"
}

variable "step_functions_arn" {
  description = "Step Functions state machine ARN for event routing"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
