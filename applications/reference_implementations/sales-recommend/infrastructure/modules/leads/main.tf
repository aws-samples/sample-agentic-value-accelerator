###############################################################################
# Leads Module — DynamoDB table for captured visitor emails
#
# Backs the email-capture modal in the UI. The Next.js /api/lead route upserts
# one item per email (incrementing a visit counter), and /api/leads reads them
# back for the in-app "Visitors" view.
#
# Per-deployment by default (name derives from the project prefix, which already
# carries the deployment suffix). To share a single table across all
# sales-recommend instances, pass the same `table_name` to every deployment and
# create the table out-of-band (or in one deployment only) — the IAM policy in
# modules/iam is scoped to this deterministic name.
###############################################################################

resource "aws_dynamodb_table" "leads" {
  name         = "${var.project}-leads"
  billing_mode = "PAY_PER_REQUEST" # on-demand — no capacity to manage, cheap at demo volume
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  # Emails are self-reported PII; encrypt at rest with the AWS-owned key.
  server_side_encryption {
    enabled = true
  }

  tags = {
    Name    = "${var.project}-leads"
    Project = var.project
  }
}
