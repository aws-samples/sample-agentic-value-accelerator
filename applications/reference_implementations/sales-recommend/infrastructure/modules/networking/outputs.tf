output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "ecs_subnet_ids" {
  description = "Subnet IDs for ECS tasks (public if NAT disabled, private if NAT enabled)"
  value       = var.enable_nat ? aws_subnet.private[*].id : aws_subnet.public[*].id
}

output "alb_security_group_id" {
  description = "Security group ID for the Application Load Balancer"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs.id
}

output "agent_security_group_id" {
  description = "Security group ID for Agent runtime"
  value       = aws_security_group.agent.id
}
