###############################################################################
# OpenSearch Serverless — Encryption Policy
###############################################################################

resource "aws_opensearchserverless_security_policy" "encryption" {
  name = "${local.prefix}-enc"
  type = "encryption"

  policy = jsonencode({
    Rules = [
      {
        Resource     = ["collection/${local.prefix}-kb"]
        ResourceType = "collection"
      }
    ]
    AWSOwnedKey = true
  })
}

###############################################################################
# OpenSearch Serverless — Network Policy
###############################################################################

resource "aws_opensearchserverless_security_policy" "network" {
  name = "${local.prefix}-net"
  type = "network"

  policy = jsonencode([
    {
      Rules = [
        {
          Resource     = ["collection/${local.prefix}-kb"]
          ResourceType = "collection"
        }
      ]
      AllowFromPublic = true
    }
  ])
}

###############################################################################
# OpenSearch Serverless — Collection
###############################################################################

resource "aws_opensearchserverless_collection" "this" {
  name = "${local.prefix}-kb"
  type = "VECTORSEARCH"

  tags = local.default_tags

  depends_on = [
    aws_opensearchserverless_security_policy.encryption,
    aws_opensearchserverless_security_policy.network,
  ]
}

###############################################################################
# OpenSearch Serverless — Data Access Policy
###############################################################################

resource "aws_opensearchserverless_access_policy" "this" {
  name = "${local.prefix}-access"
  type = "data"

  policy = jsonencode([
    {
      Rules = [
        {
          Resource     = ["index/${local.prefix}-kb/*"]
          Permission   = ["aoss:CreateIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"]
          ResourceType = "index"
        },
        {
          Resource     = ["collection/${local.prefix}-kb"]
          Permission   = ["aoss:CreateCollectionItems", "aoss:DescribeCollectionItems", "aoss:UpdateCollectionItems"]
          ResourceType = "collection"
        }
      ]
      Principal = [
        aws_iam_role.kb_role.arn,
        data.aws_caller_identity.current.arn
      ]
    }
  ])
}
