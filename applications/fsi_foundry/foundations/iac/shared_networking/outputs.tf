output "vpc_id" {
  description = "ID of the shared VPC"
  value       = aws_vpc.main.id
}

output "vpc_name" {
  description = "Name tag of the shared VPC"
  value       = local.vpc_name
}

output "vpc_cidr" {
  description = "CIDR block of the shared VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of public subnets (for ALBs, NAT gateways)"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "IDs of private app subnets (for EC2, ECS, Lambda)"
  value       = aws_subnet.private_app[*].id
}

output "private_data_subnet_ids" {
  description = "IDs of private data subnets (for RDS, ElastiCache)"
  value       = aws_subnet.private_data[*].id
}

output "availability_zones" {
  description = "Availability zones used by subnets"
  value       = local.availability_zones
}

output "nat_gateway_ids" {
  description = "IDs of NAT gateways (if enabled)"
  value       = var.enable_nat_gateway ? aws_nat_gateway.main[*].id : []
}

# ============================================================================
# Instructions for Use Cases
# ============================================================================

output "usage_instructions" {
  description = "Instructions for using this VPC in use case deployments"
  value       = <<-EOT

    ============================================
    Shared VPC Deployed Successfully!
    ============================================

    VPC Details:
    - VPC ID: ${aws_vpc.main.id}
    - VPC Name: ${local.vpc_name}
    - CIDR Block: ${aws_vpc.main.cidr_block}
    - Region: ${var.aws_region}
    - Environment: ${var.environment}

    Subnets:
    - Public Subnets: ${join(", ", aws_subnet.public[*].id)}
    - Private App Subnets: ${join(", ", aws_subnet.private_app[*].id)}
    - Private Data Subnets: ${join(", ", aws_subnet.private_data[*].id)}

    To use this VPC in your use case deployments:

    1. For EC2 deployments, set these Terraform variables:
       -var="create_vpc=false"
       -var="vpc_id=${aws_vpc.main.id}"
       -var="subnet_ids=${jsonencode(aws_subnet.public[*].id)}"

    2. Or use VPC name lookup (recommended):
       -var="create_vpc=false"
       -var="vpc_name_tag=${local.vpc_name}"

    3. In deployment scripts, set:
       export VPC_ID=${aws_vpc.main.id}
       export SUBNET_IDS="${join(",", aws_subnet.public[*].id)}"

    Example deployment:
    cd applications/fsi_foundry/foundations/iac/ec2
    terraform apply \
      -var="create_vpc=false" \
      -var="vpc_name_tag=${local.vpc_name}" \
      -var="use_case_id=agentic_payments" \
      -var="framework=langchain_langgraph"

    Benefits:
    - All use cases share this VPC (no VPC quota issues)
    - Security group isolation between use cases
    - Reduced costs (single NAT gateway if enabled)
    - Centralized network management

  EOT
}
