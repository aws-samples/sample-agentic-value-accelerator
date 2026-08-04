resource "aws_bedrockagentcore_agent_runtime" "this" {
  agent_runtime_name = "${local.agentcore_name_prefix}_runtime"
  description        = "Human-approval workflow agent runtime for ${var.project_name} (${var.environment})"
  role_arn           = aws_iam_role.runtime.arn

  agent_runtime_artifact {
    container_configuration {
      container_uri = var.container_image_uri
    }
  }

  network_configuration {
    network_mode = var.network_mode

    dynamic "network_mode_config" {
      for_each = var.network_mode == "VPC" ? [1] : []
      content {
        security_groups = var.vpc_security_group_ids
        subnets         = var.vpc_subnet_ids
      }
    }
  }

  environment_variables = var.environment_variables

  tags = var.tags
}

resource "aws_bedrockagentcore_agent_runtime_endpoint" "this" {
  name             = "${local.agentcore_name_prefix}_endpoint"
  agent_runtime_id = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
  description      = "Endpoint for ${var.project_name} human-approval workflow agent"

  tags = var.tags
}
