# -----------------------------------------------------------------------------
# ECS Cluster
# -----------------------------------------------------------------------------

resource "aws_ecs_cluster" "langfuse" {
  name = "${local.name_prefix}-langfuse"
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "langfuse" {
  name              = "/ecs/${local.name_prefix}-langfuse"
  retention_in_days = 30
}

# -----------------------------------------------------------------------------
# Database URL Secret (stored in Secrets Manager, injected via ECS secrets)
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}-langfuse-database-url"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${local.db_username}:${random_password.db_password.result}@${aws_rds_cluster.langfuse.endpoint}:${local.db_port}/${local.db_name}"
}

# -----------------------------------------------------------------------------
# ECS Task Definition
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "langfuse" {
  family                   = "${local.name_prefix}-langfuse"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "langfuse"
    image = "langfuse/langfuse:${var.langfuse_image_tag}"

    portMappings = [{
      containerPort = local.app_port
      protocol      = "tcp"
    }]

    environment = [
      { name = "NEXTAUTH_URL", value = "http://${aws_lb.langfuse.dns_name}" },
      { name = "REDIS_CONNECTION_STRING", value = "redis://${aws_elasticache_replication_group.langfuse.primary_endpoint_address}:${local.redis_port}" },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "PORT", value = tostring(local.app_port) },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "NEXTAUTH_SECRET", valueFrom = aws_secretsmanager_secret.nextauth_secret.arn },
      { name = "SALT", valueFrom = aws_secretsmanager_secret.salt.arn },
      { name = "ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.encryption_key.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.langfuse.name
        "awslogs-region"        = data.aws_region.current.region
        "awslogs-stream-prefix" = "langfuse"
      }
    }

    essential = true
  }])
}

# -----------------------------------------------------------------------------
# ECS Service
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "langfuse" {
  name            = "${local.name_prefix}-langfuse"
  cluster         = aws_ecs_cluster.langfuse.id
  task_definition = aws_ecs_task_definition.langfuse.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.langfuse.arn
    container_name   = "langfuse"
    container_port   = local.app_port
  }

  depends_on = [aws_lb_listener.langfuse_http]
}
