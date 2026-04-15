output "api_id" {
  description = "The ID of the REST API"
  value       = aws_api_gateway_rest_api.this.id
}

output "api_arn" {
  description = "The ARN of the REST API"
  value       = aws_api_gateway_rest_api.this.arn
}

output "api_endpoint" {
  description = "The invoke URL for the API"
  value       = aws_api_gateway_stage.this.invoke_url
}

output "api_domain" {
  description = "The domain name of the API (for CloudFront origin)"
  value       = "${aws_api_gateway_rest_api.this.id}.execute-api.${data.aws_region.current.region}.amazonaws.com"
}

output "stage_name" {
  description = "The name of the API stage"
  value       = aws_api_gateway_stage.this.stage_name
}

output "execution_arn" {
  description = "The execution ARN of the API"
  value       = aws_api_gateway_rest_api.this.execution_arn
}

output "stage_arn" {
  description = "Arn of API Stage"
  value = aws_api_gateway_stage.this.arn
}

data "aws_region" "current" {}
