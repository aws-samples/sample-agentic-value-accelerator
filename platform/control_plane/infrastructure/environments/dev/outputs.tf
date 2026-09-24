# =============================================================================
# Dev Environment Outputs
# =============================================================================

output "gateway_endpoint" {
  description = "LiteLLM gateway endpoint (internal ALB URL)"
  value       = module.litellm.gateway_endpoint
}

output "config_s3_bucket" {
  description = "S3 bucket for LiteLLM config storage"
  value       = module.litellm.config_s3_bucket
}

output "backend_environment_variables" {
  description = "Environment variables for the Control Plane backend to integrate with the gateway"
  value       = module.litellm.backend_environment_variables
}

output "vpc_id" {
  description = "VPC ID created for this deployment"
  value       = aws_vpc.main.id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "master_key_secret_arn" {
  description = "Secrets Manager ARN for the LiteLLM primary key"
  value       = module.litellm.litellm_master_key_secret_arn
}


output "bastion_instance_id" {
  description = "SSM bastion instance ID — connect with: aws ssm start-session --target <id>"
  value       = module.bastion.instance_id
}

output "backend_endpoint" {
  description = "Control Plane backend API endpoint"
  value       = "http://${aws_lb.backend.dns_name}:8000"
}

output "frontend_endpoint" {
  description = "Control Plane frontend URL (public, IP-restricted)"
  value       = "http://${aws_lb.frontend.dns_name}"
}

# Where each region tier actually landed, printed after every apply.
#
# This exists because the failure it guards against produces no error to read. A
# governed-fleet region pointed at the wrong place does not fail the apply, does not fail
# the healthcheck, and does not fail the first API call - Bedrock, CloudWatch, CloudTrail and
# Service Quotas are per-region and answer 200 with the wrong region's inventory. The first
# symptom is a dashboard showing an AI estate of zero, which reads as "we have no agents"
# rather than "you are looking in the wrong region".
#
# So the resolution is stated at the one moment the deployer is still thinking about it, with
# each value labelled as chosen or inherited. `terraform output region_resolution` reprints
# it later, and scripts/deploy.sh reads it. It deliberately reports the *resolved* value
# rather than the raw variable, since the whole class of bug lives in the gap between the two.
output "region_resolution" {
  description = "Resolved region per tier, and whether each was chosen or inherited. Check governed_fleet against where your Bedrock estate really is - a wrong value here renders as an empty estate, not an error."
  value = {
    "1_control_plane" = {
      region = var.aws_region
      holds  = "AVA's own DynamoDB tables, ECS cluster, both ALBs, the VPC"
      source = "var.aws_region"
    }
    "2_governed_fleet" = {
      region = var.govern_aws_region != "" ? var.govern_aws_region : var.aws_region
      holds  = "the customer's Bedrock agents, AgentCore runtimes, guardrails, and their CloudWatch metrics"
      source = var.govern_aws_region != "" ? "var.govern_aws_region (stated explicitly)" : "INHERITED from var.aws_region - correct only if your AI estate is really in ${var.aws_region}"
    }
    "3_guardrails_table" = {
      region = var.guardrails_table_region != "" ? var.guardrails_table_region : var.aws_region
      holds  = "the guardrails DynamoDB table (fsi-control-plane-guardrails)"
      source = var.guardrails_table_region != "" ? "var.guardrails_table_region (stated explicitly)" : "INHERITED from var.aws_region - correct for a fresh deploy, since this root creates the table"
    }
  }
}
