# =============================================================================
# LiteLLM Gateway Module - Application Load Balancer
# =============================================================================
# Implements:
#   - Internal ALB in public subnets
#   - HTTP listener on port 4000 (primary gateway endpoint for ECS tasks
#     and Lambda within the VPC)
#
# Task: 1.3
# Requirements: 1.3
#
# Security Notes:
#   - ALB is internal (not internet-facing) — reachable only within the VPC
#   - Port 4000: direct forwarding (used by ECS tasks, Lambda, backend)
# =============================================================================

# -----------------------------------------------------------------------------
# Internal Application Load Balancer
# -----------------------------------------------------------------------------

resource "aws_lb" "litellm" {
  name               = "${var.name_prefix}-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.litellm_alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false
  drop_invalid_header_fields = true

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-alb"
  })
}

# -----------------------------------------------------------------------------
# HTTP Listener (Port 4000) - Primary Gateway Endpoint
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "litellm_internal" {
  load_balancer_arn = aws_lb.litellm.arn
  port              = 4000
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.litellm.arn
  }

  tags = local.tags
}
