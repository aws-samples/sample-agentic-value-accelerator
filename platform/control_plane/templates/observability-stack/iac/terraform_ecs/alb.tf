# Security Groups
resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name}-ecs-tasks"
  description = "Security group for ECS tasks"
  vpc_id      = data.aws_vpc.vpc.id

  ingress {
    protocol    = "tcp"
    from_port   = 3000
    to_port     = 3000
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  ingress {
    protocol    = "tcp"
    from_port   = 8123
    to_port     = 8123
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  ingress {
    protocol    = "tcp"
    from_port   = 9000
    to_port     = 9000
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  ingress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = [data.aws_vpc.vpc.cidr_block]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.tag_name} ECS Tasks"
  }
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Security group for Application Load Balancer"
  vpc_id      = data.aws_vpc.vpc.id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = var.ingress_inbound_cidrs
  }

  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = var.ingress_inbound_cidrs
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.tag_name} ALB"
  }
}

# Application Load Balancer
resource "aws_lb" "langfuse" {
  name               = var.name
  internal           = var.alb_scheme == "internal"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.alb_scheme == "internal" ? var.private_subnet_ids : var.public_subnet_ids

  enable_deletion_protection = false

  tags = {
    Name = local.tag_name
  }
}

resource "aws_lb_target_group" "langfuse" {
  name        = "${var.name}-langfuse"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.vpc.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/api/public/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${local.tag_name} Langfuse"
  }
}

resource "aws_lb_listener" "langfuse" {
  load_balancer_arn = aws_lb.langfuse.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.langfuse.arn
  }

  tags = {
    Name = "${local.tag_name} Langfuse"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "langfuse" {
  name = var.name

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"

      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs_exec.name
      }
    }
  }

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = local.tag_name
  }
}

resource "aws_ecs_cluster_capacity_providers" "langfuse" {
  cluster_name = aws_ecs_cluster.langfuse.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "ecs_exec" {
  name              = "/aws/ecs/${var.name}/exec"
  retention_in_days = 7

  tags = {
    Name = "${local.tag_name} ECS Exec"
  }
}

resource "aws_cloudwatch_log_group" "langfuse" {
  name              = "/aws/ecs/${var.name}/langfuse"
  retention_in_days = 7

  tags = {
    Name = "${local.tag_name} Langfuse"
  }
}

resource "aws_cloudwatch_log_group" "langfuse-worker" {
  name              = "/aws/ecs/${var.name}/langfuse-worker"
  retention_in_days = 7

  tags = {
    Name = "${local.tag_name} Langfuse-worker"
  }
}

resource "aws_cloudwatch_log_group" "clickhouse" {
  name              = "/aws/ecs/${var.name}/clickhouse"
  retention_in_days = 7

  tags = {
    Name = "${local.tag_name} ClickHouse"
  }
}
