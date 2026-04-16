locals {
  tag_name         = lower(var.name) == "langfuse" ? "Langfuse ${var.environment}" : "Langfuse ${var.name} ${var.environment}"
  effective_domain = coalesce(var.domain, var.name)

  common_tags = {
    Environment = var.environment
    Project     = var.name
    ManagedBy   = "terraform"
  }
}
