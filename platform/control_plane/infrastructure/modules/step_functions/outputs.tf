output "state_machine_arn" {
  description = "Step Functions state machine ARN"
  value       = aws_sfn_state_machine.deployment.arn
}

output "state_machine_name" {
  description = "Step Functions state machine name"
  value       = aws_sfn_state_machine.deployment.name
}

output "state_machine_id" {
  description = "Step Functions state machine ID"
  value       = aws_sfn_state_machine.deployment.id
}

output "execution_role_arn" {
  description = "Step Functions execution role ARN"
  value       = aws_iam_role.step_functions.arn
}
