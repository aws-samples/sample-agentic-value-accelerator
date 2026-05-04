variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "alert_mcp_lambda_arn" {
  description = "Lambda ARN for Alert MCP (MCP-compatible Lambda for gateway)"
  type        = string
}
