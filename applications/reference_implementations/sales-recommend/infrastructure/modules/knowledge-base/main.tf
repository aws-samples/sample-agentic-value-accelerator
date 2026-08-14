###############################################################################
# Knowledge Base Module
#
# Provisions a fully self-contained Amazon Bedrock Knowledge Base:
#   - S3 bucket (random name) as the data source
#   - Amazon OpenSearch Serverless (VECTORSEARCH) collection as the vector store
#     (AWS-native "serverless" search backend; successor to Elasticsearch)
#   - Vector index inside the collection (created via the opensearch provider,
#     since the AWS provider has no native OSS index resource)
#   - Dedicated IAM role trusted by Bedrock
#   - Bedrock Knowledge Base + S3 data source
###############################################################################

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.17.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    opensearch = {
      source  = "opensearch-project/opensearch"
      version = ">= 2.2.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }
}

locals {
  # OpenSearch Serverless collection names: 3-32 chars, lowercase alphanumeric
  # and hyphen, must start with a letter. Derive a safe name from the project.
  collection_name = substr(replace(lower("${var.project}-kb"), "/[^a-z0-9-]/", "-"), 0, 32)

  index_name     = "bedrock-knowledge-base-default-index"
  vector_field   = "bedrock-knowledge-base-default-vector"
  text_field     = "AMAZON_BEDROCK_TEXT_CHUNK"
  metadata_field = "AMAZON_BEDROCK_METADATA"

  embedding_model_arn = "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.embedding_model_id}"
}

data "aws_caller_identity" "current" {}

# --------------------------------------------------------------------------
# S3 bucket — data source (random name)
# --------------------------------------------------------------------------
resource "random_id" "bucket_suffix" {
  byte_length = 6
}

resource "aws_s3_bucket" "data_source" {
  bucket        = "${var.project}-kb-${random_id.bucket_suffix.hex}"
  force_destroy = var.force_destroy_bucket

  tags = {
    Name    = "${var.project}-kb-data-source"
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "data_source" {
  bucket                  = aws_s3_bucket.data_source.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_source" {
  bucket = aws_s3_bucket.data_source.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "data_source" {
  bucket = aws_s3_bucket.data_source.id
  versioning_configuration {
    status = "Enabled"
  }
}

# --------------------------------------------------------------------------
# OpenSearch Serverless — encryption / network / data-access policies
# --------------------------------------------------------------------------
resource "aws_opensearchserverless_security_policy" "encryption" {
  name = "${local.collection_name}-enc"
  type = "encryption"
  policy = jsonencode({
    Rules = [
      {
        Resource     = ["collection/${local.collection_name}"]
        ResourceType = "collection"
      }
    ]
    AWSOwnedKey = true
  })
}

resource "aws_opensearchserverless_security_policy" "network" {
  name = "${local.collection_name}-net"
  type = "network"
  policy = jsonencode([
    {
      Rules = [
        {
          Resource     = ["collection/${local.collection_name}"]
          ResourceType = "collection"
        },
        {
          Resource     = ["collection/${local.collection_name}"]
          ResourceType = "dashboard"
        }
      ]
      AllowFromPublic = true
    }
  ])
}

# --------------------------------------------------------------------------
# OpenSearch Serverless — collection (vector store)
# --------------------------------------------------------------------------
resource "aws_opensearchserverless_collection" "this" {
  name = local.collection_name
  type = "VECTORSEARCH"

  tags = {
    Name    = local.collection_name
    Project = var.project
  }

  depends_on = [
    aws_opensearchserverless_security_policy.encryption,
    aws_opensearchserverless_security_policy.network
  ]
}

# Data access policy — grants the KB role and the deployer principal the
# permissions needed to create the index and read/write documents.
resource "aws_opensearchserverless_access_policy" "data" {
  name = "${local.collection_name}-data"
  type = "data"
  policy = jsonencode([
    {
      Rules = [
        {
          Resource     = ["collection/${local.collection_name}"]
          Permission   = ["aoss:*"]
          ResourceType = "collection"
        },
        {
          Resource     = ["index/${local.collection_name}/*"]
          Permission   = ["aoss:*"]
          ResourceType = "index"
        }
      ]
      Principal = [
        aws_iam_role.kb.arn,
        data.aws_caller_identity.current.arn
      ]
    }
  ])
}

# AOSS data-access policy propagation is eventually consistent. Wait before
# creating the index / the KB to avoid intermittent 403s on first apply.
resource "time_sleep" "wait_for_data_access" {
  create_duration = "60s"
  depends_on = [
    aws_opensearchserverless_access_policy.data,
    aws_opensearchserverless_collection.this
  ]
}

# --------------------------------------------------------------------------
# opensearch provider — talks to the collection's data plane (SigV4)
# --------------------------------------------------------------------------
provider "opensearch" {
  url         = aws_opensearchserverless_collection.this.collection_endpoint
  healthcheck = false
  aws_region  = var.aws_region
}

# --------------------------------------------------------------------------
# Vector index
# --------------------------------------------------------------------------
resource "opensearch_index" "this" {
  name                           = local.index_name
  number_of_shards               = "2"
  number_of_replicas             = "0"
  index_knn                      = true
  index_knn_algo_param_ef_search = "512"

  mappings = jsonencode({
    properties = {
      (local.vector_field) = {
        type      = "knn_vector"
        dimension = var.vector_dimension
        method = {
          name       = "hnsw"
          engine     = "faiss"
          space_type = "l2"
          parameters = {
            ef_construction = 512
            m               = 16
          }
        }
      }
      (local.text_field) = {
        type  = "text"
        index = true
      }
      (local.metadata_field) = {
        type  = "text"
        index = false
      }
    }
  })

  force_destroy = true

  depends_on = [time_sleep.wait_for_data_access]
}

# --------------------------------------------------------------------------
# IAM role for the Knowledge Base (trusted by Bedrock)
# --------------------------------------------------------------------------
data "aws_iam_policy_document" "kb_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["bedrock.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "kb" {
  name               = "${var.project}-kb-role"
  assume_role_policy = data.aws_iam_policy_document.kb_assume_role.json

  tags = {
    Name    = "${var.project}-kb-role"
    Project = var.project
  }
}

data "aws_iam_policy_document" "kb_permissions" {
  # Invoke the embedding model
  statement {
    sid       = "InvokeEmbeddingModel"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embedding_model_arn]
  }

  # Access the OpenSearch Serverless collection data plane
  statement {
    sid       = "OpenSearchServerlessAccess"
    effect    = "Allow"
    actions   = ["aoss:APIAccessAll"]
    resources = [aws_opensearchserverless_collection.this.arn]
  }

  # Read the S3 data source
  statement {
    sid     = "S3ReadDataSource"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.data_source.arn,
      "${aws_s3_bucket.data_source.arn}/*"
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role_policy" "kb_permissions" {
  name   = "${var.project}-kb-permissions"
  role   = aws_iam_role.kb.id
  policy = data.aws_iam_policy_document.kb_permissions.json
}

# --------------------------------------------------------------------------
# Bedrock Knowledge Base
# --------------------------------------------------------------------------
resource "aws_bedrockagent_knowledge_base" "this" {
  name     = "${var.project}-kb"
  role_arn = aws_iam_role.kb.arn

  knowledge_base_configuration {
    type = "VECTOR"
    vector_knowledge_base_configuration {
      embedding_model_arn = local.embedding_model_arn
    }
  }

  storage_configuration {
    type = "OPENSEARCH_SERVERLESS"
    opensearch_serverless_configuration {
      collection_arn    = aws_opensearchserverless_collection.this.arn
      vector_index_name = local.index_name
      field_mapping {
        vector_field   = local.vector_field
        text_field     = local.text_field
        metadata_field = local.metadata_field
      }
    }
  }

  depends_on = [
    opensearch_index.this,
    aws_iam_role_policy.kb_permissions
  ]
}

# --------------------------------------------------------------------------
# S3 data source
# --------------------------------------------------------------------------
resource "aws_bedrockagent_data_source" "s3" {
  knowledge_base_id = aws_bedrockagent_knowledge_base.this.id
  name              = "${var.project}-s3-data-source"

  data_source_configuration {
    type = "S3"
    s3_configuration {
      bucket_arn = aws_s3_bucket.data_source.arn
    }
  }

  # NONE = treat each file as a single chunk (one vector per file). The wiki
  # generator writes exactly one concise capability profile per repo, so each
  # repo becomes one vector. This keeps retrieval results whole-repo and
  # prevents cross-repo functionality mixing in recommendations.
  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "NONE"
    }
  }
}
