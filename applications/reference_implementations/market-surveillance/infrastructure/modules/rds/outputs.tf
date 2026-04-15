output "db_endpoint" {
  description = "The endpoint of the Aurora cluster"
  value       = aws_rds_cluster.this.endpoint
}

output "db_reader_endpoint" {
  description = "The reader endpoint of the Aurora cluster"
  value       = aws_rds_cluster.this.reader_endpoint
}

output "db_address" {
  description = "The hostname of the Aurora cluster"
  value       = aws_rds_cluster.this.endpoint
}

output "db_port" {
  description = "The port of the Aurora cluster"
  value       = aws_rds_cluster.this.port
}

output "db_name" {
  description = "The name of the database"
  value       = aws_rds_cluster.this.database_name
}

output "db_arn" {
  description = "The ARN of the Aurora cluster"
  value       = aws_rds_cluster.this.arn
}

output "db_identifier" {
  description = "The identifier of the Aurora cluster"
  value       = aws_rds_cluster.this.cluster_identifier
}

output "db_cluster_resource_id" {
  description = "The resource ID of the Aurora cluster"
  value       = aws_rds_cluster.this.cluster_resource_id
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "db_secret_name" {
  description = "Name of the Secrets Manager secret containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.name
}
