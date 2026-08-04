# =============================================================================
# LiteLLM ALB — hardened against unauthenticated access (DyePack remediation)
# =============================================================================
# Security model:
#   1. SG ingress restricted to CloudFront managed prefix list — arbitrary
#      internet IPs cannot reach the ALB ENI at all.
#   2. HTTP:80 listener default action is 403 — only requests carrying the
#      x-origin-verify shared secret header are forwarded to LiteLLM.
#   3. (Optional) HTTPS:443 listener when acm_certificate_arn is provided,
#      with HTTP:80 redirecting to HTTPS instead.
#
# This matches the Langfuse ALB pattern in foundation-stack and fully closes
# the DyePack EC2IPAuthentication finding.
# =============================================================================

locals {
  enable_https = var.acm_certificate_arn != ""
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

# Only allow traffic from CloudFront edge IPs
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "LiteLLM ALB - CloudFront origin only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
    description     = "HTTP from CloudFront only"
  }

  dynamic "ingress" {
    for_each = local.enable_https ? [1] : []
    content {
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
      description     = "HTTPS from CloudFront only"
    }
  }

  # In-VPC callers (e.g. AgentCore runtimes) do not egress from CloudFront
  # edge IPs, so the CloudFront prefix list alone is not sufficient for them
  # to reach the ALB. Allow the VPC (or any operator-supplied) CIDR here.
  dynamic "ingress" {
    for_each = length(var.additional_ingress_cidrs) > 0 ? [1] : []
    content {
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = var.additional_ingress_cidrs
      description = "HTTP from additional CIDRs (e.g. VPC for AgentCore runtimes)"
    }
  }

  dynamic "ingress" {
    for_each = local.enable_https && length(var.additional_ingress_cidrs) > 0 ? [1] : []
    content {
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.additional_ingress_cidrs
      description = "HTTPS from additional CIDRs (e.g. VPC for AgentCore runtimes)"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} ALB" })
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name}-ecs-tasks"
  description = "LiteLLM ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "From ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} ECS Tasks" })
}

# -----------------------------------------------------------------------------
# Application Load Balancer
# -----------------------------------------------------------------------------

resource "aws_lb" "litellm" {
  name               = "${var.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  drop_invalid_header_fields = true
  enable_deletion_protection = false

  tags = merge(local.common_tags, { Name = local.tag_name })
}

resource "aws_lb_target_group" "litellm" {
  name        = "${var.name}-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health/liveliness"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} TG" })
}

# -----------------------------------------------------------------------------
# HTTP Listener (Port 80)
# - Without HTTPS: default 403, forward only with x-origin-verify header
# - With HTTPS:    redirect all traffic to :443
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.litellm.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = local.enable_https ? "redirect" : "fixed-response"

    dynamic "redirect" {
      for_each = local.enable_https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "fixed_response" {
      for_each = local.enable_https ? [] : [1]
      content {
        content_type = "text/plain"
        message_body = "Forbidden"
        status_code  = "403"
      }
    }
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} HTTP" })
}

# Forward on HTTP:80 only when x-origin-verify header matches (no-HTTPS mode)
resource "aws_lb_listener_rule" "http_origin_verify" {
  count        = local.enable_https ? 0 : 1
  listener_arn = aws_lb_listener.http.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.litellm.arn
  }

  condition {
    http_header {
      http_header_name = "x-origin-verify"
      values           = [random_password.origin_verify.result]
    }
  }
}

# -----------------------------------------------------------------------------
# HTTPS Listener (Port 443) — optional, when acm_certificate_arn is provided
# Same origin-verify pattern: default 403, forward only with shared secret.
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "https" {
  count             = local.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.litellm.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} HTTPS" })
}

# Forward on HTTPS:443 only when x-origin-verify header matches
resource "aws_lb_listener_rule" "https_origin_verify" {
  count        = local.enable_https ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.litellm.arn
  }

  condition {
    http_header {
      http_header_name = "x-origin-verify"
      values           = [random_password.origin_verify.result]
    }
  }
}
