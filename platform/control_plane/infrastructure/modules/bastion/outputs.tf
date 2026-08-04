output "instance_id" {
  description = "EC2 instance ID — use with: aws ssm start-session --target <id>"
  value       = aws_instance.bastion.id
}

output "security_group_id" {
  description = "Bastion security group ID"
  value       = aws_security_group.bastion.id
}
