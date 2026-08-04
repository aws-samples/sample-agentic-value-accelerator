resource "aws_cloudwatch_log_group" "litellm" {
  name              = "/aws/ecs/${var.name}/litellm"
  retention_in_days = 30
  tags              = merge(local.common_tags, { Name = "${local.tag_name} Logs" })
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.tag_name} Exec Role" })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.name}-ecs-secrets"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "ssm:GetParameter",
        "ssm:GetParameters",
      ]
      Resource = compact([
        aws_secretsmanager_secret.litellm.arn,
        aws_ssm_parameter.config.arn,
        var.langfuse_public_key_secret_arn,
        var.langfuse_secret_key_secret_arn,
      ])
    }]
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name = "${var.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.tag_name} Task Role" })
}

# Bedrock runtime — every model call passes through LiteLLM via this role.
#
# Two Resource ARN shapes are required for cross-region inference profiles:
#   * inference-profile/* — the entry point LiteLLM names (e.g. us.anthropic.*)
#   * foundation-model/*  — Bedrock dispatches profile calls to underlying
#                           foundation models across us-east-1/us-east-2/us-west-2
# Both must be allowed; allowing only the profile ARN throws AccessDenied at
# the foundation-model layer when Bedrock fans out cross-region.
resource "aws_iam_role_policy" "ecs_task_bedrock" {
  name = "${var.name}-bedrock-invoke"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeBedrockModelsAndProfiles"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream",
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:*:inference-profile/*",
          "arn:aws:bedrock:*:*:application-inference-profile/*",
        ]
      },
      {
        Sid      = "ApplyBedrockGuardrails"
        Effect   = "Allow"
        Action   = ["bedrock:ApplyGuardrail"]
        Resource = "*"
      },
      {
        Sid      = "ReadConfigParameter"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = aws_ssm_parameter.config.arn
      },
      {
        Sid    = "WriteLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.litellm.arn}:*"
      },
    ]
  })
}

resource "aws_ecs_cluster" "litellm" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(local.common_tags, { Name = local.tag_name })
}

resource "aws_ecs_cluster_capacity_providers" "litellm" {
  cluster_name       = aws_ecs_cluster.litellm.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

resource "aws_ecs_task_definition" "litellm" {
  family                   = "${var.name}-litellm"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.litellm_cpu
  memory                   = var.litellm_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "litellm"
      image     = "${aws_ecr_repository.litellm.repository_url}:${var.litellm_version}"
      essential = true

      portMappings = [{ containerPort = 4000, protocol = "tcp" }]

      # The stock litellm-database image has no bootstrap that knows about
      # LITELLM_CONFIG_PARAM, so /etc/litellm/config.yaml never exists and the
      # proxy crashes on boot with "Config file not found". Fetch the rendered
      # config from SSM into that path before launching LiteLLM. boto3 ships in
      # the litellm-database image, so no image rebuild is required.
      entryPoint = ["sh", "-c"]
      command = [
        "mkdir -p /etc/litellm && python3 -c \"import boto3,os; v=boto3.client('ssm',region_name=os.environ['AWS_REGION_NAME']).get_parameter(Name=os.environ['LITELLM_CONFIG_PARAM'])['Parameter']['Value']; open('/etc/litellm/config.yaml','w').write(v)\" && exec litellm --config /etc/litellm/config.yaml --port 4000 --num_workers 2 --telemetry False"
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.litellm.name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "litellm"
        }
      }

      environment = concat([
        { name = "PORT", value = "4000" },
        { name = "DATABASE_URL", value = "postgresql://litellm:${random_password.postgres_password.result}@${aws_rds_cluster.postgres.endpoint}:5432/litellm" },
        { name = "REDIS_HOST", value = aws_elasticache_replication_group.redis.primary_endpoint_address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "LITELLM_CONFIG_PARAM", value = aws_ssm_parameter.config.name },
        { name = "AWS_REGION_NAME", value = data.aws_region.current.region },
        { name = "STORE_MODEL_IN_DB", value = "True" },
        # Disable browser-facing surfaces on the LLM Gateway CloudFront URL.
        # LiteLLM's Swagger UI, ReDoc, and OpenAPI JSON are world-readable
        # by default — they don't leak virtual keys, but they enumerate the
        # full API surface. API endpoints (chat/completions, embeddings, etc.)
        # remain protected by Bearer virtual-key auth and are unaffected.
        # DISABLE_SWAGGER_UI is the canonical name (v1.50+); the two aliases
        # cover older versions and the admin panel.
        { name = "DISABLE_SWAGGER_UI", value = "True" },
        { name = "LITELLM_DISABLE_SWAGGER_UI", value = "True" },
        { name = "DISABLE_ADMIN_UI", value = "False" },
        ], local.attach_lf ? [
        { name = "LANGFUSE_HOST", value = var.langfuse_host },
      ] : [])

      secrets = concat([
        { name = "LITELLM_MASTER_KEY", valueFrom = "${aws_secretsmanager_secret.litellm.arn}:master_key::" },
        { name = "LITELLM_SALT_KEY", valueFrom = "${aws_secretsmanager_secret.litellm.arn}:salt::" },
        ], local.attach_lf ? [
        { name = "LANGFUSE_PUBLIC_KEY", valueFrom = var.langfuse_public_key_secret_arn },
        { name = "LANGFUSE_SECRET_KEY", valueFrom = var.langfuse_secret_key_secret_arn },
      ] : [])

      # The litellm-database image is wolfi-based and does not ship curl, so a
      # `curl` health check fails and ECS marks every task UNHEALTHY and cycles
      # it forever. Use python3 (present in the image) to probe liveliness.
      healthCheck = {
        command     = ["CMD-SHELL", "python3 -c \"import urllib.request; urllib.request.urlopen('http://localhost:4000/health/liveliness', timeout=3)\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  runtime_platform {
    cpu_architecture = "X86_64"
  }

  depends_on = [null_resource.push_image]
  tags       = merge(local.common_tags, { Name = "${local.tag_name} Task" })
}

resource "aws_ecs_service" "litellm" {
  name            = "${var.name}-litellm"
  cluster         = aws_ecs_cluster.litellm.id
  task_definition = aws_ecs_task_definition.litellm.arn
  desired_count   = var.litellm_desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # The litellm-database image runs `prisma migrate deploy` on every boot and
  # then starts uvicorn — roughly 40-60s before /health/liveliness answers 200.
  # Without a grace period ECS enforces the ALB health check immediately and
  # kills tasks mid-startup ("Task failed ELB health checks"). 300s gives the
  # migration + startup sequence enough runway to pass the first health checks.
  health_check_grace_period_seconds = 300

  network_configuration {
    security_groups = [aws_security_group.ecs_tasks.id]
    subnets         = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.litellm.arn
    container_name   = "litellm"
    container_port   = 4000
  }

  depends_on = [aws_lb_listener.http]
  tags       = merge(local.common_tags, { Name = "${local.tag_name} Service" })
}

# Note: ECS service autoscaling intentionally omitted. The Control Plane's
# CodeBuild role doesn't carry application-autoscaling:* permissions (only
# autoscaling:* for EC2 Auto Scaling), and adding autoscaling to a single-
# account shared service like the gateway wasn't worth a cross-cutting IAM
# change. Fixed desired_count = var.litellm_desired_count (default 2) matches
# the Langfuse Foundation Stack pattern. Bump var.litellm_desired_count if you
# need more capacity, or add autoscaling later once the CodeBuild role gains
# application-autoscaling permissions.
