# OpenSearch domain for vector storage
resource "aws_opensearch_domain" "vectors" {
  domain_name    = "${var.project_name}-vectors"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type  = "t3.small.search"
    instance_count = 1
  }

  ebs_options {
    ebs_enabled = true
    volume_size = 10
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-vectors"
    }
  )
}

# S3 bucket for document storage
resource "aws_s3_bucket" "documents" {
  bucket = "${var.project_name}-documents"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-documents"
    }
  )
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint"
  value       = aws_opensearch_domain.vectors.endpoint
}

output "documents_bucket" {
  description = "S3 bucket for documents"
  value       = aws_s3_bucket.documents.id
}
