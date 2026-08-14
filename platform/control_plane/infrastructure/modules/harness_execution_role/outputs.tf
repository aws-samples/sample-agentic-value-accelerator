output "role_arn" {
  description = "ARN of the harness execution role."
  value       = aws_iam_role.harness.arn
}

output "role_name" {
  description = "Name of the harness execution role."
  value       = aws_iam_role.harness.name
}
