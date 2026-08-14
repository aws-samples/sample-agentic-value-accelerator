variable "name_prefix" {
  type        = string
  description = "Shared control-plane resource prefix (e.g. ava-cp-dev-982569)"
}

variable "registry_name" {
  type        = string
  description = "Registry name. Must start with letter/digit. Allowed: a-z A-Z 0-9 _ - . / (<=64 chars)."
  default     = "AVA"
}

variable "registry_description" {
  type    = string
  default = "AVA control-plane registry — publishes MCP servers, A2A agents, harnesses, and other managed AVA resources for cross-team discovery. Records require manual approval via the AVA Approval Queue."
}

variable "auto_approve" {
  type        = bool
  description = "If true, records are immediately searchable without curator review. Off by default — records flow through the AVA Approval Queue (Operate)."
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
