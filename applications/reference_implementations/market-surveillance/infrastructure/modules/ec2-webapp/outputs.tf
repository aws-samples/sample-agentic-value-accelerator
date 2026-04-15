output "autoscaling_group_id" {
  description = "ID of the Auto Scaling Group"
  value       = aws_autoscaling_group.webapp.id
}

output "autoscaling_group_name" {
  description = "Name of the Auto Scaling Group"
  value       = aws_autoscaling_group.webapp.name
}

output "autoscaling_group_arn" {
  description = "ARN of the Auto Scaling Group"
  value       = aws_autoscaling_group.webapp.arn
}

output "launch_template_id" {
  description = "ID of the Launch Template"
  value       = aws_launch_template.webapp.id
}

output "launch_template_latest_version" {
  description = "Latest version of the Launch Template"
  value       = aws_launch_template.webapp.latest_version
}

output "iam_role_arn" {
  description = "ARN of the IAM role for EC2 instances"
  value       = aws_iam_role.webapp_ec2.arn
}

output "iam_role_name" {
  description = "Name of the IAM role for EC2 instances"
  value       = aws_iam_role.webapp_ec2.name
}

output "instance_profile_arn" {
  description = "ARN of the IAM instance profile"
  value       = aws_iam_instance_profile.webapp_ec2.arn
}

output "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.webapp.name
}
