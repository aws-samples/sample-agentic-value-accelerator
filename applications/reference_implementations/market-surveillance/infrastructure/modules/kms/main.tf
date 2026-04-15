data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  keys = {
    rds = {
      description = "Encrypts Aurora PostgreSQL storage at rest"
      service     = "rds.amazonaws.com"
    }
    s3 = {
      description = "Encrypts S3 objects (agent configs, artifacts)"
      service     = "s3.amazonaws.com"
    }
    dynamodb = {
      description = "Encrypts DynamoDB tables (chat history, session metadata)"
      service     = "dynamodb.amazonaws.com"
    }
    secrets = {
      description = "Encrypts Secrets Manager secrets (DB credentials)"
      service     = "secretsmanager.amazonaws.com"
    }
    lambda = {
      description = "Encrypts Lambda environment variables"
      service     = "lambda.amazonaws.com"
    }
    ebs = {
      description = "Encrypts EBS volumes (bastion, webapp instances)"
      service     = "ec2.amazonaws.com"
    }
    logs = {
      description = "Encrypts CloudWatch Logs"
      service     = "logs.amazonaws.com"
    }
    ecr = {
      description = "Encrypts ECR container images"
      service     = "ecr.amazonaws.com"
    }
  }
}

# KMS Keys — one per service for granular access control
resource "aws_kms_key" "this" {
  for_each = local.keys

  description             = "Market Surveillance ${each.key} – ${each.value.description}"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = var.enable_key_rotation
  is_enabled              = true

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "market-surveillance-${each.key}-key-policy"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowServiceUsage"
        Effect = "Allow"
        Principal = {
          Service = each.value.service
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
    ]
  })

  tags = {
    Name        = "market-surveillance-${each.key}-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
    Service     = each.key
  }
}

# Alias for each key — human-readable references
resource "aws_kms_alias" "this" {
  for_each = local.keys

  name          = "alias/market-surveillance-${each.key}-${var.environment}"
  target_key_id = aws_kms_key.this[each.key].key_id
}
