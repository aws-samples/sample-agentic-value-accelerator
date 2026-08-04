# -----------------------------------------------------------------------------
# ECS Task Execution Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-langfuse-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        aws_secretsmanager_secret.database_url.arn,
        aws_secretsmanager_secret.nextauth_secret.arn,
        aws_secretsmanager_secret.salt.arn,
        aws_secretsmanager_secret.encryption_key.arn
      ]
    }]
  })
}

# -----------------------------------------------------------------------------
# ECS Task Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-langfuse-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}
