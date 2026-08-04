# -----------------------------------------------------------------------------
# AgentCore Runtime
# -----------------------------------------------------------------------------

resource "aws_bedrockagentcore_agent_runtime" "this" {
  agent_runtime_name = "${local.agentcore_name_prefix}_runtime"
  description        = "Supervisor with specialists runtime for ${var.project_name} (${var.environment})"
  role_arn           = aws_iam_role.runtime.arn

  agent_runtime_artifact {
    container_configuration {
      container_uri = var.container_image_uri
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  environment_variables = {
    MODEL_ID   = var.model_id
    AWS_REGION = var.aws_region
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# AgentCore Runtime Endpoint
# -----------------------------------------------------------------------------

resource "aws_bedrockagentcore_agent_runtime_endpoint" "this" {
  name             = "${local.agentcore_name_prefix}_endpoint"
  agent_runtime_id = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
  description      = "Endpoint for ${var.project_name} supervisor with specialists"

  tags = var.tags
}
