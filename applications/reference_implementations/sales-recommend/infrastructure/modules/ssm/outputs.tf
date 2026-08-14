output "auth_username" {
  description = "Current value of the auth username parameter"
  value       = data.aws_ssm_parameter.auth_username.value
}

output "auth_password" {
  description = "Current value of the auth password parameter (decrypted)"
  value       = data.aws_ssm_parameter.auth_password.value
  sensitive   = true
}
