# -----------------------------------------------------------------------------
# OpenSearch Serverless — Vector store for the Knowledge Base
# -----------------------------------------------------------------------------

locals {
  collection_name = "${var.name_prefix}-kb"
  index_name      = "bedrock-knowledge-base-default-index"
}

# Encryption policy (required before collection)
resource "aws_opensearchserverless_security_policy" "kb_encryption" {
  name = "${var.name_prefix}-kb-enc"
  type = "encryption"

  policy = jsonencode({
    Rules = [{
      Resource     = ["collection/${local.collection_name}"]
      ResourceType = "collection"
    }]
    AWSOwnedKey = true
  })
}

# Network policy (required before collection)
resource "aws_opensearchserverless_security_policy" "kb_network" {
  name = "${var.name_prefix}-kb-net"
  type = "network"

  policy = jsonencode([{
    Description = "Public access for ${local.collection_name}"
    Rules = [
      { ResourceType = "collection", Resource = ["collection/${local.collection_name}"] },
      { ResourceType = "dashboard", Resource = ["collection/${local.collection_name}"] },
    ]
    AllowFromPublic = true
  }])
}

# Collection
resource "aws_opensearchserverless_collection" "kb" {
  name             = local.collection_name
  type             = "VECTORSEARCH"
  standby_replicas = "DISABLED"

  depends_on = [
    aws_opensearchserverless_security_policy.kb_encryption,
    aws_opensearchserverless_security_policy.kb_network,
  ]
}

# Access policy (grants KB role + deployer access)
resource "aws_opensearchserverless_access_policy" "kb_access" {
  name = "${var.name_prefix}-kb-access"
  type = "data"

  policy = jsonencode([{
    Rules = [
      {
        ResourceType = "index"
        Resource     = ["index/${local.collection_name}/*"]
        Permission   = ["aoss:CreateIndex", "aoss:DeleteIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"]
      },
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.collection_name}"]
        Permission   = ["aoss:CreateCollectionItems", "aoss:DeleteCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"]
      },
    ]
    Principal = [
      aws_iam_role.kb_role.arn,
      "arn:aws:iam::${var.account_id}:root",
    ]
  }])
}

# Vector index
resource "opensearch_index" "kb" {
  name                           = local.index_name
  number_of_shards               = "2"
  number_of_replicas             = "0"
  index_knn                      = true
  index_knn_algo_param_ef_search = "512"
  force_destroy                  = true

  mappings = <<-EOF
    {
      "properties": {
        "bedrock-knowledge-base-default-vector": {
          "type": "knn_vector",
          "dimension": ${var.embedding_dimensions},
          "method": {
            "name": "hnsw",
            "engine": "faiss",
            "parameters": { "m": 16, "ef_construction": 512 },
            "space_type": "l2"
          }
        },
        "AMAZON_BEDROCK_METADATA": { "type": "text", "index": "false" },
        "AMAZON_BEDROCK_TEXT_CHUNK": { "type": "text", "index": "true" }
      }
    }
  EOF

  depends_on = [aws_opensearchserverless_collection.kb, aws_opensearchserverless_access_policy.kb_access]
}
