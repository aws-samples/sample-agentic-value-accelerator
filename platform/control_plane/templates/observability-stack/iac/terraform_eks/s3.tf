locals {
  # Convert domain to bucket-friendly format (e.g., company.com -> company-com)
  bucket_prefix = replace(local.effective_domain, ".", "-")
}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "aws_s3_bucket" "langfuse" {
  bucket = "${local.bucket_prefix}-${var.name}-${random_string.suffix.result}"

  # Add tags for better resource management
  tags = {
    Name    = "${local.bucket_prefix}-${var.name}"
    Domain  = local.effective_domain
    Service = "langfuse"
  }
}

resource "aws_s3_bucket_versioning" "langfuse" {
  bucket = aws_s3_bucket.langfuse.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "langfuse" {
  bucket = aws_s3_bucket.langfuse.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Add lifecycle rules for cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "langfuse" {
  bucket = aws_s3_bucket.langfuse.id

  # https://aws.amazon.com/s3/storage-classes/
  # Transition to "STANDARD Infrequent Access" after 90 days, and
  # to "GLACIER Instant Retrieval" after 180 days
  rule {
    id     = "langfuse_lifecycle"
    status = "Enabled"

    filter {
      prefix = "" # Empty prefix matches all objects
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER_IR"
    }
  }
}

# Create IRSA role for Langfuse service account
resource "aws_iam_role" "langfuse_irsa" {
  name = "langfuse"
  path = "/kubernetes/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${replace(aws_eks_cluster.langfuse.identity[0].oidc[0].issuer, "https://", "")}"
        }
        Condition = {
          StringEquals = {
            "${replace(aws_eks_cluster.langfuse.identity[0].oidc[0].issuer, "https://", "")}:sub" : "system:serviceaccount:langfuse:langfuse"
            "${replace(aws_eks_cluster.langfuse.identity[0].oidc[0].issuer, "https://", "")}:aud" : "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

# S3 access policy for the IRSA role
resource "aws_iam_role_policy" "langfuse_s3_access" {
  name = "${var.name}-s3-access"
  role = aws_iam_role.langfuse_irsa.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.langfuse.arn,
          "${aws_s3_bucket.langfuse.arn}/*"
        ]
      }
    ]
  })
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
