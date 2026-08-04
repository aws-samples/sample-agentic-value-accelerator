# ---------------------------------------------------------------------------
# AVA AgentCore Fleet Dashboard
#
# Single per-region CloudWatch dashboard that aggregates across every
# AgentCore runtime in the account. Built on SEARCH() expressions so it
# auto-discovers new runtimes — no redeploy needed when a new use case ships.
#
# Flip on for ONE deployment per region (var.create_fleet_dashboard=true).
# Subsequent deployments in the same region should leave it false; otherwise
# they fight over the same dashboard name.
#
# The expected AgentCore CloudWatch namespace is "AWS/BedrockAgentCore" with
# AgentRuntimeName as the primary dimension. Resource-usage metrics live in
# the same namespace and use Service/Resource/Name dimensions per AWS docs.
# If the live namespace differs, swap the constant in `local.acore_ns`.
# ---------------------------------------------------------------------------

locals {
  acore_ns       = "AWS/BedrockAgentCore"
  fleet_log_glob = "/aws/vendedlogs/bedrock-agentcore/runtimes/*"
}

resource "aws_cloudwatch_dashboard" "fleet" {
  count = var.create_fleet_dashboard ? 1 : 0

  dashboard_name = var.fleet_dashboard_name

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "text"
        x    = 0, y = 0, width = 24, height = 2
        properties = {
          markdown = "# AVA AgentCore Fleet — ${var.aws_region}\nAggregated view across every AgentCore runtime in this region. Widgets use `SEARCH()` so new runtimes appear automatically. Filter by use case via the `usecase` resource attribute on traces (CloudWatch Transaction Search) or by clicking a runtime in any widget legend.\n\n[Open GenAI Observability Console](https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#gen-ai-observability:agent-runtimes) · [Open Transaction Search](https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#xray:traces/query)"
        }
      },

      {
        type = "metric"
        x    = 0, y = 2, width = 12, height = 6
        properties = {
          title  = "Invocations per minute (by runtime)"
          view   = "timeSeries"
          stacked = true
          region = var.aws_region
          metrics = [
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"Invocations\"', 'Sum', 60)", label = "", id = "inv" }]
          ]
          yAxis = { left = { min = 0 } }
        }
      },

      {
        type = "metric"
        x    = 12, y = 2, width = 12, height = 6
        properties = {
          title  = "Total errors per minute (system + user + throttles)"
          view   = "timeSeries"
          stacked = true
          region = var.aws_region
          metrics = [
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"SystemErrors\"', 'Sum', 60)",  label = "", id = "sys" }],
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"UserErrors\"', 'Sum', 60)",    label = "", id = "usr" }],
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"Throttles\"', 'Sum', 60)",     label = "", id = "thr" }]
          ]
          yAxis = { left = { min = 0 } }
        }
      },

      {
        type = "metric"
        x    = 0, y = 8, width = 24, height = 6
        properties = {
          title  = "Invocation latency (p50 / p95 / p99 by runtime)"
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          metrics = [
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"Latency\"', 'p50', 60)", label = "p50 - ", id = "p50" }],
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"Latency\"', 'p95', 60)", label = "p95 - ", id = "p95" }],
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"Latency\"', 'p99', 60)", label = "p99 - ", id = "p99" }]
          ]
          yAxis = { left = { min = 0, label = "ms" } }
        }
      },

      {
        type = "metric"
        x    = 0, y = 14, width = 12, height = 6
        properties = {
          title  = "Active sessions (sum) — by runtime"
          view   = "timeSeries"
          stacked = true
          region = var.aws_region
          metrics = [
            [{ expression = "SEARCH('{${local.acore_ns},AgentRuntimeName} MetricName=\"SessionCount\"', 'Sum', 300)", label = "", id = "sess" }]
          ]
          yAxis = { left = { min = 0 } }
        }
      },

      {
        type = "metric"
        x    = 12, y = 14, width = 12, height = 6
        properties = {
          title  = "Resource usage — vCPU-Hours & GB-Hours (account-wide)"
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          metrics = [
            ["${local.acore_ns}", "CPUUsed-vCPUHours",  "Service", "AgentCore.Runtime", { stat = "Sum", label = "vCPU-Hours" }],
            ["${local.acore_ns}", "MemoryUsed-GBHours", "Service", "AgentCore.Runtime", { stat = "Sum", label = "GB-Hours", yAxis = "right" }]
          ]
          yAxis = {
            left  = { min = 0, label = "vCPU-Hours" }
            right = { min = 0, label = "GB-Hours" }
          }
        }
      },

      {
        type = "metric"
        x    = 0, y = 20, width = 24, height = 4
        properties = {
          title  = "Bedrock model token usage (account-wide, by model)"
          view   = "timeSeries"
          stacked = true
          region = var.aws_region
          metrics = [
            [{ expression = "SEARCH('{AWS/Bedrock,ModelId} MetricName=\"InputTokenCount\"', 'Sum', 300)",  label = "in - ",  id = "ti" }],
            [{ expression = "SEARCH('{AWS/Bedrock,ModelId} MetricName=\"OutputTokenCount\"', 'Sum', 300)", label = "out - ", id = "to" }]
          ]
          yAxis = { left = { min = 0 } }
        }
      },

      {
        type = "log"
        x    = 0, y = 24, width = 24, height = 6
        properties = {
          title  = "Recent errors across all runtimes (APPLICATION_LOGS)"
          region = var.aws_region
          view   = "table"
          query  = "SOURCE '${local.fleet_log_glob}' | fields @timestamp, resource_arn, request_id, session_id, operation, response_payload\n| filter ispresent(error_type) or @message like /(?i)error|exception|traceback/\n| sort @timestamp desc\n| limit 50"
        }
      }
    ]
  })
}
