# -----------------------------------------------------------------------------
# AgentCore Runtime
# -----------------------------------------------------------------------------

resource "aws_bedrockagentcore_agent_runtime" "this" {
  agent_runtime_name = "${local.agentcore_name_prefix}_runtime"
  description        = var.runtime_description != "" ? var.runtime_description : "AgentCore runtime for ${var.project_name} (${var.environment})"
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

  protocol_configuration {
    server_protocol = var.server_protocol
  }

  lifecycle_configuration {
    idle_runtime_session_timeout = var.idle_session_timeout
    max_lifetime                 = var.max_session_lifetime
  }

  environment_variables = var.environment_variables

  tags = var.tags
}

# -----------------------------------------------------------------------------
# AgentCore Runtime Endpoint
# -----------------------------------------------------------------------------

resource "aws_bedrockagentcore_agent_runtime_endpoint" "this" {
  name                  = "${local.agentcore_name_prefix}_endpoint"
  agent_runtime_id      = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
  agent_runtime_version = aws_bedrockagentcore_agent_runtime.this.agent_runtime_version
  description           = "Endpoint for ${var.project_name} agent runtime"

  tags = var.tags
}

# -----------------------------------------------------------------------------
# ECR Repository
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "agent" {
  name                 = "${local.name_prefix}-agent"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.environment != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "agent" {
  repository = aws_ecr_repository.agent.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
