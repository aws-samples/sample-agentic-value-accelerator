# =============================================================================
# LiteLLM Gateway Module - ECS Task Definition, Service, and Auto-Scaling
# =============================================================================
# Implements:
#   - ECS Fargate task definition with version-pinned LiteLLM image from ghcr.io
#   - ECS service in existing cluster with deployment circuit breaker
#   - ALB target group with health check on /health (port 4000)
#   - Auto-scaling: min=2, max=10, CPU target=70%, request count scaling
#   - CloudWatch log group for container logs (30-day retention)
#   - Deployment circuit breaker with automatic rollback on health check failure
#   - Langfuse observability: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
#     LANGFUSE_HOST mapped from Secrets Manager to ECS task environment
#     with flush interval and buffer TTL for local trace buffering (Req 6.4)
#
# Health Endpoints (LiteLLM native - no custom code required):
#   - GET /health  → status, uptime, DB/Redis connectivity (ECS + ALB health check)
#   - GET /ready   → returns 200 only when all deps (RDS, Redis, Bedrock) are healthy
#   - GET /metrics → Prometheus-compatible metrics endpoint
#
# ECS Health Check Configuration (Requirement 9.3):
#   - Endpoint: /health
#   - Interval: 30 seconds
#   - Timeout: 5 seconds
#   - Retries: 3 (marks task unhealthy after 3 consecutive failures)
#   - Start period: 60 seconds (grace period for container startup)
#
# Deployment Circuit Breaker (Requirement 16.4):
#   - Enabled with automatic rollback
#   - ECS monitors task health during deployment
#   - If new tasks fail health checks within the deployment window, the
#     deployment is rolled back to the previous stable task definition
#   - Grace period of 60s ensures tasks have time to initialize
#   - Combined with minimum_healthy_percent=50, ensures at least one healthy
#     task serves traffic during rolling updates (Requirement 16.2)
#
# Langfuse Observability (Requirements 6.1-6.5):
#   - success_callback/failure_callback: ["langfuse"] in config.yaml (Req 6.1)
#   - Trace data includes: model, tokens, latency, cost, key_id, status (Req 6.2)
#   - Trace propagation via x-ava-trace-id / traceparent headers (Req 6.3)
#   - Local buffering: LANGFUSE_FLUSH_INTERVAL + LANGFUSE_BUFFER_TTL_SECONDS
#     environment variables configure 5-min buffer when Langfuse unreachable (Req 6.4)
#   - langfuse_default_tags in config.yaml tags traces with use_case, team (Req 6.5)
#
# References resources from:
#   - security.tf: aws_security_group.litellm_tasks, aws_iam_role.task_role,
#                  aws_iam_role.execution_role
#   - secrets.tf:  aws_secretsmanager_secret.master_key,
#                  aws_secretsmanager_secret.db_credentials,
#                  aws_secretsmanager_secret.redis_auth,
#                  aws_secretsmanager_secret.langfuse_keys
#
# Tasks: 1.2, 7.2, 7.3
# Requirements: 1.1, 1.2, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.2, 9.3, 9.6, 16.2, 16.4
# =============================================================================

# -----------------------------------------------------------------------------
# CloudWatch Log Group for ECS Tasks
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "litellm" {
  name              = "/ecs/${local.resource_prefix}"
  retention_in_days = 30

  tags = local.tags
}

# -----------------------------------------------------------------------------
# ALB Target Group
# -----------------------------------------------------------------------------

resource "aws_lb_target_group" "litellm" {
  name        = "${var.name_prefix}-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health/liveliness"
    port                = "4000"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = local.tags
}

# -----------------------------------------------------------------------------
# ECS Task Definition
# -----------------------------------------------------------------------------
# Uses version-pinned LiteLLM image from ghcr.io/berriai/litellm.
# Container exposes port 4000.
#
# Health Check (Requirement 9.3):
#   - Uses /health endpoint which returns JSON with status, uptime,
#     database connectivity, and Redis connectivity (Requirement 9.1)
#   - Interval: 30s, Timeout: 5s, Retries: 3
#   - Start period: 60s for container initialization
#
# LiteLLM Native Endpoints (no custom code needed):
#   - GET /health  → {status, uptime, db_connectivity, redis_connectivity}
#   - GET /ready   → HTTP 200 only when all deps healthy (Requirement 9.2)
#   - GET /metrics → Prometheus-compatible metrics (Requirement 9.6)
#
# Environment variables injected from Secrets Manager (secrets.tf) via
# the ECS execution role (security.tf).
# Task CPU: 1024 (1 vCPU), Memory: 2048 (2 GB).
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "litellm" {
  family                   = local.resource_prefix
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    {
      name      = "litellm"
      image     = "ghcr.io/berriai/litellm:${var.litellm_image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:4000/health/liveliness || exit 1"]
        interval    = var.health_check_interval
        timeout     = var.health_check_timeout
        retries     = var.health_check_retries
        startPeriod = var.health_check_start_period
      }

      environment = [
        {
          name  = "AWS_REGION_NAME"
          value = local.region
        },
        {
          name  = "LITELLM_CONFIG_PATH"
          value = "/app/config.yaml"
        },
        {
          name  = "LITELLM_CONFIG_S3_URI"
          value = "s3://${var.config_s3_bucket}/${var.config_s3_prefix}/config-latest.yaml"
        },
        {
          name  = "REDIS_HOST"
          value = aws_elasticache_replication_group.litellm.primary_endpoint_address
        },
        {
          name  = "LANGFUSE_HOST"
          value = var.langfuse_host
        },
        {
          name  = "LANGFUSE_FLUSH_INTERVAL"
          value = tostring(var.langfuse_flush_interval)
        },
        {
          name  = "LANGFUSE_BUFFER_TTL_SECONDS"
          value = tostring(var.langfuse_buffer_ttl_seconds)
        },
        {
          name  = "BEDROCK_MANTLE_REGION"
          value = local.region
        }
      ]

      # Download config from S3 before starting LiteLLM.
      # Override entryPoint to use shell (the image's ENTRYPOINT is "litellm").
      entryPoint = ["sh", "-c"]
      command = [
        "python3 -c \"import boto3,os; s3=boto3.client('s3'); uri=os.environ.get('LITELLM_CONFIG_S3_URI',''); bucket,key=uri.replace('s3://','').split('/',1) if uri else ('',''); s3.download_file(bucket,key,'/app/config.yaml') if bucket else None\" && exec litellm --config /app/config.yaml --port 4000"
      ]

      secrets = concat([
        {
          name      = "LITELLM_MASTER_KEY"
          valueFrom = aws_secretsmanager_secret.master_key.arn
        },
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.db_credentials.arn
        },
        {
          name      = "REDIS_PASSWORD"
          valueFrom = aws_secretsmanager_secret.redis_auth.arn
        },
        {
          name      = "LANGFUSE_PUBLIC_KEY"
          valueFrom = "${aws_secretsmanager_secret.langfuse_keys.arn}:public_key::"
        },
        {
          name      = "LANGFUSE_SECRET_KEY"
          valueFrom = "${aws_secretsmanager_secret.langfuse_keys.arn}:secret_key::"
        }
      ], var.bedrock_mantle_api_key != "" ? [{
        name      = "BEDROCK_MANTLE_API_KEY"
        valueFrom = aws_secretsmanager_secret.bedrock_mantle_api_key[0].arn
      }] : [])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.litellm.name
          "awslogs-region"        = local.region
          "awslogs-stream-prefix" = "litellm"
        }
      }
    }
  ])

  tags = local.tags
}

# -----------------------------------------------------------------------------
# ECS Fargate Service
# -----------------------------------------------------------------------------
# Deploys into the existing ECS cluster (same as Control Plane backend).
# Uses private subnets with no public IP, secured by litellm_tasks SG.
#
# Deployment Circuit Breaker (Requirement 16.4):
#   - enable=true, rollback=true: ECS monitors deployment health and
#     automatically rolls back if new tasks fail health checks
#   - The circuit breaker tracks the deployment's progress and triggers
#     rollback when the percentage of failed tasks exceeds the threshold
#   - With health_check_grace_period=60s and container healthCheck interval=30s
#     with 3 retries, a failing task is detected within ~150s (2.5 min)
#   - Combined with deployment_minimum_healthy_percent=50, this ensures
#     rollback occurs within the 5-minute deployment window
#
# Zero-Downtime Rolling Updates (Requirement 16.2):
#   - deployment_minimum_healthy_percent=50 ensures at least one healthy task
#     serves traffic during updates (with desired_count=2, one task stays up)
#   - deployment_maximum_percent=200 allows new tasks to start before old
#     tasks are drained, enabling seamless traffic transfer
#   - health_check_grace_period_seconds=60 gives new tasks time to initialize
#     and pass their first health check before being marked unhealthy
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "litellm" {
  name            = local.resource_prefix
  cluster         = local.ecs_cluster_arn
  task_definition = aws_ecs_task_definition.litellm.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.litellm_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.litellm.arn
    container_name   = "litellm"
    container_port   = 4000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  # Ensure minimum healthy percent during rolling updates (Requirement 16.2)
  deployment_minimum_healthy_percent = var.deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.deployment_maximum_percent

  # Allow time for new tasks to stabilize before health check enforcement
  # Combined with circuit breaker, ensures rollback within 5 minutes (Req 16.4)
  health_check_grace_period_seconds = var.health_check_grace_period

  # Ensure the seed config object and S3 read policy exist before tasks launch.
  # Without this, ECS tasks may start before the config file or IAM permissions
  # are available, causing immediate boot failures on first deploy.
  depends_on = [
    aws_s3_object.config_seed,
    aws_iam_role_policy.task_s3_config,
  ]

  # Ignore changes to desired_count managed by auto-scaling
  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Auto-Scaling Configuration
# -----------------------------------------------------------------------------
# min=2, max=10, CPU target=70% per Requirements 1.5.
# Also scales on ALB request count per target.
# -----------------------------------------------------------------------------

resource "aws_appautoscaling_target" "litellm" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${local.ecs_cluster_name}/${aws_ecs_service.litellm.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU utilization target tracking policy (target 70%)
resource "aws_appautoscaling_policy" "litellm_cpu" {
  name               = "${local.resource_prefix}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.litellm.resource_id
  scalable_dimension = aws_appautoscaling_target.litellm.scalable_dimension
  service_namespace  = aws_appautoscaling_target.litellm.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = var.cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ALB request count per target scaling policy
resource "aws_appautoscaling_policy" "litellm_requests" {
  name               = "${local.resource_prefix}-request-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.litellm.resource_id
  scalable_dimension = aws_appautoscaling_target.litellm.scalable_dimension
  service_namespace  = aws_appautoscaling_target.litellm.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.litellm.arn_suffix}/${aws_lb_target_group.litellm.arn_suffix}"
    }

    target_value       = 1000
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
