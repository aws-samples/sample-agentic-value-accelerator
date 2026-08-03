output "zone_id" {
  description = "Route 53 hosted zone ID. Feed this into the main Control Plane terraform as var.hosted_zone_id when wiring records from other modules."
  value       = aws_route53_zone.this.zone_id
}

output "zone_name" {
  description = "Hosted zone name (without trailing dot)."
  value       = aws_route53_zone.this.name
}

output "name_servers" {
  description = "Four AWS-assigned name servers for this zone. Give these to the parent-zone (example.com) owner so they can add a delegating NS record for `ava-demo`."
  value       = aws_route53_zone.this.name_servers
}

output "primary_name_server" {
  description = "The primary NS shown in the auto-generated SOA record."
  value       = aws_route53_zone.this.primary_name_server
}
