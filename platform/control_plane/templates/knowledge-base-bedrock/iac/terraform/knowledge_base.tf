###############################################################################
# Bedrock Knowledge Base
###############################################################################

resource "aws_bedrockagent_knowledge_base" "this" {
  name     = "${local.prefix}-kb"
  role_arn = aws_iam_role.kb_role.arn

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
      vector_index_name = local.vector_index_name

      field_mapping {
        vector_field   = "embedding"
        text_field     = "text"
        metadata_field = "metadata"
      }
    }
  }

  tags = local.default_tags
}

###############################################################################
# Bedrock Data Source
###############################################################################

resource "aws_bedrockagent_data_source" "this" {
  knowledge_base_id = aws_bedrockagent_knowledge_base.this.id
  name              = "${local.prefix}-s3-source"

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn = aws_s3_bucket.documents.arn
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
