variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "repository_name" {
  description = "Name of the CodeCommit repository"
  type        = string
}

variable "repository_description" {
  description = "Description of the CodeCommit repository"
  type        = string
  default     = "AVA Control Plane CI/CD Repository"
}

variable "event_bus_name" {
  description = "EventBridge event bus name for deployment events"
  type        = string
}

variable "step_functions_arn" {
  description = "Step Functions state machine ARN for deployment pipeline"
  type        = string
}

variable "eventbridge_role_arn" {
  description = "IAM role ARN for EventBridge to invoke Step Functions"
  type        = string
}

variable "enable_push_trigger" {
  description = "Enable automatic deployment on git push"
  type        = bool
  default     = true
}

variable "enable_pr_trigger" {
  description = "Enable automatic deployment on pull request merge"
  type        = bool
  default     = true
}

variable "trigger_branches" {
  description = "List of branch names that trigger deployments"
  type        = list(string)
  default     = ["main", "develop"]
}

variable "enable_notifications" {
  description = "Enable SNS notifications for CodeCommit events"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
