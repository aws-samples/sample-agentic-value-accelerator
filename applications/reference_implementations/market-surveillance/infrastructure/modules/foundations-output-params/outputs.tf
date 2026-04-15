output "parameter_arns" {
  description = "Merged map of all parameter ARNs (key = parameter key)"
  value = merge(
    { for k, v in aws_ssm_parameter.string : k => v.arn },
    { for k, v in aws_ssm_parameter.secure_string : k => v.arn },
    { for k, v in aws_ssm_parameter.string_list : k => v.arn },
  )
}

output "parameter_names" {
  description = "Merged map of all parameter names (key = parameter key)"
  value = merge(
    { for k, v in aws_ssm_parameter.string : k => v.name },
    { for k, v in aws_ssm_parameter.secure_string : k => v.name },
    { for k, v in aws_ssm_parameter.string_list : k => v.name },
  )
}
