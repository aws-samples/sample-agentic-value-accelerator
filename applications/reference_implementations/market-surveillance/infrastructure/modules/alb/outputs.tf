output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.webapp.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.webapp.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.webapp.zone_id
}

output "alb_id" {
  description = "ID of the Application Load Balancer"
  value       = aws_lb.webapp.id
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.webapp.arn
}

output "target_group_name" {
  description = "Name of the target group"
  value       = aws_lb_target_group.webapp.name
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener (null if HTTPS not enabled)"
  value       = length(aws_lb_listener.https) > 0 ? aws_lb_listener.https[0].arn : null
}

output "http_listener_arn" {
  description = "ARN of the HTTP listener"
  value       = aws_lb_listener.http.arn
}

output "https_enabled" {
  description = "Whether HTTPS is enabled on the ALB"
  value       = length(aws_lb_listener.https) > 0
}
