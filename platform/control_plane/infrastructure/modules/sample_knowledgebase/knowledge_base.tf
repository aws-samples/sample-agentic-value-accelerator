# -----------------------------------------------------------------------------
# Bedrock Knowledge Base + Data Source
# -----------------------------------------------------------------------------

# Wait for IAM role policy propagation
resource "time_sleep" "wait_for_iam" {
  depends_on      = [aws_iam_role_policy.kb_policy]
  create_duration = "20s"
}

resource "aws_bedrockagent_knowledge_base" "this" {
  name        = "${var.name_prefix}-kb"
  description = "Sample FSI knowledge base — company policies, product guides, and compliance documents"
  role_arn    = aws_iam_role.kb_role.arn

  knowledge_base_configuration {
    type = "VECTOR"

    vector_knowledge_base_configuration {
      embedding_model_arn = "arn:aws:bedrock:${var.region}::foundation-model/${var.embedding_model_id}"

      embedding_model_configuration {
        bedrock_embedding_model_configuration {
          dimensions = var.embedding_dimensions
        }
      }
    }
  }

  storage_configuration {
    type = "OPENSEARCH_SERVERLESS"

    opensearch_serverless_configuration {
      collection_arn    = aws_opensearchserverless_collection.kb.arn
      vector_index_name = local.index_name

      field_mapping {
        vector_field   = "bedrock-knowledge-base-default-vector"
        text_field     = "AMAZON_BEDROCK_TEXT_CHUNK"
        metadata_field = "AMAZON_BEDROCK_METADATA"
      }
    }
  }

  depends_on = [
    opensearch_index.kb,
    time_sleep.wait_for_iam,
  ]
}

# Data Source — S3 bucket with documents
resource "aws_bedrockagent_data_source" "s3" {
  knowledge_base_id    = aws_bedrockagent_knowledge_base.this.id
  name                 = "${var.name_prefix}-kb-s3-source"
  data_deletion_policy = "DELETE"

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn         = aws_s3_bucket.kb_documents.arn
      inclusion_prefixes = ["documents/"]
    }
  }

  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = var.chunking_strategy

      dynamic "fixed_size_chunking_configuration" {
        for_each = var.chunking_strategy == "FIXED_SIZE" ? [1] : []
        content {
          max_tokens         = var.chunk_max_tokens
          overlap_percentage = var.chunk_overlap_percentage
        }
      }
    }
  }
}
