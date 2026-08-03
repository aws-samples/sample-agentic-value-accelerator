# -----------------------------------------------------------------------------
# Bedrock private connectivity
#
# Two AWS PrivateLink interface endpoints so every LiteLLM -> Bedrock call
# stays on the AWS backbone instead of going out via NAT Gateway to the
# public bedrock-runtime API:
#
#   * com.amazonaws.<region>.bedrock-runtime  — InvokeModel*, Converse*
#   * com.amazonaws.<region>.bedrock          — listFoundationModels, getModel,
#                                               ApplyGuardrail
#
# Benefits over public path:
#   * Tokens never traverse the public internet
#   * Lower latency (single AWS hop)
#   * Zero NAT egress charges on Bedrock traffic — the dominant gateway cost
#   * Route 53 private DNS resolves bedrock-runtime.<region>.amazonaws.com to
#     the endpoint ENIs automatically (no SDK changes needed in LiteLLM)
# -----------------------------------------------------------------------------

resource "aws_security_group" "bedrock_endpoint" {
  name = "${var.name}-bedrock-endpoint"
  # AWS SG description allowlist excludes > and a few other characters.
  # Keep this string ASCII and inside: a-zA-Z0-9. _-:/()#,@[]+=&;{}!$*
  description = "LiteLLM ECS tasks to Bedrock VPC endpoints"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
    description     = "HTTPS from LiteLLM ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.tag_name} Bedrock Endpoint" })
}

resource "aws_vpc_endpoint" "bedrock_runtime" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.bedrock_endpoint.id]
  private_dns_enabled = true

  tags = merge(local.common_tags, { Name = "${local.tag_name} bedrock-runtime" })
}

resource "aws_vpc_endpoint" "bedrock" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.bedrock"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.bedrock_endpoint.id]
  private_dns_enabled = true

  tags = merge(local.common_tags, { Name = "${local.tag_name} bedrock" })
}
