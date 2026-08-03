# -----------------------------------------------------------------------------
# Grant the AgentCore runtime role access to this app's data stores.
#
# The runtime module creates the execution role and exposes it as
# module.runtime.iam_role_name; we attach a least-privilege policy for the
# specific DynamoDB tables and S3 bucket the agent tools use.
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "data_access" {
  statement {
    sid    = "DynamoDataStores"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [
      aws_dynamodb_table.transactions.arn,
      aws_dynamodb_table.cases.arn,
      aws_dynamodb_table.sars.arn,
    ]
  }

  statement {
    sid    = "S3DataReadWrite"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*",
    ]
  }

  # Required because the DynamoDB tables and S3 bucket are encrypted with the
  # customer-managed KMS key — the runtime must decrypt to read and re-encrypt
  # to write.
  statement {
    sid    = "DataKmsAccess"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.data.arn]
  }
}

resource "aws_iam_policy" "data_access" {
  name        = "${local.name_prefix}-data-access"
  description = "Payments-fraud agent access to its DynamoDB tables and S3 data bucket"
  policy      = data.aws_iam_policy_document.data_access.json
  tags        = var.tags
}

resource "aws_iam_role_policy_attachment" "data_access" {
  role       = module.runtime.iam_role_name
  policy_arn = aws_iam_policy.data_access.arn
}

# -----------------------------------------------------------------------------
# Bedrock model access for the agents.
#
# The agents call cross-region INFERENCE PROFILES (e.g. us.anthropic.claude-...),
# which require InvokeModel* on both the inference-profile ARN and the underlying
# foundation-model ARNs in every region the profile may route to. The runtime
# module's own bedrock_invoke policy is scoped to a single foundation-model ARN
# and does not cover this, so we attach a supplementary policy.
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "bedrock_inference" {
  statement {
    sid    = "InvokeInferenceProfilesAndModels"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    # Foundation models in any region (inference profiles fan out across regions)
    # plus the inference-profile resources in this account.
    resources = [
      "arn:aws:bedrock:*::foundation-model/*",
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }
}

resource "aws_iam_policy" "bedrock_inference" {
  name        = "${local.name_prefix}-bedrock-inference"
  description = "Invoke Bedrock inference profiles + underlying foundation models for the payments-fraud agents"
  policy      = data.aws_iam_policy_document.bedrock_inference.json
  tags        = var.tags
}

resource "aws_iam_role_policy_attachment" "bedrock_inference" {
  role       = module.runtime.iam_role_name
  policy_arn = aws_iam_policy.bedrock_inference.arn
}
