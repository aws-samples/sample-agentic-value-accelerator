output "agentcore_runtime_id" {
  description = "ID of the AgentCore Runtime"
  value       = aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeId"]
}

output "agentcore_runtime_arn" {
  description = "ARN of the AgentCore Runtime"
  value       = aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeArn"]
}

output "agentcore_runtime_name" {
  description = "Name of the AgentCore Runtime"
  value       = aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeName"]
}

output "use_case_id" {
  description = "Use case identifier"
  value       = var.use_case_id
}

output "agent_name" {
  description = "AgentCore agent name (derived or explicit)"
  value       = local.agent_name
}

output "resource_prefix" {
  description = "Resource naming prefix (pattern: {project_name}-{use_case_id})"
  value       = local.resource_prefix
}

output "workspace_name" {
  description = "Terraform workspace name"
  value       = local.workspace_name
}

output "guardrail_id" {
  description = "Bedrock Guardrail ID attached to this deployment"
  value       = var.guardrail_id
}

output "guardrail_version" {
  description = "Bedrock Guardrail version"
  value       = var.guardrail_version
}

output "agentcore_observability_enabled" {
  description = "Whether AgentCore CloudWatch/X-Ray observability is wired for this runtime"
  value       = var.enable_agentcore_observability
}

output "agentcore_log_group_name" {
  description = "CloudWatch log group receiving AgentCore APPLICATION_LOGS for this runtime"
  value       = var.enable_agentcore_observability ? aws_cloudwatch_log_group.agentcore_runtime[0].name : ""
}

output "agentcore_observability_console_url" {
  description = "Deep link to the Bedrock AgentCore agents view in CloudWatch GenAI Observability"
  value       = var.enable_agentcore_observability ? "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#/gen-ai-observability/agent-core/agents" : ""
}

output "fleet_dashboard_url" {
  description = "Deep link to the AVA AgentCore fleet CloudWatch dashboard"
  value       = var.create_fleet_dashboard ? "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.fleet[0].dashboard_name}" : ""
}

output "deployment_instructions" {
  description = "Instructions for testing the agent"
  value       = <<-EOT
    
    ============================================
    AgentCore Runtime Deployment Complete!
    ============================================
    
    Use Case: ${var.use_case_id}
    Workspace: ${local.workspace_name}
    Runtime Name: ${aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeName"]}
    Runtime ID: ${aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeId"]}
    Runtime ARN: ${aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeArn"]}
    
    Test the agent:
    1. Using AWS CLI:
       aws bedrock-agentcore invoke-agent-runtime \
         --agent-runtime-id ${aws_cloudformation_stack.agentcore_runtime.outputs["AgentRuntimeId"]} \
         --input-text '{"customer_id": "CUST001", "assessment_type": "full"}' \
         --region ${data.terraform_remote_state.infra.outputs.aws_region}
    
    2. Using the test script:
       USE_CASE_ID=${var.use_case_id} ./scripts/test/test_agentcore.sh
    
  EOT
}
