# -----------------------------------------------------------------------------
# Memory Execution IAM Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "memory" {
  name        = "${local.name_prefix}-agentcore-memory"
  description = "IAM role assumed by Bedrock AgentCore for memory operations."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "bedrock-agentcore.amazonaws.com" }
        Action    = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:aws:bedrock-agentcore:${local.region}:${local.account_id}:*"
          }
        }
      }
    ]
  })

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Managed Policy: Memory Model Inference
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "memory_inference" {
  role       = aws_iam_role.memory.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonBedrockAgentCoreMemoryBedrockModelInferenceExecutionRolePolicy"
}
