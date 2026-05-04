output "instance_id" {
  description = "ID of the bastion host EC2 instance"
  value       = aws_instance.bastion.id
}

output "instance_arn" {
  description = "ARN of the bastion host EC2 instance"
  value       = aws_instance.bastion.arn
}

output "private_ip" {
  description = "Private IP address of the bastion host"
  value       = aws_instance.bastion.private_ip
}

output "iam_role_arn" {
  description = "ARN of the bastion host IAM role"
  value       = aws_iam_role.bastion.arn
}

output "iam_role_name" {
  description = "Name of the bastion host IAM role"
  value       = aws_iam_role.bastion.name
}

output "security_group_id" {
  description = "Security group ID attached to the bastion host"
  value       = var.security_group_id
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch Log Group name for bastion logs"
  value       = aws_cloudwatch_log_group.bastion.name
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch Log Group ARN for bastion logs"
  value       = aws_cloudwatch_log_group.bastion.arn
}
