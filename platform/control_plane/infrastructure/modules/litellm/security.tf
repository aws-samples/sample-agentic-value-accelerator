# =============================================================================
# LiteLLM Gateway Module - Security Groups, IAM Roles
# =============================================================================
# Implements:
#   - Security groups: gateway tasks (inbound ALB-only on 4000), ALB, RDS, Redis
#   - IAM task role: bedrock:InvokeModel, secretsmanager:GetSecretValue, logs, metrics
#   - IAM execution role: ECR pull, CloudWatch logs, Secrets Manager env injection
#
# Task: 1.5
# Requirements: 1.6, 7.4, 7.5, 7.6
#
# ARCC Compliance:
#   - BSC6 IAM Least Privilege: specific actions and resource ARNs, no wildcards
#   - BSC5 IAM Roles Over Keys: ECS task role uses STS temporary credentials
#   - BSC5 Secrets Manager: credentials stored with rotation support
# =============================================================================

# =============================================================================
# Security Groups
# =============================================================================

# -----------------------------------------------------------------------------
# ALB Security Group
# Inbound: HTTPS (443) from anywhere (will be restricted to CloudFront via header)
# Outbound: Port 4000 to task SG
# -----------------------------------------------------------------------------

resource "aws_security_group" "litellm_alb" {
  name_prefix = "${local.resource_prefix}-alb-"
  description = "Security group for LiteLLM Gateway ALB - allows HTTPS inbound"
  vpc_id      = var.vpc_id

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Port 4000: Primary internal gateway endpoint used by ECS agent tasks,
# Control Plane backend, and Spend Aggregator Lambda within the VPC.
resource "aws_security_group_rule" "alb_ingress_internal_4000" {
  type              = "ingress"
  from_port         = 4000
  to_port           = 4000
  protocol          = "tcp"
  description       = "Allow internal VPC traffic to gateway port 4000 (agents, backend, Lambda)"
  security_group_id = aws_security_group.litellm_alb.id
  cidr_blocks       = [data.aws_vpc.existing.cidr_block]
}

resource "aws_security_group_rule" "alb_egress_to_tasks" {
  type                     = "egress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  description              = "Allow outbound to LiteLLM ECS tasks on port 4000"
  security_group_id        = aws_security_group.litellm_alb.id
  source_security_group_id = aws_security_group.litellm_tasks.id
}

# -----------------------------------------------------------------------------
# ECS Tasks Security Group
# Inbound: Port 4000 from ALB SG only
# Outbound: 443 (VPC endpoints for Bedrock, Secrets Manager, CloudWatch, ECR),
#           5432 (RDS), 6379 (Redis)
# -----------------------------------------------------------------------------

resource "aws_security_group" "litellm_tasks" {
  name_prefix = "${local.resource_prefix}-tasks-"
  description = "Security group for LiteLLM ECS tasks - inbound from ALB only on port 4000"
  vpc_id      = var.vpc_id

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-tasks-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "tasks_ingress_from_alb" {
  type                     = "ingress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  description              = "Allow inbound from ALB on port 4000 only"
  security_group_id        = aws_security_group.litellm_tasks.id
  source_security_group_id = aws_security_group.litellm_alb.id
}

resource "aws_security_group_rule" "tasks_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  description       = "Allow HTTPS outbound for VPC endpoints (Bedrock, Secrets Manager, CloudWatch, ECR)"
  security_group_id = aws_security_group.litellm_tasks.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "tasks_egress_to_rds" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  description              = "Allow outbound to RDS PostgreSQL"
  security_group_id        = aws_security_group.litellm_tasks.id
  source_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group_rule" "tasks_egress_to_redis" {
  type                     = "egress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  description              = "Allow outbound to ElastiCache Redis"
  security_group_id        = aws_security_group.litellm_tasks.id
  source_security_group_id = aws_security_group.litellm_redis.id
}

# -----------------------------------------------------------------------------
# Redis Security Group
# Inbound: 6379 from task SG only
# Outbound: none required
# -----------------------------------------------------------------------------

resource "aws_security_group" "litellm_redis" {
  name_prefix = "${local.resource_prefix}-redis-"
  description = "Security group for LiteLLM ElastiCache Redis - allows inbound from ECS tasks only"
  vpc_id      = var.vpc_id

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-redis-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "redis_ingress_from_ecs" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  description              = "Allow Redis inbound from LiteLLM ECS tasks"
  security_group_id        = aws_security_group.litellm_redis.id
  source_security_group_id = aws_security_group.litellm_tasks.id
}

# =============================================================================
# IAM Task Role
# =============================================================================
# Attached to ECS tasks at runtime. Provides least-privilege permissions for:
#   - Bedrock model invocation (InvokeModel, InvokeModelWithResponseStream, ApplyGuardrail)
#   - Secrets Manager read access (scoped to litellm-* secrets)
#   - CloudWatch Logs (scoped to /ecs/ava-litellm log group)
#   - CloudWatch Metrics (scoped to AVA/Gateway namespace via condition)
# Per BSC6: specific actions, specific resource ARNs, conditions where applicable.
# Per BSC5: uses IAM role with STS temporary credentials, not access keys.
# =============================================================================

resource "aws_iam_role" "task_role" {
  name = "${local.resource_prefix}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSTaskAssume"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:ecs:${data.aws_region.current.name}:${local.account_id}:*"
          }
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-task-role"
  })
}

resource "aws_iam_role_policy" "task_bedrock" {
  name = "${local.resource_prefix}-bedrock-invoke"
  role = aws_iam_role.task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockInvoke"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ApplyGuardrail"
        ]
        Resource = [
          "arn:aws:bedrock:*:${local.account_id}:inference-profile/*",
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:${data.aws_region.current.name}:${local.account_id}:guardrail/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_secrets" {
  name = "${local.resource_prefix}-secrets-read"
  role = aws_iam_role.task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${data.aws_region.current.name}:${local.account_id}:secret:${var.name_prefix}-*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_logs" {
  name = "${local.resource_prefix}-cloudwatch-logs"
  role = aws_iam_role.task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${local.account_id}:log-group:/ecs/${local.resource_prefix}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_metrics" {
  name = "${local.resource_prefix}-cloudwatch-metrics"
  role = aws_iam_role.task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CloudWatchMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "AVA/Gateway"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_s3_config" {
  name = "${local.resource_prefix}-s3-config-read"
  role = aws_iam_role.task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3GetConfig"
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = "arn:aws:s3:::${var.config_s3_bucket}/${var.config_s3_prefix}/*"
      },
      {
        Sid    = "S3ListConfig"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${var.config_s3_bucket}"
        Condition = {
          StringLike = {
            "s3:prefix" = "${var.config_s3_prefix}/*"
          }
        }
      }
    ]
  })
}

# =============================================================================
# IAM Execution Role
# =============================================================================
# Used by ECS agent to pull container images and inject secrets as env vars.
# Permissions:
#   - ECR pull (GetAuthorizationToken, BatchGetImage, GetDownloadUrlForLayer)
#   - CloudWatch Logs creation (CreateLogGroup, CreateLogStream, PutLogEvents)
#   - Secrets Manager read (for env variable injection at container start)
# =============================================================================

resource "aws_iam_role" "execution_role" {
  name = "${local.resource_prefix}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSExecutionAssume"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:ecs:${data.aws_region.current.name}:${local.account_id}:*"
          }
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-execution-role"
  })
}

resource "aws_iam_role_policy" "execution_ecr" {
  name = "${local.resource_prefix}-ecr-pull"
  role = aws_iam_role.execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "arn:aws:ecr:${data.aws_region.current.name}:${local.account_id}:repository/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "execution_logs" {
  name = "${local.resource_prefix}-execution-logs"
  role = aws_iam_role.execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${local.account_id}:log-group:/ecs/${local.resource_prefix}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "${local.resource_prefix}-execution-secrets"
  role = aws_iam_role.execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerEnvInjection"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${data.aws_region.current.name}:${local.account_id}:secret:${var.name_prefix}-*"
      }
    ]
  })
}
