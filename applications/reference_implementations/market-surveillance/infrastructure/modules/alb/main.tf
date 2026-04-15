# Application Load Balancer Module
# Purpose: Load balancer for web application EC2 instances

locals {
  alb_name = "trade-webapp-alb-${var.environment}"
  tg_name  = "trade-webapp-tg-${var.environment}"
}

# Application Load Balancer
# Access logs are conditionally enabled via dynamic block — enabled in prod environments
resource "aws_lb" "webapp" {
  # nosemgrep: terraform.aws.security.aws-elb-access-logs-not-enabled.aws-elb-access-logs-not-enabled
  #checkov:skip=CKV_AWS_150:Deletion protection is set by the caller based on environment (prod=true)
  #checkov:skip=CKV2_AWS_20:Redirect to HTTPS requires HTTPS listener and certificate which is suitable for Production environments but out of scope for PoC
  name               = local.alb_name
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.security_group_ids
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.enable_deletion_protection
  enable_http2               = var.enable_http2
  idle_timeout               = var.idle_timeout

  

  drop_invalid_header_fields = true

  dynamic "access_logs" {
    for_each = var.enable_access_logs && var.access_logs_bucket != "" ? [1] : []
    content {
      bucket  = var.access_logs_bucket
      prefix  = var.access_logs_prefix
      enabled = true
    }
  }

  tags = {
    Name        = local.alb_name
    Environment = var.environment
    Project     = "market-surveillance"
    Component   = "webapp"
  }
}

# Target Group
resource "aws_lb_target_group" "webapp" {
  name     = local.tg_name
  port     = var.target_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    path                = var.health_check_path
    protocol            = "HTTP"
    port                = "traffic-port"
    interval            = var.health_check_interval
    timeout             = var.health_check_timeout
    healthy_threshold   = var.health_check_healthy_threshold
    unhealthy_threshold = var.health_check_unhealthy_threshold
    matcher             = "200-299"
  }

  deregistration_delay = var.deregistration_delay

  stickiness {
    enabled         = var.stickiness_enabled
    type            = "lb_cookie"
    cookie_duration = var.stickiness_duration
  }

  # Connection settings for streaming responses
  connection_termination = false

  tags = {
    Name        = local.tg_name
    Environment = var.environment
    Project     = "market-surveillance"
    Component   = "webapp"
  }
}

# HTTP Listener - Forward to target group (if no HTTPS) or redirect to HTTPS
resource "aws_lb_listener" "http" {
  #checkov:skip=CKV_AWS_2:HTTP Protocol is suitable for development environment; For production, move to using HTTPS with certificate
  #checkov:skip=CKV_AWS_103:SSL Policy not required for HTTP protocol. For Production environment using HTTPS, will require custom SSL Policy or default

  load_balancer_arn = aws_lb.webapp.arn
  port              = 80
  protocol          = "HTTP"

  # If certificate is provided, redirect to HTTPS; otherwise forward to target group
  default_action {
    type = var.certificate_arn != "" ? "redirect" : "forward"

    # Redirect to HTTPS (only if certificate is provided)
    dynamic "redirect" {
      for_each = var.certificate_arn != "" ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    # Forward to target group (only if no certificate)
    target_group_arn = var.certificate_arn == "" ? aws_lb_target_group.webapp.arn : null
  }

  tags = {
    Name        = var.certificate_arn != "" ? "${local.alb_name}-http-redirect" : "${local.alb_name}-http-listener"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

# HTTPS Listener - Only created if certificate is provided
resource "aws_lb_listener" "https" {
  count = var.certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.webapp.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.webapp.arn
  }

  tags = {
    Name        = "${local.alb_name}-https-listener"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}
