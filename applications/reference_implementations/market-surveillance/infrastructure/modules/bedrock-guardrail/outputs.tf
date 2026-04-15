output "guardrail_id" {
  description = "ID of the Bedrock Guardrail"
  value       = aws_bedrock_guardrail.this.guardrail_id
}

output "guardrail_arn" {
  description = "ARN of the Bedrock Guardrail"
  value       = aws_bedrock_guardrail.this.guardrail_arn
}

output "guardrail_version" {
  description = "Published version of the guardrail (or DRAFT if versioning disabled)"
  value       = var.create_version ? aws_bedrock_guardrail_version.this[0].version : "DRAFT"
}

output "guardrail_name" {
  description = "Name of the Bedrock Guardrail"
  value       = aws_bedrock_guardrail.this.name
}

output "guardrail_status" {
  description = "Status of the Bedrock Guardrail"
  value       = aws_bedrock_guardrail.this.status
}
