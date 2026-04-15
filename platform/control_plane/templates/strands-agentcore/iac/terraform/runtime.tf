# AgentCore Runtime
# Executes the LangGraph agent

resource "aws_agentcore_runtime" "main" {
  name        = "${var.project_name}-runtime"
  description = "${var.project_name} Runtime"

  gateway_id = aws_agentcore_gateway.main.id

  # Container configuration
  container {
    image = "ecr_repository_url/${var.project_name}:latest"

    environment_variables = {
      PROJECT_NAME         = var.project_name
      AWS_REGION           = var.aws_region
      LANGFUSE_HOST        = var.langfuse_host
      LANGFUSE_SECRET_NAME = var.langfuse_secret_name
    }
  }

  # IAM role for runtime
  iam_role_arn = aws_iam_role.runtime.arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-runtime"
      Framework   = "strands"
      Environment = var.environment
    }
  )
}

output "runtime_id" {
  description = "AgentCore Runtime ID"
  value       = aws_agentcore_runtime.main.id
}
