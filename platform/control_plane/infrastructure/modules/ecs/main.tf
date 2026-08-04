# ============================================================================
# ECS Cluster
# ============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cluster"
  })
}

# ============================================================================
# CloudWatch Log Group
# ============================================================================

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.name_prefix}"
  retention_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-logs"
  })
}

# ============================================================================
# IAM Roles
# ============================================================================

# ECS Task Execution Role (for pulling images, writing logs)
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.name_prefix}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role (for application permissions)
resource "aws_iam_role" "ecs_task" {
  name = "${var.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

# Policy for DynamoDB access
resource "aws_iam_role_policy" "ecs_task_dynamodb" {
  name = "dynamodb-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.application_catalog_table_arn,
          "${var.application_catalog_table_arn}/index/*",
          var.deployment_metadata_table_arn,
          "${var.deployment_metadata_table_arn}/index/*",
          var.deployments_table_arn,
          "${var.deployments_table_arn}/index/*",
          "${var.deployment_metadata_table_arn}/index/*",
          var.app_factory_table_arn,
          "${var.app_factory_table_arn}/index/*",
          var.guardrails_table_arn,
          "${var.guardrails_table_arn}/index/*",
          var.policies_table_arn,
          "${var.policies_table_arn}/index/*",
          var.prioritization_table_arn,
          "${var.prioritization_table_arn}/index/*",
          var.maturity_table_arn,
          "${var.maturity_table_arn}/index/*",
          var.business_cases_table_arn,
          "${var.business_cases_table_arn}/index/*",
          var.knowledge_table_arn,
          "${var.knowledge_table_arn}/index/*",
          var.operating_model_table_arn,
          "${var.operating_model_table_arn}/index/*",
          var.organization_design_table_arn,
          "${var.organization_design_table_arn}/index/*",
          var.service_approval_table_arn,
          "${var.service_approval_table_arn}/index/*"
        ]
      }
    ]
  })
}

# Policy for Security Agent existence detection.
# The aws-security frontier agent's deploy route auto-detects whether an
# AWS::SecurityAgent::Application already exists in the account before
# zipping the IaC. Without these permissions the singleton-aware logic
# falls back to user-supplied parameters and re-creates the singleton
# resource, which then fails CFN/Terraform with "Application already exists".
resource "aws_iam_role_policy" "ecs_task_security_agent_detect" {
  name = "security-agent-detect"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          # Cloud Control API uses cloudformation:* under the hood; both
          # action namespaces must be allowed for the SDK call to succeed.
          "cloudformation:ListResources",
          "cloudformation:GetResource",
          "cloudcontrol:ListResources",
          "cloudcontrol:GetResource",
          "securityagent:GetApplication",
          "securityagent:ListApplications"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy for S3 access
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:CreateBucket"
        ]
        Resource = [
          var.project_archives_bucket_arn,
          "${var.project_archives_bucket_arn}/*",
          var.frontend_bucket_arn,
          "${var.frontend_bucket_arn}/*",
          var.service_approval_bucket_arn,
          "${var.service_approval_bucket_arn}/*",
          "arn:aws:s3:::fsi-*",
          "arn:aws:s3:::fsi-*/*",
          "arn:aws:s3:::ava-*",
          "arn:aws:s3:::ava-*/*"
        ]
      }
    ]
  })
}

# Policy for Step Functions access
# Service-approval Path B: backend's create_run calls
# bedrock-agentcore:InvokeAgentRuntime against the v2 module's runtime.
# Scoped to runtimes under this account so the backend can't accidentally
# invoke arbitrary AgentCore runtimes elsewhere.
resource "aws_iam_role_policy" "ecs_task_agentcore_invoke" {
  name = "service-approval-agentcore-invoke"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock-agentcore:InvokeAgentRuntime",
      ]
      # Wildcard on runtime-id segment because AgentCore appends a random
      # suffix at create-time. We can't pin to a specific runtime ARN at
      # IaC-generation time without circular dependency on the v2 module.
      Resource = "arn:aws:bedrock-agentcore:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:runtime/*"
    }]
  })
}

# Policy for CloudWatch Logs access (CodeBuild logs + AgentCore runtime logs)
resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "codebuild-logs-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:GetLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:FilterLogEvents",
          "logs:GetLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/*",
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/*:log-stream:*",
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/vendedlogs/bedrock-agentcore/*",
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/vendedlogs/bedrock-agentcore/*:log-stream:*",
        ]
      }
    ]
  })
}

# Policy for Advanced Prompt Optimization (Bedrock AdvPO jobs + model discovery).
# S3 access to the AdvPO bucket is already covered by the ava-* wildcard in
# the s3-access policy above. These actions are not resource-scopable, so "*".
resource "aws_iam_role_policy" "ecs_task_advpo" {
  name = "advpo-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:CreateAdvancedPromptOptimizationJob",
          "bedrock:GetAdvancedPromptOptimizationJob",
          "bedrock:ListAdvancedPromptOptimizationJobs",
          "bedrock:StopAdvancedPromptOptimizationJob",
          "bedrock:DeleteAdvancedPromptOptimizationJob",
          "bedrock:BatchDeleteAdvancedPromptOptimizationJob",
          "bedrock:ListFoundationModels",
          "bedrock:ListInferenceProfiles",
          "bedrock:GetInferenceProfile"
        ]
        Resource = "*"
      },
      {
        # The AdvPO job runs under this task role (no separate execution role is
        # passed), so it must be able to invoke the target models — including
        # cross-region inference profiles (e.g. us.anthropic.claude-*), which
        # require invoke on both the profile and the underlying foundation models.
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/*",
          "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:application-inference-profile/*"
        ]
      }
    ]
  })
}

# Policy for Bedrock Guardrails and CloudWatch Metrics
resource "aws_iam_role_policy" "ecs_task_bedrock_guardrails" {
  name = "bedrock-guardrails-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:CreateGuardrail",
          "bedrock:UpdateGuardrail",
          "bedrock:DeleteGuardrail",
          "bedrock:GetGuardrail",
          "bedrock:ListGuardrails",
          "bedrock:CreateGuardrailVersion"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricStatistics"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# Security Groups
# ============================================================================

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${var.name_prefix}-ecs-tasks-"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Allow traffic from ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-ecs-tasks-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP traffic"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS traffic"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Application Load Balancer
# ============================================================================

resource "aws_lb" "main" {
  name               = "${var.name_prefix}-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false
  enable_http2               = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-alb"
  })
}

resource "aws_lb_target_group" "main" {
  name        = "${var.name_prefix}-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-tg"
  })
}

resource "aws_lb_listener" "main" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

# ============================================================================
# ECS Task Definition
# ============================================================================

resource "aws_ecs_task_definition" "main" {
  family                   = "${var.name_prefix}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        },
        {
          name  = "ROOT_PATH"
          value = "/${var.environment}"
        },
        {
          name  = "TEMPLATES_PATH"
          value = "/app/templates"
        },
        {
          name  = "REFERENCE_IMPLEMENTATIONS_DIR"
          value = "/app/reference_implementations"
        },
        {
          name  = "APPLICATION_CATALOG_TABLE"
          value = var.application_catalog_table_name
        },
        {
          name  = "DEPLOYMENT_METADATA_TABLE"
          value = var.deployment_metadata_table_name
        },
        {
          name  = "PROJECT_ARCHIVES_BUCKET"
          value = var.project_archives_bucket_name
        },
        {
          name  = "ADVPO_BUCKET"
          value = var.advpo_bucket_name
        },
        {
          name  = "FRONTEND_BUCKET"
          value = var.frontend_bucket_name
        },
        {
          name  = "DEPLOYMENTS_TABLE_NAME"
          value = var.deployments_table_name
        },
        {
          name  = "GUARDRAILS_TABLE_NAME"
          value = var.guardrails_table_name
        },
        {
          name  = "POLICIES_TABLE_NAME"
          value = var.policies_table_name
        },
        {
          name  = "POLICY_ENGINE_ID"
          value = var.policy_engine_id
        },
        {
          name  = "GATEWAY_ARN"
          value = var.policy_gateway_arn
        },
        {
          name  = "PRIORITIZATION_TABLE_NAME"
          value = var.prioritization_table_name
        },
        {
          name  = "MATURITY_TABLE_NAME"
          value = var.maturity_table_name
        },
        {
          name  = "BUSINESS_CASES_TABLE_NAME"
          value = var.business_cases_table_name
        },
        {
          name  = "KNOWLEDGE_TABLE_NAME"
          value = var.knowledge_table_name
        },
        {
          name  = "DATALAKE_MCP_IMAGE_URI"
          value = var.datalake_mcp_image_uri
        },
        {
          name  = "KB_MCP_IMAGE_URI"
          value = var.kb_mcp_image_uri
        },
        {
          name  = "OPERATING_MODEL_TABLE_NAME"
          value = var.operating_model_table_name
        },
        {
          name  = "ORGANIZATION_DESIGN_TABLE_NAME"
          value = var.organization_design_table_name
        },
        {
          name  = "STATE_MACHINE_ARN"
          value = var.state_machine_arn
        },
        {
          name  = "FRONTIER_AGENTS_STATE_MACHINE_ARN"
          value = var.frontier_agents_state_machine_arn
        },
        {
          name  = "FRONTIER_AGENTS_FEDERATION_ROLE_ARN"
          value = var.frontier_agents_federation_role_arn
        },
        {
          name  = "AWS_DEFAULT_REGION"
          value = data.aws_region.current.name
        },
        {
          # Backend settings.AWS_REGION (Pydantic) reads this env var and uses it
          # as the default deployment region. Without it the setting falls back to
          # its hardcoded "us-east-1", so use-case CodeBuild deploys init the S3
          # tf-state backend in the wrong region and fail with a 301 redirect.
          name  = "AWS_REGION"
          value = data.aws_region.current.name
        },
        {
          name  = "CONTROL_PLANE_VPC_ID"
          value = var.vpc_id
        },
        {
          name  = "APP_FACTORY_TABLE_NAME"
          value = var.app_factory_table_name
        },
        {
          name  = "CORS_ORIGINS"
          value = jsonencode(var.cors_origins)
        },
        {
          name  = "SERVICE_APPROVAL_TABLE_NAME"
          value = var.service_approval_table_name
        },
        {
          name  = "SERVICE_APPROVAL_BUCKET"
          value = var.service_approval_bucket
        },
        # Service-Approval Path B (post-Phase B decommission): backend
        # invokes AgentCore directly. SFN/Fargate envs are gone.
        {
          name  = "SERVICE_APPROVAL_AGENT_RUNTIME_ARN"
          value = var.service_approval_agent_runtime_arn
        },
        # Cognito + auth env vars. Without these the backend's _extract_role
        # cannot decode JWTs and falls into a dev-mode bypass that returns
        # Role.ADMIN for every user — every viewer gets deploy permission.
        # Discovered the hard way on the golden redeploy. Required for any
        # stamp where the UI runs against a real Cognito user pool.
        {
          name  = "USE_DEV_AUTH"
          value = "false"
        },
        {
          name  = "COGNITO_USER_POOL_ID"
          value = var.cognito_user_pool_id
        },
        {
          name  = "COGNITO_CLIENT_ID"
          value = var.cognito_user_pool_client_id
        },
        {
          name  = "COGNITO_REGION"
          value = data.aws_region.current.name
        },
        # FSI Foundry SSO — HMAC secret shared with each FSI app's CloudFront
        # Function. Backend uses it to sign handoff tokens AFTER real Cognito
        # RS256 verification of the caller's id_token succeeds.
        {
          name  = "FSI_APP_SIGNING_SECRET"
          value = var.fsi_app_signing_secret
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-task"
  })
}

# ============================================================================
# ECS Service
# ============================================================================

resource "aws_ecs_service" "main" {
  name            = "${var.name_prefix}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "backend"
    container_port   = 8000
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-service"
  })

  depends_on = [aws_lb_listener.main]
}

# ============================================================================
# Auto Scaling
# ============================================================================

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_cpu" {
  name               = "${var.name_prefix}-cpu-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "ecs_memory" {
  name               = "${var.name_prefix}-memory-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_iam_role_policy" "ecs_task_sts" {
  name = "sts-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = "*"
      }
    ]
  })
}

# Step Functions — the backend (running as this task role) calls
# states:StartExecution directly to kick off the deployment pipeline
# (App Factory deploy, FSI Foundry / reference-impl deploy) and the
# frontier-agents pipeline, then polls execution status. Without this,
# any deploy fails with AccessDeniedException on StartExecution.
resource "aws_iam_role_policy" "ecs_task_step_functions" {
  name = "step-functions-start"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:StartExecution",
        ]
        Resource = compact([
          var.state_machine_arn,
          var.frontier_agents_state_machine_arn,
        ])
      },
      {
        Effect = "Allow"
        Action = [
          "states:DescribeExecution",
          "states:StopExecution",
        ]
        # Execution ARNs are :execution:<stateMachineName>:<executionName>,
        # so map the state-machine ARN to its execution ARN prefix + wildcard.
        Resource = compact([
          var.state_machine_arn != "" ? "${replace(var.state_machine_arn, ":stateMachine:", ":execution:")}:*" : "",
          var.frontier_agents_state_machine_arn != "" ? "${replace(var.frontier_agents_state_machine_arn, ":stateMachine:", ":execution:")}:*" : "",
        ])
      },
    ]
  })
}

# Policy for CodeCommit read access (backend lists seeded use case repos)
resource "aws_iam_role_policy" "ecs_task_codecommit" {
  name = "codecommit-read-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codecommit:ListRepositories",
          "codecommit:GetRepository",
          "codecommit:ListBranches",
          "codecommit:GetBranch"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy for Bedrock AgentCore access (test deployment invocations)
resource "aws_iam_role_policy" "ecs_task_bedrock_agentcore" {
  name = "bedrock-agentcore-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:InvokeAgentRuntime",
          "bedrock-agentcore:GetAgentRuntime",
          "bedrock-agentcore:ListAgentRuntimes",
          # _provision_gateway repoints the runtime's GATEWAY_URL env var to the
          # dedicated per-use-case gateway after creating it.
          "bedrock-agentcore:UpdateAgentRuntime"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy for AgentCore Policy Engine + Gateway control-plane CRUD.
# Backend's /policies route invokes bedrock-agentcore-control to manage
# Cedar policies on the platform policy engine.
resource "aws_iam_role_policy" "ecs_task_agentcore_policy" {
  name = "bedrock-agentcore-policy-crud"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:CreatePolicy",
          "bedrock-agentcore:GetPolicy",
          "bedrock-agentcore:ListPolicies",
          "bedrock-agentcore:UpdatePolicy",
          "bedrock-agentcore:DeletePolicy",
          "bedrock-agentcore:CreatePolicyEngine",
          "bedrock-agentcore:GetPolicyEngine",
          "bedrock-agentcore:ListPolicyEngines",
          "bedrock-agentcore:DeletePolicyEngine",
          "bedrock-agentcore:GetGateway",
          "bedrock-agentcore:ListGateways",
          # Required to attach/detach a policy engine to a gateway and to
          # switch ENFORCE/LOG_ONLY mode (backend calls UpdateGateway).
          "bedrock-agentcore:UpdateGateway",
          # Required by the "Add Gateway" flow (deployment_service._provision_gateway)
          # which creates a dedicated per-use-case gateway on demand.
          "bedrock-agentcore:CreateGateway",
          "bedrock-agentcore:DeleteGateway",
          "bedrock-agentcore:ListGatewayTargets",
          "bedrock-agentcore:GetGatewayTarget",
        ]
        Resource = "*"
      },
      {
        # AgentCore's UpdateGateway validates the gateway's execution role by
        # Passing it — the task role must be allowed to PassRole the gateway
        # role, or attach-gateway fails with iam:PassRole AccessDenied.
        Sid    = "PassGatewayRole"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = "arn:aws:iam::*:role/${var.name_prefix}-agentcore-gateway-role"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "bedrock-agentcore.amazonaws.com"
          }
        }
      }
    ]
  })
}

# Policy for Secrets Manager access (Langfuse project provisioning +
# LLM Gateway virtual-key lifecycle). DeleteSecret is required by the
# offboarding path in services/llm_gateway_provisioning.py -- when a
# use case is destroyed, the CP revokes the LiteLLM virtual key AND
# deletes the corresponding Secrets Manager secret so a redeploy mints
# fresh credentials instead of reusing a key that has been purged from
# LiteLLM's DB.
resource "aws_iam_role_policy" "ecs_task_secrets_manager" {
  name = "secrets-manager-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:CreateSecret",
          "secretsmanager:PutSecretValue",
          "secretsmanager:DeleteSecret",
          "secretsmanager:TagResource"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy for the LLM Gateway routes — read/write the SSM-rendered
# litellm config.yaml, query the gateway's CloudWatch Logs for the Audit
# tab, and trigger an ECS rolling restart after a config edit.
resource "aws_iam_role_policy" "ecs_task_llm_gateway" {
  name = "llm-gateway-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LlmGatewayConfigRW"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:PutParameter",
        ]
        Resource = "arn:aws:ssm:*:*:parameter/llm-gateway/*"
      },
      {
        Sid    = "LlmGatewayLogInsights"
        Effect = "Allow"
        Action = [
          "logs:StartQuery",
          "logs:GetQueryResults",
          "logs:StopQuery",
          "logs:DescribeLogGroups",
        ]
        Resource = "*"
      },
      {
        Sid    = "LlmGatewayServiceRollout"
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService",
        ]
        Resource = "arn:aws:ecs:*:*:service/llm-gateway-*/*"
      },
    ]
  })
}

# Knowledge discovery + provisioning
resource "aws_iam_role_policy" "ecs_task_knowledge_discovery" {
  name = "knowledge-discovery"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GlueReadAccess"
        Effect = "Allow"
        Action = [
          "glue:GetDatabases",
          "glue:GetDatabase",
          "glue:GetTables",
          "glue:GetTable",
        ]
        Resource = ["*"]
      },
      {
        Sid      = "AthenaListWorkgroups"
        Effect   = "Allow"
        Action   = ["athena:ListWorkGroups"]
        Resource = ["*"]
      },
      {
        Sid    = "BedrockKnowledgeBases"
        Effect = "Allow"
        Action = [
          "bedrock:ListKnowledgeBases",
          "bedrock:GetKnowledgeBase",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "IAMForProvisioning"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:PassRole",
        ]
        Resource = ["arn:aws:iam::*:role/ava-knowledge-*"]
      },
      {
        Sid    = "LakeFormationGrants"
        Effect = "Allow"
        Action = [
          "lakeformation:GrantPermissions",
          "lakeformation:RevokePermissions",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "AgentCoreProvisioning"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:*",
        ]
        Resource = ["*"]
      },
      {
        Sid      = "STSIdentity"
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = ["*"]
      },
      {
        # Required when the Glue Data Catalog has SSE-KMS enabled with a CMK.
        # LakeFormation grant calls fail with "Insufficient encryption key
        # permissions for Glue API" without these. Scoped to glue + lakeformation
        # via kms:ViaService.
        Sid    = "GlueCatalogKMS"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey",
        ]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "kms:ViaService" = [
              "glue.${data.aws_region.current.name}.amazonaws.com",
              "lakeformation.${data.aws_region.current.name}.amazonaws.com",
            ]
          }
        }
      },
    ]
  })
}
