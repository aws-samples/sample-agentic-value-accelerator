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
