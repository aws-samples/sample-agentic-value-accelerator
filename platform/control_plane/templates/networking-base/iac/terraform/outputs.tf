output "vpc_id" {
  description = "VPC identifier"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = join(",", aws_subnet.public[*].id)
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = join(",", aws_subnet.private[*].id)
}

output "security_group_id" {
  description = "Default security group ID"
  value       = aws_security_group.default.id
}

output "tfvars_files" {
  description = "Paths to the generated network.auto.tfvars.json files in observability-stack directories"
  value       = [for f in local_file.network_tfvars : f.filename]
}
