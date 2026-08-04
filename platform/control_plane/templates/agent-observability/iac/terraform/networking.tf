# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-langfuse-alb"
  description = "ALB security group for Langfuse"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.certificate_arn != "" ? [1] : []
    content {
      description = "HTTPS"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-langfuse-ecs"
  description = "ECS tasks security group for Langfuse"
  vpc_id      = var.vpc_id

  ingress {
    description     = "ALB to ECS"
    from_port       = local.app_port
    to_port         = local.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-langfuse-rds"
  description = "RDS security group for Langfuse"
  vpc_id      = var.vpc_id

  ingress {
    description     = "ECS to RDS"
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-langfuse-redis"
  description = "Redis security group for Langfuse"
  vpc_id      = var.vpc_id

  ingress {
    description     = "ECS to Redis"
    from_port       = local.redis_port
    to_port         = local.redis_port
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# -----------------------------------------------------------------------------
# Application Load Balancer
# -----------------------------------------------------------------------------

resource "aws_lb" "langfuse" {
  name               = "${local.name_prefix}-langfuse"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "langfuse" {
  name        = "${local.name_prefix}-langfuse"
  port        = local.app_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/public/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }
}

# -----------------------------------------------------------------------------
# HTTP Listener
# When certificate_arn is provided, HTTP redirects to HTTPS.
# Otherwise, HTTP forwards directly (WARNING: not suitable for production).
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "langfuse_http" {
  load_balancer_arn = aws_lb.langfuse.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = var.certificate_arn != "" ? "redirect" : "forward"

    dynamic "redirect" {
      for_each = var.certificate_arn != "" ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    # Forward only when no certificate (HTTP-only mode)
    target_group_arn = var.certificate_arn == "" ? aws_lb_target_group.langfuse.arn : null
  }
}

# -----------------------------------------------------------------------------
# HTTPS Listener (only created when certificate_arn is provided)
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "langfuse_https" {
  count             = var.certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.langfuse.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.langfuse.arn
  }
}
