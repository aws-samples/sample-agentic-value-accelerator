output "web_acl_id" {
  description = "The ID of the WAF Web ACL"
  value       = aws_wafv2_web_acl.this.id
}

output "web_acl_arn" {
  description = "The ARN of the WAF Web ACL"
  value       = aws_wafv2_web_acl.this.arn
}

output "web_acl_capacity" {
  description = "The capacity units used by the Web ACL"
  value       = aws_wafv2_web_acl.this.capacity
}

output "log_group_arn" {
  description = "The ARN of the CloudWatch Log Group for WAF logs"
  value       = aws_cloudwatch_log_group.waf.arn
}
