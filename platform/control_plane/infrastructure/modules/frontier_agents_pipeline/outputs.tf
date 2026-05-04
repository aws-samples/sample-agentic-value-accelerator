output "state_machine_arn" {
  description = "ARN of the Frontier Agents Step Functions state machine."
  value       = aws_sfn_state_machine.deployment.arn
}

output "state_machine_name" {
  description = "Name of the Frontier Agents Step Functions state machine."
  value       = aws_sfn_state_machine.deployment.name
}

output "codebuild_project_name" {
  description = "Name of the Frontier Agents CodeBuild project."
  value       = aws_codebuild_project.deploy.name
}

output "codebuild_project_arn" {
  description = "ARN of the Frontier Agents CodeBuild project."
  value       = aws_codebuild_project.deploy.arn
}

output "codebuild_log_group_name" {
  description = "CloudWatch log group for the Frontier Agents CodeBuild project."
  value       = aws_cloudwatch_log_group.codebuild.name
}
