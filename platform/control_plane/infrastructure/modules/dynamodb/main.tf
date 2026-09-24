# ============================================================================
# App Factory Submissions Table
# ============================================================================

resource "aws_dynamodb_table" "app_factory" {
  name         = "${var.name_prefix}-app-factory"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app-factory"
  })
}

# ============================================================================
# Application Catalog Table
# ============================================================================

resource "aws_dynamodb_table" "application_catalog" {
  name         = "${var.name_prefix}-application-catalog"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "application_id"
  range_key    = "version"

  attribute {
    name = "application_id"
    type = "S"
  }

  attribute {
    name = "version"
    type = "S"
  }

  attribute {
    name = "template_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  # GSI for querying by template
  global_secondary_index {
    name            = "TemplateIndex"
    hash_key        = "template_id"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-application-catalog"
  })
}

# ============================================================================
# Deployment Metadata Table
# ============================================================================

resource "aws_dynamodb_table" "deployment_metadata" {
  name         = "${var.name_prefix}-deployment-metadata"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "deployment_id"
  range_key    = "timestamp"

  attribute {
    name = "deployment_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "application_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # GSI for querying deployments by application
  global_secondary_index {
    name            = "ApplicationIndex"
    hash_key        = "application_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI for querying deployments by status
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-deployment-metadata"
  })
}

# ============================================================================
# Deployments Table (Control Plane Overhaul)
# ============================================================================

resource "aws_dynamodb_table" "deployments" {
  name         = "${var.name_prefix}-deployments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-deployments"
  })
}

# ============================================================================
# Guardrails Table
# ============================================================================

resource "aws_dynamodb_table" "guardrails" {
  name         = "${var.name_prefix}-guardrails"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-guardrails"
  })
}

# ============================================================================
# Policies Table — AgentCore resource-level operational policies
# ============================================================================

resource "aws_dynamodb_table" "policies" {
  name         = "${var.name_prefix}-policies"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-policies"
  })
}

# ============================================================================
# Prioritization Table — use cases + scores for the Plan / Prioritization page
# ============================================================================

resource "aws_dynamodb_table" "prioritization" {
  name         = "${var.name_prefix}-prioritization"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-prioritization"
  })
}

# ============================================================================
# Maturity Assessment Table — Plan / Maturity Assessment page
# ============================================================================

resource "aws_dynamodb_table" "maturity" {
  name         = "${var.name_prefix}-maturity"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-maturity"
  })
}

# ============================================================================
# Business Cases Table — Plan / Business Cases page
# ============================================================================

resource "aws_dynamodb_table" "business_cases" {
  name         = "${var.name_prefix}-business-cases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-business-cases"
  })
}

# ============================================================================
# Knowledge Registry Table
# ============================================================================

resource "aws_dynamodb_table" "knowledge" {
  name         = "${var.name_prefix}-knowledge"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-knowledge"
  })
}
# Operating Model Table — Plan / Operating Model page
# ============================================================================

resource "aws_dynamodb_table" "operating_model" {
  name         = "${var.name_prefix}-operating-model"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-operating-model"
  })
}

# ============================================================================
# Organization Design Table — Plan / Organization Design page
# ============================================================================

resource "aws_dynamodb_table" "organization_design" {
  name         = "${var.name_prefix}-organization-design"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-organization-design"
  })
}

# ============================================================================
# MCP Servers registry — Build > MCP Servers page writes here
# ============================================================================
resource "aws_dynamodb_table" "mcp_servers" {
  name         = "${var.name_prefix}-mcp-servers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "server_id"

  attribute {
    name = "server_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-servers"
  })
}

# ============================================================================
# Identity Providers registry — Secure > Identity page writes here
# ============================================================================
resource "aws_dynamodb_table" "identity_providers" {
  name         = "${var.name_prefix}-identity-providers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "provider_id"

  attribute {
    name = "provider_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-identity-providers"
  })
}

# ============================================================================
# Approval Policies — Secure > Approval Policies page writes here.
# Each row is a rule: "when action X hits resource Y, require sign-off from
# role Z". Single-table, pk=policy_id. Low volume, PAY_PER_REQUEST.
# ============================================================================
resource "aws_dynamodb_table" "approval_policies" {
  name         = "${var.name_prefix}-approval-policies"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "policy_id"

  attribute {
    name = "policy_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-approval-policies"
  })
}

# ============================================================================
# Approval Requests — Operate > Approval Queue page writes / reads here.
# Live queue of pending sign-offs. Single-table, pk=request_id. Volume is
# request-per-gated-action so PAY_PER_REQUEST fits until we outgrow it.
# ============================================================================
resource "aws_dynamodb_table" "approval_requests" {
  name         = "${var.name_prefix}-approval-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "request_id"

  attribute {
    name = "request_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-approval-requests"
  })
}

# ============================================================================
# A2A Agents registry — Build > A2A Agents page writes here
# ============================================================================
resource "aws_dynamodb_table" "a2a_agents" {
  name         = "${var.name_prefix}-a2a-agents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "agent_id"

  attribute {
    name = "agent_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-a2a-agents"
  })
}

# ============================================================================
# Evaluations Table (Operate → Evaluation)
# ============================================================================
# Stores evaluation suites (SUITE#<id>), runs (RUN#<id>), and cached pairwise
# comparisons (PAIRWISE#<a>::<b>) under a single prefixed hash key — the
# access pattern the evaluation service uses (point reads by pk, prefix scans
# with a projected summary for list pages).

resource "aws_dynamodb_table" "evaluations" {
  name         = "${var.name_prefix}-evaluations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-evaluations"
  })
}

# ============================================================================
# Login Events Table (audit)
# ============================================================================
# Written by the Cognito PostAuthentication Lambda after every successful
# sign-in. Two access patterns supported:
#
#   1. Per-user history — Query(pk = USER#<sub>) sorted by sk (ISO ts).
#   2. Per-day report   — Query GSI by_date (event_date = YYYY-MM-DD).
#
# PITR is on because this is an audit-grade table; encryption at rest via
# AWS-managed KMS. PAY_PER_REQUEST matches the rest of the CP tables.

resource "aws_dynamodb_table" "login_events" {
  name         = "${var.name_prefix}-login-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "event_date"
    type = "S"
  }

  global_secondary_index {
    name            = "by_date"
    hash_key        = "event_date"
    range_key       = "sk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-login-events"
  })
}
