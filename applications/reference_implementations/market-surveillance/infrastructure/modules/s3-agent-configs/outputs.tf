output "bucket_id" {
  description = "The ID of the agent configs S3 bucket"
  value       = aws_s3_bucket.agent_configs.id
}

output "bucket_arn" {
  description = "The ARN of the agent configs S3 bucket"
  value       = aws_s3_bucket.agent_configs.arn
}

output "bucket_name" {
  description = "The name of the agent configs S3 bucket"
  value       = aws_s3_bucket.agent_configs.bucket
}

output "schema_config_key" {
  description = "The S3 key for the schema config file"
  value       = aws_s3_object.schema_config.key
}

output "schema_config_version_id" {
  description = "The version ID of the schema config file"
  value       = aws_s3_object.schema_config.version_id
}

output "orchestrator_config_key" {
  description = "The S3 key for the orchestrator config file"
  value       = aws_s3_object.orchestrator_config.key
}

output "rule_definition_config_key" {
  description = "The S3 key for the rule definition config file"
  value       = aws_s3_object.rule_definition_config.key
}

output "analyst_metrics_config_key" {
  description = "The S3 key for the analyst metrics config file"
  value       = aws_s3_object.analyst_metrics_config.key
}

output "output_schema_config_key" {
  description = "The S3 key for the output schema config file"
  value       = aws_s3_object.output_schema_config.key
}

output "output_schema_config_version_id" {
  description = "The version ID of the output schema config file"
  value       = aws_s3_object.output_schema_config.version_id
}

output "msp_schema_config_key" {
  description = "The S3 key for the Risk Analyst schema config file"
  value       = aws_s3_object.msp_schema_config.key
}

output "msp_schema_config_version_id" {
  description = "The version ID of the Risk Analyst schema config file"
  value       = aws_s3_object.msp_schema_config.version_id
}

output "config_keys" {
  description = "Map of all config file S3 keys"
  value = {
    schema_config               = aws_s3_object.schema_config.key
    orchestrator_config         = aws_s3_object.orchestrator_config.key
    rule_definition_config = aws_s3_object.rule_definition_config.key
    analyst_metrics_config = aws_s3_object.analyst_metrics_config.key
    output_schema_config        = aws_s3_object.output_schema_config.key
    msp_schema_config           = aws_s3_object.msp_schema_config.key
  }
}
