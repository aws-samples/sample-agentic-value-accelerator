
resource "aws_ecs_task_definition" "langfuse_worker" {
  family                   = "${var.name}-langfuse-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.langfuse_cpu
  memory                   = var.langfuse_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "langfuse"
      image = "${aws_ecr_repository.images["langfuse-worker"].repository_url}:${var.langfuse_version}"
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      essential = true
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.langfuse-worker.name
          "awslogs-region"        = data.aws_region.current.id
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "DATABASE_HOST"
          value = aws_rds_cluster.postgres.endpoint
        },
        {
          name  = "DATABASE_USERNAME"
          value = "langfuse"
        },
        {
          name  = "DATABASE_NAME"
          value = "langfuse"
        },
        {
          name  = "REDIS_HOST"
          value = aws_elasticache_replication_group.redis.primary_endpoint_address
        },
        {
          name  = "REDIS_PORT"
          value = "6379"
        },
        {
          name  = "REDIS_USERNAME"
          value = "default"
        },
        {
          name  = "HOSTNAME"
          value = "0.0.0.0"
        },
        {
          name  = "NEXTAUTH_URL"
          value = var.domain != null ? "https://${var.domain}" : "https://${aws_cloudfront_distribution.langfuse.domain_name}"
        },
        {
          name  = "LANGFUSE_S3_EVENT_UPLOAD_BUCKET"
          value = aws_s3_bucket.langfuse.id
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_ENABLED"
          value = "true"
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_BUCKET"
          value = aws_s3_bucket.langfuse.id
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_PREFIX"
          value = "exports/"
        },
        {
          name  = "LANGFUSE_S3_MEDIA_UPLOAD_BUCKET"
          value = aws_s3_bucket.langfuse.id
        },
        {
          name  = "S3_REGION"
          value = data.aws_region.current.id
        },
        {
          name  = "CLICKHOUSE_MIGRATION_URL"
          value = "clickhouse://clickhouse.${var.name}.local:9000"
        },
        {
          name  = "CLICKHOUSE_URL"
          value = "http://clickhouse.${var.name}.local:8123"
        },
        {
          name  = "CLICKHOUSE_USER"
          value = "default"
        },
        {
          name  = "CLICKHOUSE_DB"
          value = "default"
        },
        {
          name  = "LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES"
          value = "true"
        },
        {
          name  = "LANGFUSE_READ_FROM_CLICKHOUSE_ONLY"
          value = "true"
        },
        {
          name  = "LANGFUSE_READ_FROM_POSTGRES_ONLY"
          value = "false"
        },
        {
          name  = "LANGFUSE_RETURN_FROM_CLICKHOUSE"
          value = "true"
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_REGION"
          value = data.aws_region.current.id
        },
        {
          name  = "LANGFUSE_S3_EVENT_UPLOAD_REGION"
          value = data.aws_region.current.id
        },
        {
          name  = "LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS"
          value = "604800"
        },
        {
          name  = "LANGFUSE_S3_MEDIA_UPLOAD_ENABLED"
          value = "true"
        },
        {
          name  = "LANGFUSE_SDK_CI_SYNC_PROCESSING_ENABLED"
          value = "false"
        },
        {
          name  = "TELEMETRY_ENABLED"
          value = "true"
        },
        {
          name  = "LANGFUSE_INIT_ORG_ID"
          value = "seed-org"
        },
        {
          name  = "LANGFUSE_INIT_ORG_NAME"
          value = var.langfuse_init_org_name
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_ID"
          value = "seed-project"
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_NAME"
          value = "Seed Project"
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_PUBLIC_KEY"
          value = local.langfuse_public_key
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_SECRET_KEY"
          value = local.langfuse_secret_key
        },
        {
          name  = "CLICKHOUSE_CLUSTER_ENABLED"
          value = "false"
        },
        {
          name  = "LANGFUSE_INIT_USER_EMAIL"
          value = var.langfuse_init_user_email
        },
        {
          name  = "LANGFUSE_INIT_USER_NAME"
          value = var.langfuse_init_user_name
        },
        {
          name  = "LANGFUSE_INIT_USER_PASSWORD"
          value = var.langfuse_init_user_password
        }

      ]
      secrets = [
        {
          name      = "DATABASE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:postgres_password::"
        },
        {
          name      = "REDIS_AUTH"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:redis_password::"
        },
        {
          name      = "SALT"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:salt::"
        },
        {
          name      = "NEXTAUTH_SECRET"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:nextauth_secret::"
        },
        {
          name      = "CLICKHOUSE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:clickhouse_password::"
        },
        {
          name      = "ENCRYPTION_KEY"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:encryption_key::"
        }
      ]
      # healthCheck = {
      #   command     = ["CMD-SHELL", "curl -f http://localhost:3000/api/public/health || exit 1"]
      #   interval    = 30
      #   timeout     = 5
      #   retries     = 3
      #   startPeriod = 60
      # }
    }
  ],
  )
  runtime_platform {
    cpu_architecture        = "X86_64"
  }
  depends_on = [time_sleep.wait_30_seconds, null_resource.push_images]
  tags = {
    Name = "${local.tag_name} Langfuse Task"
  }

}


# Langfuse ECS Task Definition
resource "aws_ecs_task_definition" "langfuse" {
  family                   = "${var.name}-langfuse"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.langfuse_cpu
  memory                   = var.langfuse_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "langfuse"
      image = "${aws_ecr_repository.images["langfuse"].repository_url}:${var.langfuse_version}"
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      essential = true
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.langfuse.name
          "awslogs-region"        = data.aws_region.current.id
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "DATABASE_HOST"
          value = aws_rds_cluster.postgres.endpoint
        },
        {
          name  = "DATABASE_USERNAME"
          value = "langfuse"
        },
        {
          name  = "DATABASE_NAME"
          value = "langfuse"
        },
        {
          name  = "REDIS_HOST"
          value = aws_elasticache_replication_group.redis.primary_endpoint_address
        },
        {
          name  = "REDIS_PORT"
          value = "6379"
        },
        {
          name  = "REDIS_USERNAME"
          value = "default"
        },
        {
          name  = "HOSTNAME"
          value = "0.0.0.0"
        },
        {
          name  = "NEXTAUTH_URL"
          value = var.domain != null ? "https://${var.domain}" : "https://${aws_cloudfront_distribution.langfuse.domain_name}"
        },
        {
          name  = "LANGFUSE_S3_EVENT_UPLOAD_BUCKET"
          value = aws_s3_bucket.langfuse.id
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_ENABLED"
          value = "true"
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_BUCKET"
          value = aws_s3_bucket.langfuse.id
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_PREFIX"
          value = "exports/"
        },
        {
          name  = "LANGFUSE_S3_MEDIA_UPLOAD_BUCKET"
          value = aws_s3_bucket.langfuse.id
        },
        {
          name  = "S3_REGION"
          value = data.aws_region.current.id
        },
        {
          name  = "CLICKHOUSE_MIGRATION_URL"
          value = "clickhouse://clickhouse.${var.name}.local:9000"
        },
        {
          name  = "CLICKHOUSE_URL"
          value = "http://clickhouse.${var.name}.local:8123"
        },
        {
          name  = "CLICKHOUSE_USER"
          value = "default"
        },
        {
          name  = "CLICKHOUSE_DB"
          value = "default"
        },
        {
          name  = "LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES"
          value = "true"
        },
                {
          name  = "LANGFUSE_READ_FROM_CLICKHOUSE_ONLY"
          value = "true"
        },
        {
          name  = "LANGFUSE_READ_FROM_POSTGRES_ONLY"
          value = "false"
        },
        {
          name  = "LANGFUSE_RETURN_FROM_CLICKHOUSE"
          value = "true"
        },
        {
          name  = "LANGFUSE_S3_BATCH_EXPORT_REGION"
          value = data.aws_region.current.id
        },
        {
          name  = "LANGFUSE_S3_EVENT_UPLOAD_REGION"
          value = data.aws_region.current.id
        },
        {
          name  = "LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS"
          value = "604800"
        },
        {
          name  = "LANGFUSE_S3_MEDIA_UPLOAD_ENABLED"
          value = "true"
        },
        {
          name  = "LANGFUSE_SDK_CI_SYNC_PROCESSING_ENABLED"
          value = "false"
        },
        {
          name  = "TELEMETRY_ENABLED"
          value = "true"
        },
        {
          name  = "LANGFUSE_INIT_ORG_ID"
          value = "seed-org"
        },
        {
          name  = "LANGFUSE_INIT_ORG_NAME"
          value = var.langfuse_init_org_name
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_ID"
          value = "seed-project"
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_NAME"
          value = "Seed Project"
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_PUBLIC_KEY"
          value = local.langfuse_public_key
        },
        {
          name  = "LANGFUSE_INIT_PROJECT_SECRET_KEY"
          value = local.langfuse_secret_key
        },
        {
          name  = "CLICKHOUSE_CLUSTER_ENABLED"
          value = "false"
        },
        {
          name  = "LANGFUSE_INIT_USER_EMAIL"
          value = var.langfuse_init_user_email
        },
        {
          name  = "LANGFUSE_INIT_USER_NAME"
          value = var.langfuse_init_user_name
        },
        {
          name  = "LANGFUSE_INIT_USER_PASSWORD"
          value = var.langfuse_init_user_password
        }

      ]
      secrets = [
        {
          name      = "DATABASE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:postgres_password::"
        },
        {
          name      = "REDIS_AUTH"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:redis_password::"
        },
        {
          name      = "SALT"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:salt::"
        },
        {
          name      = "NEXTAUTH_SECRET"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:nextauth_secret::"
        },
        {
          name      = "CLICKHOUSE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:clickhouse_password::"
        },
        {
          name      = "ENCRYPTION_KEY"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:encryption_key::"
        }
      ]
      # healthCheck = {
      #   command     = ["CMD-SHELL", "curl -f http://localhost:3000/api/public/health || exit 1"]
      #   interval    = 30
      #   timeout     = 5
      #   retries     = 3
      #   startPeriod = 60
      # }
    }
  ],
  )
  runtime_platform {
    cpu_architecture        = "X86_64"
  }
  depends_on = [aws_ecs_task_definition.langfuse_worker, null_resource.push_images]
  tags = {
    Name = "${local.tag_name} Langfuse Task"
  }

}

resource "time_sleep" "wait_30_seconds" {
  depends_on = [aws_ecs_task_definition.clickhouse]

  create_duration = "90s"
}

# ClickHouse ECS Task Definition
resource "aws_ecs_task_definition" "clickhouse" {
  family                   = "${var.name}-clickhouse"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.clickhouse_cpu
  memory                   = var.clickhouse_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "clickhouse"
      image = "${aws_ecr_repository.images["clickhouse"].repository_url}:${var.clickhouse_version}"
      portMappings = [
        {
          containerPort = 8123
          protocol      = "tcp"
        },
        {
          containerPort = 9000
          protocol      = "tcp"
        }
      ]
      essential = true
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.clickhouse.name
          "awslogs-region"        = data.aws_region.current.id
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = [
        {
          name  = "CLICKHOUSE_DB"
          value = "default"
        },
        {
          name  = "CLICKHOUSE_USER"
          value = "default"
        }
      ]
      secrets = [
        {
          name      = "CLICKHOUSE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.langfuse.arn}:clickhouse_password::"
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost:8123/ping || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      mountPoints = [
        {
          sourceVolume  = "clickhouse-data"
          containerPath = "/var/lib/clickhouse"
        }
      ]
    }
  ]
  )

  volume {
    name = "clickhouse-data"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.clickhouse.id
      root_directory = "/"
    }
  }

  runtime_platform {
    cpu_architecture = "X86_64"
  }

  depends_on = [null_resource.push_images]

  tags = {
    Name = "${local.tag_name} ClickHouse Task"
  }
}

# Langfuse ECS Service
resource "aws_ecs_service" "langfuse" {
  name            = "${var.name}-langfuse"
  cluster         = aws_ecs_cluster.langfuse.id
  task_definition = aws_ecs_task_definition.langfuse.arn
  desired_count   = var.langfuse_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups = [aws_security_group.ecs_tasks.id]
    subnets         = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.langfuse.arn
    container_name   = "langfuse"
    container_port   = 3000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.langfuse.arn
  }

  enable_execute_command = var.enable_execute_command

  depends_on = [aws_lb_listener.langfuse]

  tags = {
    Name = "${local.tag_name} Langfuse Service"
  }
}

# ClickHouse ECS Service
resource "aws_ecs_service" "clickhouse" {
  name            = "${var.name}-clickhouse"
  cluster         = aws_ecs_cluster.langfuse.id
  task_definition = aws_ecs_task_definition.clickhouse.arn
  desired_count   = var.clickhouse_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups = [aws_security_group.ecs_tasks.id]
    subnets         = var.private_subnet_ids
  }

  service_registries {
    registry_arn = aws_service_discovery_service.clickhouse.arn
  }

  enable_execute_command = var.enable_execute_command

  tags = {
    Name = "${local.tag_name} ClickHouse Service"
  }
}


resource "aws_ecs_service" "langfuse-worker" {
  name            = "${var.name}-langfuse-worker"
  cluster         = aws_ecs_cluster.langfuse.id
  task_definition = aws_ecs_task_definition.langfuse_worker.arn
  desired_count   = var.langfuse_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups = [aws_security_group.ecs_tasks.id]
    subnets         = var.private_subnet_ids
  }

  service_registries {
    registry_arn = aws_service_discovery_service.langfuse-worker.arn
  }

  enable_execute_command = var.enable_execute_command

  tags = {
    Name = "${local.tag_name} Langfuse Worker Service"
  }
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "langfuse" {
  name        = "${var.name}.local"
  description = "Private DNS namespace for Langfuse services"
  vpc         = data.aws_vpc.vpc.id

  tags = {
    Name = "${local.tag_name} DNS Namespace"
  }
}

resource "aws_service_discovery_service" "langfuse" {
  name = "langfuse"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.langfuse.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  tags = {
    Name = "${local.tag_name} Langfuse Discovery"
  }
}

resource "aws_service_discovery_service" "langfuse-worker" {
  name = "langfuse-worker"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.langfuse.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  tags = {
    Name = "${local.tag_name} Langfuse Worker"
  }
}

resource "aws_service_discovery_service" "clickhouse" {
  name = "clickhouse"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.langfuse.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  tags = {
    Name = "${local.tag_name} ClickHouse Discovery"
  }
}

# EFS for ClickHouse persistent storage
resource "aws_efs_file_system" "clickhouse" {
  creation_token = "${var.name}-clickhouse"
  encrypted      = true

  tags = {
    Name = "${local.tag_name} ClickHouse EFS"
  }
}

resource "aws_efs_mount_target" "clickhouse" {
  count           = length(var.private_subnet_ids)
  file_system_id  = aws_efs_file_system.clickhouse.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

resource "aws_security_group" "efs" {
  name        = "${var.name}-efs"
  description = "Security group for EFS mount targets"
  vpc_id      = data.aws_vpc.vpc.id

  ingress {
    from_port   = 2049
    to_port     = 2049
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.tag_name} EFS"
  }
}
