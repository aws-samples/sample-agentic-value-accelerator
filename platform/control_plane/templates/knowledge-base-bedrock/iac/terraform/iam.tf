###############################################################################
# IAM Role — Knowledge Base Execution
###############################################################################

resource "aws_iam_role" "kb_role" {
  name = "${local.prefix}-kb-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "bedrock.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  tags = local.default_tags
}

###############################################################################
# IAM Policy — S3 Access
###############################################################################

resource "aws_iam_role_policy" "kb_s3" {
  name = "s3-access"
  role = aws_iam_role.kb_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
      }
    ]
  })
}

###############################################################################
# IAM Policy — OpenSearch Serverless Access
###############################################################################

resource "aws_iam_role_policy" "kb_aoss" {
  name = "aoss-access"
  role = aws_iam_role.kb_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "aoss:APIAccessAll"
        Resource = aws_opensearchserverless_collection.this.arn
      }
    ]
  })
}

###############################################################################
# IAM Policy — Bedrock Embedding Model
###############################################################################

resource "aws_iam_role_policy" "kb_bedrock" {
  name = "bedrock-invoke"
  role = aws_iam_role.kb_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "bedrock:InvokeModel"
        Resource = local.embedding_model_arn
      }
    ]
  })
}
