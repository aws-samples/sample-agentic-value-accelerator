# Networking Base (Foundation)

Foundation template providing VPC, private subnets, and security groups.

## Outputs
- `vpc_id` — VPC identifier
- `private_subnet_ids` — Comma-separated private subnet IDs
- `security_group_id` — Default security group ID

## Usage
Deploy this foundation first, then reference it as a dependency in use case templates.
