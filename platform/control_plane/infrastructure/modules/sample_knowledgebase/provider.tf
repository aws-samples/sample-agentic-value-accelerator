provider "opensearch" {
  url         = aws_opensearchserverless_collection.kb.collection_endpoint
  healthcheck = false
}
