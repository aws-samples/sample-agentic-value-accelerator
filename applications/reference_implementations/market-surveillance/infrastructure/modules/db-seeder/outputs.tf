output "lambda_function_name" {
  description = "Name of the DB seeder Lambda. deploy.sh uses this with `aws lambda invoke`."
  value       = aws_lambda_function.seeder.function_name
}

output "lambda_arn" {
  description = "Full ARN of the DB seeder Lambda."
  value       = aws_lambda_function.seeder.arn
}

output "log_group_name" {
  description = "CloudWatch log group for the seeder Lambda."
  value       = aws_cloudwatch_log_group.seeder.name
}
