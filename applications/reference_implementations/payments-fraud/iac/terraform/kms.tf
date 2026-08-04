# -----------------------------------------------------------------------------
# Customer-managed KMS key for data-at-rest encryption.
#
# Used by the DynamoDB tables and the S3 data bucket. A CMK (rather than the
# AWS-owned default key) matches the market-surveillance reference implementation
# and satisfies checkov CKV_AWS_119 (DynamoDB encrypted with a CMK).
# -----------------------------------------------------------------------------

resource "aws_kms_key" "data" {
  description             = "${local.name_prefix} data-at-rest encryption (DynamoDB + S3)"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms_data.json
  tags                    = merge(var.tags, { Name = "${local.name_prefix}-data-key" })
}

# Explicit key policy (CKV2_AWS_64). Delegates access control to IAM by granting
# the account root full administrative control of the key; the runtime role's
# kms:Decrypt / kms:GenerateDataKey grants (iam.tf) then govern actual usage.
data "aws_iam_policy_document" "kms_data" {
  # checkov:skip=CKV_AWS_109:This is the AWS-default KMS key policy root statement; "*" resource refers to the key itself and delegates access control to IAM.
  # checkov:skip=CKV_AWS_111:Default KMS root-account statement — standard AWS pattern, scoped to this key, IAM governs actual usage.
  # checkov:skip=CKV_AWS_356:KMS key policies use "*" resource by design (the resource IS the key); narrowing is not applicable here.
  statement {
    sid       = "EnableIAMRootPermissions"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_kms_alias" "data" {
  name          = "alias/${local.name_prefix}-data"
  target_key_id = aws_kms_key.data.key_id
}
