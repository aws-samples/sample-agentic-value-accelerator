output "web_acl_arn" {
  description = "ARN of the Bot Control Web ACL — pass this to the CloudFront distribution."
  value       = aws_wafv2_web_acl.bot_control.arn
}

output "web_acl_id" {
  description = "ID of the Bot Control Web ACL."
  value       = aws_wafv2_web_acl.bot_control.id
}
