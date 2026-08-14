###############################################################################
# ECS Module — Fargate Cluster, Task Definition, Service, ALB
###############################################################################

# ------------------------------------------------------------------------------
# ECS Cluster
# ------------------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.project}-${var.environment}-cluster"
    Project     = var.project
    Environment = var.environment
  }
}

# ------------------------------------------------------------------------------
# CloudWatch Log Group for ECS tasks
# ------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "ecs" {
  name_prefix       = "/ecs/${var.project}-ui-"
  retention_in_days = 30

  tags = {
    Project     = var.project
    Environment = var.environment
  }
}

# ------------------------------------------------------------------------------
# Task Definition
# ------------------------------------------------------------------------------
resource "aws_ecs_task_definition" "ui" {
  family                   = "${var.project}-${var.environment}-ui"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  # The UI image is built natively for linux/arm64 on the ARM64 build host
  # (AVA CodeBuild / Apple Silicon), so run the task on ARM64 (Graviton)
  # Fargate to match — avoids cross-architecture emulation during the build
  # (which caused "exec format error") and is cheaper at runtime.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  cpu                = "512"
  memory             = "1024"
  execution_role_arn = var.task_execution_role_arn
  task_role_arn      = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "${var.project}-ui"
      image     = var.ui_image_uri
      essential = true

      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "AGENT_RUNTIME_ARN"
          value = var.agent_runtime_arn
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]

      secrets = [
        {
          name      = "AUTH_USERNAME"
          valueFrom = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/auth/username"
        },
        {
          name      = "AUTH_PASSWORD"
          valueFrom = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/auth/password"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ui"
        }
      }
    }
  ])

  tags = {
    Name        = "${var.project}-${var.environment}-ui-task"
    Project     = var.project
    Environment = var.environment
  }
}

data "aws_caller_identity" "current" {}

# ------------------------------------------------------------------------------
# Application Load Balancer
# ------------------------------------------------------------------------------
resource "aws_lb" "main" {
  name               = substr("${var.project}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false

  tags = {
    Name        = "${var.project}-${var.environment}-alb"
    Project     = var.project
    Environment = var.environment
  }
}

# ------------------------------------------------------------------------------
# Target Group
# ------------------------------------------------------------------------------
resource "aws_lb_target_group" "ui" {
  name        = substr("${var.project}-tg", 0, 32)
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/"
    matcher             = "200"
  }

  tags = {
    Name        = "${var.project}-${var.environment}-ui-tg"
    Project     = var.project
    Environment = var.environment
  }
}

# ------------------------------------------------------------------------------
# Listener (HTTP on port 80)
# ------------------------------------------------------------------------------
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # Default action: BLOCK all traffic that doesn't come through CloudFront.
  # Only the listener rule below (which checks X-Origin-Verify) forwards to ECS.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  tags = {
    Name    = "${var.project}-${var.environment}-http-listener"
    Project = var.project
  }
}

# Only forward traffic that has the correct secret header (sent by CloudFront).
# This prevents direct ALB access (DyePack EC2IPAuthentication fix).
resource "aws_lb_listener_rule" "cloudfront_only" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [var.origin_secret]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ui.arn
  }
}

# ------------------------------------------------------------------------------
# ECS Service
# ------------------------------------------------------------------------------
resource "aws_ecs_service" "ui" {
  name            = "${var.project}-${var.environment}-ui-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ui.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.ecs_security_group_id]
    # When NAT is disabled, tasks run in public subnets and need a public IP for egress
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ui.arn
    container_name   = "${var.project}-ui"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]

  tags = {
    Name        = "${var.project}-${var.environment}-ui-service"
    Project     = var.project
    Environment = var.environment
  }
}
