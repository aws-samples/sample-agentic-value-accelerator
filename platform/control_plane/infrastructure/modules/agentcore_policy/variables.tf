variable "name_prefix" {
  description = "Prefix for resource naming"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
