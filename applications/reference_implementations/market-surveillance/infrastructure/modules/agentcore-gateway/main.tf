data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "assume_role" {
  statement {
    sid     = "GatewayAssumeRolePolicy"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:bedrock-agentcore:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:gateway/*"]
    }
  }
}

resource "aws_iam_role" "gateway_role" {
  name               = "bedrock-agentcore-gateway-role-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = {
    Name        = "bedrock-agentcore-gateway-role-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }
}

resource "aws_iam_role_policy" "gateway_policy" {
  name = "gateway-external-api-policy"
  role = aws_iam_role.gateway_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          var.alert_mcp_lambda_arn,
          "${var.alert_mcp_lambda_arn}:*"
        ]
      }
    ]
  })
}

resource "time_sleep" "wait_for_iam_propagation" {
  depends_on      = [aws_iam_role.gateway_role, aws_iam_role_policy.gateway_policy]
  create_duration = "15s"
}

resource "aws_bedrockagentcore_gateway" "agent_gateway" {
  name     = "market-surveillance-gateway-${var.environment}"
  role_arn = aws_iam_role.gateway_role.arn

  # Use AWS IAM authorization for internal runtime-to-gateway communication
  # This allows the runtime to authenticate using its IAM role
  authorizer_type = "AWS_IAM"

  protocol_type = "MCP"

  tags = {
    Name        = "market-surveillance-gateway-${var.environment}"
    Environment = var.environment
    Project     = "market-surveillance"
  }

  depends_on = [time_sleep.wait_for_iam_propagation]
}

# Gateway Target 1 - Get Latest Summary
# Used by agent to retrieve investigation context in interactive sessions
resource "aws_bedrockagentcore_gateway_target" "get_latest_summary" {
  name               = "get-latest-summary"
  gateway_identifier = aws_bedrockagentcore_gateway.agent_gateway.gateway_id
  description        = "Retrieve the latest investigation summary for an alert"

  credential_provider_configuration {
    gateway_iam_role {}
  }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = var.alert_mcp_lambda_arn

        tool_schema {
          inline_payload {
            name        = "get_latest_summary"
            description = "Retrieve the most recent investigation summary for an alert. Use this at the start of interactive sessions to understand what has already been investigated and to provide context-aware responses. The summary includes previous findings, recommendations, and the complete audit trail of prior investigations."

            input_schema {
              type        = "object"
              description = "Alert identifier to retrieve summary for"

              property {
                name        = "alertId"
                type        = "string"
                description = "The unique identifier of the alert to retrieve the summary for (e.g., '123', 'ALERT-2024-001'). This should match the alert currently being investigated."
                required    = true
              }
            }
          }
        }
      }
    }
  }

  # Ensure IAM policy and gateway are created before gateway target
  depends_on = [aws_iam_role_policy.gateway_policy, time_sleep.wait_for_iam_propagation]
}

# Gateway Target 2 - Save Summary
# Used by agent to persist investigation summaries after completing investigations
resource "aws_bedrockagentcore_gateway_target" "save_summary" {
  name               = "save-summary"
  gateway_identifier = aws_bedrockagentcore_gateway.agent_gateway.gateway_id
  description        = "Save investigation summary with findings and recommendations"

  credential_provider_configuration {
    gateway_iam_role {}
  }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = var.alert_mcp_lambda_arn

        tool_schema {
          inline_payload {
            name        = "save_summary"
            description = "Save a comprehensive investigation summary for an alert. Use this after completing an alert investigation to persist the findings, recommendations, and complete audit trail of the investigation process. This creates a permanent record for compliance and review."

            input_schema {
              type        = "object"
              description = "Complete investigation summary with findings, recommendations, and audit trail"

              property {
                name        = "alertId"
                type        = "string"
                description = "The unique identifier of the alert that was investigated (e.g., '123', 'ALERT-2024-001'). CRITICAL: Use the EXACT value provided in the investigation context."
                required    = true
              }

              property {
                name        = "investigationId"
                type        = "string"
                description = "The unique investigation identifier (UUID format). CRITICAL: Use the EXACT value provided in the investigation context. This is used as the database key and must match exactly."
                required    = true
              }

              property {
                name        = "summaryText"
                type        = "string"
                description = "A comprehensive narrative summary of the investigation findings. Should include: what was investigated, key patterns discovered, suspicious activities identified, regulatory concerns, and overall assessment. Typically 2-5 paragraphs providing complete context."
                required    = true
              }

              property {
                name        = "findings"
                type        = "array"
                description = "Array of specific findings discovered during the investigation. Each finding should be a concise string statement (e.g., '3 transactions totaling $2.5M occurred between 2-4 AM', '2 counterparty entities match OFAC sanctions list'). Include all significant discoveries."
                required    = true
              }

              property {
                name        = "recommendations"
                type        = "array"
                description = "Array of actionable recommendations based on the findings. Each recommendation should be a clear action item (e.g., 'Escalate to compliance team immediately', 'Request additional documentation from customer', 'File SAR within 30 days'). Prioritize by urgency."
                required    = true
              }

              property {
                name        = "asyncAuditTrail"
                type        = "array"
                description = <<-EOT
Complete audit trail of the investigation process documenting every step taken. This provides full transparency and reproducibility of the investigation methodology.

Each audit trail entry must be an object containing:
- timestamp: ISO 8601 string (e.g., "2026-02-06T10:30:00Z")
- type: string - one of: "decision", "agent_routing", "thinking", "tool_call", "validation", "data_access", "computation"
- content: string - human-readable description of what was done and why
- metadata: object with detailed context (see below)

CRITICAL - Include these specific details in metadata:

For DATABASE QUERIES (type: "data_access"):
- tool_name: "gateway_query_database" or similar
- table_name: Name of table accessed (e.g., "flagged_trade", "trade_details")
- sql_query: Complete SQL query executed (full text, not truncated)
- query_purpose: Why this query was needed (e.g., "Retrieve flagged trade details for alert")
- row_count: Number of rows returned
- execution_time_ms: Query execution time if available

For PYTHON CODE EXECUTION (type: "computation"):
- tool_name: "execute_python" or "code_interpreter"
- code_snippet: Complete Python code executed (include all logic)
- purpose: What the code calculates or validates
- input_summary: Brief description of input data
- output_summary: Brief description of results
- variables_used: Key variables and their values

For AGENT ROUTING (type: "agent_routing"):
- agent: Name of agent being invoked (e.g., "data_contract_agent", "trade_analyst_agent")
- purpose: Why this agent was selected
- input_summary: What information was passed to the agent
- expected_output: What you expect the agent to return

For TOOL CALLS (type: "tool_call"):
- tool_name: Exact name of tool called
- tool_input: Complete input parameters (as JSON string or object)
- tool_output_summary: Brief summary of what the tool returned
- purpose: Why this tool was needed

For DECISIONS (type: "decision"):
- decision: What was decided
- rationale: Why this decision was made
- alternatives_considered: Other options that were evaluated
- workflow_state: Current state in investigation workflow

For THINKING (type: "thinking"):
- reasoning: Your thought process
- context: What information led to this thinking
- next_steps: What you plan to do based on this reasoning

EXAMPLE AUDIT TRAIL ENTRIES:

{
  "timestamp": "2026-02-06T10:30:00Z",
  "type": "data_access",
  "content": "Queried flagged_trade table to retrieve all suspected flagged trades for Alert 8",
  "metadata": {
    "tool_name": "gateway_query_database",
    "table_name": "flagged_trade",
    "sql_query": "SELECT flagged_trade_id, alert_id, trade_date, trader_id FROM flagged_trade WHERE alert_id = '8'",
    "query_purpose": "Identify all flagged trades associated with this alert",
    "row_count": 1,
    "execution_time_ms": 45
  }
}

{
  "timestamp": "2026-02-06T10:31:00Z",
  "type": "computation",
  "content": "Calculated notional ratio between flagged trade and pivot trade to evaluate Rule01 threshold",
  "metadata": {
    "tool_name": "execute_python",
    "code_snippet": "flagged_notional = 31983000\npivot_notional = 30872999\nratio = (flagged_notional / pivot_notional) * 100\nthreshold = 70\npasses_rule = ratio >= threshold\nprint(f'Ratio: {ratio:.1f}%, Threshold: {threshold}%, Passes: {passes_rule}')",
    "purpose": "Evaluate Rule01 notional threshold requirement",
    "input_summary": "Flagged notional: $31.98M, Pivot notional: $30.87M",
    "output_summary": "Ratio: 103.6%, exceeds 70% threshold",
    "variables_used": {"ratio": 103.6, "threshold": 70, "passes_rule": true}
  }
}

This detailed audit trail enables compliance officers to:
1. Reproduce the investigation by re-running the same queries and code
2. Validate the investigation methodology
3. Understand the agent's decision-making process
4. Audit data access for regulatory compliance
5. Debug issues if results are questioned
EOT
                required    = false
              }

              property {
                name        = "generatedBy"
                type        = "string"
                description = "Identifier of who/what generated this summary. Use 'async-agent' for automated investigations or 'user-requested' for user-initiated investigations. Defaults to 'async-agent' if not provided."
                required    = false
              }

              property {
                name        = "version"
                type        = "number"
                description = "Version number of this summary. Use 1 for the first summary, increment for subsequent updates. Defaults to 1 if not provided."
                required    = false
              }

              property {
                name        = "status"
                type        = "string"
                description = "Status of the investigation. Use 'completed' for successful investigations or 'failed' if errors occurred. Defaults to 'completed' if not provided."
                required    = false
              }
            }
          }
        }
      }
    }
  }

  # Ensure IAM policy and gateway are created before gateway target
  depends_on = [aws_iam_role_policy.gateway_policy, time_sleep.wait_for_iam_propagation]
}
